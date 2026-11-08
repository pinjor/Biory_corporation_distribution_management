import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Download, Printer, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { SearchField } from "@/components/app/list-toolbar";
import { EmptyState, Qty, Section } from "@/components/app/page";
import { Labeled, ProductSearch } from "@/components/app/product-search";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { locationsQuery, productsQuery } from "@/lib/queries";
import { formatDate, todayBD } from "@/lib/format";
import { downloadTableReport } from "@/lib/table-report";

export type ItemDraft = {
  location: string;
  productId: string;
  category: string;
  expFrom: string;
  expTo: string;
  from: string;
  to: string;
};

export const EMPTY_ITEM_DRAFT: ItemDraft = {
  location: "",
  productId: "",
  category: "",
  expFrom: "",
  expTo: "",
  from: "",
  to: "",
};

type Filters = ItemDraft;

type Batch = { no: string; expiry: string | null; qty: number };

type Item = {
  id: string;
  code: string;
  name: string;
  dosage: string;
  uom: string;
  category: string;
  qty: number;
  batches: Batch[];
};

function useStockRows(applied: Filters, batch: boolean) {
  const { data: products = [] } = useQuery(productsQuery);
  const { data: locations = [] } = useQuery(locationsQuery);
  const stores = locations.filter((l) => l.kind === "central" || l.kind === "so");
  const { data: stock = [], isLoading } = useQuery({
    queryKey: ["stock-worklist"],
    queryFn: async () => {
      const { data, error } = await api.from("v_stock").select("*").gt("qty", 0);
      if (error) throw error;
      return data;
    },
  });
  const categories = [...new Set(products.map((p) => p.category).filter((v): v is string => !!v))].sort();
  const rows = useMemo(() => {
    const catalog = new Map(products.map((p) => [p.id, p]));
    const grouped = new Map<string, Item>();
    for (const row of stock) {
      if (!row.product_id) continue;
      if (row.location_kind !== "central" && row.location_kind !== "so") continue;
      if (applied.location && row.location_id !== applied.location) continue;
      if (batch && applied.expFrom && (!row.expiry_date || row.expiry_date < applied.expFrom)) continue;
      if (batch && applied.expTo && (!row.expiry_date || row.expiry_date > applied.expTo)) continue;
      const product = catalog.get(row.product_id);
      const item: Item = grouped.get(row.product_id) ?? {
        id: row.product_id,
        code: product?.code ?? row.product_code ?? "",
        name: product?.name ?? row.product_name ?? "Product",
        dosage: product?.dosage_form ?? "",
        uom: product?.uom ?? "",
        category: product?.category ?? "",
        qty: 0,
        batches: [],
      };
      const qty = row.qty ?? 0;
      item.qty += qty;
      const existing = item.batches.find((b) => b.no === (row.batch_no ?? "") && b.expiry === row.expiry_date);
      if (existing) existing.qty += qty;
      else item.batches.push({ no: row.batch_no ?? "—", expiry: row.expiry_date, qty });
      grouped.set(row.product_id, item);
    }
    return [...grouped.values()]
      .filter((item) => {
        if (applied.productId && item.id !== applied.productId) return false;
        if (applied.category && item.category !== applied.category) return false;
        return item.qty > 0;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stock, products, applied, batch]);
  return { stores, categories, products, rows, isLoading };
}

function commitFilters(draft: Filters, expiry: boolean, period: boolean) {
  if (expiry && draft.expFrom && draft.expTo && draft.expFrom > draft.expTo) {
    toast.error("The from date is after the to date");
    return null;
  }
  if (period && draft.from && draft.to && draft.from > draft.to) {
    toast.error("The from date is after the to date");
    return null;
  }
  return draft;
}

function ActionRow({
  onReset,
  onPrint,
  onDownload,
  reorder,
}: {
  onReset: () => void;
  onPrint: () => void;
  onDownload: () => void;
  reorder?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit"><Search /> Search</Button>
      <Button type="button" onClick={onReset}><RotateCcw /> Reset</Button>
      <Button type="button" onClick={onPrint}><Printer /> Print</Button>
      {reorder && (
        <Button type="button" onClick={() => navigate({ to: "/reports", search: { report: "stock" } })}>
          Re-order level report
        </Button>
      )}
      <Button type="button" onClick={onDownload}><Download /> Download</Button>
    </div>
  );
}

export function ItemReportFilter({
  draft,
  stores,
  categories,
  products,
  onDraft,
  onApply,
  onReset,
  onPrint,
  onDownload,
  expiry,
  period,
  reorder,
}: {
  draft: ItemDraft;
  stores: { id: string; name: string }[];
  categories: string[];
  products: { id: string; name: string; code: string }[];
  onDraft: (next: ItemDraft) => void;
  onApply: (next: ItemDraft) => void;
  onReset: () => void;
  onPrint: () => void;
  onDownload: () => void;
  expiry?: boolean;
  period?: boolean;
  reorder?: boolean;
}) {
  const chooseProduct = (productId: string) => {
    const next = { ...draft, productId };
    onDraft(next);
    const committed = commitFilters(next, !!expiry, !!period);
    if (committed) onApply(committed);
  };
  return (
    <section className="surface-card p-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const next = commitFilters(draft, !!expiry, !!period);
          if (next) onApply(next);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Labeled label="Department">
            <NativeSelect value={draft.location} onChange={(e) => onDraft({ ...draft, location: e.target.value })} aria-label="Department">
              <option value="">All stores</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </NativeSelect>
          </Labeled>
          <Labeled label="Item code">
            <ProductSearch
              products={products}
              value={draft.productId}
              onChange={chooseProduct}
              display="code"
              placeholder="Search code or name"
              aria-label="Item code"
            />
          </Labeled>
          <Labeled label="Item name">
            <ProductSearch
              products={products}
              value={draft.productId}
              onChange={chooseProduct}
              display="name"
              placeholder="Search name or code"
              aria-label="Item name"
            />
          </Labeled>
          <Labeled label="Item category">
            <NativeSelect value={draft.category} onChange={(e) => onDraft({ ...draft, category: e.target.value })} aria-label="Item category">
              <option value="">All</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </NativeSelect>
          </Labeled>
          {period && (
            <>
              <Labeled label="From">
                <Input type="date" value={draft.from} onChange={(e) => onDraft({ ...draft, from: e.target.value })} aria-label="From date" />
              </Labeled>
              <Labeled label="To">
                <Input type="date" value={draft.to} onChange={(e) => onDraft({ ...draft, to: e.target.value })} aria-label="To date" />
              </Labeled>
            </>
          )}
          {expiry && (
            <>
              <Labeled label="Exp. from">
                <Input type="date" value={draft.expFrom} onChange={(e) => onDraft({ ...draft, expFrom: e.target.value })} aria-label="Expiry from" />
              </Labeled>
              <Labeled label="Exp. to">
                <Input type="date" value={draft.expTo} onChange={(e) => onDraft({ ...draft, expTo: e.target.value })} aria-label="Expiry to" />
              </Labeled>
            </>
          )}
        </div>
        <ActionRow {...(reorder ? { reorder: true } : {})} onReset={onReset} onPrint={onPrint} onDownload={onDownload} />
      </form>
    </section>
  );
}

export function StockWorkList() {
  const [draft, setDraft] = useState<Filters>(EMPTY_ITEM_DRAFT);
  const [applied, setApplied] = useState<Filters>(EMPTY_ITEM_DRAFT);
  const [find, setFind] = useState("");
  const { stores, categories, products, rows, isLoading } = useStockRows(applied, false);
  const shown = rows.filter((row) => !find.trim() || `${row.code} ${row.name} ${row.dosage} ${row.category} ${row.uom}`.toLowerCase().includes(find.trim().toLowerCase()));
  const page = usePagedRows(shown, `${find}|${JSON.stringify(applied)}`);

  function download() {
    void downloadTableReport("Stock report", todayBD(), todayBD(), {
      columns: ["SL", "Item code", "Item name", "A/U", "Item category", "Stock qty"],
      rows: shown.map((row, i) => [String(i + 1), row.code, row.name, row.uom || "—", row.category || "—", String(row.qty)]),
    }).catch((e) => toast.error(String(e)));
  }

  return (
    <div className="flex flex-col gap-4">
      <ItemReportFilter
        draft={draft}
        stores={stores}
        categories={categories}
        products={products}
        onDraft={setDraft}
        onApply={setApplied}
        reorder
        onReset={() => { setDraft(EMPTY_ITEM_DRAFT); setApplied(EMPTY_ITEM_DRAFT); setFind(""); }}
        onPrint={() => window.print()}
        onDownload={download}
      />
      <div className="report-print">
        <Section
          title="Stock items"
          bodyClassName={shown.length ? "p-0" : ""}
          actions={<SearchField value={find} onChange={setFind} placeholder="Search records..." label="Search stock items" />}
        >
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading stock…</div>
          ) : shown.length === 0 ? (
            <EmptyState title="No stock matches these filters" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">SL</TableHead>
                    <TableHead>Item code</TableHead>
                    <TableHead>Item name</TableHead>
                    <TableHead>A/U</TableHead>
                    <TableHead>Item category</TableHead>
                    <TableHead className="text-right">Stock qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.pageRows.map((row, index) => (
                    <TableRow key={row.id}>
                      <TableCell className="num">{(page.page - 1) * page.pageSize + index + 1}</TableCell>
                      <TableCell className="num text-xs">{row.code}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.uom || "—"}</TableCell>
                      <TableCell>{row.category || "—"}</TableCell>
                      <TableCell className="text-right"><Qty value={row.qty} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="items" onPage={page.setPage} onSize={page.setPageSize} />
            </>
          )}
        </Section>
      </div>
    </div>
  );
}

export function BatchStockReport() {
  const [draft, setDraft] = useState<Filters>(EMPTY_ITEM_DRAFT);
  const [applied, setApplied] = useState<Filters>(EMPTY_ITEM_DRAFT);
  const [find, setFind] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { stores, categories, products, rows, isLoading } = useStockRows(applied, true);
  const shown = rows.filter((row) => !find.trim() || `${row.code} ${row.name} ${row.batches.map((b) => b.no).join(" ")}`.toLowerCase().includes(find.trim().toLowerCase()));
  const page = usePagedRows(shown, `${find}|${JSON.stringify(applied)}`);

  function download() {
    const lines: string[][] = [];
    shown.forEach((row, i) => {
      lines.push([String(i + 1), `${row.batches.length} batch${row.batches.length === 1 ? "" : "es"}`, row.code, row.name, row.uom || "—", row.batches.length === 1 ? formatDate(row.batches[0]?.expiry) : "—", row.category || "—", String(row.qty)]);
      for (const batch of row.batches) {
        lines.push(["", batch.no, row.code, row.name, row.uom || "—", formatDate(batch.expiry), row.category || "—", String(batch.qty)]);
      }
    });
    void downloadTableReport("Batch wise stock", applied.expFrom || todayBD(), applied.expTo || todayBD(), {
      columns: ["SL", "Batch", "Item code", "Item name", "A/U", "Expiry date", "Item category", "Balance qty"],
      rows: lines,
    }).catch((e) => toast.error(String(e)));
  }

  return (
    <div className="flex flex-col gap-4">
      <ItemReportFilter
        draft={draft}
        stores={stores}
        categories={categories}
        products={products}
        expiry
        onDraft={setDraft}
        onApply={(next) => { setApplied(next); setOpen({}); }}
        onReset={() => { setDraft(EMPTY_ITEM_DRAFT); setApplied(EMPTY_ITEM_DRAFT); setFind(""); setOpen({}); }}
        onPrint={() => window.print()}
        onDownload={download}
      />
      <div className="report-print">
        <Section
          title="Batch stock items"
          bodyClassName={shown.length ? "p-0" : ""}
          actions={<SearchField value={find} onChange={setFind} placeholder="Item batch/code/name" label="Search batch stock" />}
        >
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading stock…</div>
          ) : shown.length === 0 ? (
            <EmptyState title="No batches match these filters" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">SL</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Item code</TableHead>
                    <TableHead>Item name</TableHead>
                    <TableHead>A/U</TableHead>
                    <TableHead>Expiry date</TableHead>
                    <TableHead>Item category</TableHead>
                    <TableHead className="text-right">Balance qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.pageRows.map((row, index) => {
                    const expanded = !!open[row.id];
                    const single = row.batches.length === 1 ? row.batches[0] : null;
                    return (
                      <Fragment key={row.id}>
                        <TableRow>
                          <TableCell className="num">{(page.page - 1) * page.pageSize + index + 1}</TableCell>
                          <TableCell>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 text-sm font-medium"
                              aria-expanded={expanded}
                              onClick={() => setOpen((cur) => ({ ...cur, [row.id]: !cur[row.id] }))}
                            >
                              <ChevronRight className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                              {row.batches.length} batch{row.batches.length === 1 ? "" : "es"}
                            </button>
                          </TableCell>
                          <TableCell className="num text-xs">{row.code}</TableCell>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell>{row.uom || "—"}</TableCell>
                          <TableCell className="text-xs">{single ? formatDate(single.expiry) : "—"}</TableCell>
                          <TableCell>{row.category || "—"}</TableCell>
                          <TableCell className="text-right"><Qty value={row.qty} /></TableCell>
                        </TableRow>
                        {expanded && row.batches.map((batch) => (
                          <TableRow key={`${row.id}:${batch.no}:${batch.expiry ?? ""}`} className="bg-muted/30">
                            <TableCell />
                            <TableCell className="num text-xs">{batch.no}</TableCell>
                            <TableCell className="num text-xs">{row.code}</TableCell>
                            <TableCell>{row.name}</TableCell>
                            <TableCell>{row.uom || "—"}</TableCell>
                            <TableCell className="text-xs">{formatDate(batch.expiry)}</TableCell>
                            <TableCell>{row.category || "—"}</TableCell>
                            <TableCell className="text-right"><Qty value={batch.qty} /></TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="items" onPage={page.setPage} onSize={page.setPageSize} />
            </>
          )}
        </Section>
      </div>
    </div>
  );
}
