import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pencil, Pill, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { PageHeader, Section, Money, StatusBadge, Field, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { masterValuesQuery, productsQuery, settingsQuery, type MasterValue } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { baseTrp } from "@/lib/pricing";
import { errorMessage, formatPct, inDateRange } from "@/lib/format";
type Product = Database["public"]["Tables"]["products"]["Row"];

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Products — BIORY Corporation" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const s = useSession();
  const { data = [] } = useQuery(productsQuery);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const { from, to, setFrom, setTo, reset } = useListRange();
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const rows = useMemo(
    () =>
      data.filter(
        (p) =>
          inDateRange(p.created_at, from, to) &&
          (!kind || p.kind === kind) &&
          (!q || `${p.code} ${p.name} ${p.generic_name ?? ""}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, q, kind, from, to],
  );
  const page = usePagedRows(rows, `${q}|${kind}|${from}|${to}`);

  return (
    <div>
      <PageHeader
        title="Products"
        description="Medicines and promotional items. Base TRP is always MRP less the product's standard trade discount."
        actions={
          <>
            {s.isWarehouse && (
              <Button onClick={() => setEdit({ kind: "saleable", active: true })}>
                <Plus /> New product
              </Button>
            )}
          </>
        }
      />
      <Section
        bodyClassName="p-0"
        title={`${rows.length} products`}
        actions={
          <ListToolbar query={q} onQuery={setQ} placeholder="Code, name, generic…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
            <NativeSelect leading={<Pill />} value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 w-44 shrink-0" aria-label="Category">
              <option value="">All categories</option>
              <option value="saleable">Medicine</option>
              <option value="promotional">Promotional gift</option>
            </NativeSelect>
            <FilterClear onClick={() => { setQ(""); setKind(""); reset(); }} />
          </ListToolbar>
        }
      >
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No products match" />
          </div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">Trade disc.</TableHead>
                <TableHead className="text-right">Base TRP</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead>Status</TableHead>
                {s.isWarehouse && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.pageRows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="num text-xs">{p.code}</TableCell>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(p.kind === "promotional" ? [p.pack_size, p.uom] : [p.generic_name, p.strength, p.dosage_form, p.pack_size, p.uom]).filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.kind === "saleable" ? "CONFIRMED" : "PARTIAL"} label={p.kind === "promotional" ? "Promotional gift" : "Medicine"} />
                  </TableCell>
                  <TableCell className="text-right"><Money value={p.mrp} /></TableCell>
                  <TableCell className="num text-right">{formatPct(p.trade_discount_pct)}</TableCell>
                  <TableCell className="text-right font-semibold"><Money value={p.base_trp} /></TableCell>
                  <TableCell className="num text-right">{p.reorder_level}</TableCell>
                  <TableCell><StatusBadge status={p.active ? "active" : "inactive"} /></TableCell>
                  {s.isWarehouse && (
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setEdit(p)} aria-label={`Edit ${p.name}`}>
                        <Pencil />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="products" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
      {edit && <ProductDialog product={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ProductDialog({ product, onClose }: { product: Partial<Product>; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);
  const { data: masters = [] } = useQuery(masterValuesQuery);
  const [f, setF] = useState<Partial<Product>>({
    trade_discount_pct: product.id ? (product.trade_discount_pct ?? 15) : (settings?.default_trade_discount_pct ?? 15),
    reorder_level: 0,
    mrp: 0,
    ...product,
  });
  const set = (k: keyof Product, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: async () => {
      const code = (f.code ?? "").trim();
      const gift = (f.kind ?? "saleable") === "promotional";
      const payload = {
        ...(code ? { code } : {}),
        name: (f.name ?? "").trim(),
        generic_name: gift ? null : f.generic_name || null,
        strength: gift ? null : f.strength || null,
        dosage_form: gift ? null : f.dosage_form || null,
        pack_size: f.pack_size || null,
        uom: f.uom || null,
        category: null,
        kind: f.kind ?? "saleable",
        mrp: gift ? 0 : Number(f.mrp ?? 0),
        trade_discount_pct: gift ? 0 : Number(f.trade_discount_pct ?? 0),
        reorder_level: Number(f.reorder_level ?? 0),
        active: f.active ?? true,
        updated_at: new Date().toISOString(),
      };
      if (!payload.name) throw new Error("Name is required");
      if (product.id && !code) throw new Error("Code is required once a product has been saved");
      const { error } = product.id
        ? await api.from("products").update(payload).eq("id", product.id)
        : await api.from("products").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product saved");
      qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const gift = (f.kind ?? "saleable") === "promotional";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product.id ? "Edit product" : "New product"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <NativeSelect
              value={f.kind ?? "saleable"}
              onChange={(e) => {
                const kind = e.target.value;
                setF((x) => ({
                  ...x,
                  kind,
                  ...(kind === "promotional" ? { generic_name: "", strength: "", dosage_form: "", category: "", mrp: 0, trade_discount_pct: 0 } : {}),
                }));
              }}
            >
              <option value="saleable">Medicine</option>
              <option value="promotional">Promotional gift</option>
            </NativeSelect>
          </Field>
          <Field label="Code">
            <Input value={f.code ?? ""} onChange={(e) => set("code", e.target.value)} placeholder={product.id ? "" : "Leave blank to auto-generate"} />
          </Field>
          <Field label="Name"><Input value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder={gift ? "Pen, pad, mug set…" : "Product name"} /></Field>
          {gift ? (
            <MasterPick label="Pack size" kind="pack_size" value={f.pack_size ?? ""} items={masters} onChange={(v) => set("pack_size", v)} />
          ) : (
            <MasterPick label="Generic name" kind="generic_name" value={f.generic_name ?? ""} items={masters} onChange={(v) => set("generic_name", v)} />
          )}
          {!gift && (
            <>
              <MasterPick label="Strength" kind="strength" value={f.strength ?? ""} items={masters} onChange={(v) => set("strength", v)} />
              <Field label="Dosage form"><Input value={f.dosage_form ?? ""} onChange={(e) => set("dosage_form", e.target.value)} /></Field>
              <MasterPick label="Pack size" kind="pack_size" value={f.pack_size ?? ""} items={masters} onChange={(v) => set("pack_size", v)} />
            </>
          )}
          <MasterPick label="UOM" kind="uom" value={f.uom ?? ""} items={masters} onChange={(v) => set("uom", v)} />
          {!gift && (
            <>
              <Field label="MRP (৳)"><Input type="number" min={0} step="0.01" value={f.mrp ?? 0} onChange={(e) => set("mrp", e.target.value)} /></Field>
              <Field label="Standard trade discount (%)">
                <Input type="number" min={0} max={100} step="0.01" value={f.trade_discount_pct ?? 0} onChange={(e) => set("trade_discount_pct", e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Reorder level (central)"><Input type="number" min={0} value={f.reorder_level ?? 0} onChange={(e) => set("reorder_level", e.target.value)} /></Field>
          <div className="flex items-center justify-between rounded-lg border px-3">
            <span className="text-sm font-medium">Active</span>
            <Switch checked={f.active ?? true} onCheckedChange={(v) => set("active", v)} />
          </div>
        </div>
        {!gift && (
          <div className="rounded-lg bg-primary-soft px-4 py-3 text-sm text-accent-foreground">
            Base TRP = <Money value={f.mrp} /> × (1 − {formatPct(f.trade_discount_pct)}) ={" "}
            <strong><Money value={baseTrp(Number(f.mrp ?? 0), Number(f.trade_discount_pct ?? 0))} /></strong>
            <div className="mt-1 text-xs text-muted-foreground">Existing orders keep the price they were booked at.</div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save product"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MasterPick({
  label,
  kind,
  value,
  items,
  onChange,
}: {
  label: string;
  kind: string;
  value: string;
  items: MasterValue[];
  onChange: (value: string) => void;
}) {
  const names = items.filter((item) => item.kind === kind && (item.active || item.name === value)).map((item) => item.name);
  const options = [...new Set(value && !names.includes(value) ? [value, ...names] : names)];
  return (
    <Field label={label}>
      <NativeSelect value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {options.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </NativeSelect>
    </Field>
  );
}
