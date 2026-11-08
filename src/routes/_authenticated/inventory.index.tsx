import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  History,
  CalendarClock,
  PackagePlus,
  Pill,
  SlidersHorizontal,
  UserRound,
  Warehouse,
} from "lucide-react";
import { api } from "@/lib/api/client";
import {
  PageHeader,
  Section,
  Money,
  Qty,
  ExpiryBadge,
  EmptyState,
  StatCard,
} from "@/components/app/page";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { locationsQuery, myAvailableStockQuery, productsQuery, settingsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { formatBDT, formatDate, inDateRange } from "@/lib/format";

type ExpiryCard = "near" | "expired" | "ok";

export const Route = createFileRoute("/_authenticated/inventory/")({
  validateSearch: (s: Record<string, unknown>): { expiry?: ExpiryCard } => {
    const raw = s["expiry"];
    return raw === "near" || raw === "expired" ? { expiry: raw } : {};
  },
  head: () => ({ meta: [{ title: "Stock — BIORY Corporation" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const s = useSession();
  const navigate = useNavigate();
  const { expiry = "" } = Route.useSearch();
  const { data: locations = [] } = useQuery(locationsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const central = locations.find((l) => l.kind === "central");
  const mine = locations.find((l) => l.so_id === s.userId);
  const soLocs = locations.filter((l) => l.kind === "so");
  const [tab, setTab] = useState<"central" | "so">(s.isStaff ? "central" : "so");
  const [soLoc, setSoLoc] = useState<string>("");
  const locId = tab === "central" ? central?.id : s.isStaff ? soLoc || soLocs[0]?.id : mine?.id;
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const { from, to, setFrom, setTo, reset } = useListRange(0);
  const near = settings?.near_expiry_days ?? 90;
  function showAll() {
    if (expiry) void navigate({ to: "/inventory", search: {}, replace: true });
  }
  function pickExpiry(next: ExpiryCard) {
    void navigate({
      to: "/inventory",
      search: expiry === next ? {} : { expiry: next },
      replace: true,
    });
  }

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock", locId],
    enabled: !!locId,
    queryFn: async () => {
      const { data, error } = await api
        .from("v_stock")
        .select("*")
        .eq("location_id", locId!)
        .gt("qty", 0)
        .order("product_name")
        .order("expiry_date");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (kind && r.product_kind !== kind) return false;
        const d = r.days_to_expiry ?? 9999;
        if (expiry === "expired" && d > 0) return false;
        if (expiry === "near" && (d <= 0 || d > near)) return false;
        if (expiry === "ok" && d <= near) return false;
        if (!inDateRange(r.expiry_date, from, to)) return false;
        if (
          q &&
          !`${r.product_code} ${r.product_name} ${r.batch_no}`
            .toLowerCase()
            .includes(q.toLowerCase())
        )
          return false;
        return true;
      }),
    [rows, kind, expiry, q, near, from, to],
  );
  const page = usePagedRows(filtered, `${locId ?? ""}|${q}|${kind}|${expiry}|${from}|${to}`);

  const totals = useMemo(() => {
    let value = 0,
      units = 0,
      nearN = 0,
      expN = 0;
    for (const r of rows) {
      units += r.qty ?? 0;
      value += Number(r.value_trp ?? 0);
      const d = r.days_to_expiry ?? 9999;
      if (d <= 0) expN++;
      else if (d <= near) nearN++;
    }
    return { value, units, nearN, expN };
  }, [rows, near]);

  const showSoSummary = tab === "so" && !s.isStaff;

  return (
    <div>
      <PageHeader
        title="Stock"
        description="Batch-wise balances derived from the stock ledger. Expired batches are blocked from issue, delivery and promotion."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/inventory/ledger">
                <History /> Ledger
              </Link>
            </Button>
            {s.isWarehouse && (
              <Button asChild variant="outline">
                <Link to="/inventory/adjust">
                  <SlidersHorizontal /> Adjust
                </Link>
              </Button>
            )}
            {s.isWarehouse && (
              <Button asChild>
                <Link to="/inventory/receive">
                  <PackagePlus /> Receive stock
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "central" | "so")}>
          <TabsList>
            {s.isStaff && (
              <TabsTrigger value="central">
                <Warehouse /> Central warehouse
              </TabsTrigger>
            )}
            <TabsTrigger value="so">
              <UserRound /> {s.isStaff ? "SO stock" : "My stock"}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "so" && s.isStaff && (
          <NativeSelect
            className="w-60"
            value={soLoc || soLocs[0]?.id || ""}
            onChange={(e) => setSoLoc(e.target.value)}
          >
            {soLocs.length === 0 && <option value="">No Sales Officers yet</option>}
            {soLocs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Units on hand" value={<Qty value={totals.units} />} active={!expiry} onClick={showAll} />
        <StatCard label="Value at TRP" value={formatBDT(totals.value)} active={!expiry} onClick={showAll} />
        <StatCard
          label="Near expiry batches"
          value={totals.nearN}
          tone={totals.nearN ? "warning" : "default"}
          hint={`Within ${near} days`}
          active={expiry === "near"}
          onClick={() => pickExpiry("near")}
        />
        <StatCard
          label="Expired batches"
          value={totals.expN}
          tone={totals.expN ? "destructive" : "default"}
          hint="Blocked from use"
          active={expiry === "expired"}
          onClick={() => pickExpiry("expired")}
        />
      </div>

      {showSoSummary && <MyAvailability />}

      <Section
        title="Batches"
        bodyClassName="p-0"
        actions={
          <ListToolbar query={q} onQuery={setQ} placeholder="Product / batch…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
            <NativeSelect leading={<Pill />} value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Kind">
              <option value="">All kinds</option>
              <option value="saleable">Saleable</option>
              <option value="promotional">Promotional</option>
            </NativeSelect>
            <NativeSelect leading={<CalendarClock />} value={expiry} onChange={(e) => {
              const value = e.target.value;
              void navigate({
                to: "/inventory",
                search: value === "near" || value === "expired" || value === "ok" ? { expiry: value } : {},
                replace: true,
              });
            }} className="h-9 w-40 shrink-0" aria-label="Expiry">
              <option value="">Any expiry</option>
              <option value="near">Near expiry</option>
              <option value="expired">Expired</option>
              <option value="ok">Healthy</option>
            </NativeSelect>
            <FilterClear onClick={() => { setQ(""); setKind(""); showAll(); reset(); }} />
          </ListToolbar>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading stock…</div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No stock here"
              description={
                tab === "so" && !s.isStaff
                  ? "Request stock from the central warehouse to start selling."
                  : "Nothing matches these filters."
              }
              action={
                tab === "so" && s.isSO ? (
                  <Button asChild size="sm">
                    <Link to="/requisitions/new">Request stock</Link>
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Base TRP</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.pageRows.map((r) => (
                <TableRow key={`${r.location_id}-${r.batch_id}`}>
                  <TableCell>
                    <div className="font-medium">{r.product_name}</div>
                    <div className="num text-xs text-muted-foreground">
                      {r.product_code} · {r.product_kind}
                    </div>
                  </TableCell>
                  <TableCell className="num text-xs">{r.batch_no}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm">{formatDate(r.expiry_date)}</span>
                      <ExpiryBadge days={r.days_to_expiry} nearDays={near} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    <Qty value={r.qty} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={r.base_trp} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={r.value_trp} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="batches" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
    </div>
  );
}

function MyAvailability() {
  const { data = [] } = useQuery(myAvailableStockQuery);
  const page = usePagedRows(data, data.length);
  const { data: products = [] } = useQuery(productsQuery);
  const byId = new Map(products.map((p) => [p.id, p]));
  if (data.length === 0) return null;
  return (
    <Section title="Available to sell" className="mb-6" bodyClassName="p-0">
      <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Usable on hand</TableHead>
            <TableHead className="text-right">Reserved by open orders</TableHead>
            <TableHead className="text-right">Available</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.pageRows.map((r) => (
            <TableRow key={r.product_id}>
              <TableCell className="font-medium">{byId.get(r.product_id)?.name ?? "—"}</TableCell>
              <TableCell className="text-right">
                <Qty value={r.on_hand} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                <Qty value={r.reserved} />
              </TableCell>
              <TableCell className="text-right font-semibold">
                <Qty value={r.available} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="products" onPage={page.setPage} onSize={page.setPageSize} />
      </>
    </Section>
  );
}
