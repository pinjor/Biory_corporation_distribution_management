import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CloudOff, Minus, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, Money, Qty, Field, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { myAvailableStockQuery, myChemistsQuery, opt, productsQuery, settingsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { checkDiscounts, computeOrderTotals } from "@/lib/pricing";
import { errorMessage } from "@/lib/format";
import { useOffline } from "@/components/app/offline-provider";
import { classifyRpcError, queuedQtyByProduct } from "@/lib/offline/outbox";
import { ORDER_DRAFT_KEY as DRAFT_KEY, type OrderDraft as Draft } from "@/lib/offline/order-draft";

export const Route = createFileRoute("/_authenticated/orders/new")({
  validateSearch: (s: Record<string, unknown>): { chemist?: string } =>
    typeof s["chemist"] === "string" ? { chemist: s["chemist"] } : {},
  head: () => ({ meta: [{ title: "New order — BIORY Corporation" }] }),
  component: NewOrder,
});

function NewOrder() {
  const s = useSession();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);
  const { data: products = [] } = useQuery(productsQuery);
  const { data: stock = [] } = useQuery(myAvailableStockQuery);
  const { data: chemists = [], isPending: chemistsPending } = useQuery(myChemistsQuery(s.userId));
  const offline = useOffline();

  const [chemist, setChemist] = useState(search.chemist ?? "");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [soPct, setSoPct] = useState("0");
  const [extraPct, setExtraPct] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [q, setQ] = useState("");
  const [idemKey] = useState(() => crypto.randomUUID());
  const [restored, setRestored] = useState(false);

  // Offline-friendly: keep the form as a local draft so a dropped connection or reload doesn't lose it.
  useEffect(() => {
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
    if (!restored) return;
    const d: Draft = { chemist, qty, so: soPct, extra: extraPct, remarks };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  }, [restored, chemist, qty, soPct, extraPct, remarks]);

  // Stock already promised to orders still waiting to sync on this device.
  const queuedQty = useMemo(() => queuedQtyByProduct(offline.queue), [offline.queue]);
  const availMap = useMemo(
    () => new Map(stock.map((r) => [r.product_id, Math.max(0, r.available - (queuedQty.get(r.product_id) ?? 0))])),
    [stock, queuedQty],
  );
  const saleable = products.filter((p) => p.active && p.kind === "saleable");
  const visible = saleable.filter((p) => !q || `${p.name} ${p.code} ${p.generic_name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const lines = saleable.filter((p) => (qty[p.id] ?? 0) > 0).map((p) => ({ product: p, qty: qty[p.id] ?? 0 }));
  const so = Number(soPct) || 0;
  const extra = Number(extraPct) || 0;
  const totals = computeOrderTotals(lines.map((l) => ({ mrp: Number(l.product.mrp), base_trp: Number(l.product.base_trp), qty: l.qty })), so, extra);
  const policy = settings ?? { so_discount_max_pct: 5, extra_discount_max_pct: 20, extra_discount_so_limit_pct: 5 };
  const disc = checkDiscounts(so, extra, policy);
  const overStock = lines.filter((l) => l.qty > (availMap.get(l.product.id) ?? 0));
  const selectedChemist = chemists.find((c) => c.id === chemist);

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
    window.__lovableEvents?.track?.("project.offline_order_queued", { reason: why, line_count: lines.length });
    toast.success(why === "offline" ? "Saved on this device — it will sync automatically when you're back online" : "Connection dropped — order saved on this device and will sync automatically");
    navigate({ to: "/orders" });
  };

  const save = useMutation({
    // Run even when offline — the handler itself decides to queue the order on the device.
    networkMode: "always",
    mutationFn: async () => {
      if (!navigator.onLine) return { queued: true as const };
      const { data, error, status } = await supabase.rpc("create_order", {
        p_chemist: chemist,
        p_items: lines.map((l) => ({ product_id: l.product.id, qty: l.qty })),
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
      localStorage.removeItem(DRAFT_KEY);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["my-available-stock"] });
      toast.success("Order saved");
      navigate({ to: "/orders/$id", params: { id } });
    },
    onError: (e) => {
      if (e instanceof TypeError) return queueOffline("dropped");
      toast.error(errorMessage(e));
    },
  });

  if (!s.isSO) return <PageHeader title="New order" description="Only Sales Officers can book orders." />;

  const setLine = (id: string, v: number) => setQty((x) => ({ ...x, [id]: Math.max(0, Math.floor(v)) }));

  return (
    <div className="pb-6">
      <PageHeader title="New order" description="Prices come from the product master and are locked into the order when you save." />
      {!offline.online && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
          <CloudOff className="mt-0.5 size-4 shrink-0" />
          <span>
            You're offline. You can still book this order — it's kept on this device and sent automatically when the connection returns. Stock and
            prices shown are from your last sync; the server re-checks them when the order arrives.
          </span>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-6">
          <Section title="Chemist">
            {chemists.length === 0 && !offline.online && chemistsPending ? (
              <EmptyState title="Your chemist list isn't on this device yet" description="Connect to the internet once so the app can download your chemists and products." />
            ) : chemists.length === 0 ? (
              <EmptyState
                title="No chemists assigned to you"
                action={<Button asChild size="sm"><Link to="/chemists">Add a chemist</Link></Button>}
              />
            ) : (
              <NativeSelect value={chemist} onChange={(e) => setChemist(e.target.value)}>
                <option value="">Choose chemist…</option>
                {chemists.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.business_name} · {c.upazila ?? c.district ?? c.code}
                  </option>
                ))}
              </NativeSelect>
            )}
            {selectedChemist && Number(selectedChemist.credit_limit) > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Credit limit <Money value={selectedChemist.credit_limit} /> · terms {selectedChemist.payment_terms_days} days
              </p>
            )}
          </Section>

          <Section title="Products" bodyClassName="p-0" actions={<Input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-48" />}>
            <ul className="divide-y">
              {visible.map((p) => {
                const v = qty[p.id] ?? 0;
                const a = availMap.get(p.id) ?? 0;
                const over = v > a;
                return (
                  <li key={p.id} className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${v > 0 ? "bg-primary-soft/50" : ""}`}>
                    <div className="min-w-0">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Stock <Qty value={a} className={a === 0 ? "text-destructive" : "text-foreground"} /> · MRP <Money value={p.mrp} /> · TRP{" "}
                        <Money value={p.base_trp} className="text-foreground" />
                      </div>
                      {v > 0 && (
                        <div className="text-xs">
                          Line: MRP <Money value={Number(p.mrp) * v} /> · TRP <Money value={Number(p.base_trp) * v} className="font-semibold" />
                        </div>
                      )}
                      {over && <div className="text-xs font-semibold text-destructive">Requested {v}, available {a}</div>}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" size="icon" variant="outline" onClick={() => setLine(p.id, v - 1)} aria-label={`Less ${p.name}`}>
                        <Minus />
                      </Button>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        className={`num w-20 text-center ${over ? "border-destructive" : ""}`}
                        value={v || ""}
                        placeholder="0"
                        onChange={(e) => setLine(p.id, Number(e.target.value) || 0)}
                      />
                      <Button type="button" size="icon" variant="outline" onClick={() => setLine(p.id, v + 1)} aria-label={`More ${p.name}`}>
                        <Plus />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <Section title="Summary">
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Total MRP" value={<Money value={totals.totalMrp} />} />
              <Row label="Standard trade discount" value={<Money value={-totals.standardDiscount} />} muted />
              <Row label="Base TRP" value={<Money value={totals.totalTrp} className="font-semibold" />} />
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label={`SO discount (0–${policy.so_discount_max_pct}%)`}>
                <Input type="number" step="0.5" min={0} max={policy.so_discount_max_pct} value={soPct} onChange={(e) => setSoPct(e.target.value)} />
              </Field>
              <Field label={`Extra discount (0–${policy.extra_discount_max_pct}%)`}>
                <Input type="number" step="0.5" min={0} max={policy.extra_discount_max_pct} value={extraPct} onChange={(e) => setExtraPct(e.target.value)} />
              </Field>
            </div>
            <dl className="mt-4 flex flex-col gap-2 border-t pt-3 text-sm">
              <Row label="SO discount" value={<Money value={-totals.soAmt} />} muted />
              <Row label="Extra discount" value={<Money value={-totals.extraAmt} />} muted />
              <div className="flex items-baseline justify-between border-t pt-2">
                <dt className="font-semibold">Net payable</dt>
                <dd><Money value={totals.net} className="text-xl font-semibold text-primary" /></dd>
              </div>
            </dl>
            {disc.errors.map((e) => (
              <p key={e} className="mt-3 rounded-md bg-destructive-soft px-3 py-2 text-xs text-destructive">{e}</p>
            ))}
            {disc.needsApproval && disc.errors.length === 0 && (
              <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Extra discount above your {policy.extra_discount_so_limit_pct}% authority — the order will wait for Admin approval before delivery.
              </p>
            )}
            <Field label="Remarks">
              <Textarea className="mt-3" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
            <Button
              className="mt-4 w-full"
              size="lg"
              disabled={!chemist || lines.length === 0 || disc.errors.length > 0 || overStock.length > 0 || save.isPending}
              onClick={() => save.mutate()}
            >
              {offline.online ? <Save /> : <CloudOff />} {save.isPending ? "Saving…" : offline.online ? "Save order" : "Save offline"}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {offline.online ? "Draft is kept on this device until saved." : "Will sync automatically when you're back online."}
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={muted ? "text-muted-foreground" : ""}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
