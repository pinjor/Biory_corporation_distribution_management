import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  HandCoins,
  PackageCheck,
  ShoppingCart,
  Stethoscope,
  Truck,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, StatCard, PageLoader, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/lib/session";
import { formatBDT, formatBDTCompact, formatInt, rangeFor, todayBD, type RangeKey } from "@/lib/format";
import { salesOfficersQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — PharmaField" }] }),
  component: Dashboard,
});

interface Summary {
  orders_count: number;
  order_value: number;
  delivered_value: number;
  collected_value: number;
  outstanding_due: number;
  overdue_due: number;
  wallet_balance: number;
  pending_deposits_count: number;
  pending_deposits_value: number;
  visits_count: number;
  new_chemists: number;
  pending_order_approvals: number;
  pending_requisitions: number;
  awaiting_issue: number;
  near_expiry_batches: number;
  expired_batches: number;
  low_stock_products: number;
  top_sos: { id: string; full_name: string; so_code: string; order_value: number; delivered: number; collected: number; visits: number; new_chemists: number }[];
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "custom", label: "Custom range" },
];

function Dashboard() {
  const s = useSession();
  return s.isStaff ? <AdminDashboard /> : <SODashboard />;
}

function useSummary(from: string, to: string, so: string | null) {
  return useQuery({
    queryKey: ["dashboard", from, to, so],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_summary", so ? { p_from: from, p_to: to, p_so: so } : { p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as Summary;
    },
  });
}

function AdminDashboard() {
  const s = useSession();
  const [range, setRange] = useState<RangeKey>("month");
  const [custom, setCustom] = useState(() => rangeFor("month"));
  const [so, setSo] = useState<string>("");
  const r = range === "custom" ? custom : rangeFor(range);
  const { data, isLoading } = useSummary(r.from, r.to, so || null);
  const sos = useQuery(salesOfficersQuery);

  return (
    <div>
      <PageHeader
        eyebrow="Company overview"
        title={`Good day, ${s.profile?.full_name?.split(" ")[0] || "there"}`}
        description="Orders, fulfilment, receivables and stock health across all Sales Officers."
        actions={
          <>
            <NativeSelect value={range} onChange={(e) => setRange(e.target.value as RangeKey)} className="w-36">
              {RANGES.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </NativeSelect>
            {range === "custom" && (
              <>
                <Input type="date" className="w-38" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                <Input type="date" className="w-38" value={custom.to} max={todayBD()} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
              </>
            )}
            <NativeSelect value={so} onChange={(e) => setSo(e.target.value)} className="w-44">
              <option value="">All Sales Officers</option>
              {(sos.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} {p.so_code ? `(${p.so_code})` : ""}
                </option>
              ))}
            </NativeSelect>
          </>
        }
      />
      {isLoading || !data ? (
        <PageLoader />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Orders" value={formatInt(data.orders_count)} hint={formatBDTCompact(data.order_value)} icon={<ShoppingCart />} />
            <StatCard label="Delivered" value={formatBDTCompact(data.delivered_value)} icon={<Truck />} tone="info" />
            <StatCard label="Collected" value={formatBDTCompact(data.collected_value)} icon={<HandCoins />} tone="success" />
            <StatCard
              label="Outstanding due"
              value={formatBDTCompact(data.outstanding_due)}
              hint={data.overdue_due > 0 ? `${formatBDT(data.overdue_due)} overdue` : "Nothing overdue"}
              icon={<AlertTriangle />}
              tone={data.overdue_due > 0 ? "destructive" : "default"}
            />
            <StatCard label="SO wallets" value={formatBDTCompact(data.wallet_balance)} hint="Cash held by SOs" icon={<Wallet />} tone="warning" />
            <StatCard label="Doctor visits" value={formatInt(data.visits_count)} hint={`${data.new_chemists} new chemists`} icon={<Stethoscope />} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Section title="Sales Officer performance" bodyClassName="p-0">
              {data.top_sos.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title="No Sales Officers yet"
                    description="Assign the Sales Officer role to users to see their performance here."
                    action={
                      s.isSuper ? (
                        <Button asChild size="sm">
                          <Link to="/users">Manage users</Link>
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SO</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Delivered</TableHead>
                      <TableHead className="text-right">Collected</TableHead>
                      <TableHead className="text-right">Efficiency</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.top_sos.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="font-medium">{t.full_name}</div>
                          <div className="num text-xs text-muted-foreground">{t.so_code}</div>
                        </TableCell>
                        <TableCell className="num text-right">{formatBDTCompact(t.order_value)}</TableCell>
                        <TableCell className="num text-right">{formatBDTCompact(t.delivered)}</TableCell>
                        <TableCell className="num text-right">{formatBDTCompact(t.collected)}</TableCell>
                        <TableCell className="num text-right">
                          {t.delivered > 0 ? `${Math.round((t.collected / t.delivered) * 100)}%` : "—"}
                        </TableCell>
                        <TableCell className="num text-right">{t.visits}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Section>

            <div className="flex flex-col gap-6">
              <Section title="Pending approvals">
                <ul className="flex flex-col gap-2 text-sm">
                  <AlertRow to="/orders" label="Orders awaiting discount / credit approval" count={data.pending_order_approvals} />
                  <AlertRow to="/deposits" label={`Deposits to verify (${formatBDT(data.pending_deposits_value)})`} count={data.pending_deposits_count} />
                  <AlertRow to="/requisitions" label="Requisitions to decide" count={data.pending_requisitions} />
                  <AlertRow to="/requisitions" label="Approved requisitions to issue" count={data.awaiting_issue} />
                </ul>
              </Section>
              <Section title="Stock alerts">
                <ul className="flex flex-col gap-2 text-sm">
                  <AlertRow to="/inventory" label="Batches near expiry" count={data.near_expiry_batches} tone="warning" />
                  <AlertRow to="/inventory" label="Expired batches still holding stock" count={data.expired_batches} tone="destructive" />
                  <AlertRow to="/reports" label="Products below reorder level" count={data.low_stock_products} tone="warning" />
                </ul>
              </Section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertRow({
  to,
  label,
  count,
  tone = "info",
}: {
  to: "/orders" | "/deposits" | "/requisitions" | "/inventory" | "/reports";
  label: string;
  count: number;
  tone?: "info" | "warning" | "destructive";
}) {
  const cls =
    count === 0
      ? "bg-muted text-muted-foreground"
      : tone === "destructive"
        ? "bg-destructive-soft text-destructive"
        : tone === "warning"
          ? "bg-warning-soft text-warning-foreground"
          : "bg-info-soft text-info";
  return (
    <li>
      <Link to={to} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted">
        <span>{label}</span>
        <span className={`num min-w-8 rounded-md px-2 py-0.5 text-center text-xs font-semibold ${cls}`}>{count}</span>
      </Link>
    </li>
  );
}

function SODashboard() {
  const s = useSession();
  const today = todayBD();
  const { data } = useSummary(today, today, s.userId);
  const month = rangeFor("month");
  const { data: m } = useSummary(month.from, month.to, s.userId);
  const first = s.profile?.full_name?.split(" ")[0] || "there";

  const tiles: { to: "/orders/new" | "/orders" | "/visits/new" | "/inventory" | "/wallet" | "/requisitions/new"; label: string; hint: string; icon: React.ReactNode }[] = [
    { to: "/orders/new", label: "New order", hint: "Book a chemist order", icon: <ShoppingCart /> },
    { to: "/orders", label: "Deliver / collect", hint: "Open orders & dues", icon: <PackageCheck /> },
    { to: "/visits/new", label: "Doctor visit", hint: "Log visit & samples", icon: <Stethoscope /> },
    { to: "/inventory", label: "My stock", hint: "Saleable & promo", icon: <Boxes /> },
    { to: "/wallet", label: "Deposit money", hint: "Settle with company", icon: <Wallet /> },
    { to: "/requisitions/new", label: "Request stock", hint: "From central warehouse", icon: <ClipboardList /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-hero rounded-2xl p-5 text-sidebar-foreground sm:p-6">
        <div className="text-xs uppercase tracking-[0.16em] text-sidebar-primary">Today · {today}</div>
        <h1 className="mt-1 text-2xl font-semibold text-sidebar-accent-foreground">Good day, {first}</h1>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Kpi label="Orders" value={formatInt(data?.orders_count)} />
          <Kpi label="Collected" value={formatBDTCompact(data?.collected_value)} />
          <Kpi label="Visits" value={formatInt(data?.visits_count)} />
          <Kpi label="Wallet" value={formatBDTCompact(data?.wallet_balance)} accent />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {tiles.map((t) => (
            <Button key={t.to + t.label} asChild variant="tile">
              <Link to={t.to}>
                <span className="text-primary">{t.icon}</span>
                <span>
                  <span className="block font-semibold">{t.label}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{t.hint}</span>
                </span>
              </Link>
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="This month · orders" value={formatBDTCompact(m?.order_value)} hint={`${m?.orders_count ?? 0} orders`} />
        <StatCard label="This month · collected" value={formatBDTCompact(m?.collected_value)} tone="success" />
        <StatCard
          label="My outstanding due"
          value={formatBDTCompact(m?.outstanding_due)}
          hint={m && m.overdue_due > 0 ? `${formatBDT(m.overdue_due)} overdue` : "Nothing overdue"}
          tone={m && m.overdue_due > 0 ? "destructive" : "default"}
        />
      </div>

      {m && (m.near_expiry_batches > 0 || m.expired_batches > 0 || m.pending_order_approvals > 0) && (
        <Section title="Heads up">
          <ul className="flex flex-col gap-2 text-sm">
            {m.pending_order_approvals > 0 && <AlertRow to="/orders" label="Orders waiting for approval" count={m.pending_order_approvals} />}
            {m.near_expiry_batches > 0 && <AlertRow to="/inventory" label="Batches in my stock near expiry" count={m.near_expiry_batches} tone="warning" />}
            {m.expired_batches > 0 && <AlertRow to="/inventory" label="Expired batches in my stock" count={m.expired_batches} tone="destructive" />}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-sidebar-foreground/70">{label}</div>
      <div className={`num text-xl font-semibold ${accent ? "text-sidebar-primary" : "text-sidebar-accent-foreground"}`}>{value}</div>
    </div>
  );
}
