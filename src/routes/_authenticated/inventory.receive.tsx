import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, Field, Qty } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { opt, productsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, formatDate, todayBD } from "@/lib/format";
import { downloadCsv, OPENING_STOCK_HEADERS, parseCsv, validateOpeningStock, type OpeningRow, type RowIssue } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/inventory/receive")({
  head: () => ({ meta: [{ title: "Receive stock — PharmaField" }] }),
  component: ReceivePage,
});

function ReceivePage() {
  const s = useSession();
  if (!s.isWarehouse) {
    return <PageHeader title="Receive stock" description="Only Warehouse Admins and Admins can receive stock." />;
  }
  return (
    <div>
      <PageHeader title="Receive stock" description="Post opening stock or purchase receipts into the central warehouse, batch by batch." />
      <Tabs defaultValue="manual">
        <TabsList className="mb-4">
          <TabsTrigger value="manual">Single batch</TabsTrigger>
          <TabsTrigger value="bulk">Bulk opening stock (CSV)</TabsTrigger>
        </TabsList>
        <TabsContent value="manual"><ManualReceipt /></TabsContent>
        <TabsContent value="bulk"><BulkImport /></TabsContent>
      </Tabs>
    </div>
  );
}

function ManualReceipt() {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery(productsQuery);
  const blank = { product: "", batch: "", mfg: "", expiry: "", qty: "", type: "PURCHASE_RECEIPT", reference: "", remarks: "" };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }));
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("receive_stock", {
        p_product: f.product,
        p_batch_no: f.batch,
        p_mfg: opt(f.mfg),
        p_expiry: f.expiry,
        p_qty: Number(f.qty),
        p_type: f.type,
        p_reference: opt(f.reference),
        p_remarks: opt(f.remarks),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock received into Central Warehouse");
      qc.invalidateQueries({ queryKey: ["stock"] });
      setF({ ...blank, type: f.type });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const p = products.find((x) => x.id === f.product);
  return (
    <Section title="Receipt details">
      <form
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Receipt type">
          <NativeSelect value={f.type} onChange={(e) => set("type", e.target.value)}>
            <option value="PURCHASE_RECEIPT">Purchase / stock receipt</option>
            <option value="OPENING">Opening stock</option>
          </NativeSelect>
        </Field>
        <Field label="Product">
          <NativeSelect required value={f.product} onChange={(e) => set("product", e.target.value)}>
            <option value="">Choose product…</option>
            {products.filter((x) => x.active).map((x) => (
              <option key={x.id} value={x.id}>{x.name} ({x.code})</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Batch number"><Input required value={f.batch} onChange={(e) => set("batch", e.target.value)} /></Field>
        <Field label="Manufacturing date"><Input type="date" value={f.mfg} max={todayBD()} onChange={(e) => set("mfg", e.target.value)} /></Field>
        <Field label="Expiry date"><Input required type="date" min={todayBD()} value={f.expiry} onChange={(e) => set("expiry", e.target.value)} /></Field>
        <Field label="Quantity received"><Input required type="number" min={1} value={f.qty} onChange={(e) => set("qty", e.target.value)} /></Field>
        <Field label="Reference document (GRN / invoice)"><Input value={f.reference} onChange={(e) => set("reference", e.target.value)} /></Field>
        <Field label="Remarks / storage bin"><Input value={f.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={m.isPending}>{m.isPending ? "Posting…" : "Post receipt"}</Button>
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

function BulkImport() {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery(productsQuery);
  const [result, setResult] = useState<{ rows: OpeningRow[]; issues: RowIssue[]; file: string } | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      if (!result) return 0;
      const { data, error } = await supabase.rpc("import_opening_stock", {
        p_rows: result.rows.map((r) => ({
          product_code: r.product_code,
          batch_no: r.batch_no,
          mfg_date: r.mfg_date,
          expiry_date: r.expiry_date,
          qty: r.qty,
          remarks: r.remarks,
        })),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (n) => {
      toast.success(`Imported ${n} batches`);
      qc.invalidateQueries({ queryKey: ["stock"] });
      setResult(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function onFile(file: File) {
    const text = await file.text();
    const map = new Map(products.map((p) => [p.code, p.name]));
    const v = validateOpeningStock(parseCsv(text), map, todayBD());
    setResult({ ...v, file: file.name });
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title="1 · Upload">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <label className="flex flex-1 cursor-pointer items-center gap-3 rounded-xl border border-dashed p-5 hover:bg-muted">
            <FileUp className="size-6 text-primary" />
            <div>
              <div className="text-sm font-semibold">{result ? result.file : "Choose a CSV file"}</div>
              <div className="text-xs text-muted-foreground">Columns: {OPENING_STOCK_HEADERS.join(", ")} · dates as YYYY-MM-DD</div>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </label>
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv("opening-stock-template.csv", [
                [...OPENING_STOCK_HEADERS],
                [products[0]?.code ?? "NAP500", "B-0001", "2026-01-01", "2028-01-01", "100", "Rack A1"],
              ])
            }
          >
            <Download /> Template
          </Button>
        </div>
      </Section>

      {result && (
        <>
          <Section title={`2 · Validate — ${result.rows.length} valid, ${result.issues.length} with problems`}>
            {result.issues.length > 0 ? (
              <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto text-sm">
                {result.issues.map((i) => (
                  <li key={i.line} className="rounded-md bg-destructive-soft px-3 py-1.5 text-destructive">
                    Line {i.line}: {i.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-success">Every row passed validation.</p>
            )}
            {result.issues.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">Fix the file and upload again — the import only runs when every row is valid.</p>
            )}
          </Section>
          <Section title="3 · Preview" bodyClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Mfg</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.slice(0, 200).map((r) => (
                  <TableRow key={r.line}>
                    <TableCell className="num text-xs">{r.line}</TableCell>
                    <TableCell>{r.product_name} <span className="num text-xs text-muted-foreground">{r.product_code}</span></TableCell>
                    <TableCell className="num text-xs">{r.batch_no}</TableCell>
                    <TableCell className="text-xs">{formatDate(r.mfg_date || null)}</TableCell>
                    <TableCell className="text-xs">{formatDate(r.expiry_date)}</TableCell>
                    <TableCell className="text-right"><Qty value={r.qty} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResult(null)}>Discard</Button>
            <Button disabled={result.issues.length > 0 || result.rows.length === 0 || m.isPending} onClick={() => m.mutate()}>
              {m.isPending ? "Importing…" : `4 · Confirm import of ${result.rows.length} batches`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
