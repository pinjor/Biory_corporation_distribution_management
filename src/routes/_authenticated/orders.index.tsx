import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpDown,
  Check,
  Clock,
  Coins,
  Download,
  Eye,
  Pencil,
  Plus,
  MapPin,
  ShoppingCart,
  Trash2,
  Truck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar } from "@/components/app/list-toolbar";
import { EmptyState, Money, StatusBadge } from "@/components/app/page";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { salesOfficersQuery, territoriesQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { addDays, errorMessage, formatDate, todayBD } from "@/lib/format";
import { downloadOrderById } from "@/lib/order-report";
import { QueuedOrdersPanel } from "@/components/app/sync-status";
import { useOffline } from "@/components/app/offline-provider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({ meta: [{ title: "Orders — BIORY Corporation" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const s = useSession();
  const { online } = useOffline();
  const today = todayBD();
  const [so, setSo] = useState("");
  const [territory, setTerritory] = useState("");
  const [from, setFrom] = useState(addDays(today, -90));
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<{ key: "order_no" | "net_total" | "due"; dir: "asc" | "desc" } | null>(null);

  const { data: orders = [], isLoading: ordersLoading, isSuccess, fetchStatus } = useQuery({
    queryKey: ["orders", "board"],
    queryFn: async () => {
      const { data, error } = await api
        .from("orders")
        .select("*, chemists(business_name, code, territory_id, payment_terms_days), profiles!orders_so_id_fkey(full_name, so_code)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: sos = [] } = useQuery({ ...salesOfficersQuery, enabled: s.isStaff });
  const { data: territories = [] } = useQuery(territoriesQuery);

  const orderRows = useMemo(() => {
    const rows = orders.filter((o) => {
      if (o.order_date < from || o.order_date > to) return false;
      if (so && o.so_id !== so) return false;
      if (territory && o.chemists?.territory_id !== territory) return false;
      if (q && !`${o.order_no} ${o.chemists?.business_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "order_no") return String(a.order_no).localeCompare(String(b.order_no)) * dir;
      return (Number(a[sort.key] ?? 0) - Number(b[sort.key] ?? 0)) * dir;
    });
  }, [orders, from, to, so, territory, q, sort]);
  const page = usePagedRows(orderRows, `${q}|${from}|${to}|${so}|${territory}|${sort?.key ?? ""}|${sort?.dir ?? ""}`);

  const loading = !isSuccess && (fetchStatus === "paused" || !online)
    ? "offline"
    : ordersLoading
      ? "loading"
      : "ready";

  const net = orderRows.reduce((a, o) => a + Number(o.net_total ?? 0), 0);
  const due = orderRows.reduce((a, o) => a + Number(o.due ?? 0), 0);
  const delivered = orderRows.filter((o) => o.delivery_status === "DELIVERED").length;
  const pending = orderRows.filter((o) => o.status === "CONFIRMED" && o.delivery_status !== "DELIVERED").length;

  function resetFilters() {
    setQ("");
    setSo("");
    setTerritory("");
    setFrom(addDays(today, -90));
    setTo(today);
  }

  function toggleSort(key: "order_no" | "net_total" | "due") {
    setSort((cur) => (cur?.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  const pageIds = page.pageRows.map((r) => r.id as string);
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const someChecked = pageIds.some((id) => selected.includes(id));

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <ShoppingCart className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">Orders</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Sales orders for chemist shops.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(s.isSO || s.isSuper) && (
            <Button asChild className="rounded-xl">
              <Link to="/orders/new"><Plus /> New order</Link>
            </Button>
          )}
        </div>
      </div>

      {s.isSO && <QueuedOrdersPanel />}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={<ShoppingCart className="size-5" />} label="Total orders" value={orderRows.length} />
        <Metric icon={<Coins className="size-5" />} label="Net amount" value={<Money value={net} />} />
        <Metric icon={<Clock className="size-5" />} label="Due amount" value={<Money value={due} />} tone="red" />
        <Metric icon={<Check className="size-5" />} label="Delivered" value={delivered} />
        <Metric icon={<Truck className="size-5" />} label="Pending delivery" value={pending} tone="amber" />
      </div>

      <section className="surface-card overflow-hidden">
        <header className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-base font-semibold text-foreground">Orders</h2>
          <ListToolbar query={q} onQuery={setQ} placeholder="Order / chemist…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
            <NativeSelect leading={<MapPin />} value={territory} onChange={(e) => setTerritory(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Territory">
              <option value="">All territories</option>
              {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </NativeSelect>
            {s.isStaff && (
              <NativeSelect leading={<Users />} value={so} onChange={(e) => setSo(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Sales officer">
                <option value="">All SOs</option>
                {sos.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </NativeSelect>
            )}
            <FilterClear onClick={resetFilters} />
          </ListToolbar>
        </header>

        {loading === "offline" ? (
          <div className="p-6 text-sm text-muted-foreground">You're offline. This list appears once you're connected again.</div>
        ) : loading === "loading" ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : orderRows.length === 0 ? (
          <div className="p-5"><EmptyState title="No orders here" /></div>
        ) : (
          <>
            <div className="px-4 py-2.5 text-sm text-muted-foreground">
              {orderRows.length} orders · Net <Money value={net} className="font-medium text-foreground" /> · Due <Money value={due} className="font-medium text-destructive" />
            </div>
            <div className="mx-3 overflow-hidden rounded-xl border">
              <OrderTable
                rows={page.pageRows}
                isStaff={s.isStaff}
                today={today}
                selected={selected}
                allChecked={allChecked}
                someChecked={someChecked}
                onToggleAll={() => setSelected(allChecked ? selected.filter((id) => !pageIds.includes(id)) : [...new Set([...selected, ...pageIds])])}
                onToggle={(id) => setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])}
                onSort={toggleSort}
              />
            </div>
            <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="orders" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </section>
    </div>
  );
}

function Metric({ icon, label, value, tone = "green" }: { icon: ReactNode; label: string; value: ReactNode; tone?: "green" | "red" | "amber" }) {
  const toneCls = {
    green: "bg-primary-soft text-primary",
    red: "bg-destructive-soft text-destructive",
    amber: "bg-warning-soft text-warning-foreground",
  }[tone];
  return (
    <div className="surface-card flex items-center gap-3 px-4 py-3.5">
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", toneCls)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("num truncate text-xl font-semibold", tone === "red" ? "text-destructive" : "text-foreground")}>{value}</div>
      </div>
    </div>
  );
}

const headCls = "bg-primary text-[13px] font-medium normal-case tracking-normal text-primary-foreground";

function OrderTable({
  rows, isStaff, today, selected, allChecked, someChecked, onToggleAll, onToggle, onSort,
}: {
  rows: any[];
  isStaff: boolean;
  today: string;
  selected: string[];
  allChecked: boolean;
  someChecked: boolean;
  onToggleAll: () => void;
  onToggle: (id: string) => void;
  onSort: (key: "order_no" | "net_total" | "due") => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-0 hover:bg-primary">
          <TableHead className={cn(headCls, "w-10")}>
            <Checkbox
              aria-label="Select all on this page"
              checked={allChecked ? true : someChecked ? "indeterminate" : false}
              onCheckedChange={onToggleAll}
              className="border-primary-foreground/70 data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary"
            />
          </TableHead>
          <SortHead label="Order no." onClick={() => onSort("order_no")} />
          <TableHead className={headCls}>Chemist shop</TableHead>
          {isStaff && <TableHead className={headCls}>SO</TableHead>}
          <TableHead className={headCls}>Status</TableHead>
          <SortHead label="Net amount" align="right" onClick={() => onSort("net_total")} />
          <SortHead label="Due amount" align="right" onClick={() => onSort("due")} />
          <TableHead className={cn(headCls, "text-right")}>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((o) => {
          const overdue = o.first_delivered_at && Number(o.due) > 0 && addDays(o.first_delivered_at, o.chemists?.payment_terms_days ?? 30) < today;
          return (
            <TableRow key={o.id} data-state={selected.includes(o.id) ? "selected" : undefined}>
              <TableCell>
                <Checkbox aria-label={`Select ${o.order_no}`} checked={selected.includes(o.id)} onCheckedChange={() => onToggle(o.id)} />
              </TableCell>
              <TableCell>
                <Link to="/orders/$id" params={{ id: o.id }} className="num font-semibold text-foreground hover:text-primary hover:underline">{o.order_no}</Link>
                <div className="text-xs text-muted-foreground">{formatDate(o.order_date)}</div>
              </TableCell>
              <TableCell className="text-sm">{o.chemists?.business_name}</TableCell>
              {isStaff && <TableCell className="text-sm">{o.profiles?.full_name}</TableCell>}
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <StatusBadge status={o.status} />
                  {o.status !== "CANCELLED" && o.status !== "PENDING_APPROVAL" && <StatusBadge status={o.delivery_status} />}
                  {overdue && <StatusBadge status="UNPAID" label="overdue" />}
                </div>
              </TableCell>
              <TableCell className="text-right"><Money value={o.net_total} /></TableCell>
              <TableCell className="text-right"><Money value={o.due} className={Number(o.due) > 0 ? "font-semibold text-destructive" : "text-muted-foreground"} /></TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <OrderRowActions order={o} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SortHead({ label, align, onClick }: { label: string; align?: "right"; onClick: () => void }) {
  return (
    <TableHead className={cn(headCls, align === "right" && "text-right")}>
      <button type="button" onClick={onClick} className={cn("inline-flex cursor-pointer items-center gap-1", align === "right" && "ml-auto")}>
        {label}
        <ArrowUpDown className="size-3.5 opacity-80" />
      </button>
    </TableHead>
  );
}

function OrderRowActions({
  order,
}: {
  order: {
    id: string;
    order_no: string;
    status: string;
    delivery_status: string;
    due: unknown;
    so_id: string;
    stock_from?: string | null;
  };
}) {
  const s = useSession();
  const qc = useQueryClient();
  const [cancel, setCancel] = useState(false);
  const mine = order.so_id === s.userId;
  const openForChange = ["PENDING_APPROVAL", "CONFIRMED"].includes(order.status) && order.delivery_status === "NOT_DELIVERED";
  const canEdit = (mine || s.isSuper) && openForChange;
  const canCancel = (mine || s.isAdmin) && openForChange;
  const canDeliver = (mine || (order.stock_from === "central" && s.isAdmin)) && order.status === "CONFIRMED" && order.delivery_status !== "DELIVERED";

  return (
    <div className="inline-flex items-center justify-end gap-0.5">
      <Button asChild size="icon" variant="ghost" aria-label={`View ${order.order_no}`} className="size-8">
        <Link to="/orders/$id" params={{ id: order.id }}><Eye /></Link>
      </Button>
      {canEdit && (
        <Button asChild size="icon" variant="ghost" aria-label={`Edit ${order.order_no}`} className="size-8">
          <Link to="/orders/new" search={{ edit: order.id }}><Pencil /></Link>
        </Button>
      )}
      {canCancel && (
        <Button size="icon" variant="ghost" aria-label={`Delete ${order.order_no}`} className="size-8" onClick={() => setCancel(true)}>
          <Trash2 />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Download ${order.order_no}`}
        className="size-8"
        onClick={() => void downloadOrderById(order.id).catch((e) => toast.error(errorMessage(e)))}
      >
        <Download />
      </Button>
      {canDeliver && (
        <Button asChild size="icon" variant="ghost" aria-label={`Deliver ${order.order_no}`} className="size-8">
          <Link to="/orders/$id" params={{ id: order.id }} search={{ do: "deliver" }}><Truck /></Link>
        </Button>
      )}
      {cancel && (
        <ReasonDialog
          title={`Delete ${order.order_no}`}
          confirm="Delete order"
          note="This cancels the order before delivery. A reason is required, and the ledger keeps the cancellation."
          onClose={() => setCancel(false)}
          run={async (reason) => {
            const { error } = await api.rpc("cancel_order", { p_id: order.id, p_reason: reason });
            if (error) throw error;
            await qc.invalidateQueries({ queryKey: ["orders"] });
          }}
        />
      )}
    </div>
  );
}

