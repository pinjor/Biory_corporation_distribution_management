import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader, Section, StatusBadge, EmptyState, Money, Qty } from "@/components/app/page";
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

const TABS = ["chemist", "doctor", "submitted", "requisition", "issued", "received", "open", "to_deliver", "unpaid"] as const;
type Tab = (typeof TABS)[number];

const LABELS: Record<Tab, string> = {
  chemist: "Chemist",
  doctor: "Doctor",
  submitted: "Submitted",
  requisition: "Requisition",
  issued: "Issued",
  received: "Received",
  open: "Open",
  to_deliver: "To deliver",
  unpaid: "Unpaid",
};

function isTab(value: unknown): value is Tab {
  return typeof value === "string" && (TABS as readonly string[]).includes(value);
}

function readTab(s: Record<string, unknown>): Tab | undefined {
  return isTab(s["tab"]) ? s["tab"] : undefined;
}

export const Route = createFileRoute("/_authenticated/orders/")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => {
    const tab = readTab(s);
    return tab ? { tab } : {};
  },
  head: () => ({ meta: [{ title: "Orders — BIORY Corporation" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const s = useSession();
  const navigate = useNavigate();
  const tab = Route.useSearch().tab ?? "chemist";
  const orderTab = tab === "chemist" || tab === "open" || tab === "to_deliver" || tab === "unpaid";
  const { online } = useOffline();
  const today = todayBD();
  const [so, setSo] = useState("");
  const [territory, setTerritory] = useState("");
  const [from, setFrom] = useState(addDays(today, -90));
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");

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
  const { data: requisitions = [], isLoading: reqLoading } = useQuery({
    queryKey: ["requisitions", "board"],
    queryFn: async () => {
      const { data, error } = await api
        .from("requisitions")
        .select("*, profiles!requisitions_so_id_fkey(full_name, so_code), requisition_items(requested_qty)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: chemists = [] } = useQuery({
    queryKey: ["chemists", "names"],
    queryFn: async () => {
      const { data, error } = await api.from("chemists").select("id, business_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: doctors = [] } = useQuery({
    queryKey: ["doctors", "names"],
    queryFn: async () => {
      const { data, error } = await api.from("doctors").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: sos = [] } = useQuery({ ...salesOfficersQuery, enabled: s.isStaff });
  const { data: territories = [] } = useQuery(territoriesQuery);

  const chemistName = new Map(chemists.map((c) => [c.id, c.business_name as string]));
  const doctorName = new Map(doctors.map((d) => [d.id, d.name as string]));

  const orderRows = orders.filter((o) => {
    if (o.order_date < from || o.order_date > to) return false;
    if (so && o.so_id !== so) return false;
    if (territory && o.chemists?.territory_id !== territory) return false;
    if (q && !`${o.order_no} ${o.chemists?.business_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (tab === "chemist") return true;
    if (tab === "open") return ["PENDING_APPROVAL", "CONFIRMED"].includes(o.status);
    if (tab === "to_deliver") return o.status === "CONFIRMED" && o.delivery_status !== "DELIVERED";
    if (tab === "unpaid") return Number(o.due) > 0 && o.status !== "CANCELLED";
    return false;
  });
  const reqRows = requisitions.filter((r) => {
    const party = r.party_kind === "doctor" ? doctorName.get(r.party_id) : chemistName.get(r.party_id);
    if (q && !`${r.req_no} ${party ?? ""} ${r.profiles?.full_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (tab === "doctor") return r.party_kind === "doctor";
    if (tab === "submitted") return r.status === "SUBMITTED";
    if (tab === "requisition") return true;
    if (tab === "issued") return r.status === "ISSUED";
    if (tab === "received") return r.status === "RECEIVED";
    return false;
  });
  const loading = orderTab && !isSuccess && (fetchStatus === "paused" || !online)
    ? "offline"
    : ordersLoading || reqLoading
      ? "loading"
      : "ready";

  const partyOf = (r: (typeof requisitions)[number]) => {
    if (r.party_kind === "doctor") return doctorName.get(r.party_id) ?? "Doctor";
    if (r.party_id) return chemistName.get(r.party_id) ?? "Chemist shop";
    return r.profiles?.full_name ?? "Sales Officer";
  };

  return (
    <div>
      <PageHeader
        title="Orders"
        description="One list. Use the tabs to see chemist shops, doctors, submitted requests, requisitions, and open orders."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv("orders.csv", [
                  ["order_no", "date", "chemist", "so", "status", "delivery", "payment", "net_total", "due"],
                  ...orderRows.map((o) => [o.order_no, o.order_date, o.chemists?.business_name, o.profiles?.full_name, o.status, o.delivery_status, o.payment_status, o.net_total, o.due]),
                ])
              }
            >
              Export CSV
            </Button>
            {(s.isSO || s.isWarehouse) && (
              <Button asChild variant="outline">
                <Link to="/requisitions/new"><Plus /> New requisition</Link>
              </Button>
            )}
            {(s.isSO || s.isSuper) && (
              <Button asChild>
                <Link to="/orders/new"><Plus /> New order</Link>
              </Button>
            )}
          </>
        }
      />
      {s.isSO && <QueuedOrdersPanel />}
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((key) => (
          <Button key={key} size="sm" variant={tab === key ? "default" : "ghost"} onClick={() => navigate({ to: "/orders", search: { tab: key } })}>
            {LABELS[key]}
          </Button>
        ))}
      </div>
      <Section
        bodyClassName="p-0"
        title={LABELS[tab]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Input placeholder={orderTab ? "Order / chemist…" : "Number / party…"} value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-40" />
            {orderTab && (
              <>
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
              </>
            )}
          </div>
        }
      >
        {loading === "offline" ? (
          <div className="p-6 text-sm text-muted-foreground">You're offline. This list appears once you're connected again.</div>
        ) : loading === "loading" ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : orderTab ? (
          <OrderTable rows={orderRows} isStaff={s.isStaff} today={today} />
        ) : (
          <RequisitionTable rows={reqRows} partyOf={partyOf} />
        )}
      </Section>
    </div>
  );
}

function OrderTable({ rows, isStaff, today }: { rows: any[]; isStaff: boolean; today: string }) {
  if (rows.length === 0) return <div className="p-5"><EmptyState title="No orders here" /></div>;
  const sum = (k: "net_total" | "due") => rows.reduce((a, o) => a + Number(o[k] ?? 0), 0);
  return (
    <div>
      <div className="px-4 py-3 text-sm text-muted-foreground">
        {rows.length} orders · net <Money value={sum("net_total")} /> · due <Money value={sum("due")} className="text-destructive" />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Chemist shop</TableHead>
            {isStaff && <TableHead>SO</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Net</TableHead>
            <TableHead className="text-right">Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((o) => {
            const overdue = o.first_delivered_at && Number(o.due) > 0 && addDays(o.first_delivered_at, o.chemists?.payment_terms_days ?? 30) < today;
            return (
              <TableRow key={o.id}>
                <TableCell>
                  <Link to="/orders/$id" params={{ id: o.id }} className="num font-medium text-primary hover:underline">{o.order_no}</Link>
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
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function RequisitionTable({ rows, partyOf }: { rows: any[]; partyOf: (r: any) => string }) {
  if (rows.length === 0) return <div className="p-5"><EmptyState title="Nothing in this tab" /></div>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Requisition</TableHead>
          <TableHead>Party</TableHead>
          <TableHead>Sales Officer</TableHead>
          <TableHead className="text-right">Requested</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <Link to="/requisitions/$id" params={{ id: r.id }} className="num font-medium text-primary hover:underline">{r.req_no}</Link>
              <div className="text-xs text-muted-foreground">{formatDate(r.created_at)}</div>
            </TableCell>
            <TableCell className="text-sm">
              {partyOf(r)}
              <div className="text-xs capitalize text-muted-foreground">{r.party_kind ?? "field"}</div>
            </TableCell>
            <TableCell className="text-sm">{r.profiles?.full_name}</TableCell>
            <TableCell className="text-right"><Qty value={(r.requisition_items ?? []).reduce((a: number, i: { requested_qty: number }) => a + i.requested_qty, 0)} /></TableCell>
            <TableCell><StatusBadge status={r.status} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
