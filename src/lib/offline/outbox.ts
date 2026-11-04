/**
 * Device-side outbox for orders booked while offline.
 *
 * Each queued order carries the idempotency key it will be submitted with, so a
 * retry after a dropped response can never create a second order on the server.
 * The queue lives in localStorage per user so it survives reloads and app restarts.
 */

export interface QueuedOrderItem {
  product_id: string;
  qty: number;
  name: string;
  mrp: number;
  base_trp: number;
}

export interface QueuedOrder {
  /** Also the idempotency key sent to create_order. */
  id: string;
  createdAt: string;
  chemistId: string;
  chemistName: string;
  items: QueuedOrderItem[];
  soPct: number;
  extraPct: number;
  remarks: string;
  netEstimate: number;
  status: "pending" | "failed";
  attempts: number;
  lastError?: string | undefined;
  lastAttemptAt?: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const outboxKey = (userId: string) => `pf-outbox:${userId}`;

export class Outbox {
  private listeners = new Set<() => void>();
  private cache: QueuedOrder[] | null = null;

  constructor(
    private store: KeyValueStore,
    readonly userId: string,
  ) {}

  get key() {
    return outboxKey(this.userId);
  }

  list(): QueuedOrder[] {
    if (this.cache) return this.cache;
    try {
      const raw = this.store.getItem(this.key);
      const parsed = raw ? (JSON.parse(raw) as QueuedOrder[]) : [];
      this.cache = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private write(next: QueuedOrder[]) {
    this.cache = next;
    if (next.length === 0) this.store.removeItem(this.key);
    else this.store.setItem(this.key, JSON.stringify(next));
    this.listeners.forEach((l) => l());
  }

  add(order: Omit<QueuedOrder, "status" | "attempts" | "createdAt"> & { createdAt?: string }) {
    const existing = this.list();
    if (existing.some((o) => o.id === order.id)) return;
    this.write([...existing, { ...order, createdAt: order.createdAt ?? new Date().toISOString(), status: "pending", attempts: 0 }]);
  }

  update(id: string, patch: Partial<QueuedOrder>) {
    this.write(this.list().map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  remove(id: string) {
    this.write(this.list().filter((o) => o.id !== id));
  }

  /** Put a failed order back in line for the next sync. */
  retry(id: string) {
    this.update(id, { status: "pending", lastError: undefined });
  }

  /** Re-read storage (another tab may have changed it). */
  reload() {
    this.cache = null;
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export interface RpcResult {
  data: unknown;
  error: { message?: string; code?: string; details?: string } | null;
  status?: number;
}

/**
 * "retry" = the server never gave a definitive answer (no connection, timeout, server
 * hiccup, expired sign-in) — keep the order queued. "reject" = the server checked the
 * order and refused it (e.g. not enough stock) — the user must fix it.
 */
export function classifyRpcError(r: Pick<RpcResult, "error" | "status">): "retry" | "reject" {
  const status = r.status ?? 0;
  const code = r.error?.code ?? "";
  const msg = `${r.error?.message ?? ""} ${r.error?.details ?? ""}`.toLowerCase();
  if (status === 0) return "retry";
  if (status === 401 || status === 403 || status === 408 || status === 429 || status >= 500) return "retry";
  if (code.startsWith("PGRST3")) return "retry"; // JWT problems
  if (code === "40001" || code === "40P01" || code === "57014") return "retry"; // serialization, deadlock, timeout
  if (!code && /failed to fetch|network|load failed|timeout|aborted/.test(msg)) return "retry";
  return "reject";
}

export interface SyncReport {
  synced: { order: QueuedOrder; orderId: string }[];
  rejected: { order: QueuedOrder; message: string }[];
  /** True when sync stopped early because the connection is still unusable. */
  interrupted: boolean;
}

/**
 * Submit queued orders oldest-first. Stops at the first connection problem (no point
 * hammering a dead network); business rejections are parked as "failed" and the
 * rest of the queue continues.
 */
export async function syncOutbox(outbox: Outbox, submit: (o: QueuedOrder) => Promise<RpcResult>): Promise<SyncReport> {
  const report: SyncReport = { synced: [], rejected: [], interrupted: false };
  const pending = outbox.list().filter((o) => o.status === "pending");
  for (const order of pending) {
    // Another tab may have handled it already.
    if (!outbox.list().some((o) => o.id === order.id && o.status === "pending")) continue;
    const attemptAt = new Date().toISOString();
    let res: RpcResult;
    try {
      res = await submit(order);
    } catch (e) {
      res = { data: null, error: { message: e instanceof Error ? e.message : String(e) }, status: 0 };
    }
    if (!res.error && typeof res.data === "string") {
      outbox.remove(order.id);
      report.synced.push({ order, orderId: res.data });
      continue;
    }
    const kind = res.error ? classifyRpcError(res) : "retry";
    if (kind === "retry") {
      outbox.update(order.id, { attempts: order.attempts + 1, lastAttemptAt: attemptAt, lastError: res.error?.message ?? "No response" });
      report.interrupted = true;
      break;
    }
    const message = res.error?.message ?? "Rejected by server";
    outbox.update(order.id, { status: "failed", attempts: order.attempts + 1, lastAttemptAt: attemptAt, lastError: message });
    report.rejected.push({ order, message });
  }
  return report;
}

/** Units of each product already promised to queued (not yet synced) orders. */
export function queuedQtyByProduct(orders: QueuedOrder[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "pending") continue;
    for (const it of o.items) m.set(it.product_id, (m.get(it.product_id) ?? 0) + it.qty);
  }
  return m;
}
