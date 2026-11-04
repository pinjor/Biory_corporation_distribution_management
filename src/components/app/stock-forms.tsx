import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import { errorMessage, formatDate, formatDateTime, humanize, todayBD } from "@/lib/format";
import {
  downloadCsv,
  OPENING_STOCK_HEADERS,
  parseCsv,
  validateOpeningStock,
  type OpeningRow,
  type RowIssue,
} from "@/lib/csv";

/** Shared stock-entry building blocks for Receive stock, Opening stock and Stock adjustment. */

export function OpeningStockImport() {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery(productsQuery);
  const [result, setResult] = useState<{
    rows: OpeningRow[];
    issues: RowIssue[];
    file: string;
  } | null>(null);
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
      toast.success(`Imported ${n} rows as one opening challan`);
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
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
              <div className="text-sm font-semibold">
                {result ? result.file : "Choose a CSV file"}
              </div>
              <div className="text-xs text-muted-foreground">
                Columns: {OPENING_STOCK_HEADERS.join(", ")} · dates as YYYY-MM-DD
              </div>
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
                [
                  products[0]?.code ?? "NAP500",
                  "B-0001",
                  "2026-01-01",
                  "2028-01-01",
                  "100",
                  "Rack A1",
                ],
              ])
            }
          >
            <Download /> Template
          </Button>
        </div>
      </Section>

      {result && (
        <>
          <Section
            title={`2 · Validate — ${result.rows.length} valid, ${result.issues.length} with problems`}
          >
            {result.issues.length > 0 ? (
              <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto text-sm">
                {result.issues.map((i) => (
                  <li
                    key={i.line}
                    className="rounded-md bg-destructive-soft px-3 py-1.5 text-destructive"
                  >
                    Line {i.line}: {i.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-success">Every row passed validation.</p>
            )}
            {result.issues.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Fix the file and upload again — the import only runs when every row is valid.
              </p>
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
                    <TableCell>
                      {r.product_name}{" "}
                      <span className="num text-xs text-muted-foreground">{r.product_code}</span>
                    </TableCell>
                    <TableCell className="num text-xs">{r.batch_no}</TableCell>
                    <TableCell className="text-xs">{formatDate(r.mfg_date || null)}</TableCell>
                    <TableCell className="text-xs">{formatDate(r.expiry_date)}</TableCell>
                    <TableCell className="text-right">
                      <Qty value={r.qty} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResult(null)}>
              Discard
            </Button>
            <Button
              disabled={result.issues.length > 0 || result.rows.length === 0 || m.isPending}
              onClick={() => m.mutate()}
            >
              {m.isPending ? "Importing…" : `4 · Confirm import of ${result.rows.length} batches`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
