import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { PageHeader, Section, EmptyState } from "@/components/app/page";
import { ListToolbar } from "@/components/app/list-toolbar";
import { ProductSearch } from "@/components/app/product-search";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { locationsQuery, productsQuery, settingsQuery } from "@/lib/queries";
import { menuAllowed } from "@/lib/access";
import { useSession } from "@/lib/session";
import { addDays, daysBetween, formatBDT, formatDate, formatInt, rangeFor, todayBD } from "@/lib/format";
import { downloadTableReport, type TableSheet } from "@/lib/table-report";
import { BatchStockReport, EMPTY_ITEM_DRAFT, ItemReportFilter, StockWorkList, type ItemDraft } from "@/components/app/stock-worklist";

const REPORT_KEYS = ["outstanding", "so", "product", "collections", "discounts", "stocklist", "batchstock", "stock", "expiry", "promo", "issue", "receive", "itemstock"] as const;

export type ReportKey = (typeof REPORT_KEYS)[number];

export const Route = createFileRoute("/_authenticated/reports")({
  validateSearch: (s: Record<string, unknown>): { report: (typeof REPORT_KEYS)[number] } => {
    const raw = s["report"];
    const report = typeof raw === "string" && (REPORT_KEYS as readonly string[]).includes(raw) ? raw as (typeof REPORT_KEYS)[number] : "outstanding";
    return { report };
  },
  head: () => ({ meta: [{ title: "Reports — BIORY Corporation" }] }),
  component: ReportsPage,
});

let reportSink: ((sheet: TableSheet) => void) | null = null;

const REPORTS: { key: ReportKey; label: string; money?: boolean; stock?: boolean }[] = [
  { key: "outstanding", label: "Outstanding & ageing", money: true },
  { key: "so", label: "SO performance", money: true },
  { key: "product", label: "Product sales", money: true },
  { key: "collections", label: "Collections", money: true },
  { key: "discounts", label: "Discounts", money: true },
  { key: "stocklist", label: "Stock report", stock: true },
  { key: "batchstock", label: "Batch wise stock", stock: true },
  { key: "stock", label: "Re-order level", stock: true },
  { key: "expiry", label: "Near expiry / expired", stock: true },
  { key: "promo", label: "Promotional usage", stock: true },
  { key: "issue", label: "Item wise issue", stock: true },
  { key: "receive", label: "Item wise receive", stock: true },
  { key: "itemstock", label: "Item stock", stock: true },
];

interface Col<T> {
  label: string;
  get: (r: T) => string | number | null | undefined;
  money?: boolean;
  num?: boolean;
}

function ReportTable<T>({ name, cols, rows, footer }: { name: string; cols: Col<T>[]; rows: T[]; footer?: ReactNode }) {
  const page = usePagedRows(rows, `${name}|${rows.length}`);
  useEffect(() => {
    reportSink?.({
      columns: cols.map((c) => c.label),
      rows: rows.map((r) => cols.map((c) => {
        const v = c.get(r);
        if (v === null || v === undefined || v === "") return "—";
        if (c.money) return formatBDT(v);
        if (c.num) return formatInt(v);
        return String(v);
      })),
    });
  }, [cols, rows]);
  return (
    <Section
      title={`${rows.length} rows`}
      bodyClassName="p-0"
    >
      {rows.length === 0 ? (
        <div className="p-5"><EmptyState title="Nothing to report for this selection" /></div>
      ) : (
        <>
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((c) => <TableHead key={c.label} className={c.money || c.num ? "text-right" : ""}>{c.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.pageRows.map((r, i) => (
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
        <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="rows" onPage={page.setPage} onSize={page.setPageSize} />
        </>
      )}
      {footer}
    </Section>
  );
}

function ReportsPage() {
  const s = useSession();
  const navigate = useNavigate();
  const { report } = Route.useSearch();
  const month = rangeFor("month");
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const [productId, setProductId] = useState("");
  const [ran, setRan] = useState<{ report: ReportKey; from: string; to: string; productId: string } | null>(null);
  const [sheet, setSheet] = useState<TableSheet | null>(null);
  const { data: products = [] } = useQuery(productsQuery);
  const list = REPORTS.filter((r) => menuAllowed(`report:${r.key}`, s.roles, s.menus));
  const shown = list.some((r) => r.key === report) ? report : (list[0]?.key ?? "outstanding");
  const label = list.find((r) => r.key === shown)?.label ?? "Report";
  const live = ran?.report === shown;
  const worklist = shown === "stocklist" || shown === "batchstock" || shown === "issue" || shown === "receive" || shown === "itemstock";
  useEffect(() => {
    if (shown !== report) navigate({ to: "/reports", search: { report: shown }, replace: true });
  }, [shown, report, navigate]);
  useEffect(() => {
    setRan(null);
    setSheet(null);
  }, [report]);
  useEffect(() => {
    reportSink = (next) => setSheet((cur) => JSON.stringify(cur) === JSON.stringify(next) ? cur : next);
    return () => { reportSink = null; };
  }, []);
  if (worklist) {
    return (
      <div>
        <PageHeader
          title={label}
          description={
            shown === "stocklist" ? "On-hand stock by item for a store."
            : shown === "batchstock" ? "On-hand stock by item. Open a row to see each batch."
            : shown === "issue" ? "Quantity issued from a store, by item."
            : shown === "receive" ? "Quantity received into a store, by item."
            : "Opening, received, issued and closing quantity by item."
          }
        />
        {shown === "stocklist" && <StockWorkList />}
        {shown === "batchstock" && <BatchStockReport />}
        {shown === "issue" && <PeriodItemReport kind="issue" />}
        {shown === "receive" && <PeriodItemReport kind="receive" />}
        {shown === "itemstock" && <PeriodItemReport kind="itemstock" />}
      </div>
    );
  }
  return (
    <div>
      <PageHeader
        title={label}
        description={s.isStaff ? "Company-wide figures, reconciled to the stock and money ledgers." : "Your own figures."}
        actions={
          <>
            <Button variant="outline" disabled={!live || !sheet?.rows.length} onClick={() => void downloadTableReport(label, ran?.from ?? from, ran?.to ?? to, sheet ?? { columns: [], rows: [] }).catch((e) => toast.error(String(e)))}>
              <Download /> Open PDF
            </Button>
            <Button variant="outline" disabled={!live} onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          </>
        }
      />
      <Section title={label} className="mb-4" bodyClassName="hidden" actions={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (from > to) {
              toast.error("The from date is after the to date");
              return;
            }
            setRan({ report: shown, from, to, productId });
          }}
        >
          <ListToolbar from={from} to={to} onFrom={setFrom} onTo={setTo} maxTo={todayBD()}>
            <div className="w-52 shrink-0">
              <ProductSearch
                products={products.filter((p) => p.active)}
                value={productId}
                onChange={setProductId}
                placeholder="All products"
                aria-label="Product"
              />
            </div>
            <Button type="submit" className="h-9 shrink-0 rounded-xl">Get</Button>
          </ListToolbar>
        </form>
      }>
        {null}
      </Section>
      {live && ran && (
        <div className="report-print">
          {shown === "outstanding" && <Outstanding />}
          {shown === "so" && <SoPerformance from={ran.from} to={ran.to} />}
          {shown === "product" && <ProductSales from={ran.from} to={ran.to} productId={ran.productId} />}
          {shown === "collections" && <Collections from={ran.from} to={ran.to} />}
          {shown === "discounts" && <Discounts from={ran.from} to={ran.to} />}
          {shown === "stock" && <LowStock productId={ran.productId} />}
          {shown === "expiry" && <Expiry productId={ran.productId} />}
          {shown === "promo" && <Promo from={ran.from} to={ran.to} productId={ran.productId} />}
        </div>
      )}
      {!live && (
        <Section title={label}>
          <EmptyState title="Press Get to run this report" description="Choose the report, dates and product, then load it. Leave product as all products to include every item. Open PDF to print or download that result." />
        </Section>
      )}
    </div>
  );
}

function Outstanding() {
  const { data = [] } = useQuery({
    queryKey: ["rpt-outstanding"],
    queryFn: async () => {
      const { data, error } = await api
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
      const { data, error } = await api.rpc("dashboard_summary", { p_from: from, p_to: to });
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

function ProductSales({ from, to, productId }: { from: string; to: string; productId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["rpt-product", from, to],
    queryFn: async () => {
      const { data, error } = await api
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
      if (productId && i.product_id !== productId) continue;
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
  }, [data, productId]);
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
      const { data, error } = await api
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
      const { data, error } = await api
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

function LowStock({ productId }: { productId: string }) {
  const { data: products = [] } = useQuery(productsQuery);
  const { data: stock = [] } = useQuery({
    queryKey: ["rpt-central-stock"],
    queryFn: async () => {
      const { data, error } = await api.from("v_stock").select("product_id, qty, days_to_expiry, location_kind").eq("location_kind", "central");
      if (error) throw error;
      return data;
    },
  });
  const rows = products
    .filter((p) => p.active && (!productId || p.id === productId))
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

function Expiry({ productId }: { productId: string }) {
  const { data: settings } = useQuery(settingsQuery);
  const near = settings?.near_expiry_days ?? 90;
  const { data = [] } = useQuery({
    queryKey: ["rpt-expiry", near],
    queryFn: async () => {
      const { data, error } = await api
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
      rows={productId ? data.filter((row) => row.product_id === productId) : data}
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

function Promo({ from, to, productId }: { from: string; to: string; productId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["rpt-promo", from, to],
    queryFn: async () => {
      const { data, error } = await api
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
      if (productId && i.product_id !== productId) continue;
      const so = i.doctor_visits?.profiles?.full_name ?? "";
      const k = `${i.product_id}|${so}`;
      const r = m.get(k) ?? { product: i.products?.name ?? "", so, qty: 0, doctors: new Set<string>() };
      r.qty += i.qty;
      if (i.doctor_visits?.doctor_id) r.doctors.add(i.doctor_visits.doctor_id);
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty);
  }, [data, productId]);
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

type Move = {
  product_id: string;
  qty: number | null;
  movement_type: string;
  from_location: string | null;
  to_location: string | null;
  performed_at: string;
};

function bdDay(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function useStockMoves(from: string, to: string) {
  const { data: locations = [] } = useQuery(locationsQuery);
  const { data: products = [] } = useQuery(productsQuery);
  const scope = useMemo(() => new Set(locations.filter((l) => l.kind === "central" || l.kind === "so").map((l) => l.id)), [locations]);
  const central = useMemo(() => new Set(locations.filter((l) => l.kind === "central").map((l) => l.id)), [locations]);
  const so = useMemo(() => new Set(locations.filter((l) => l.kind === "so").map((l) => l.id)), [locations]);
  const { data: moves = [] } = useQuery({
    queryKey: ["rpt-stock-moves", to],
    queryFn: async () => {
      const { data, error } = await api
        .from("stock_movements")
        .select("product_id, qty, movement_type, from_location, to_location, performed_at")
        .lte("performed_at", `${to}T23:59:59+06:00`)
        .limit(5000);
      if (error) throw error;
      return data as Move[];
    },
  });
  return { moves, products, scope, central, so, from };
}

function isIssue(move: Move, central: Set<string>) {
  return (move.movement_type === "REQUISITION_ISSUE" || move.movement_type === "CENTRAL_TO_SO_TRANSFER") && !!move.from_location && central.has(move.from_location);
}

function isReceive(move: Move, so: Set<string>) {
  return (move.movement_type === "REQUISITION_RECEIPT" || move.movement_type === "CENTRAL_TO_SO_TRANSFER") && !!move.to_location && so.has(move.to_location);
}

function netAt(move: Move, scope: Set<string>) {
  let qty = 0;
  if (move.to_location && scope.has(move.to_location)) qty += move.qty ?? 0;
  if (move.from_location && scope.has(move.from_location)) qty -= move.qty ?? 0;
  return qty;
}

function enteredScope(move: Move, scope: Set<string>) {
  return !!move.to_location && scope.has(move.to_location) && !(move.from_location && scope.has(move.from_location));
}

function leftScope(move: Move, scope: Set<string>) {
  return !!move.from_location && scope.has(move.from_location) && !(move.to_location && scope.has(move.to_location));
}

function productAllowed(products: { id: string; category: string | null }[], id: string, productId: string, category: string) {
  if (productId && id !== productId) return false;
  if (!category) return true;
  return (products.find((p) => p.id === id)?.category ?? "") === category;
}

function PeriodItemReport({ kind }: { kind: "issue" | "receive" | "itemstock" }) {
  const month = rangeFor("month");
  const start = { ...EMPTY_ITEM_DRAFT, from: month.from, to: month.to };
  const [draft, setDraft] = useState<ItemDraft>(start);
  const [applied, setApplied] = useState<ItemDraft | null>(null);
  const sheet = useRef<TableSheet | null>(null);
  const { data: products = [] } = useQuery(productsQuery);
  const { data: locations = [] } = useQuery(locationsQuery);
  const stores = locations.filter((l) => l.kind === "central" || l.kind === "so");
  const categories = [...new Set(products.map((p) => p.category).filter((v): v is string => !!v))].sort();
  useEffect(() => {
    const outer = reportSink;
    reportSink = (next) => {
      sheet.current = next;
      outer?.(next);
    };
    return () => { reportSink = outer; };
  }, []);
  const title = kind === "issue" ? "Item wise issue" : kind === "receive" ? "Item wise receive" : "Item stock";
  return (
    <div className="flex flex-col gap-4">
      <ItemReportFilter
        draft={draft}
        stores={stores}
        categories={categories}
        products={products.map((p) => ({ id: p.id, name: p.name, code: p.code }))}
        period
        onDraft={setDraft}
        onApply={setApplied}
        onReset={() => { setDraft(start); setApplied(null); }}
        onPrint={() => window.print()}
        onDownload={() => {
          const next = sheet.current;
          if (!next?.rows.length || !applied) {
            toast.error("Search first, then download");
            return;
          }
          void downloadTableReport(title, applied.from, applied.to, next).catch((e) => toast.error(String(e)));
        }}
      />
      {applied ? (
        <div className="report-print">
          {kind === "itemstock" ? (
            <ItemStock from={applied.from} to={applied.to} productId={applied.productId} locationId={applied.location} category={applied.category} />
          ) : (
            <ItemMovement from={applied.from} to={applied.to} kind={kind} productId={applied.productId} locationId={applied.location} category={applied.category} />
          )}
        </div>
      ) : (
        <Section title={title}>
          <EmptyState title="Press Search to run this report" description="Pick an item by code or name, or leave both blank for every item." />
        </Section>
      )}
    </div>
  );
}

function ItemMovement({ from, to, kind, productId, locationId, category }: { from: string; to: string; kind: "issue" | "receive"; productId: string; locationId: string; category: string }) {
  const { moves, products, central, so } = useStockMoves(from, to);
  const rows = useMemo(() => {
    const names = new Map(products.map((p) => [p.id, { name: p.name, code: p.code }]));
    const totals = new Map<string, number>();
    for (const move of moves) {
      const day = bdDay(move.performed_at);
      if (from && day < from) continue;
      if (to && day > to) continue;
      if (!productAllowed(products, move.product_id, productId, category)) continue;
      if (kind === "issue" && locationId && move.from_location !== locationId) continue;
      if (kind === "receive" && locationId && move.to_location !== locationId) continue;
      if (kind === "issue" ? !isIssue(move, central) : !isReceive(move, so)) continue;
      totals.set(move.product_id, (totals.get(move.product_id) ?? 0) + (move.qty ?? 0));
    }
    return [...totals.entries()]
      .map(([id, qty]) => ({ name: names.get(id)?.name ?? "Product", code: names.get(id)?.code ?? "", qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [moves, products, central, so, from, to, kind, productId, locationId, category]);
  return (
    <ReportTable
      name={kind === "issue" ? "item-issue" : "item-receive"}
      rows={rows}
      cols={[
        { label: "Product", get: (r) => r.name },
        { label: "Code", get: (r) => r.code },
        { label: kind === "issue" ? "Issued qty" : "Received qty", get: (r) => r.qty, num: true },
      ]}
    />
  );
}

function ItemStock({ from, to, productId, locationId, category }: { from: string; to: string; productId: string; locationId: string; category: string }) {
  const { moves, products, scope } = useStockMoves(from, to);
  const rows = useMemo(() => {
    const scoped = locationId ? new Set([...scope].filter((id) => id === locationId)) : scope;
    const picked = products.filter((p) => p.active && productAllowed(products, p.id, productId, category)).map((p) => p.id);
    const names = new Map(products.map((p) => [p.id, { name: p.name, code: p.code }]));
    const chosen = new Set(picked);
    const acc = new Map<string, { opening: number; received: number; issued: number; closing: number }>();
    for (const id of picked) acc.set(id, { opening: 0, received: 0, issued: 0, closing: 0 });
    for (const move of moves) {
      if (!chosen.has(move.product_id)) continue;
      const row = acc.get(move.product_id);
      if (!row) continue;
      const day = bdDay(move.performed_at);
      const net = netAt(move, scoped);
      if (from && day < from) row.opening += net;
      if (!to || day <= to) row.closing += net;
      if ((!from || day >= from) && (!to || day <= to)) {
        if (enteredScope(move, scoped)) row.received += move.qty ?? 0;
        if (leftScope(move, scoped)) row.issued += move.qty ?? 0;
      }
    }
    return [...acc.entries()].map(([id, row]) => ({
      name: names.get(id)?.name ?? "Product",
      code: names.get(id)?.code ?? "",
      ...row,
    }));
  }, [moves, products, scope, from, to, productId, locationId, category]);
  return (
    <ReportTable
      name="item-stock"
      rows={rows}
      cols={[
        { label: "Product", get: (r) => r.name },
        { label: "Code", get: (r) => r.code },
        { label: "Opening", get: (r) => r.opening, num: true },
        { label: "Received", get: (r) => r.received, num: true },
        { label: "Issued", get: (r) => r.issued, num: true },
        { label: "Closing", get: (r) => r.closing, num: true },
      ]}
    />
  );
}
