import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { EmptyState, PageHeader, PageLoader, Qty, Section } from "@/components/app/page";
import { Labeled, ProductSearch } from "@/components/app/product-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchField } from "@/components/app/list-toolbar";
import { locationsQuery, opt, productsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, formatDate, todayBD } from "@/lib/format";
import { newId } from "@/lib/id";

export const Route = createFileRoute("/_authenticated/inventory/opening/new")({
  validateSearch: (s: Record<string, unknown>): { edit?: string } =>
    typeof s["edit"] === "string" ? { edit: s["edit"] } : {},
  head: () => ({ meta: [{ title: "New opening stock — BIORY Corporation" }] }),
  component: OpeningStockPage,
});

type Line = {
  key: string;
  productId: string;
  batch: string;
  mfg: string;
  expiry: string;
  qty: number;
  remarks: string;
};

function OpeningStockPage() {
  const s = useSession();
  const { edit } = Route.useSearch();
  if (!s.isWarehouse) {
    return (
      <PageHeader
        title="Opening stock"
        description="Only Warehouse Admins and Admins can post opening stock."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={edit ? "Edit opening stock" : "New opening stock"}
        description="Saving keeps this entry pending. Stock increases only after it is approved."
        actions={
          <Button asChild variant="outline">
            <Link to="/inventory/opening"><ArrowLeft /> Back</Link>
          </Button>
        }
      />
      <OpeningEntry />
    </div>
  );
}

function OpeningEntry() {
  const { edit } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const idem = useRef(newId());
  const { data: products = [] } = useQuery(productsQuery);
  const { data: locations = [] } = useQuery(locationsQuery);
  const central = useMemo(
    () => [...locations.filter((l) => l.kind === "central")].sort((a, b) => a.created_at.localeCompare(b.created_at))[0],
    [locations],
  );
  const [date, setDate] = useState(todayBD());
  const [productId, setProductId] = useState("");
  const [batch, setBatch] = useState("");
  const [mfg, setMfg] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qty, setQty] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [find, setFind] = useState("");
  const [hydrated, setHydrated] = useState(!edit);
  const { data: existing, isLoading: loadingExisting, isError } = useQuery({
    queryKey: ["opening-entry", edit],
    enabled: !!edit,
    queryFn: async () => {
      const { data, error } = await api
        .from("opening_entries")
        .select("id, status, entry_date, opening_entry_items(id, product_id, batch_no, mfg_date, expiry_date, qty, remarks)")
        .eq("id", edit!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!existing || hydrated) return;
    setDate(existing.entry_date);
    setLines((existing.opening_entry_items ?? []).map((item) => ({
      key: item.id,
      productId: item.product_id,
      batch: item.batch_no,
      mfg: item.mfg_date ?? "",
      expiry: item.expiry_date,
      qty: item.qty,
      remarks: item.remarks ?? "",
    })));
    setHydrated(true);
  }, [existing, hydrated]);

  const active = products.filter((p) => p.active);
  const names = new Map(products.map((p) => [p.id, p]));
  const picked = names.get(productId);

  const { data: storeStock = [] } = useQuery({
    queryKey: ["stock", central?.id, "opening"],
    enabled: !!central?.id,
    queryFn: async () => {
      const { data, error } = await api.from("v_stock").select("product_id, batch_no, qty").eq("location_id", central!.id);
      if (error) throw error;
      return data;
    },
  });
  const onHand = useMemo(() => {
    if (!productId) return null;
    const rows = storeStock.filter((row) => row.product_id === productId);
    const source = batch.trim()
      ? rows.filter((row) => (row.batch_no ?? "").toLowerCase() === batch.trim().toLowerCase())
      : rows;
    return source.reduce((sum, row) => sum + (row.qty ?? 0), 0);
  }, [storeStock, productId, batch]);

  const shown = lines.filter((line) => {
    if (!find.trim()) return true;
    const product = names.get(line.productId);
    return `${product?.name ?? ""} ${product?.code ?? ""} ${line.batch}`.toLowerCase().includes(find.trim().toLowerCase());
  });

  function chooseProduct(id: string) {
    setProductId(id);
  }

  function clearEntry() {
    setProductId("");
    setBatch("");
    setMfg("");
    setExpiry("");
    setQty("");
    setRemarks("");
  }

  function addLine() {
    const n = Math.floor(Number(qty));
    const id = productId;
    if (!id) {
      toast.error("Choose a product");
      return;
    }
    if (!batch.trim()) {
      toast.error("Enter a batch number");
      return;
    }
    if (!expiry) {
      toast.error("Enter an expiry date");
      return;
    }
    if (expiry <= todayBD()) {
      toast.error("Cannot receive an expired batch");
      return;
    }
    if (mfg && mfg > todayBD()) {
      toast.error("Manufacturing date cannot be in the future");
      return;
    }
    if (!(n > 0)) {
      toast.error("Enter the opening quantity");
      return;
    }
    const key = `${id}:${batch.trim().toLowerCase()}`;
    if (lines.some((line) => `${line.productId}:${line.batch.toLowerCase()}` === key)) {
      toast.error("That product and batch are already on the list");
      return;
    }
    setLines((cur) => [...cur, {
      key: newId(),
      productId: id,
      batch: batch.trim(),
      mfg,
      expiry,
      qty: n,
      remarks: remarks.trim(),
    }]);
    clearEntry();
  }

  function resetForm() {
    if (lines.length && !window.confirm("Clear this opening stock entry and start again?")) return;
    setDate(todayBD());
    setLines([]);
    setFind("");
    clearEntry();
  }

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await api.rpc("save_opening_entry", {
        p_id: edit ?? null,
        p_date: date,
        p_items: lines.map((line) => ({
          product_id: line.productId,
          batch_no: line.batch,
          mfg: opt(line.mfg),
          expiry: line.expiry,
          qty: line.qty,
          remarks: opt(line.remarks),
        })),
        p_remarks: null,
        p_idempotency_key: edit ? null : idem.current,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(edit ? "Opening entry updated. It is still pending." : "Opening entry saved as pending");
      qc.invalidateQueries({ queryKey: ["opening-entries"] });
      void navigate({ to: "/inventory/opening" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (edit && loadingExisting) return <PageLoader />;
  if (edit && (isError || !existing)) {
    return <EmptyState title="Opening entry not found" description="This challan is no longer available to edit." />;
  }
  if (existing && existing.status !== "PENDING") {
    return <EmptyState title="This opening entry is already approved" description="Approved entries cannot be edited. The stock was added when it was approved." />;
  }

  return (
    <>
      <Section title="Opening Details">
        <div className="grid gap-4 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
          <Labeled label="Date *">
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Labeled>
          <Labeled label="Store *">
            <Input readOnly value={central?.name ?? "Central warehouse"} className="bg-muted/40" />
          </Labeled>
          <Button type="button" variant="outline" onClick={resetForm}>
            <RotateCcw /> Reset
          </Button>
        </div>
      </Section>

      <Section title="Add Items">
        <form
          className="grid gap-2 md:grid-cols-4 xl:grid-cols-[1.4fr_repeat(7,minmax(0,1fr))_auto] xl:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            addLine();
          }}
        >
          <Labeled label="Item *" className="md:col-span-2 xl:col-span-1">
            <ProductSearch
              products={active}
              value={productId}
              onChange={chooseProduct}
              placeholder="Code or name"
              aria-label="Item code or name"
            />
          </Labeled>
          <Labeled label="UOM">
            <Input readOnly value={picked?.uom ?? ""} placeholder="UOM" className="bg-muted/40" />
          </Labeled>
          <Labeled label="Current stock">
            <Input readOnly value={onHand == null ? "" : String(onHand)} className="bg-muted/40" />
          </Labeled>
          <Labeled label="Batch no. *">
            <Input value={batch} placeholder="Batch" onChange={(e) => setBatch(e.target.value)} />
          </Labeled>
          <Labeled label="Mfg date">
            <Input type="date" value={mfg} max={todayBD()} onChange={(e) => setMfg(e.target.value)} />
          </Labeled>
          <Labeled label="Expiry date *">
            <Input type="date" min={todayBD()} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Labeled>
          <Labeled label="Opening qty *">
            <Input type="number" min={1} placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Labeled>
          <Labeled label="Remarks">
            <Input value={remarks} placeholder="Storage bin, optional" onChange={(e) => setRemarks(e.target.value)} />
          </Labeled>
          <Button type="submit">
            <Plus /> Add
          </Button>
        </form>
      </Section>

      <Section
        title="Opening Items"
        actions={
          <div className="flex items-center gap-2">
            <SearchField value={find} onChange={setFind} placeholder="Search by item name..." label="Search opening items" />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!lines.length) return;
                if (window.confirm("Remove every line from this opening entry?")) setLines([]);
              }}
            >
              Clear All
            </Button>
          </div>
        }
        bodyClassName={lines.length ? "p-0" : ""}
      >
        {lines.length === 0 ? (
          <EmptyState title="No items added yet" />
        ) : shown.length === 0 ? (
          <div className="p-5"><EmptyState title="No items match that search" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SL</TableHead>
                <TableHead>Item code</TableHead>
                <TableHead>Item name</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead>Batch no.</TableHead>
                <TableHead>Mfg date</TableHead>
                <TableHead>Expiry date</TableHead>
                <TableHead className="text-right">Opening qty</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="w-14" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((line) => {
                const product = names.get(line.productId);
                const sl = lines.findIndex((row) => row.key === line.key) + 1;
                return (
                  <TableRow key={line.key}>
                    <TableCell className="num">{sl}</TableCell>
                    <TableCell className="num text-xs">{product?.code}</TableCell>
                    <TableCell className="font-medium">{product?.name ?? "Product"}</TableCell>
                    <TableCell>{product?.uom || "—"}</TableCell>
                    <TableCell className="num text-xs">{line.batch}</TableCell>
                    <TableCell className="text-xs">{line.mfg ? formatDate(line.mfg) : "—"}</TableCell>
                    <TableCell className="text-xs">{formatDate(line.expiry)}</TableCell>
                    <TableCell className="text-right"><Qty value={line.qty} /></TableCell>
                    <TableCell className="max-w-40 truncate text-xs text-muted-foreground">{line.remarks || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${product?.name ?? "item"}`}
                        className="size-8"
                        onClick={() => setLines((cur) => cur.filter((row) => row.key !== line.key))}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>

      <div className="flex justify-end">
        <Button type="button" disabled={!lines.length || m.isPending} onClick={() => m.mutate()}>
          {m.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </>
  );
}
