import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { productsQuery, settingsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { addDays, daysBetween, formatBDT, formatDate, formatInt, rangeFor, todayBD } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — PharmaField" }] }),
  component: ReportsPage,
});

type ReportKey = "outstanding" | "so" | "product" | "collections" | "discounts" | "stock" | "expiry" | "promo";

const REPORTS: { key: ReportKey; label: string; staffOnly?: boolean }[] = [
  { key: "outstanding", label: "Outstanding & ageing" },
  { key: "so", label: "SO performance", staffOnly: true },
  { key: "product", label: "Product sales" },
  { key: "collections", label: "Collections" },
  { key: "discounts", label: "Discounts" },
  { key: "stock", label: "Low stock (central)" },
  { key: "expiry", label: "Near expiry / expired" },
  { key: "promo", label: "Promotional usage" },
];

interface Col<T> {
  label: string;
  get: (r: T) => string | number | null | undefined;
  money?: boolean;
  num?: boolean;
}

function ReportTable<T>({ name, cols, rows, footer }: { name: string; cols: Col<T>[]; rows: T[]; footer?: ReactNode }) {
  return (
    <Section
      title={`${rows.length} rows`}
      bodyClassName="p-0"
      actions={
        <Button size="sm" variant="outline" onClick={() => downloadCsv(`${name}.csv`, [cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => c.get(r)))])}>
          Export CSV
        </Button>
      }
    >
      {rows.length === 0 ? (
        <div className="p-5"><EmptyState title="Nothing to report for this selection" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((c) => <TableHead key={c.label} className={c.money || c.num ? "text-right" : ""}>{c.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                {cols.map((c) => {
                  const v = c.get(r);
                  return (
                    <TableCell key={c.label} className={c.money || c.num ? "num text-right" : "text-sm"}>
                      {c.money ? formatBDT(v) : c.num ? formatInt(v) : (v ?? "—")}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {footer}
    </Section>
  );
}

function ReportsPage() {
  const s = useSession();
  const [report, setReport] = useState<ReportKey>("outstanding");
  const month = rangeFor("month");
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const list = REPORTS.filter((r) => !r.staffOnly || s.isStaff);
  const needsRange = ["so", "product", "collections", "discounts", "promo"].includes(report);
  return (
    <div>
      <PageHeader
        title="Reports"
        description={s.isStaff ? "Company-wide figures, reconciled to the stock and money ledgers." : "Your own figures."}
        actions={
          <>
            <NativeSelect value={report} onChange={(e) => setReport(e.target.value as ReportKey)} className="w-52">
              {list.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </NativeSelect>
            {needsRange && (
              <>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-38" />
                <Input type="date" value={to} max={todayBD()} onChange={(e) => setTo(e.target.value)} className="w-38" />
              </>
            )}
          </>
        }
      />
      {report === "outstanding" && <Outstanding />}
      {report === "so" && <SoPerformance from={from} to={to} />}
      {report === "product" && <ProductSales from={from} to={to} />}
      {report === "collections" && <Collections from={from} to={to} />}
      {report === "discounts" && <Discounts from={from} to={to} />}
      {report === "stock" && <LowStock />}
      {report === "expiry" && <Expiry />}
      {report === "promo" && <Promo from={from} to={to} />}
    </div>
  );
}

function Outstanding() {
  const { data = [] } = useQuery({
    queryKey: ["rpt-outstanding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("chemist_id, due, first_delivered_at, chemists(business_name, code, payment_terms_days, credit_limit), profiles!orders_so_id_fkey(full_name)")
        .gt("due", 0)
        .neq("status", "CANCELLED");
      if (error) throw error;
      return data;
    },
  });
  const today = todayBD();
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; code: string; so: string; terms: number; limit: number; b0: number; b30: number; b60: number; b90: number; total: number; overdue: number }>();
    for (const o of data) {
      const k = o.chemist_id;
      const r = m.get(k) ?? { name: o.chemists?.business_name ?? "", code: o.chemists?.code ?? "", so: o.profiles?.full_name ?? "", terms: o.chemists?.payment_terms_days ?? 30, limit: Number(o.chemists?.credit_limit ?? 0), b0: 0, b30: 0, b60: 0, b90: 0, total: 0, overdue: 0 };
      const due = Number(o.due);
      const age = o.first_delivered_at ? daysBetween(o.first_delivered_at, today) : 0;
      if (age <= 30) r.b0 += due;
      else if (age <= 60) r.b30 += due;
      else if (age <= 90) r.b60 += due;
      else r.b90 += due;
      if (age > r.terms) r.overdue += due;
      r.total += due;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [data, today]);
  return (
    <ReportTable
      name="outstanding-ageing"
      rows={rows}
      cols={[
        { label: "Chemist", get: (r) => r.name },
        { label: "Code", get: (r) => r.code },
        { label: "SO", get: (r) => r.so },
        { label: "0–30 days", get: (r) => r.b0, money: true },
        { label: "31–60", get: (r) => r.b30, money: true },
        { label: "61–90", get: (r) => r.b60, money: true },
        { label: "90+", get: (r) => r.b90, money: true },
        { label: "Overdue (past terms)", get: (r) => r.overdue, money: true },
        { label: "Total due", get: (r) => r.total, money: true },
      ]}
    />
  );
}

function SoPerformance({ from, to }: { from: string; to: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-so", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_summary", { p_from: from, p_to: to });
      if (error) throw error;
      return (data as unknown as { top_sos: { full_name: string; so_code: string; order_value: number; delivered: number; collected: number; visits: number; new_chemists: number }[] }).top_sos;
    },
  });
  return (
    <ReportTable
      name="so-performance"
      rows={data ?? []}
      cols={[
        { label: "SO", get: (r) => r.full_name },
        { label: "Code", get: (r) => r.so_code },
        { label: "Order value", get: (r) => r.order_value, money: true },
        { label: "Delivered", get: (r) => r.delivered, money: true },
        { label: "Collected", get: (r) => r.collected, money: true },
        { label: "Collection efficiency %", get: (r) => (r.delivered > 0 ? Math.round((r.collected / r.delivered) * 100) : 0), num: true },
        { label: "Doctor visits", get: (r) => r.visits, num: true },
        { label: "New chemists", get: (r) => r.new_chemists, num: true },
      ]}
    />
  );
}

function ProductSales({ from, to }: { from: string; to: string }) {
  const { data = [] } = useQuery({
    queryKey: ["rpt-product", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("product_id, qty, delivered_qty, line_mrp, line_trp, line_net, net_unit_price, products(name, code), orders!inner(order_date, status)")
        .gte("orders.order_date", from)
        .lte("orders.order_date", to)
        .neq("orders.status", "CANCELLED");
      if (error) throw error;
      return data;
    },
  });
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; code: string; qty: number; delivered: number; mrp: number; trp: number; net: number; deliveredValue: number }>();
    for (const i of data) {
      const r = m.get(i.product_id) ?? { name: i.products?.name ?? "", code: i.products?.code ?? "", qty: 0, delivered: 0, mrp: 0, trp: 0, net: 0, deliveredValue: 0 };
      r.qty += i.qty;
      r.delivered += i.delivered_qty;
      r.mrp += Number(i.line_mrp);
      r.trp += Number(i.line_trp);
      r.net += Number(i.line_net);
      r.deliveredValue += i.delivered_qty * Number(i.net_unit_price);
      m.set(i.product_id, r);
    }
    return [...m.values()].sort((a, b) => b.net - a.net);
  }, [data]);
  return (
    <ReportTable
      name="product-sales"
      rows={rows}
      cols={[
        { label: "Product", get: (r) => r.name },
        { label: "Code", get: (r) => r.code },
        { label: "Ordered qty", get: (r) => r.qty, num: true },
        { label: "Delivered qty", get: (r) => r.delivered, num: true },
        { label: "MRP value", get: (r) => r.mrp, money: true },
        { label: "Base TRP", get: (r) => r.trp, money: true },
        { label: "Net ordered", get: (r) => r.net, money: true },
        { label: "Net delivered", get: (r) => r.deliveredValue, money: true },
      ]}
    />
  );
}

function Collections({ from, to }: { from: string; to: string }) {
  const { data = [] } = useQuery({
    queryKey: ["rpt-collections", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("*, chemists(business_name), orders(order_no), profiles!collections_so_id_fkey(full_name)")
        .gte("collection_date", from)
        .lte("collection_date", to)
        .order("collection_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const valid = data.filter((c) => c.status === "VALID").reduce((a, c) => a + Number(c.amount), 0);
  return (
    <ReportTable
      name="collections"
      rows={data}
      footer={<div className="border-t px-5 py-3 text-right text-sm">Valid collections: <strong className="num">{formatBDT(valid)}</strong></div>}
      cols={[
        { label: "Date", get: (r) => formatDate(r.collection_date) },
        { label: "Collection", get: (r) => r.collection_no },
        { label: "Order", get: (r) => r.orders?.order_no },
        { label: "Chemist", get: (r) => r.chemists?.business_name },
        { label: "SO", get: (r) => r.profiles?.full_name },
        { label: "Method", get: (r) => r.method },
        { label: "Status", get: (r) => r.status },
        { label: "Amount", get: (r) => r.amount, money: true },
      ]}
    />
  );
}

function Discounts({ from, to }: { from: string; to: string }) {
  const { data: settings } = useQuery(settingsQuery);
  const { data = [] } = useQuery({
    queryKey: ["rpt-discounts", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, chemists(business_name), profiles!orders_so_id_fkey(full_name)")
        .gte("order_date", from)
        .lte("order_date", to)
        .or("so_discount_pct.gt.0,extra_discount_pct.gt.0")
        .order("extra_discount_pct", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const limit = Number(settings?.extra_discount_so_limit_pct ?? 5);
  return (
    <ReportTable
      name="discounts"
      rows={data}
      cols={[
        { label: "Order", get: (r) => r.order_no },
        { label: "Date", get: (r) => formatDate(r.order_date) },
        { label: "Chemist", get: (r) => r.chemists?.business_name },
        { label: "SO", get: (r) => r.profiles?.full_name },
        { label: "Status", get: (r) => r.status },
        { label: "SO %", get: (r) => r.so_discount_pct, num: true },
        { label: "Extra %", get: (r) => r.extra_discount_pct, num: true },
        { label: "Excess?", get: (r) => (Number(r.extra_discount_pct) > limit ? "Above SO authority" : "") },
        { label: "Base TRP", get: (r) => r.total_base_trp, money: true },
        { label: "Discount given", get: (r) => Number(r.so_discount_amt) + Number(r.extra_discount_amt), money: true },
      ]}
    />
  );
}

function LowStock() {
  const { data: products = [] } = useQuery(productsQuery);
  const { data: stock = [] } = useQuery({
    queryKey: ["rpt-central-stock"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_stock").select("product_id, qty, days_to_expiry, location_kind").eq("location_kind", "central");
      if (error) throw error;
      return data;
    },
  });
  const rows = products
    .filter((p) => p.active)
    .map((p) => {
      const usable = stock.filter((s) => s.product_id === p.id && (s.days_to_expiry ?? 0) > 0).reduce((a, s) => a + (s.qty ?? 0), 0);
      return { name: p.name, code: p.code, kind: p.kind, reorder: p.reorder_level, usable, gap: Math.max(0, p.reorder_level - usable) };
    })
    .filter((r) => r.usable === 0 || r.usable < r.reorder)
    .sort((a, b) => b.gap - a.gap);
  return (
    <ReportTable
      name="low-stock"
      rows={rows}
      cols={[
        { label: "Product", get: (r) => r.name },
        { label: "Code", get: (r) => r.code },
        { label: "Kind", get: (r) => r.kind },
        { label: "Usable central stock", get: (r) => r.usable, num: true },
        { label: "Reorder level", get: (r) => r.reorder, num: true },
        { label: "Shortfall", get: (r) => r.gap, num: true },
      ]}
    />
  );
}

function Expiry() {
  const { data: settings } = useQuery(settingsQuery);
  const near = settings?.near_expiry_days ?? 90;
  const { data = [] } = useQuery({
    queryKey: ["rpt-expiry", near],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_stock")
        .select("*")
        .gt("qty", 0)
        .lte("expiry_date", addDays(todayBD(), near))
        .order("expiry_date");
      if (error) throw error;
      return data;
    },
  });
  return (
    <ReportTable
      name="near-expiry"
      rows={data}
      cols={[
        { label: "Location", get: (r) => r.location_name },
        { label: "Product", get: (r) => r.product_name },
        { label: "Batch", get: (r) => r.batch_no },
        { label: "Expiry", get: (r) => formatDate(r.expiry_date) },
        { label: "Status", get: (r) => ((r.days_to_expiry ?? 0) <= 0 ? "EXPIRED" : `${r.days_to_expiry} days left`) },
        { label: "Qty", get: (r) => r.qty, num: true },
        { label: "Value at TRP", get: (r) => r.value_trp, money: true },
      ]}
    />
  );
}

function Promo({ from, to }: { from: string; to: string }) {
  const { data = [] } = useQuery({
    queryKey: ["rpt-promo", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_items")
        .select("qty, product_id, products(name), doctor_visits!inner(visit_date, doctor_id, doctors(name), profiles!doctor_visits_so_id_fkey(full_name))")
        .gte("doctor_visits.visit_date", from)
        .lte("doctor_visits.visit_date", to);
      if (error) throw error;
      return data;
    },
  });
  const rows = useMemo(() => {
    const m = new Map<string, { product: string; so: string; qty: number; doctors: Set<string> }>();
    for (const i of data) {
      const so = i.doctor_visits?.profiles?.full_name ?? "";
      const k = `${i.product_id}|${so}`;
      const r = m.get(k) ?? { product: i.products?.name ?? "", so, qty: 0, doctors: new Set<string>() };
      r.qty += i.qty;
      if (i.doctor_visits?.doctor_id) r.doctors.add(i.doctor_visits.doctor_id);
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty);
  }, [data]);
  return (
    <ReportTable
      name="promo-usage"
      rows={rows}
      cols={[
        { label: "Promotional product", get: (r) => r.product },
        { label: "SO", get: (r) => r.so },
        { label: "Units issued", get: (r) => r.qty, num: true },
        { label: "Doctors reached", get: (r) => r.doctors.size, num: true },
      ]}
    />
  );
}
