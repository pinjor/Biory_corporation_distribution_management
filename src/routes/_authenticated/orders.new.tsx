import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ClipboardList, CloudOff, Info, Minus, Package, Pencil, Plus, Save, Search, ShoppingCart, Store } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { PageHeader, Money, Qty, Field, EmptyState, PageLoader } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { myAvailableStockQuery, opt, productsQuery, settingsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { checkDiscounts, computeOrderTotals } from "@/lib/pricing";
import { errorMessage } from "@/lib/format";
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
    queryKey: ["chemists", "order-form", s.isSuper ? "all" : s.userId],
    enabled: canBook,
    queryFn: async () => {
      let q = api.from("chemists").select("*").eq("status", "active").order("business_name");
      if (!s.isSuper) q = q.eq("assigned_so", s.userId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const [chemist, setChemist] = useState(search.chemist ?? "");
  const chemists = allChemists;
  const selectedChemist = allChemists.find((c) => c.id === chemist);
  const bookingSo = editing ? (existing?.so_id ?? "") : s.isSuper ? (selectedChemist?.assigned_so ?? "") : s.userId;
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

  const [qty, setQty] = useState<Record<string, number>>({});
  const [soPct, setSoPct] = useState("0");
  const [extraPct, setExtraPct] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [idemKey] = useState(() => crypto.randomUUID());
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
          setQty(d.qty ?? {});
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
    setQty(next);
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
  const lines = saleable.filter((p) => (qty[p.id] ?? 0) > 0).map((p) => ({ product: p, qty: qty[p.id] ?? 0 }));
  const chosenIds = useMemo(() => new Set(lines.map((l) => l.product.id)), [lines]);
  const so = Number(soPct) || 0;
  const extra = Number(extraPct) || 0;
  const totals = computeOrderTotals(lines.map((l) => ({ mrp: Number(l.product.mrp), base_trp: Number(l.product.base_trp), qty: l.qty })), so, extra);
  const policy = settings ?? { so_discount_max_pct: 5, extra_discount_max_pct: 20, extra_discount_so_limit_pct: 5 };
  const disc = checkDiscounts(so, extra, policy);
  const overStock = lines.filter((l) => l.qty > (availMap.get(l.product.id) ?? 0));

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
        ...(s.isSuper ? { p_so: bookingSo } : {}),
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

  const setLine = (id: string, v: number) => setQty((x) => ({ ...x, [id]: Math.max(0, Math.floor(v)) }));
  const addProduct = (id: string) => setQty((x) => ({ ...x, [id]: (x[id] ?? 0) > 0 ? x[id] : 1 }));
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
              <ProductPicker products={saleable} chosen={chosenIds} onPick={addProduct} />
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-[#0d5c4a] text-left text-[11px] font-semibold uppercase tracking-wide text-white">
                    <th className="px-4 py-2.5 font-semibold">Product</th>
                    <th className="px-3 py-2.5 font-semibold">Stock</th>
                    <th className="px-3 py-2.5 font-semibold">MRP</th>
                    <th className="px-3 py-2.5 font-semibold">TRP</th>
                    <th className="px-3 py-2.5 font-semibold">Pack size</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => {
                    const p = line.product;
                    const v = line.qty;
                    const a = availMap.get(p.id) ?? 0;
                    const over = v > a;
                    return (
                      <tr key={p.id} className="border-b border-border/70 bg-primary-soft/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <ProductMark name={p.name} index={index} />
                            <div className="min-w-0">
                              <div className="font-semibold">{p.name}</div>
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{p.code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${a > 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
                            <Qty value={a} />
                          </span>
                        </td>
                        <td className="num px-3 py-3"><Money value={p.mrp} /></td>
                        <td className="num px-3 py-3 font-semibold text-emerald-700"><Money value={p.base_trp} /></td>
                        <td className="px-3 py-3 text-muted-foreground">{p.pack_size || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <div className={`inline-flex items-center rounded-lg border bg-card ${over ? "border-destructive" : "border-input"}`}>
                              <button type="button" className="grid size-8 place-items-center text-muted-foreground hover:text-foreground" onClick={() => setLine(p.id, v - 1)} aria-label={`Less ${p.name}`}>
                                <Minus className="size-3.5" />
                              </button>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                aria-label={`${p.name} quantity`}
                                className="num w-8 border-0 bg-transparent text-center text-sm outline-none"
                                value={v}
                                onChange={(e) => setLine(p.id, Number(e.target.value) || 0)}
                              />
                              <button type="button" className="grid size-8 place-items-center text-muted-foreground hover:text-foreground" onClick={() => setLine(p.id, v + 1)} aria-label={`More ${p.name}`}>
                                <Plus className="size-3.5" />
                              </button>
                            </div>
                          </div>
                          {over && <div className="mt-1 text-right text-[11px] font-semibold text-destructive">Available {a}</div>}
                        </td>
                      </tr>
                    );
                  })}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Search and select a product to add it here.</td>
                    </tr>
                  )}
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
                className="h-11 w-full bg-[#0d5c4a] text-white hover:bg-[#0a4a3b] disabled:opacity-100"
                size="lg"
                disabled={!chemist || !bookingSo || lines.length === 0 || disc.errors.length > 0 || overStock.length > 0 || save.isPending}
                onClick={() => save.mutate()}
              >
                {editing || s.isSuper || offline.online ? <Save /> : <CloudOff />}
                {save.isPending ? "Saving…" : editing ? "Save changes" : s.isSuper || offline.online ? "Save Order" : "Save offline"}
              </Button>
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

type PickerProduct = { id: string; name: string; code: string; generic_name?: string | null; pack_size?: string | null };

function ProductPicker({ products, chosen, onPick }: { products: PickerProduct[]; chosen: Set<string>; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const matches = products.filter((p) => !q || `${p.name} ${p.code} ${p.generic_name ?? ""} ${p.pack_size ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  const place = () => {
    const el = root.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    setBox({
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - Math.max(rect.width, 260) - 8),
      width: Math.max(rect.width, 260),
      maxH: Math.max(140, Math.min(280, below - 16)),
    });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (root.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
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

  const pick = (id: string) => {
    onPick(id);
    setQ("");
    setOpen(false);
  };

  return (
    <div ref={root} className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search products..."
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && matches[0]) {
            e.preventDefault();
            pick(matches[0].id);
          }
        }}
        className="h-9 pl-9"
        aria-label="Search products"
        role="combobox"
        aria-expanded={open}
      />
      {open && box && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menu}
              role="listbox"
              className="fixed z-[60] overflow-y-auto rounded-xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-[0_18px_40px_-18px_color-mix(in_oklab,var(--primary)_45%,transparent),0_2px_8px_-2px_color-mix(in_oklab,var(--foreground)_12%,transparent)]"
              style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxH }}
            >
              {matches.length === 0 ? (
                <p className="px-2.5 py-2 text-sm text-muted-foreground">No products match that search.</p>
              ) : (
                matches.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={chosen.has(p.id)}
                    onClick={() => pick(p.id)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-primary-soft"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                        {p.code}
                        {p.pack_size ? ` · ${p.pack_size}` : ""}
                      </span>
                    </span>
                    {chosen.has(p.id) ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

const MARKS = ["bg-emerald-100 text-emerald-700", "bg-violet-100 text-violet-700", "bg-orange-100 text-orange-700", "bg-amber-100 text-amber-700"];

function ProductMark({ name, index }: { name: string; index: number }) {
  return (
    <span className={`grid size-10 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${MARKS[index % MARKS.length]}`}>
      {name.slice(0, 2).toUpperCase()}
    </span>
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
