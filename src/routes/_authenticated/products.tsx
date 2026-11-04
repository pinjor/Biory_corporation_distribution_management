import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { PageHeader, Section, Money, StatusBadge, Field, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { productsQuery, settingsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { baseTrp } from "@/lib/pricing";
import { errorMessage, formatPct } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

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
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const rows = useMemo(
    () =>
      data.filter(
        (p) =>
          (!kind || p.kind === kind) &&
          (!q ||
            `${p.code} ${p.name} ${p.generic_name ?? ""}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, q, kind],
  );

  return (
    <div>
      <PageHeader
        title="Products"
        description="Medicines and promotional items. Base TRP is always MRP less the product's standard trade discount."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv("products.csv", [
                  [
                    "code",
                    "name",
                    "generic",
                    "strength",
                    "form",
                    "pack",
                    "uom",
                    "kind",
                    "mrp",
                    "trade_discount_pct",
                    "base_trp",
                    "reorder_level",
                    "active",
                  ],
                  ...rows.map((p) => [
                    p.code,
                    p.name,
                    p.generic_name,
                    p.strength,
                    p.dosage_form,
                    p.pack_size,
                    p.uom,
                    p.kind,
                    p.mrp,
                    p.trade_discount_pct,
                    p.base_trp,
                    p.reorder_level,
                    p.active ? "yes" : "no",
                  ]),
                ])
              }
            >
              Export CSV
            </Button>
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
          <div className="flex gap-2">
            <Input
              placeholder="Search code, name, generic…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 w-56"
            />
            <NativeSelect
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="h-8 w-36"
            >
              <option value="">All kinds</option>
              <option value="saleable">Saleable</option>
              <option value="promotional">Promotional</option>
            </NativeSelect>
          </div>
        }
      >
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No products match" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">Trade disc.</TableHead>
                <TableHead className="text-right">Base TRP</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead>Status</TableHead>
                {s.isWarehouse && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="num text-xs">{p.code}</TableCell>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[p.generic_name, p.strength, p.dosage_form, p.pack_size, p.uom]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={p.kind === "saleable" ? "CONFIRMED" : "PARTIAL"}
                      label={p.kind}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={p.mrp} />
                  </TableCell>
                  <TableCell className="num text-right">
                    {formatPct(p.trade_discount_pct)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    <Money value={p.base_trp} />
                  </TableCell>
                  <TableCell className="num text-right">{p.reorder_level}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.active ? "active" : "inactive"} />
                  </TableCell>
                  {s.isWarehouse && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEdit(p)}
                        aria-label={`Edit ${p.name}`}
                      >
                        <Pencil />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      {edit && <ProductDialog product={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

const UOMS = [
  "Pot",
  "Box",
  "Strip",
  "Bottle",
  "Tube",
  "Sachet",
  "Vial",
  "Ampoule",
  "Jar",
  "Pack",
  "Pcs",
];

function ProductDialog({ product, onClose }: { product: Partial<Product>; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);
  const [f, setF] = useState<Partial<Product>>({
    trade_discount_pct: product.id
      ? (product.trade_discount_pct ?? 15)
      : (settings?.default_trade_discount_pct ?? 15),
    reorder_level: 0,
    mrp: 0,
    ...product,
  });
  const set = (k: keyof Product, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: (f.name ?? "").trim(),
        generic_name: f.generic_name || null,
        strength: f.strength || null,
        dosage_form: f.dosage_form || null,
        pack_size: f.pack_size || null,
        uom: f.uom || null,
        category: f.category || null,
        kind: f.kind ?? "saleable",
        mrp: Number(f.mrp ?? 0),
        trade_discount_pct: Number(f.trade_discount_pct ?? 0),
        reorder_level: Number(f.reorder_level ?? 0),
        active: f.active ?? true,
        updated_at: new Date().toISOString(),
      };
      if (!payload.name) throw new Error("Product name is required");
      const { error } = product.id
        ? await supabase.from("products").update(payload).eq("id", product.id)
        : await supabase.from("products").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product saved");
      qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product.id ? "Edit product" : "New product"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Product code"
            hint={
              product.id
                ? "Codes never change once assigned"
                : "Generated automatically when you save"
            }
          >
            <Input
              value={product.id ? (f.code ?? "") : "Auto (P###)"}
              readOnly
              disabled
              className="num"
            />
          </Field>
          <Field label="Name">
            <Input value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Generic name">
            <Input
              value={f.generic_name ?? ""}
              onChange={(e) => set("generic_name", e.target.value)}
            />
          </Field>
          <Field label="Strength">
            <Input value={f.strength ?? ""} onChange={(e) => set("strength", e.target.value)} />
          </Field>
          <Field label="Dosage form">
            <Input
              value={f.dosage_form ?? ""}
              onChange={(e) => set("dosage_form", e.target.value)}
            />
          </Field>
          <Field label="Pack size" hint="e.g. 30s, 10×10, 100 ml">
            <Input value={f.pack_size ?? ""} onChange={(e) => set("pack_size", e.target.value)} />
          </Field>
          <Field label="UOM (unit of measure)">
            <NativeSelect value={f.uom ?? ""} onChange={(e) => set("uom", e.target.value)}>
              <option value="">Choose unit…</option>
              {UOMS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Category">
            <Input value={f.category ?? ""} onChange={(e) => set("category", e.target.value)} />
          </Field>
          <Field label="Kind">
            <NativeSelect
              value={f.kind ?? "saleable"}
              onChange={(e) => set("kind", e.target.value)}
            >
              <option value="saleable">Saleable</option>
              <option value="promotional">Promotional (gift / sample)</option>
            </NativeSelect>
          </Field>
          <Field label="MRP (৳)">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={f.mrp ?? 0}
              onChange={(e) => set("mrp", e.target.value)}
            />
          </Field>
          <Field label="Standard trade discount (%)">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={f.trade_discount_pct ?? 0}
              onChange={(e) => set("trade_discount_pct", e.target.value)}
            />
          </Field>
          <Field label="Reorder level (central)">
            <Input
              type="number"
              min={0}
              value={f.reorder_level ?? 0}
              onChange={(e) => set("reorder_level", e.target.value)}
            />
          </Field>
          <div className="flex items-center justify-between rounded-lg border px-3">
            <span className="text-sm font-medium">Active</span>
            <Switch checked={f.active ?? true} onCheckedChange={(v) => set("active", v)} />
          </div>
        </div>
        <div className="rounded-lg bg-primary-soft px-4 py-3 text-sm text-accent-foreground">
          Base TRP = <Money value={f.mrp} /> × (1 − {formatPct(f.trade_discount_pct)}) ={" "}
          <strong>
            <Money value={baseTrp(Number(f.mrp ?? 0), Number(f.trade_discount_pct ?? 0))} />
          </strong>
          <div className="mt-1 text-xs text-muted-foreground">
            Existing orders keep the price they were booked at.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
