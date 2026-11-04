import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, StatusBadge, EmptyState, Money } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { salesOfficersQuery, territoriesQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { addDays, formatDate, todayBD } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { QueuedOrdersPanel } from "@/components/app/sync-status";
import { useOffline } from "@/components/app/offline-provider";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({ meta: [{ title: "Orders — BIORY Corporation" }] }),
  component: OrdersPage,
});

type View = "all" | "open" | "approval" | "to_deliver" | "unpaid" | "partially_paid" | "paid" | "overdue" | "cancelled";

const VIEWS: { key: View; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "approval", label: "Awaiting approval" },
  { key: "to_deliver", label: "To deliver" },
  { key: "unpaid", label: "Unpaid" },
  { key: "partially_paid", label: "Partially paid" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

function OrdersPage() {
  const s = useSession();
  const [view, setView] = useState<View>("open");
  const [so, setSo] = useState("");
  const [territory, setTerritory] = useState("");
  const [from, setFrom] = useState(addDays(todayBD(), -90));
  const [to, setTo] = useState(todayBD());
  const [q, setQ] = useState("");
  const { data: sos = [] } = useQuery({ ...salesOfficersQuery, enabled: s.isStaff });
  const { data: territories = [] } = useQuery(territoriesQuery);

  const { online } = useOffline();
  const { data = [], isLoading, isSuccess, fetchStatus } = useQuery({
    queryKey: ["orders", view, so, from, to],
    queryFn: async () => {
      let qq = supabase
        .from("orders")
        .select("*, chemists(business_name, code, territory_id, payment_terms_days), profiles!orders_so_id_fkey(full_name, so_code)")
        .gte("order_date", from)
        .lte("order_date", to)
        .order("created_at", { ascending: false })
        .limit(500);
      if (so) qq = qq.eq("so_id", so);
      switch (view) {
        case "open": qq = qq.in("status", ["PENDING_APPROVAL", "CONFIRMED"]); break;
        case "approval": qq = qq.eq("status", "PENDING_APPROVAL"); break;
        case "to_deliver": qq = qq.eq("status", "CONFIRMED").neq("delivery_status", "DELIVERED"); break;
        case "unpaid": qq = qq.eq("payment_status", "UNPAID").gt("delivered_value", 0); break;
        case "partially_paid": qq = qq.eq("payment_status", "PARTIALLY_PAID"); break;
        case "paid": qq = qq.eq("payment_status", "PAID"); break;
        case "overdue": qq = qq.gt("due", 0).neq("status", "CANCELLED"); break;
        case "cancelled": qq = qq.eq("status", "CANCELLED"); break;
      }
      const { data, error } = await qq;
      if (error) throw error;
      return data;
    },
  });

  const today = todayBD();
  const rows = data.filter((o) => {
    if (territory && o.chemists?.territory_id !== territory) return false;
    if (q && !`${o.order_no} ${o.chemists?.business_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (view === "overdue") {
      if (!o.first_delivered_at) return false;
      return addDays(o.first_delivered_at, o.chemists?.payment_terms_days ?? 30) < today;
    }
    return true;
  });
  const sum = (k: "net_total" | "delivered_value" | "collected_value" | "due") => rows.reduce((a, o) => a + Number(o[k]), 0);

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Orders, deliveries and collections are separate documents — an order can be delivered and paid in parts."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv("orders.csv", [
                  ["order_no", "date", "chemist", "so", "status", "delivery", "payment", "net_total", "delivered", "collected", "due"],
                  ...rows.map((o) => [o.order_no, o.order_date, o.chemists?.business_name, o.profiles?.full_name, o.status, o.delivery_status, o.payment_status, o.net_total, o.delivered_value, o.collected_value, o.due]),
                ])
              }
            >
              Export CSV
            </Button>
            {s.isSO && (
              <Button asChild>
                <Link to="/orders/new"><Plus /> New order</Link>
              </Button>
            )}
          </>
        }
      />
      {s.isSO && <QueuedOrdersPanel />}
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {VIEWS.map((v) => (
          <Button key={v.key} size="sm" variant={view === v.key ? "default" : "ghost"} onClick={() => setView(v.key)}>
            {v.label}
          </Button>
        ))}
      </div>
      <Section
        bodyClassName="p-0"
        title={
          <span>
            {rows.length} orders · net <Money value={sum("net_total")} /> · due <Money value={sum("due")} className="text-destructive" />
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Order / chemist…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-40" />
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" />
            <Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" />
            <NativeSelect value={territory} onChange={(e) => setTerritory(e.target.value)} className="h-8 w-36">
              <option value="">All territories</option>
              {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </NativeSelect>
            {s.isStaff && (
              <NativeSelect value={so} onChange={(e) => setSo(e.target.value)} className="h-8 w-40">
                <option value="">All SOs</option>
                {sos.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </NativeSelect>
            )}
          </div>
        }
      >
        {!isSuccess && (fetchStatus === "paused" || !online) ? (
          <div className="p-6 text-sm text-muted-foreground">You're offline. Order history appears here once you're connected again.</div>
        ) : isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No orders here" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Chemist</TableHead>
                {s.isStaff && <TableHead>SO</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link to="/orders/$id" params={{ id: o.id }} className="num font-medium text-primary hover:underline">{o.order_no}</Link>
                    <div className="text-xs text-muted-foreground">{formatDate(o.order_date)}</div>
                  </TableCell>
                  <TableCell className="text-sm">{o.chemists?.business_name}</TableCell>
                  {s.isStaff && <TableCell className="text-sm">{o.profiles?.full_name}</TableCell>}
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={o.status} />
                      {o.status !== "CANCELLED" && o.status !== "PENDING_APPROVAL" && <StatusBadge status={o.delivery_status} />}
                      {o.delivered_value > 0 && <StatusBadge status={o.payment_status} />}
                    </div>
                  </TableCell>
                  <TableCell className="text-right"><Money value={o.net_total} /></TableCell>
                  <TableCell className="text-right"><Money value={o.delivered_value} /></TableCell>
                  <TableCell className="text-right"><Money value={o.collected_value} /></TableCell>
                  <TableCell className="text-right">
                    <Money value={o.due} className={Number(o.due) > 0 ? "font-semibold text-destructive" : "text-muted-foreground"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
