import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { EmptyState, PageHeader, Qty, Section } from "@/components/app/page";
import { Labeled, ProductSearch } from "@/components/app/product-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchField } from "@/components/app/list-toolbar";
import { opt, productsQuery, locationsQuery, salesOfficersQuery } from "@/lib/queries";
import { NativeSelect } from "@/components/app/select-native";
import { useSession } from "@/lib/session";
import { errorMessage, todayBD } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/requisitions/new")({
  validateSearch: (s: Record<string, unknown>): { edit?: string } =>
    typeof s["edit"] === "string" ? { edit: s["edit"] } : {},
  head: () => ({ meta: [{ title: "New requisition — BIORY Corporation" }] }),
  component: NewRequisition,
});

type Line = { productId: string; qty: number };
type Template = { id: string; name: string; lines: Line[] };

const DATE_PREFIX = /^Entry date: (\d{4}-\d{2}-\d{2})\n?/;

function templateKey(userId: string) {
  return `biory.requisition-templates.${userId}`;
}

function readTemplates(userId: string): Template[] {
  try {
    const raw = JSON.parse(localStorage.getItem(templateKey(userId)) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((row) => row && typeof row.name === "string" && Array.isArray(row.lines));
  } catch {
    return [];
  }
}

function NewRequisition() {
  const s = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { edit } = Route.useSearch();
  const canAssign = s.isSuper || s.isAdmin || s.isWarehouse;
  const { data: products = [] } = useQuery(productsQuery);
  const { data: officers = [] } = useQuery({ ...salesOfficersQuery, enabled: canAssign });
  const { data: locations = [], isFetched: locationsFetched } = useQuery(locationsQuery);
  const centrals = locations.filter((l) => l.kind === "central");
  const stores = locations.filter((l) => l.kind === "so" && l.so_id);
  const mine = stores.find((store) => store.so_id === s.userId);
  const [date, setDate] = useState(todayBD());
  const [requestStore, setRequestStore] = useState("");
  const [fulfillStore, setFulfillStore] = useState("");
  const [soId, setSoId] = useState(canAssign ? "" : s.userId);
  const [lines, setLines] = useState<Line[]>([]);
  const [remarks, setRemarks] = useState("");
  const [ready, setReady] = useState(!edit);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [find, setFind] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const { data: storeStock = [] } = useQuery({
    queryKey: ["store-available", fulfillStore],
    enabled: !!fulfillStore,
    queryFn: async () => {
      const { data, error } = await api.from("v_stock").select("product_id, qty, days_to_expiry").eq("location_id", fulfillStore);
      if (error) throw error;
      return data;
    },
  });
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ["requisition", edit],
    enabled: !!edit,
    queryFn: async () => {
      const { data, error } = await api
        .from("requisitions")
        .select("id, status, remarks, so_id, requisition_items(product_id, requested_qty)")
        .eq("id", edit!)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const stock = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of storeStock) {
      if ((row.days_to_expiry ?? 1) <= 0) continue;
      m.set(row.product_id!, (m.get(row.product_id!) ?? 0) + (row.qty ?? 0));
    }
    return m;
  }, [storeStock]);

  useEffect(() => {
    if (!fulfillStore && centrals[0]) setFulfillStore(centrals[0].id);
  }, [fulfillStore, centrals]);
  useEffect(() => {
    if (canAssign || requestStore || !mine) return;
    setRequestStore(mine.id);
    setSoId(s.userId);
  }, [canAssign, s.userId, requestStore, mine]);
  useEffect(() => {
    setTemplates(readTemplates(s.userId));
  }, [s.userId]);
  useEffect(() => {
    if (!existing || ready || !locationsFetched) return;
    const note = existing.remarks ?? "";
    const dated = note.match(DATE_PREFIX);
    setDate(dated?.[1] ?? todayBD());
    setRemarks(dated ? note.replace(DATE_PREFIX, "") : note);
    setSoId(existing.so_id);
    const loc = locations.find((store) => store.kind === "so" && store.so_id === existing.so_id);
    if (loc) setRequestStore(loc.id);
    setLines(existing.requisition_items.map((item) => ({ productId: item.product_id, qty: item.requested_qty })));
    setReady(true);
  }, [existing, ready, locationsFetched, locations]);

  const locked = !!existing && existing.status !== "SUBMITTED" && existing.status !== "DRAFT";
  const active = products.filter((p) => p.active);
  const names = new Map(products.map((p) => [p.id, p]));
  const picked = names.get(productId);
  const shown = lines.filter((line) => {
    if (!find.trim()) return true;
    const product = names.get(line.productId);
    return `${product?.name ?? ""} ${product?.code ?? ""}`.toLowerCase().includes(find.trim().toLowerCase());
  });

  function chooseProduct(id: string) {
    setProductId(id);
  }

  function addLine() {
    const n = Math.floor(Number(qty));
    const id = productId;
    if (!id) {
      toast.error("Choose a product");
      return;
    }
    if (!(n > 0)) {
      toast.error("Enter a requisition quantity");
      return;
    }
    setLines((cur) => {
      const existingLine = cur.find((line) => line.productId === id);
      if (existingLine) return cur.map((line) => line.productId === id ? { ...line, qty: n } : line);
      return [...cur, { productId: id, qty: n }];
    });
    setProductId("");
    setQty("");
  }

  function resetForm() {
    if (lines.length && !window.confirm("Clear this requisition and start again?")) return;
    setDate(todayBD());
    setFulfillStore(centrals[0]?.id ?? "");
    setRemarks("");
    setLines([]);
    setProductId("");
    setQty("");
    setFind("");
    if (canAssign) {
      setRequestStore("");
      setSoId("");
    } else if (mine) {
      setRequestStore(mine.id);
      setSoId(s.userId);
    }
  }

  function storeTemplates(next: Template[]) {
    setTemplates(next);
    localStorage.setItem(templateKey(s.userId), JSON.stringify(next));
  }

  function applyTemplate(template: Template) {
    const known = template.lines.filter((line) => names.has(line.productId) && line.qty > 0);
    if (!known.length) {
      toast.error("That template has no products that are still on file");
      return;
    }
    setLines(known);
    setPickerOpen(false);
    toast.success(`Loaded “${template.name}”`);
  }

  function saveTemplate() {
    const name = templateName.trim();
    if (!name) return;
    const kept = lines.filter((line) => line.qty > 0);
    const next = templates.filter((row) => row.name.toLowerCase() !== name.toLowerCase());
    next.push({ id: crypto.randomUUID(), name, lines: kept });
    storeTemplates(next);
    setTemplateName("");
    setSaveOpen(false);
    toast.success("Template saved on this device");
  }

  const m = useMutation({
    mutationFn: async (submit: boolean) => {
      const store = stores.find((row) => row.id === requestStore);
      const p_so = canAssign ? (store?.so_id ?? null) : soId;
      const note = remarks.trim();
      const stamped = date !== todayBD() ? `Entry date: ${date}${note ? `\n${note}` : ""}` : note;
      const p_items = lines.filter((line) => line.qty > 0).map((line) => ({ product_id: line.productId, qty: line.qty }));
      const { data, error } = await api.rpc("save_requisition", {
        p_id: edit ?? null,
        p_so,
        p_items,
        p_remarks: opt(stamped),
        p_submit: submit,
        p_approve: false,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, submit) => {
      toast.success(submit ? "Requisition submitted" : "Requisition saved");
      void qc.invalidateQueries({ queryKey: ["requisitions"] });
      navigate({ to: "/requisitions" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!s.isSO && !canAssign) {
    return <PageHeader title="New requisition" description="Only Sales Officers and warehouse staff can raise requisitions." />;
  }
  if (edit && loadingExisting) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (locked) {
    return (
      <PageHeader
        title="Requisition locked"
        description="This requisition can no longer be edited. Edit and delete stop once it is approved, rejected, or issued."
      />
    );
  }

  const requestingLocked = !canAssign || (!!edit && existing?.status === "SUBMITTED");
  const officerName = new Map(officers.map((officer) => [officer.id, officer.full_name]));
  const officerCode = new Map(officers.map((officer) => [officer.id, officer.so_code]));
  const readyToSave = lines.some((line) => line.qty > 0) && !!soId && !!requestStore && !!fulfillStore && !m.isPending;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={edit ? "Edit requisition" : "Requisition entry"}
        description="Super Admin, Admin, and warehouse can raise this for any Sales Officer. Added lines stay on this page until you save."
      />

      <Section title="Requisition Details">
        <div className="grid items-end gap-2 max-sm:grid-cols-1 sm:grid-cols-[9.25rem_minmax(11.5rem,1fr)_minmax(11rem,0.9fr)_minmax(8rem,1.2fr)]">
          <Labeled label="Date *">
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="min-w-0" />
          </Labeled>
          <Labeled label="Req from *">
            <NativeSelect
              value={requestStore}
              disabled={requestingLocked}
              onChange={(e) => {
                const id = e.target.value;
                setRequestStore(id);
                const store = stores.find((row) => row.id === id);
                setSoId(store?.so_id ?? "");
              }}
            >
              <option value="">{canAssign ? "Select Sales Officer" : "Select location"}</option>
              {stores.map((store) => {
                const name = (store.so_id && officerName.get(store.so_id)) || store.name;
                const code = store.so_id ? officerCode.get(store.so_id) : null;
                return <option key={store.id} value={store.id}>{code ? `${name} (${code})` : name}</option>;
              })}
            </NativeSelect>
          </Labeled>
          <Labeled label="Req to *">
            <NativeSelect value={fulfillStore} onChange={(e) => setFulfillStore(e.target.value)}>
              <option value="">Select location</option>
              {centrals.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </NativeSelect>
          </Labeled>
          <Labeled label="Note (optional)">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Note for the warehouse" />
          </Labeled>
        </div>
        {requestStore && !soId && (
          <p className="mt-3 text-xs text-destructive">That store has no Sales Officer, so a requisition cannot be raised for it.</p>
        )}
      </Section>

      <Section
        title="Add Items"
        actions={
          <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
            <FileText /> Template
          </Button>
        }
      >
        <form
          className="grid gap-3 md:grid-cols-[1.6fr_0.7fr_0.7fr_0.5fr_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            addLine();
          }}
        >
          <Labeled label="Item *">
            <ProductSearch
              products={active}
              value={productId}
              onChange={chooseProduct}
              placeholder="Code or name"
              aria-label="Item code or name"
            />
          </Labeled>
          <Labeled label="Current stock">
            <Input readOnly value={picked ? String(stock.get(productId) ?? 0) : ""} className="bg-muted/40" />
          </Labeled>
          <Labeled label="Requisition qty *">
            <Input
              type="number"
              min={1}
              placeholder="Qty"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Labeled>
          <Labeled label="UOM">
            <Input readOnly value={picked?.uom ?? ""} placeholder="UOM" className="bg-muted/40" />
          </Labeled>
          <Button type="submit" className="md:mb-0">
            <Plus /> Add
          </Button>
        </form>
      </Section>

      <Section
        title="Requisition Items"
        actions={
          <div className="flex items-center gap-2">
            <SearchField value={find} onChange={setFind} placeholder="Search by item name..." label="Search requisition items" />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!lines.length) return;
                if (window.confirm("Remove every item from this requisition?")) setLines([]);
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
                <TableHead className="w-12">SL</TableHead>
                <TableHead>Item code</TableHead>
                <TableHead>Item name</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead className="text-right">Current stock</TableHead>
                <TableHead className="text-right">Requisition qty</TableHead>
                <TableHead className="w-14" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((line) => {
                const product = names.get(line.productId);
                const sl = lines.findIndex((row) => row.productId === line.productId) + 1;
                return (
                  <TableRow key={line.productId}>
                    <TableCell className="num">{sl}</TableCell>
                    <TableCell className="num text-xs">{product?.code}</TableCell>
                    <TableCell className="font-medium">{product?.name ?? "Product"}</TableCell>
                    <TableCell>{product?.uom || "—"}</TableCell>
                    <TableCell className="text-right"><Qty value={stock.get(line.productId) ?? 0} /></TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={1}
                        className="num ml-auto w-24 text-center"
                        value={line.qty || ""}
                        onChange={(e) => {
                          const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                          setLines((cur) => cur.map((row) => row.productId === line.productId ? { ...row, qty: n } : row));
                        }}
                        aria-label={`Quantity for ${product?.name ?? "product"}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${product?.name ?? "product"}`}
                        className="size-8"
                        onClick={() => setLines((cur) => cur.filter((row) => row.productId !== line.productId))}
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={resetForm}>
          <RotateCcw /> Reset
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!lines.some((line) => line.qty > 0)}
          onClick={() => {
            setTemplateName("");
            setSaveOpen(true);
          }}
        >
          <FileText /> Save as Template
        </Button>
        <Button type="button" variant="outline" disabled={!readyToSave} onClick={() => m.mutate(false)}>
          {m.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" disabled={!readyToSave} onClick={() => m.mutate(true)}>
          {m.isPending ? "Saving…" : "Submit"}
        </Button>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Templates</DialogTitle>
          </DialogHeader>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates saved on this device yet. Add items, then use Save as Template.</p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {templates.map((template) => (
                <li key={template.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-primary-soft"
                    onClick={() => applyTemplate(template)}
                  >
                    <span className="truncate font-medium">{template.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{template.lines.length} items</span>
                  </button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete template ${template.name}`}
                    className="size-8"
                    onClick={() => storeTemplates(templates.filter((row) => row.id !== template.id))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
          </DialogHeader>
          <Labeled label="Template name">
            <Input
              autoFocus
              value={templateName}
              placeholder="e.g. Weekly store request"
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveTemplate();
                }
              }}
            />
          </Labeled>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button type="button" disabled={!templateName.trim()} onClick={saveTemplate}>Save template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
