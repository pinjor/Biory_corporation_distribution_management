import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CloudOff, CloudUpload, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useOffline } from "@/components/app/offline-provider";
import { Money, Section } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateTime } from "@/lib/format";
import type { QueuedOrder } from "@/lib/offline/outbox";
import { ORDER_DRAFT_KEY, type OrderDraft } from "@/lib/offline/order-draft";
import { cn } from "@/lib/utils";

/** Header chip: offline state and how many orders are waiting to sync. */
export function SyncStatusChip() {
  const { online, pendingCount, failedCount, syncing, syncNow, lastSyncError } = useOffline();
  if (online && pendingCount === 0 && failedCount === 0) return null;
  const tone = failedCount > 0 ? "bg-destructive-soft text-destructive" : !online ? "bg-warning-soft text-warning-foreground" : "bg-info-soft text-info";
  const label = !online
    ? pendingCount > 0
      ? `Offline · ${pendingCount} to sync`
      : "Offline"
    : syncing
      ? "Syncing…"
      : failedCount > 0
        ? `${failedCount} need attention`
        : `${pendingCount} to sync`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", tone)} aria-label="Sync status">
          {!online ? <CloudOff className="size-3.5" /> : failedCount > 0 ? <AlertTriangle className="size-3.5" /> : <CloudUpload className={cn("size-3.5", syncing && "animate-pulse")} />}
          <span className="hidden sm:inline">{label}</span>
          <span className="num sm:hidden">{pendingCount + failedCount || ""}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1rem))] p-0">
        <QueuedOrdersList compact />
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>{!online ? "Orders sync automatically when you're back online." : lastSyncError ?? "Synced automatically in the background."}</span>
          <Button size="sm" variant="outline" onClick={() => void syncNow()} disabled={syncing || pendingCount === 0}>
            <RefreshCw className={cn(syncing && "animate-spin")} /> Sync
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Orders saved on this device that haven't reached the server yet. */
export function QueuedOrdersPanel() {
  const { queue, online, syncing, syncNow, pendingCount } = useOffline();
  if (queue.length === 0) return null;
  return (
    <Section
      className="mb-6"
      bodyClassName="p-0"
      title={
        <span className="flex items-center gap-2">
          <CloudUpload className="size-4 text-info" /> Waiting to sync on this device ({queue.length})
        </span>
      }
      actions={
        <Button size="sm" variant="outline" onClick={() => void syncNow()} disabled={!online || syncing || pendingCount === 0}>
          <RefreshCw className={cn(syncing && "animate-spin")} /> {online ? "Sync now" : "Offline"}
        </Button>
      }
    >
      <QueuedOrdersList />
    </Section>
  );
}

function QueuedOrdersList({ compact }: { compact?: boolean }) {
  const { queue, retry, discard } = useOffline();
  const navigate = useNavigate();
  if (queue.length === 0) return <p className="p-4 text-sm text-muted-foreground">Nothing waiting to sync.</p>;

  const edit = (o: QueuedOrder) => {
    const draft: OrderDraft = {
      chemist: o.chemistId,
      qty: Object.fromEntries(o.items.map((i) => [i.product_id, i.qty])),
      so: String(o.soPct),
      extra: String(o.extraPct),
      remarks: o.remarks,
    };
    localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify(draft));
    discard(o.id);
    navigate({ to: "/orders/new" });
  };

  return (
    <ul className={cn("divide-y", compact && "max-h-80 overflow-y-auto")}>
      {queue.map((o) => (
        <li key={o.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{o.chemistName}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  o.status === "failed" ? "bg-destructive-soft text-destructive" : "bg-info-soft text-info",
                )}
              >
                {o.status === "failed" ? "Not accepted" : "Pending"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {o.items.length} product{o.items.length === 1 ? "" : "s"} · approx. <Money value={o.netEstimate} /> · booked {formatDateTime(o.createdAt)}
            </div>
            {o.status === "failed" && o.lastError && <div className="mt-1 text-xs font-medium text-destructive">{o.lastError}</div>}
          </div>
          {!compact || o.status === "failed" ? (
            <div className="flex shrink-0 gap-1">
              {o.status === "failed" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => edit(o)}><Pencil /> Fix</Button>
                  <Button size="sm" variant="outline" onClick={() => retry(o.id)}><RefreshCw /> Retry</Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                aria-label="Discard queued order"
                onClick={() => {
                  if (window.confirm(`Discard the queued order for ${o.chemistName}? It has not been sent to the server.`)) discard(o.id);
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
