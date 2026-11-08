import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MapPin, Pill, ArrowLeftRight } from "lucide-react";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader, Section, Qty, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { locationsQuery, productsQuery, profilesQuery } from "@/lib/queries";
import { addDays, formatDateTime, humanize, todayBD } from "@/lib/format";
export const Route = createFileRoute("/_authenticated/inventory/ledger")({
  head: () => ({ meta: [{ title: "Stock ledger — BIORY Corporation" }] }),
  component: LedgerPage,
});

const TYPES = [
  "OPENING", "PURCHASE_RECEIPT", "REQUISITION_ISSUE", "REQUISITION_RECEIPT", "CENTRAL_TO_SO_TRANSFER", "SO_TO_CENTRAL_RETURN", "SO_TO_SO_TRANSFER", "CUSTOMER_DELIVERY",
  "CUSTOMER_RETURN", "DOCTOR_PROMOTION", "DAMAGE", "EXPIRED", "LOSS", "MANUAL_ADJUSTMENT_IN", "MANUAL_ADJUSTMENT_OUT",
];

function LedgerPage() {
  const { data: products = [] } = useQuery(productsQuery);
  const { data: locations = [] } = useQuery(locationsQuery);
  const { data: profiles = [] } = useQuery(profilesQuery);
  const today = todayBD();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(addDays(today, -90));
  const [to, setTo] = useState(today);
  const [product, setProduct] = useState("");
  const [type, setType] = useState("");
  const [loc, setLoc] = useState("");
  const [limit, setLimit] = useState(500);
  const pmap = new Map(products.map((p) => [p.id, p]));
  const lmap = new Map(locations.map((l) => [l.id, l.name]));
  const umap = new Map(profiles.map((p) => [p.id, p.full_name]));

  const { data = [], isLoading } = useQuery({
    queryKey: ["ledger", product, type, loc, from, to, limit],
    queryFn: async () => {
      let query = api
        .from("stock_movements")
        .select("*, batches(batch_no, expiry_date)")
        .gte("performed_at", `${from}T00:00:00+06:00`)
        .lte("performed_at", `${to}T23:59:59+06:00`)
        .order("performed_at", { ascending: false })
        .limit(limit);
      if (product) query = query.eq("product_id", product);
      if (type) query = query.eq("movement_type", type);
      if (loc) query = query.or(`from_location.eq.${loc},to_location.eq.${loc}`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
  const rows = useMemo(() => data.filter((m) => {
    const item = pmap.get(m.product_id);
    const hay = `${item?.name ?? ""} ${item?.code ?? ""} ${m.batches?.batch_no ?? ""} ${m.reference_no ?? ""} ${m.remarks ?? ""}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  }), [data, q, pmap]);
  const page = usePagedRows(rows, `${q}|${product}|${type}|${loc}|${from}|${to}|${limit}`);

  return (
    <div>
      <PageHeader title="Stock ledger" description="Every stock change, append-only. Corrections appear as new adjustment entries — nothing is edited or deleted." />
      <Section
        bodyClassName="p-0"
        title={`${rows.length} movements`}
        actions={
          <ListToolbar query={q} onQuery={setQ} placeholder="Product, batch, reference…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
            <NativeSelect leading={<Pill />} value={product} onChange={(e) => setProduct(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Product">
              <option value="">All products</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
            <NativeSelect leading={<MapPin />} value={loc} onChange={(e) => setLoc(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Location">
              <option value="">All locations</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </NativeSelect>
            <NativeSelect leading={<ArrowLeftRight />} value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-44 shrink-0" aria-label="Movement type">
              <option value="">All types</option>
              {TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </NativeSelect>
            <FilterClear onClick={() => {
              setQ("");
              setProduct("");
              setLoc("");
              setType("");
              setFrom(addDays(today, -90));
              setTo(today);
            }} />
          </ListToolbar>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No movements" /></div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Product · Batch</TableHead>
                <TableHead>From → To</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.pageRows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(m.performed_at)}</TableCell>
                  <TableCell className="text-xs font-medium">{humanize(m.movement_type)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{pmap.get(m.product_id)?.name}</div>
                    <div className="num text-xs text-muted-foreground">{m.batches?.batch_no}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.from_location ? lmap.get(m.from_location) : <span className="text-muted-foreground">external</span>} →{" "}
                    {m.to_location ? lmap.get(m.to_location) : <span className="text-muted-foreground">customer / out</span>}
                  </TableCell>
                  <TableCell className="text-right font-semibold"><Qty value={m.qty} /></TableCell>
                  <TableCell className="text-xs">
                    <div className="num">{m.reference_no ?? "—"}</div>
                    {m.remarks && <div className="text-muted-foreground">{m.remarks}</div>}
                    {m.performed_by && <div className="text-muted-foreground">by {umap.get(m.performed_by)}</div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="movements" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
      {data.length >= limit && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => setLimit((l) => l + 200)}>Load more</Button>
        </div>
      )}
    </div>
  );
}
