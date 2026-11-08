import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ComponentType } from "react";
import { ArrowLeftRight, MapPin, Package, PackageOpen, Pill, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { Section, Field, Qty, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { locationsQuery, opt, productsQuery, profilesQuery } from "@/lib/queries";
import { errorMessage, formatDate, formatDateTime, humanize, inDateRange, todayBD } from "@/lib/format";

/** Shared stock-entry building blocks for Receive stock, Opening stock and Stock adjustment. */

export function BatchReceiptForm({ type }: { type: "PURCHASE_RECEIPT" | "OPENING" }) {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery(productsQuery);
  const blank = {
    product: "",
    batch: "",
    mfg: "",
    expiry: "",
    qty: "",
    reference: "",
    remarks: "",
  };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }));
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await api.rpc("receive_stock", {
        p_product: f.product,
        p_batch_no: f.batch,
        p_mfg: opt(f.mfg),
        p_expiry: f.expiry,
        p_qty: Number(f.qty),
        p_type: type,
        p_reference: opt(f.reference),
        p_remarks: opt(f.remarks),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        type === "OPENING"
          ? "Opening stock posted to Central Warehouse"
          : "Stock received into Central Warehouse",
      );
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      setF(blank);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const p = products.find((x) => x.id === f.product);
  return (
    <Section title={type === "OPENING" ? "Opening balance for one batch" : "Purchase receipt"}>
      <form
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Product">
          <NativeSelect required value={f.product} onChange={(e) => set("product", e.target.value)}>
            <option value="">Choose product…</option>
            {products
              .filter((x) => x.active)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.code})
                </option>
              ))}
          </NativeSelect>
        </Field>
        <Field label="Batch number">
          <Input required value={f.batch} onChange={(e) => set("batch", e.target.value)} />
        </Field>
        <Field label="Manufacturing date">
          <Input
            type="date"
            value={f.mfg}
            max={todayBD()}
            onChange={(e) => set("mfg", e.target.value)}
          />
        </Field>
        <Field label="Expiry date">
          <Input
            required
            type="date"
            min={todayBD()}
            value={f.expiry}
            onChange={(e) => set("expiry", e.target.value)}
          />
        </Field>
        <Field label={type === "OPENING" ? "Opening quantity" : "Quantity received"}>
          <Input
            required
            type="number"
            min={1}
            value={f.qty}
            onChange={(e) => set("qty", e.target.value)}
          />
        </Field>
        <Field
          label={
            type === "OPENING"
              ? "Reference (e.g. stock count sheet)"
              : "Reference document (GRN / invoice)"
          }
        >
          <Input value={f.reference} onChange={(e) => set("reference", e.target.value)} />
        </Field>
        <Field label="Remarks / storage bin">
          <Input value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={m.isPending}>
            {m.isPending ? "Posting…" : type === "OPENING" ? "Post opening stock" : "Post receipt"}
          </Button>
        </div>
        {p && (
          <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
            {p.name}: MRP ৳{p.mrp} · trade discount {p.trade_discount_pct}% · Base TRP ৳{p.base_trp}
          </div>
        )}
      </form>
    </Section>
  );
}

/** Latest ledger entries of the given movement types (read-only). */
export function RecentMovements({
  noun,
  types,
  empty,
}: {
  noun: string;
  types: string[];
  empty: string;
}) {
  const { data: products = [] } = useQuery(productsQuery);
  const { data: locations = [] } = useQuery(locationsQuery);
  const { data: profiles = [] } = useQuery(profilesQuery);
  const [q, setQ] = useState("");
  const [product, setProduct] = useState("");
  const [loc, setLoc] = useState("");
  const [type, setType] = useState("");
  const { from, to, setFrom, setTo, reset } = useListRange();
  const pmap = new Map(products.map((p) => [p.id, p]));
  const lmap = new Map(locations.map((l) => [l.id, l.name]));
  const umap = new Map(profiles.map((p) => [p.id, p.full_name]));
  const { data = [], isLoading } = useQuery({
    queryKey: ["movements", types.join(","), from, to],
    queryFn: async () => {
      let query = api
        .from("stock_movements")
        .select("*, batches(batch_no, expiry_date)")
        .in("movement_type", types)
        .order("performed_at", { ascending: false })
        .limit(500);
      if (from) query = query.gte("performed_at", `${from}T00:00:00+06:00`);
      if (to) query = query.lte("performed_at", `${to}T23:59:59+06:00`);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
  const rows = useMemo(() => data.filter((m) => {
    if (product && m.product_id !== product) return false;
    if (type && m.movement_type !== type) return false;
    if (loc && m.to_location !== loc && m.from_location !== loc) return false;
    if (!inDateRange(m.performed_at, from, to)) return false;
    const item = pmap.get(m.product_id);
    const who = m.performed_by ? umap.get(m.performed_by) ?? "" : "";
    const hay = `${item?.name ?? ""} ${item?.code ?? ""} ${m.batches?.batch_no ?? ""} ${m.reference_no ?? ""} ${m.remarks ?? ""} ${who}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  }), [data, q, product, loc, type, from, to, pmap, umap]);
  const page = usePagedRows(rows, `${q}|${product}|${loc}|${type}|${from}|${to}|${types.join(",")}`);
  const Icon: ComponentType<{ className?: string }> = types.length === 1 && types[0] === "OPENING"
    ? PackageOpen
    : types.includes("DAMAGE")
      ? SlidersHorizontal
      : Package;
  return (
    <section className="surface-card mt-6 overflow-hidden">
      <header className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-primary" />
          <h2 className="text-base font-semibold">{rows.length} {noun}</h2>
        </div>
        <ListToolbar query={q} onQuery={setQ} placeholder="Product, batch, reference…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
          <NativeSelect leading={<Pill />} value={product} onChange={(e) => setProduct(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Product">
            <option value="">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
          <NativeSelect leading={<MapPin />} value={loc} onChange={(e) => setLoc(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Location">
            <option value="">All locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </NativeSelect>
          {types.length > 1 && (
            <NativeSelect leading={<ArrowLeftRight />} value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-44 shrink-0" aria-label="Type">
              <option value="">All types</option>
              {types.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
            </NativeSelect>
          )}
          <FilterClear onClick={() => {
            setQ("");
            setProduct("");
            setLoc("");
            setType("");
            reset();
          }} />
        </ListToolbar>
      </header>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="p-5">
          <EmptyState title={data.length === 0 ? "Nothing yet" : "No matching entries"} description={data.length === 0 ? empty : "Try a different search or clear the filters."} />
        </div>
      ) : (
        <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Reason / reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.pageRows.map((m) => {
              const isIn = !!m.to_location && !m.from_location;
              const loc = m.to_location ?? m.from_location;
              return (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">{formatDateTime(m.performed_at)}</TableCell>
                  <TableCell className="text-xs">{humanize(m.movement_type)}</TableCell>
                  <TableCell className="font-medium">
                    {pmap.get(m.product_id)?.name ?? "—"}
                  </TableCell>
                  <TableCell className="num text-xs">
                    {m.batches?.batch_no}
                    {m.batches?.expiry_date && (
                      <span className="block text-muted-foreground">
                        exp {formatDate(m.batches.expiry_date)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{loc ? lmap.get(loc) : "—"}</TableCell>
                  <TableCell
                    className={`num text-right font-semibold ${isIn ? "text-success" : "text-destructive"}`}
                  >
                    {isIn ? "+" : "−"}
                    <Qty value={m.qty} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.performed_by ? umap.get(m.performed_by) : "System"}
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                    {[m.reference_no, m.remarks].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun={noun} onPage={page.setPage} onSize={page.setPageSize} />
        </>
      )}
    </section>
  );
}
