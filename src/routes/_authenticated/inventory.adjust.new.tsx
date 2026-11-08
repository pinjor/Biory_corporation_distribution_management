import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { PageHeader, Section, EmptyState, PageLoader, Qty } from "@/components/app/page";
import { Labeled, ProductSearch } from "@/components/app/product-search";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchField } from "@/components/app/list-toolbar";
import { locationsQuery, opt, productsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, formatDate, todayBD } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory/adjust/new")({
  validateSearch: (s: Record<string, unknown>): { edit?: string } =>
    typeof s["edit"] === "string" ? { edit: s["edit"] } : {},
  head: () => ({ meta: [{ title: "New stock adjustment — BIORY Corporation" }] }),
  component: AdjustPage,
});

const REASONS = ["Damaged", "Expired", "Lost / missing", "Physical count", "Customer return", "Other"] as const;

function movementType(dir: "in" | "out", reason: string) {
  if (dir === "in") return reason === "Customer return" ? "CUSTOMER_RETURN" : "MANUAL_ADJUSTMENT_IN";
  if (reason === "Damaged") return "DAMAGE";
  if (reason === "Expired") return "EXPIRED";
  if (reason === "Lost / missing") return "LOSS";
  return "MANUAL_ADJUSTMENT_OUT";
}

function directionLabel(type: string) {
  return type === "MANUAL_ADJUSTMENT_IN" || type === "CUSTOMER_RETURN" ? "Increase" : "Decrease";
}

type Line = {
  key: string;
  productId: string;
  batchId: string;
  batchNo: string;
  expiry: string;
  type: string;
  qty: number;
  reason: string;
  remarks: string;
};

function AdjustPage() {
  const { edit } = Route.useSearch();
  const s = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const idem = useRef(crypto.randomUUID());
  const { data: locations = [] } = useQuery(locationsQuery);
  const { data: products = [] } = useQuery(productsQuery);
  const central = locations.find((l) => l.kind === "central");
  const [loc, setLoc] = useState("");
  const location = loc || central?.id || "";
  const [date, setDate] = useState(todayBD());
  const [chalan, setChalan] = useState("");
  const [productId, setProductId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [dir, setDir] = useState<"in" | "out">("out");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [find, setFind] = useState("");
  const [hydrated, setHydrated] = useState(!edit);
  const { data: existing, isLoading: loadingExisting, isError } = useQuery({
    queryKey: ["adjustment-entry", edit],
    enabled: !!edit,
    queryFn: async () => {
      const { data, error } = await api
        .from("adjustment_entries")
        .select("id, status, entry_date, location_id, remarks, adjustment_entry_items(id, product_id, batch_id, movement_type, qty, reason, remarks, batches(batch_no, expiry_date))")
        .eq("id", edit!)
        .single();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!existing || hydrated) return;
    setDate(existing.entry_date);
    setChalan(existing.remarks ?? "");
    setLoc(existing.location_id);
    setLines((existing.adjustment_entry_items ?? []).map((item) => ({
      key: item.id,
      productId: item.product_id,
      batchId: item.batch_id,
      batchNo: item.batches?.batch_no ?? "",
      expiry: item.batches?.expiry_date ?? "",
      type: item.movement_type,
      qty: item.qty,
      reason: item.reason,
      remarks: item.remarks ?? "",
    })));
    setHydrated(true);
  }, [existing, hydrated]);

  const active = products.filter((p) => p.active);
  const names = new Map(products.map((p) => [p.id, p]));
  const picked = names.get(productId);

  const { data: stock = [] } = useQuery({
    queryKey: ["stock", location, "adjust"],
    enabled: !!location,
    queryFn: async () => {
      const { data, error } = await api
        .from("v_stock")
        .select("*")
        .eq("location_id", location)
        .order("product_name")
        .order("expiry_date");
      if (error) throw error;
      return data;
    },
  });
  const batches = useMemo(
    () => stock.filter((row) => row.product_id === productId && (dir === "in" || (row.qty ?? 0) > 0)),
    [stock, productId, dir],
  );
  const batch = batches.find((row) => row.batch_id === batchId);
  const shown = lines.filter((line) => {
    if (!find.trim()) return true;
    const product = names.get(line.productId);
    return `${product?.name ?? ""} ${product?.code ?? ""}`.toLowerCase().includes(find.trim().toLowerCase());
  });

  function chooseProduct(id: string) {
    setProductId(id);
    setBatchId("");
  }

  function clearEntry() {
    setProductId("");
    setBatchId("");
    setQty("");
    setReason("");
    setRemarks("");
    setDir("out");
  }

  function addLine() {
    const n = Math.floor(Number(qty));
    if (!location) {
      toast.error("Choose a store");
      return;
    }
    const id = productId;
    if (!id) {
      toast.error("Choose a product");
      return;
    }
    if (!batchId || !batch) {
      toast.error("Choose a batch");
      return;
    }
    if (!(n > 0)) {
      toast.error("Enter the adjusted quantity");
      return;
    }
    if (dir === "out" && n > (batch.qty ?? 0)) {
      toast.error(`Only ${batch.qty ?? 0} on hand in that batch`);
      return;
    }
    if (!reason) {
      toast.error("Choose an adjust reason");
      return;
    }
    if (reason === "Other" && !remarks.trim()) {
      toast.error("Enter remarks when the reason is Other");
      return;
    }
    const ledgerType = movementType(dir, reason);
    if (lines.some((line) => line.batchId === batchId && line.type === ledgerType)) {
      toast.error("That batch is already on this adjustment for the same type");
      return;
    }
    setLines((cur) => [...cur, {
      key: crypto.randomUUID(),
      productId: id,
      batchId,
      batchNo: batch.batch_no ?? "",
      expiry: batch.expiry_date ?? "",
      type: ledgerType,
      qty: n,
      reason,
      remarks: remarks.trim(),
    }]);
    clearEntry();
  }

  function resetForm() {
    if (lines.length && !window.confirm("Clear this adjustment and start again?")) return;
    setDate(todayBD());
    setChalan("");
    setLoc("");
    setLines([]);
    setFind("");
    clearEntry();
  }

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await api.rpc("save_adjustment_entry", {
        p_id: edit ?? null,
        p_date: date,
        p_location: location,
        p_items: lines.map((line) => ({
          product_id: line.productId,
          batch_id: line.batchId,
          qty: line.qty,
          movement_type: line.type,
          reason: line.reason,
          remarks: opt(line.remarks),
        })),
        p_remarks: opt(chalan),
        p_idempotency_key: edit ? null : idem.current,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(edit ? "Adjustment updated. It is still pending." : "Adjustment saved as pending");
      qc.invalidateQueries({ queryKey: ["adjustment-entries"] });
      void navigate({ to: "/inventory/adjust" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!s.isWarehouse) {
    return (
      <PageHeader
        title="Stock adjustment"
        description="Only Warehouse Admins and Admins can adjust stock."
      />
    );
  }
  if (edit && loadingExisting) return <PageLoader />;
  if (edit && (isError || !existing)) {
    return <EmptyState title="Adjustment not found" description="This challan is no longer available to edit." />;
  }
  if (existing && existing.status !== "PENDING") {
    return <EmptyState title="This adjustment is already approved" description="Approved adjustments cannot be edited. Stock changed when it was approved." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={edit ? "Edit stock adjustment" : "New stock adjustment"}
        description="Saving keeps this adjustment pending. Stock increases or decreases only after it is approved."
        actions={
          <Button asChild variant="outline">
            <Link to="/inventory/adjust"><ArrowLeft /> Back</Link>
          </Button>
        }
      />

      <Section>
        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr_1.2fr_auto] md:items-end">
          <Labeled label="Chalan date *">
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Labeled>
          <Labeled label="Chalan number">
            <Input
              value={chalan}
              placeholder="Optional — auto if empty"
              onChange={(e) => setChalan(e.target.value)}
            />
          </Labeled>
          <Labeled label="Store *">
            <NativeSelect
              value={location}
              onChange={(e) => {
                if (lines.length && !window.confirm("Changing store clears the lines already added.")) {
                  return;
                }
                setLoc(e.target.value);
                setLines([]);
                setBatchId("");
              }}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </NativeSelect>
          </Labeled>
          <Button type="button" variant="outline" onClick={resetForm}>
            <RotateCcw /> Reset
          </Button>
        </div>
      </Section>

      <section className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-xs">
            <thead>
              <tr className="bg-primary text-left font-medium text-primary-foreground">
                <th className="w-10 px-2 py-2">SL</th>
                <th className="min-w-40 px-1.5 py-2">Item *</th>
                <th className="w-16 px-1.5 py-2">UOM</th>
                <th className="min-w-28 px-1.5 py-2">Batch no. *</th>
                <th className="w-24 px-1.5 py-2">Expire date</th>
                <th className="w-16 px-1.5 py-2">Stock</th>
                <th className="w-28 px-1.5 py-2">Adjust type *</th>
                <th className="w-16 px-1.5 py-2">Qty *</th>
                <th className="min-w-28 px-1.5 py-2">Reason *</th>
                <th className="min-w-24 px-1.5 py-2">{reason === "Other" ? "Remarks *" : "Remarks"}</th>
                <th className="w-16 px-1.5 py-2" />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-1.5 text-muted-foreground">1</td>
                <td className="px-1.5 py-1.5">
                  <ProductSearch
                    products={active}
                    value={productId}
                    onChange={chooseProduct}
                    placeholder="Code or name"
                    aria-label="Item code or name"
                    className="h-8 text-xs"
                  />
                </td>
                <td className="px-1.5 py-1.5">
                  <Input readOnly value={picked?.uom ?? ""} placeholder="UOM" aria-label="UOM" className="h-8 bg-muted/40 px-2 text-xs" />
                </td>
                <td className="px-1.5 py-1.5">
                  <NativeSelect
                    aria-label="Batch number"
                    className="h-8 text-xs"
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value)}
                    disabled={!productId}
                  >
                    <option value="">{productId ? (batches.length ? "Select…" : "No batches") : "Select…"}</option>
                    {batches.map((row) => (
                      <option key={row.batch_id} value={row.batch_id!}>
                        {row.batch_no}
                      </option>
                    ))}
                  </NativeSelect>
                </td>
                <td className="px-1.5 py-1.5">
                  <Input readOnly type="text" value={batch?.expiry_date ? formatDate(batch.expiry_date) : ""} placeholder="Expiry" aria-label="Expire date" className="h-8 bg-muted/40 px-2 text-xs" />
                </td>
                <td className="px-1.5 py-1.5">
                  <Input readOnly value={batch ? String(batch.qty ?? 0) : ""} aria-label="Current stock" className="h-8 bg-muted/40 px-2 text-xs" />
                </td>
                <td className="px-1.5 py-1.5">
                  <NativeSelect aria-label="Adjust type" className="h-8 text-xs" value={dir} onChange={(e) => { setDir(e.target.value === "in" ? "in" : "out"); setBatchId(""); }}>
                    <option value="in">Increase</option>
                    <option value="out">Decrease</option>
                  </NativeSelect>
                </td>
                <td className="px-1.5 py-1.5">
                  <Input type="number" min={1} value={qty} placeholder="0" aria-label="Adjusted quantity" className="h-8 px-2 text-xs" onChange={(e) => setQty(e.target.value)} />
                </td>
                <td className="px-1.5 py-1.5">
                  <NativeSelect aria-label="Adjust reason" className="h-8 text-xs" value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="">Select</option>
                    {REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </NativeSelect>
                </td>
                <td className="px-1.5 py-1.5">
                  <Input value={remarks} placeholder="Remarks" aria-label="Remarks" className="h-8 px-2 text-xs" onChange={(e) => setRemarks(e.target.value)} />
                </td>
                <td className="px-1.5 py-1.5">
                  <div className="flex items-center gap-1">
                    <Button type="button" size="icon" aria-label="Add item" className="size-8" onClick={addLine}>
                      <Plus />
                    </Button>
                    <Button type="button" size="icon" variant="destructive" aria-label="Clear entry row" className="size-8" onClick={clearEntry}>
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <Section
        title="Adjusted Items"
        actions={
          <SearchField value={find} onChange={setFind} placeholder="Search records..." label="Search adjusted items" />
        }
        bodyClassName={lines.length ? "p-0" : ""}
      >
        {lines.length === 0 ? (
          <EmptyState title="No items added" description={'Select a product and click Add to add items.'} />
        ) : shown.length === 0 ? (
          <div className="p-5"><EmptyState title="No items match that search" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SL</TableHead>
                <TableHead>Batch no.</TableHead>
                <TableHead>Item code</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead>Item name</TableHead>
                <TableHead className="text-right">Adjusted qty</TableHead>
                <TableHead>Adjust type</TableHead>
                <TableHead>Expire date</TableHead>
                <TableHead className="w-14">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((line) => {
                const product = names.get(line.productId);
                const row = stock.find((item) => item.batch_id === line.batchId);
                const batchNo = line.batchNo || row?.batch_no;
                const expiry = line.expiry || row?.expiry_date;
                const sl = lines.findIndex((item) => item.key === line.key) + 1;
                return (
                  <TableRow key={line.key}>
                    <TableCell className="num">{sl}</TableCell>
                    <TableCell className="num text-xs">{batchNo || "—"}</TableCell>
                    <TableCell className="num text-xs">{product?.code}</TableCell>
                    <TableCell>{product?.uom || "—"}</TableCell>
                    <TableCell className="font-medium">{product?.name ?? "Product"}</TableCell>
                    <TableCell className="text-right"><Qty value={line.qty} /></TableCell>
                    <TableCell className="text-xs">{directionLabel(line.type)}</TableCell>
                    <TableCell className="text-xs">{formatDate(expiry)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        aria-label={`Remove ${product?.name ?? "item"}`}
                        className="size-8"
                        onClick={() => setLines((cur) => cur.filter((item) => item.key !== line.key))}
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

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (lines.length && !window.confirm("Leave without saving these lines?")) return;
            navigate({ to: "/inventory/adjust" });
          }}
        >
          Cancel
        </Button>
        <Button type="button" disabled={!lines.length || m.isPending || !location} onClick={() => m.mutate()}>
          {m.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

    </div>
  );
}
