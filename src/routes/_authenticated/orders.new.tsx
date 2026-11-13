import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ClipboardList, CloudOff, Info, Package, Pencil, Plus, Save, ShoppingCart, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { PageHeader, Money, Field, EmptyState, PageLoader } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { myAvailableStockQuery, opt, productsQuery, settingsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { checkDiscounts, computeOrderTotals } from "@/lib/pricing";
import { ProductSearch } from "@/components/app/product-search";
import { errorMessage } from "@/lib/format";
import { newId } from "@/lib/id";
import { useOffline } from "@/components/app/offline-provider";
import { classifyRpcError, queuedQtyByProduct } from "@/lib/offline/outbox";
import { ORDER_DRAFT_KEY as DRAFT_KEY, type OrderDraft as Draft } from "@/lib/offline/order-draft";

export const Route = createFileRoute("/_authenticated/orders/new")({
  validateSearch: (s: Record<string, unknown>): { chemist?: string; so?: string; edit?: string } => ({
    ...(typeof s["chemist"] === "string" ? { chemist: s["chemist"] } : {}),
    ...(typeof s["so"] === "string" ? { so: s["so"] } : {}),
    ...(typeof s["edit"] === "string" ? { edit: s["edit"] } : {}),
  }),
  head: () => ({ meta: [{ title: "New order — BIORY Corporation" }] }),
  component: NewOrder,
});

type LineRow = { key: string; productId: string; qty: string };

function blankRow(): LineRow {
  return { key: newId(), productId: "", qty: "" };
}

function rowsFromQty(saved: Record<string, number>): LineRow[] {
  const filled = Object.entries(saved)
    .filter(([, value]) => value > 0)
    .map(([id, value]) => ({ key: id, productId: id, qty: String(value) }));
  return filled.length > 0 ? [...filled, blankRow()] : [blankRow()];
}

type EditableOrder = {
  id: string;
  order_no: string;
  chemist_id: string;
  so_id: string;
  so_discount_pct: number | string | null;
  extra_discount_pct: number | string | null;
  remarks: string | null;
  status: string;
  delivery_status: string;
  stock_from: string | null;
  order_items: { product_id: string; qty: number; delivered_qty: number }[];
};

function NewOrder() {
  const s = useSession();
  const search = Route.useSearch();
  const editing = !!search.edit;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canBook = s.isSO || s.isSuper;
  const { data: existing, isLoading: orderLoading, isError: orderError } = useQuery({
    queryKey: ["order", "edit", search.edit],
    enabled: editing && canBook,
    queryFn: async () => {
      const { data, error } = await api
        .from("orders")
        .select("id, order_no, chemist_id, so_id, so_discount_pct, extra_discount_pct, remarks, status, delivery_status, stock_from, order_items(product_id, qty, delivered_qty)")
        .eq("id", search.edit!)
        .single();
      if (error) throw error;
      return data as EditableOrder;
    },
  });
  const { data: settings } = useQuery(settingsQuery);
  const { data: products = [] } = useQuery(productsQuery);
  const offline = useOffline();

  const { data: allChemists = [], isPending: chemistsPending, isError: chemistsError } = useQuery({
    queryKey: ["chemists", "order-form", s.userId],
    enabled: canBook,
    queryFn: async () => {
      const { data, error } = await api.from("chemists").select("*").eq("status", "active").order("business_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [chemist, setChemist] = useState(search.chemist ?? "");
  const chemists = allChemists;
  const selectedChemist = allChemists.find((c) => c.id === chemist);
  const bookingSo = editing ? (existing?.so_id ?? "") : s.userId;
  const fromCentral = editing ? existing?.stock_from === "central" : s.isSuper;
  const { data: stock = [] } = useQuery({
    ...myAvailableStockQuery,
    queryKey: ["my-available-stock", editing ? `edit-${existing?.stock_from ?? ""}-${existing?.so_id ?? ""}` : s.isSuper ? "central" : bookingSo || "none"],
    enabled: canBook && (editing ? !!existing : s.isSuper || !!bookingSo),
    queryFn: async () => {
      const call = fromCentral
        ? api.rpc("central_available_stock")
        : s.isSuper
          ? api.rpc("so_available_stock", { p_so: bookingSo })
          : api.rpc("my_available_stock");
      const { data, error } = await call;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [rows, setRows] = useState<LineRow[]>(() => [blankRow()]);
  const qty = useMemo(() => {
    const next: Record<string, number> = {};
    for (const row of rows) {
      const amount = Math.max(0, Math.floor(Number(row.qty) || 0));
      if (row.productId && amount > 0) next[row.productId] = (next[row.productId] ?? 0) + amount;
    }
    return next;
  }, [rows]);
  const [soPct, setSoPct] = useState("0");
  const [extraPct, setExtraPct] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [idemKey] = useState(() => newId());
  const [restored, setRestored] = useState(false);

  // Offline-friendly: keep a new order as a local draft. An edit loads the saved order and must not pick up that draft.
  useEffect(() => {
    if (editing) {
      setRestored(true);
      return;
    }
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Draft;
        if (!search.chemist || d.chemist === search.chemist) {
          setChemist(d.chemist || search.chemist || "");
          setRows(rowsFromQty(d.qty ?? {}));
          setSoPct(d.so ?? "0");
          setExtraPct(d.extra ?? "0");
          setRemarks(d.remarks ?? "");
          if (Object.values(d.qty ?? {}).some((v) => v > 0)) toast.info("Restored your unsaved order draft");
        }
      }
    } catch {
      /* ignore broken draft */
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!existing) return;
    setChemist(existing.chemist_id);
    const next: Record<string, number> = {};
    for (const item of existing.order_items) next[item.product_id] = item.qty;
    setRows(rowsFromQty(next));
    setSoPct(String(existing.so_discount_pct ?? 0));
    setExtraPct(String(existing.extra_discount_pct ?? 0));
    setRemarks(existing.remarks ?? "");
  }, [existing]);
  useEffect(() => {
    if (!restored || editing) return;
    const d: Draft = { chemist, qty, so: soPct, extra: extraPct, remarks };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  }, [restored, editing, chemist, qty, soPct, extraPct, remarks]);

  // Stock already promised to orders still waiting to sync on this device.
  const queuedQty = useMemo(() => queuedQtyByProduct(offline.queue), [offline.queue]);
  const ownQty = useMemo(() => {
    const held = new Map<string, number>();
    for (const item of existing?.order_items ?? []) held.set(item.product_id, Number(item.qty) || 0);
    return held;
  }, [existing]);
  const availMap = useMemo(() => {
    const next = new Map(stock.map((r) => [r.product_id, Math.max(0, r.available - (editing ? 0 : (queuedQty.get(r.product_id) ?? 0)))]));
    if (editing) {
      for (const [id, held] of ownQty) next.set(id, Math.max(0, (next.get(id) ?? 0) + held));
    }
    return next;
  }, [stock, queuedQty, editing, ownQty]);
  const saleable = products.filter((p) => p.active && p.kind === "saleable");
  const lines = saleable.flatMap((p) => ((qty[p.id] ?? 0) > 0 ? [{ product: p, qty: qty[p.id] ?? 0 }] : []));
  const so = Number(soPct) || 0;
  const extra = Number(extraPct) || 0;
  const totals = computeOrderTotals(lines.map((l) => ({ mrp: Number(l.product.mrp), base_trp: Number(l.product.base_trp), qty: l.qty })), so, extra);
  const policy = settings ?? { so_discount_max_pct: 5, extra_discount_max_pct: 20, extra_discount_so_limit_pct: 5 };
  const disc = checkDiscounts(so, extra, policy);
  const overStock = lines.filter((l) => l.qty > (availMap.get(l.product.id) ?? 0));
  const saveBlock = !chemist
    ? "Choose a chemist before saving."
    : lines.length === 0
        ? "Select a product and enter a quantity."
        : overStock.length > 0
          ? "A quantity is higher than the stock on hand."
          : "";

  const queueOffline = (why: "offline" | "dropped") => {
    offline.queueOrder({
      id: idemKey,
      chemistId: chemist,
      chemistName: selectedChemist?.business_name ?? "Chemist",
      items: lines.map((l) => ({ product_id: l.product.id, qty: l.qty, name: l.product.name, mrp: Number(l.product.mrp), base_trp: Number(l.product.base_trp) })),
      soPct: so,
      extraPct: extra,
      remarks,
      netEstimate: totals.net,
    });
    localStorage.removeItem(DRAFT_KEY);
    toast.success(why === "offline" ? "Saved on this device — it will sync automatically when you're back online" : "Connection dropped — order saved on this device and will sync automatically");
    navigate({ to: "/orders" });
  };

  const save = useMutation({
    // Run even when offline — the handler itself decides to queue the order on the device.
    networkMode: "always",
    mutationFn: async () => {
      const items = lines.map((l) => ({ product_id: l.product.id, qty: l.qty }));
      if (editing) {
        if (!navigator.onLine) throw new Error("A connection is required to edit an order");
        const { data, error } = await api.rpc("update_order", {
          p_id: search.edit,
          p_chemist: chemist,
          p_items: items,
          p_so_discount_pct: so,
          p_extra_discount_pct: extra,
          p_remarks: opt(remarks),
        });
        if (error) throw error;
        return { queued: false as const, id: data as string };
      }
      if (!navigator.onLine) {
        if (s.isSuper) throw new Error("A connection is required when a Super Admin books an order");
        return { queued: true as const };
      }
      const { data, error, status } = await api.rpc("create_order", {
        p_chemist: chemist,
        p_items: items,
        p_so_discount_pct: so,
        p_extra_discount_pct: extra,
        p_remarks: opt(remarks),
        p_idempotency_key: idemKey,
      });
      if (error) {
        // No definitive answer from the server: keep it on the device (same idempotency key, so no duplicate).
        if (classifyRpcError({ error, status }) === "retry") return { queued: true as const };
        throw error;
      }
      return { queued: false as const, id: data as string };
    },
    onSuccess: (r) => {
      if (r.queued) return queueOffline(navigator.onLine ? "dropped" : "offline");
      const id = r.id;
      if (!editing) localStorage.removeItem(DRAFT_KEY);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["my-available-stock"] });
      toast.success(editing ? "Order updated" : "Order confirmed");
      navigate({ to: "/orders" });
    },
    onError: (e) => {
      if (!editing && e instanceof TypeError) return queueOffline("dropped");
      toast.error(errorMessage(e));
    },
  });

  if (!canBook) return <PageHeader title={editing ? "Edit order" : "New order"} description="Only a Sales Officer or Super Admin can book or edit orders." />;
  if (editing && orderLoading) return <PageLoader />;
  if (editing && (orderError || !existing)) {
    return <PageHeader title="Edit order" description="This order could not be opened." />;
  }
  const locked = !!existing && (existing.delivery_status !== "NOT_DELIVERED" || !["PENDING_APPROVAL", "CONFIRMED"].includes(existing.status) || existing.order_items.some((item) => item.delivered_qty > 0));
  if (locked && existing) {
    return (
      <div>
        <PageHeader eyebrow={<Link to="/orders/$id" params={{ id: existing.id }} className="hover:underline">{existing.order_no}</Link>} title="Edit order" />
        <EmptyState title="This order can no longer be edited" description="Delivery has already started, so the booked lines stay as they are." />
      </div>
    );
  }

  const title = editing ? "Edit Order" : "New Order";
  const subtitle = editing
    ? "Change the chemist shop, quantities, or discounts before delivery. Prices are recalculated when you save."
    : s.isSuper
      ? "Pick the chemist shop. The order uses company stock and is confirmed immediately."
      : "Prices come from the product master and are locked into the order when you save.";

  return (
    <div className="pb-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#0d5c4a] text-white shadow-sm">
          <ShoppingCart className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link to="/orders" className="hover:text-foreground">Orders</Link>
            <span>/</span>
            <span className="font-medium text-foreground">{title}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {!editing && !offline.online && !s.isSuper && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          <CloudOff className="mt-0.5 size-4 shrink-0" />
          <span>
            You're offline. You can still book this order — it's kept on this device and sent automatically when the connection returns. Stock and
            prices shown are from your last sync; the server re-checks them when the order arrives.
          </span>
        </div>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
        <div className="flex flex-col gap-5">
          <section className="surface-card">
            <CardHead icon={<Store className="size-4" />} title="Chemist Shop" />
            <div className="p-4 sm:p-5">
              <Field label="Choose chemist shop">
                {chemistsPending ? (
                  <p className="text-sm text-muted-foreground">Loading chemist shops…</p>
                ) : chemistsError ? (
                  <EmptyState title="Chemist shops could not be loaded" description="Refresh the page and try again." />
                ) : chemists.length === 0 && !offline.online ? (
                  <EmptyState title="Your chemist list isn't on this device yet" description="Connect to the internet once so the app can download your chemists and products." />
                ) : chemists.length === 0 ? (
                  <EmptyState title="No chemist shops to choose" action={<Button asChild size="sm"><Link to="/chemists">Add a chemist</Link></Button>} />
                ) : (
                  <ChemistPicker chemists={chemists} value={chemist} onChange={setChemist} />
                )}
              </Field>
            </div>
          </section>

          <section className="surface-card overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
              <span className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-primary"><Package className="size-4" /></span>
                <h2 className="text-sm font-semibold">Products</h2>
              </span>
              <Button type="button" size="icon" variant="outline" className="size-9" aria-label="Add product" onClick={() => setRows((list) => [...list, blankRow()])}>
                <Plus />
              </Button>
            </header>
            <div>
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col />
                  <col className="w-14" />
                  <col className="w-16" />
                  <col className="w-16" />
                  <col className="w-[5.75rem]" />
                  <col className="w-14" />
                  <col className="w-9" />
                </colgroup>
                <thead>
                  <tr className="bg-[#0d5c4a] text-left text-[11px] font-semibold uppercase tracking-normal text-white">
                    <th className="px-3 py-2.5 font-semibold">Product</th>
                    <th className="px-1 py-2.5 text-center font-semibold">Stock</th>
                    <th className="px-1 py-2.5 text-center font-semibold">MRP</th>
                    <th className="px-1 py-2.5 text-center font-semibold">TRP</th>
                    <th className="px-1 py-2.5 text-center font-semibold">Pack</th>
                    <th className="px-1 py-2.5 text-center font-semibold">Qty</th>
                    <th className="py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const product = saleable.find((item) => item.id === row.productId);
                    const available = product ? (availMap.get(product.id) ?? 0) : 0;
                    const amount = Math.max(0, Math.floor(Number(row.qty) || 0));
                    const over = !!product && amount > available;
                    const taken = new Set(rows.filter((other) => other.key !== row.key && other.productId).map((other) => other.productId));
                    const choices = saleable.filter((item) => item.id === row.productId || !taken.has(item.id));
                    const readOnlyField = "h-9 min-w-0 bg-muted/40 px-1.5 text-center";
                    return (
                      <tr key={row.key} className="border-b border-border/70">
                        <td className="min-w-0 px-2 py-2">
                          <ProductSearch
                            products={choices}
                            value={row.productId}
                            placeholder="Select product"
                            aria-label="Product"
                            className="w-full min-w-0 truncate"
                            onChange={(id) => setRows((list) => list.map((item) => item.key === row.key ? { ...item, productId: id, qty: item.qty === "" ? "1" : item.qty } : item))}
                          />
                        </td>
                        <td className="px-1 py-2"><Input readOnly tabIndex={-1} value={product ? String(available) : ""} placeholder="—" aria-label="Stock" title={product ? String(available) : undefined} className={readOnlyField} /></td>
                        <td className="px-1 py-2"><Input readOnly tabIndex={-1} value={product ? String(product.mrp) : ""} placeholder="—" aria-label="MRP" className={readOnlyField} /></td>
                        <td className="px-1 py-2"><Input readOnly tabIndex={-1} value={product ? String(product.base_trp) : ""} placeholder="—" aria-label="TRP" className={readOnlyField} /></td>
                        <td className="px-1 py-2"><Input readOnly tabIndex={-1} value={product?.pack_size ?? ""} placeholder="—" aria-label="Pack size" title={product?.pack_size || undefined} className={`${readOnlyField} text-xs`} /></td>
                        <td className="px-1 py-2">
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            disabled={!product}
                            value={row.qty}
                            placeholder="0"
                            aria-label="Quantity"
                            className={`num h-9 min-w-0 px-1 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${over ? "border-destructive" : ""}`}
                            onChange={(e) => setRows((list) => list.map((item) => item.key === row.key ? { ...item, qty: e.target.value } : item))}
                          />
                          {over && <div className="mt-1 text-center text-[11px] font-semibold text-destructive">Max {available}</div>}
                        </td>
                        <td className="py-2 pr-1 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Remove product"
                            onClick={() => setRows((list) => (list.length === 1 ? [blankRow()] : list.filter((item) => item.key !== row.key)))}
                          >
                            <Trash2 />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="xl:sticky xl:top-20">
          <section className="surface-card">
            <CardHead icon={<ClipboardList className="size-4" />} title="Summary" />
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              <dl className="flex flex-col gap-2 text-sm">
                <Row label="Total MRP" value={<Money value={totals.totalMrp} />} />
                <Row label="Standard trade discount" value={<Money value={-totals.standardDiscount} />} muted />
                <Row label="Base TRP" value={<Money value={totals.totalTrp} />} />
              </dl>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`SO discount (0–${policy.so_discount_max_pct}%)`}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    <Input type="number" step="0.5" min={0} max={policy.so_discount_max_pct} value={soPct} onChange={(e) => setSoPct(e.target.value)} className="h-10 pl-8" />
                  </div>
                </Field>
                <Field label={`Extra discount (0–${policy.extra_discount_max_pct}%)`}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    <Input type="number" step="0.5" min={0} max={policy.extra_discount_max_pct} value={extraPct} onChange={(e) => setExtraPct(e.target.value)} className="h-10 pl-8" />
                  </div>
                </Field>
              </div>
              <dl className="flex flex-col gap-2 text-sm">
                <Row label="SO discount" value={<Money value={-totals.soAmt} />} muted />
                <Row label="Extra discount" value={<Money value={-totals.extraAmt} />} muted />
              </dl>
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-3">
                <span className="font-semibold">Net payable</span>
                <Money value={totals.net} className="text-xl font-semibold text-[#0d5c4a]" />
              </div>
              {disc.errors.map((e) => (
                <p key={e} className="rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive">{e}</p>
              ))}
              <Field label="Remarks">
                <div className="relative">
                  <Pencil className="pointer-events-none absolute left-3 top-3 size-3.5 text-muted-foreground" />
                  <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Enter remarks (optional)..." className="min-h-20 pl-9" />
                </div>
              </Field>
              <Button
                type="button"
                className="h-11 w-full bg-[#0d5c4a] text-white hover:bg-[#0a4a3b]"
                size="lg"
                disabled={!!saveBlock || disc.errors.length > 0 || save.isPending}
                onClick={() => save.mutate()}
              >
                {editing || s.isSuper || offline.online ? <Save /> : <CloudOff />}
                {save.isPending ? "Saving…" : editing ? "Save changes" : s.isSuper || offline.online ? "Save Order" : "Save offline"}
              </Button>
              {saveBlock && !save.isPending && (
                <p className="text-center text-xs font-medium text-destructive">{saveBlock}</p>
              )}
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <Info className="size-3.5 shrink-0" />
                {editing
                  ? "The order number stays the same. Saving is only possible before delivery."
                  : s.isSuper || offline.online
                    ? "The order is confirmed as soon as you save it."
                    : "Will sync automatically when you're back online."}
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

type Shop = { id: string; business_name: string; code?: string | null; owner_name?: string | null; district?: string | null; upazila?: string | null };

function ChemistPicker({ chemists, value, onChange }: { chemists: Shop[]; value: string; onChange: (id: string) => void }) {
  const navigate = useNavigate();
  const selected = chemists.find((c) => c.id === value);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const matches = chemists.filter((c) => {
    if (!editing || !q) return true;
    const hay = `${c.business_name} ${c.code ?? ""} ${c.owner_name ?? ""} ${c.district ?? ""} ${c.upazila ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });
  const typed = editing ? q.trim() : "";
  const canAdd = typed.length > 0 && !chemists.some((c) => c.business_name.trim().toLowerCase() === typed.toLowerCase());
  const addShop = () => navigate({ to: "/chemists", search: { name: typed } });

  const place = () => {
    const el = root.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    setBox({
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - rect.width - 8),
      width: rect.width,
      maxH: Math.max(140, Math.min(280, below - 16)),
    });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onPointer = (event: PointerEvent) => {
      if (performance.now() - openedAt.current < 250) return;
      const target = event.target as Node;
      if (root.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
      setEditing(false);
      setQ("");
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={root} className="relative w-full">
      <Store className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Choose chemist shop…"
        value={editing ? q : (selected?.business_name ?? "")}
        onChange={(e) => {
          setEditing(true);
          setQ(e.target.value);
          setOpen(true);
        }}
        onPointerDown={() => {
          openedAt.current = performance.now();
          setOpen(true);
        }}
        onFocus={(e) => {
          openedAt.current = performance.now();
          setEditing(false);
          setQ("");
          setOpen(true);
          e.currentTarget.select();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setEditing(false);
            setQ("");
          }
          if (e.key === "Enter" && matches[0]) {
            e.preventDefault();
            onChange(matches[0].id);
            setQ("");
            setEditing(false);
            setOpen(false);
          } else if (e.key === "Enter" && canAdd) {
            e.preventDefault();
            addShop();
          }
        }}
        className="h-10 pl-9 pr-9"
        aria-label="Choose chemist shop"
        role="combobox"
        aria-expanded={open}
      />
      <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground ${open ? "rotate-180 text-primary" : ""}`} />
      {open && box && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menu}
              role="listbox"
              className="pointer-events-auto fixed z-[60] overflow-y-auto rounded-xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-[0_18px_40px_-18px_color-mix(in_oklab,var(--primary)_45%,transparent),0_2px_8px_-2px_color-mix(in_oklab,var(--foreground)_12%,transparent)]"
              style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxH }}
            >
              {canAdd && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={addShop}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-primary hover:bg-primary-soft"
                >
                  <Plus className="size-4 shrink-0" />
                  Add “{typed}”
                </button>
              )}
              {matches.length === 0 && !canAdd ? (
                <p className="px-2.5 py-2 text-sm text-muted-foreground">No chemist shops match that search.</p>
              ) : matches.length === 0 ? null : (
                matches.map((c) => {
                  const placeName = [c.upazila, c.district].filter(Boolean).join(", ");
                  const on = c.id === value;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange(c.id);
                        setQ("");
                        setEditing(false);
                        setOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm ${on ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-primary-soft"}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate">{c.business_name}</span>
                        <span className={`block truncate text-[11px] uppercase tracking-wide ${on ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          {[c.code, placeName].filter(Boolean).join(" · ") || "Chemist shop"}
                        </span>
                      </span>
                      {on ? <Check className="size-3.5 shrink-0" /> : null}
                    </button>
                  );
                })
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function CardHead({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <header className="flex items-center gap-2 border-b px-4 py-3 sm:px-5">
      <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-primary">{icon}</span>
      <h2 className="text-sm font-semibold">{title}</h2>
    </header>
  );
}

function Row({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={muted ? "text-muted-foreground" : ""}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
