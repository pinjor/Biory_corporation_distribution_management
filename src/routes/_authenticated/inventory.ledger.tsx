import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, Qty, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { locationsQuery, productsQuery, profilesQuery } from "@/lib/queries";
import { formatDateTime, humanize } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/inventory/ledger")({
  head: () => ({ meta: [{ title: "Stock ledger — BIORY Corporation" }] }),
  component: LedgerPage,
});

const TYPES = [
  "OPENING", "PURCHASE_RECEIPT", "CENTRAL_TO_SO_TRANSFER", "SO_TO_CENTRAL_RETURN", "SO_TO_SO_TRANSFER", "CUSTOMER_DELIVERY",
  "CUSTOMER_RETURN", "DOCTOR_PROMOTION", "DAMAGE", "EXPIRED", "LOSS", "MANUAL_ADJUSTMENT_IN", "MANUAL_ADJUSTMENT_OUT",
];

function LedgerPage() {
  const { data: products = [] } = useQuery(productsQuery);
  const { data: locations = [] } = useQuery(locationsQuery);
  const { data: profiles = [] } = useQuery(profilesQuery);
  const [product, setProduct] = useState("");
  const [type, setType] = useState("");
  const [loc, setLoc] = useState("");
  const [limit, setLimit] = useState(100);
  const pmap = new Map(products.map((p) => [p.id, p]));
  const lmap = new Map(locations.map((l) => [l.id, l.name]));
  const umap = new Map(profiles.map((p) => [p.id, p.full_name]));

  const { data = [], isLoading } = useQuery({
    queryKey: ["ledger", product, type, loc, limit],
    queryFn: async () => {
      let q = supabase.from("stock_movements").select("*, batches(batch_no, expiry_date)").order("performed_at", { ascending: false }).limit(limit);
      if (product) q = q.eq("product_id", product);
      if (type) q = q.eq("movement_type", type);
      if (loc) q = q.or(`from_location.eq.${loc},to_location.eq.${loc}`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader title="Stock ledger" description="Every stock change, append-only. Corrections appear as new adjustment entries — nothing is edited or deleted." />
      <Section
        bodyClassName="p-0"
        title={`${data.length} movements`}
        actions={
          <div className="flex flex-wrap gap-2">
            <NativeSelect value={product} onChange={(e) => setProduct(e.target.value)} className="h-8 w-44">
              <option value="">All products</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
            <NativeSelect value={loc} onChange={(e) => setLoc(e.target.value)} className="h-8 w-44">
              <option value="">All locations</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </NativeSelect>
            <NativeSelect value={type} onChange={(e) => setType(e.target.value)} className="h-8 w-44">
              <option value="">All types</option>
              {TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </NativeSelect>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadCsv("stock-ledger.csv", [
                  ["time", "type", "product", "batch", "from", "to", "qty", "reference", "by", "remarks"],
                  ...data.map((m) => [m.performed_at, m.movement_type, pmap.get(m.product_id)?.name, m.batches?.batch_no, m.from_location ? lmap.get(m.from_location) : "", m.to_location ? lmap.get(m.to_location) : "", m.qty, m.reference_no, m.performed_by ? umap.get(m.performed_by) : "", m.remarks]),
                ])
              }
            >
              Export
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-5"><EmptyState title="No movements" /></div>
        ) : (
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
              {data.map((m) => (
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
