import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { Outbox, syncOutbox, type QueuedOrder } from "@/lib/offline/outbox";
import { queryCacheKey } from "@/lib/offline/session-cache";
import { myAvailableStockQuery, myChemistsQuery, OFFLINE_QUERY_ROOTS, opt, productsQuery, settingsQuery, territoriesQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { warmOfflinePages } from "@/lib/pwa";

// TanStack Query assumes "online" at start-up; tell it the truth so queries pause instead of failing offline.
if (typeof navigator !== "undefined") onlineManager.setOnline(navigator.onLine);

const SYNC_INTERVAL_MS = 30_000;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

interface OfflineCtx {
  online: boolean;
  syncing: boolean;
  queue: QueuedOrder[];
  pendingCount: number;
  failedCount: number;
  queueOrder: (o: Omit<QueuedOrder, "status" | "attempts" | "createdAt">) => void;
  syncNow: () => Promise<void>;
  retry: (id: string) => void;
  discard: (id: string) => void;
  lastSyncError: string | null;
}

const Ctx = createContext<OfflineCtx | null>(null);

export function useOffline() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOffline must be used inside <OfflineProvider>");
  return c;
}

/** Make sure the stored sign-in is still valid (refreshing it if needed) before sending queued orders. */
async function ensureFreshSession(userId: string): Promise<boolean> {
  const { data } = await api.auth.getSession();
  const s = data.session;
  if (!s || s.user.id !== userId) return false;
  if ((s.expires_at ?? 0) * 1000 > Date.now() + 30_000) return true;
  const { data: r, error } = await api.auth.refreshSession();
  return !error && r.session?.user.id === userId;
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const s = useSession();
  const qc = useQueryClient();
  const online = useOnline();
  const outbox = useMemo(() => new Outbox(window.localStorage, s.userId), [s.userId]);
  const queue = useSyncExternalStore(
    (cb) => outbox.subscribe(cb),
    () => outbox.list(),
    () => [],
  );
  const [syncing, setSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const running = useRef(false);

  // Keep the order form's lists on the device so it works without a connection.
  useEffect(() => {
    const persister = createSyncStoragePersister({ storage: window.localStorage, key: queryCacheKey(s.userId), throttleTime: 2000 });
    const [unsubscribe] = persistQueryClient({
      queryClient: qc,
      persister,
      maxAge: CACHE_MAX_AGE_MS,
      buster: "v1",
      dehydrateOptions: {
        // Keep the last good data even if a later refresh failed on a bad connection.
        shouldDehydrateQuery: (q) => q.state.data !== undefined && OFFLINE_QUERY_ROOTS.has(String(q.queryKey[0])),
      },
    });
    return unsubscribe;
  }, [qc, s.userId]);

  // Download what an SO needs for offline booking whenever we're connected.
  useEffect(() => {
    if (!online || !s.isSO) return;
    void qc.prefetchQuery(settingsQuery);
    void qc.prefetchQuery(productsQuery);
    void qc.prefetchQuery(territoriesQuery);
    void qc.prefetchQuery(myChemistsQuery(s.userId));
    void qc.prefetchQuery(myAvailableStockQuery);
    void warmOfflinePages(["/dashboard", "/orders", "/orders/new"]);
  }, [online, s.isSO, s.userId, qc]);

  // Another tab changed the queue.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === outbox.key) outbox.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [outbox]);

  const runSync = useCallback(
    async (manual: boolean) => {
      if (running.current) return;
      if (!outbox.list().some((o) => o.status === "pending")) return;
      if (!navigator.onLine) {
        if (manual) toast.info("You're offline — orders will sync when the connection returns.");
        return;
      }
      running.current = true;
      setSyncing(true);
      const work = async () => {
        if (!(await ensureFreshSession(s.userId))) {
          setLastSyncError("Sign in again to sync your queued orders.");
          if (manual) toast.error("Your sign-in has expired. Sign in again to sync queued orders.");
          return;
        }
        const report = await syncOutbox(outbox, async (o) => {
          const r = await api.rpc("create_order", {
            p_chemist: o.chemistId,
            p_items: o.items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
            p_so_discount_pct: o.soPct,
            p_extra_discount_pct: o.extraPct,
            p_remarks: opt(o.remarks),
            p_idempotency_key: o.id,
          });
          return { data: r.data, error: r.error, status: r.status };
        });
        setLastSyncError(report.interrupted ? "Connection is unstable — will keep trying." : null);
        if (report.synced.length) {
          toast.success(report.synced.length === 1 ? `Order for ${report.synced[0]!.order.chemistName} synced` : `${report.synced.length} queued orders synced`);
          void qc.invalidateQueries({ queryKey: ["orders"] });
          void qc.invalidateQueries({ queryKey: ["my-available-stock"] });
          void qc.invalidateQueries({ queryKey: ["dashboard"] });
        }
        for (const r of report.rejected) {
          toast.error(`Order for ${r.order.chemistName} couldn't be saved: ${r.message}`, { duration: 10_000 });
        }
        if (manual && report.interrupted && !report.synced.length) toast.info("Still can't reach the server — will retry automatically.");
      };
      try {
        // One tab syncs at a time; idempotency keys protect against duplicates either way.
        if (typeof navigator !== "undefined" && "locks" in navigator && navigator.locks) {
          await navigator.locks.request("pf-outbox-sync", { ifAvailable: true }, async (lock) => {
            if (lock) await work();
          });
        } else {
          await work();
        }
      } catch (e) {
        setLastSyncError(e instanceof Error ? e.message : "Sync failed");
      } finally {
        running.current = false;
        setSyncing(false);
      }
    },
    [outbox, qc, s.userId],
  );

  const pendingCount = queue.filter((o) => o.status === "pending").length;
  const failedCount = queue.length - pendingCount;

  // Sync on start, when the connection returns, when the app comes back to the foreground, and periodically.
  useEffect(() => {
    if (online) void runSync(false);
  }, [online, runSync]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void runSync(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [runSync]);
  useEffect(() => {
    if (!pendingCount || !online) return;
    const t = setInterval(() => void runSync(false), SYNC_INTERVAL_MS);
    return () => clearInterval(t);
  }, [pendingCount, online, runSync]);

  const value: OfflineCtx = {
    online,
    syncing,
    queue,
    pendingCount,
    failedCount,
    lastSyncError,
    queueOrder: (o) => {
      outbox.add(o);
      void runSync(false);
    },
    syncNow: () => runSync(true),
    retry: (id) => {
      outbox.retry(id);
      void runSync(true);
    },
    discard: (id) => outbox.remove(id),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
