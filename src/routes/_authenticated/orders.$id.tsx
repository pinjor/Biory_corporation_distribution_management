import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, FileText, HandCoins, Pencil, Truck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { PageHeader, Section, StatusBadge, KeyValue, PageLoader, Money, Qty, Field, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { myAvailableStockQuery, opt } from "@/lib/queries";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { useSession } from "@/lib/session";
import { round2 } from "@/lib/pricing";
import { addDays, errorMessage, formatDate, formatDateTime, formatPct, todayBD } from "@/lib/format";
import { newId } from "@/lib/id";
import { downloadOrderReport, type OrderReport } from "@/lib/order-report";

export const Route = createFileRoute("/_authenticated/orders/$id")({
  validateSearch: (s: Record<string, unknown>): { report?: "1"; do?: "deliver" | "collect" } => {
    const report = s["report"] === "1" ? ("1" as const) : undefined;
    const raw = s["do"];
    const action = raw === "deliver" || raw === "collect" ? raw : undefined;
    return { ...(report ? { report } : {}), ...(action ? { do: action } : {}) };
  },
  head: () => ({ meta: [{ title: "Order — BIORY Corporation" }] }),
  component: OrderDetail,
});

function useOrder(id: string) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await api
        .from("orders")
        .select(
          "*, chemists(*), profiles!orders_so_id_fkey(full_name, so_code), order_items(*, products(name, code, pack_size)), deliveries(*), collections(*)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}
type Order = NonNullable<ReturnType<typeof useOrder>["data"]>;

function OrderDetail() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const s = useSession();
  const qc = useQueryClient();
  const { data: o, isLoading } = useOrder(id);
  const [dialog, setDialog] = useState<"deliver" | "collect" | "reject" | "cancel" | null>(null);
  const handledSearch = useRef("");
  const [reverse, setReverse] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["my-available-stock"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await api.rpc("decide_order", { p_id: id, p_approve: true, p_note: "Approved" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Order approved"); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  useEffect(() => {
    if (!o || (!search.report && !search.do)) return;
    const key = `${o.id}:${search.report ?? ""}:${search.do ?? ""}`;
    if (handledSearch.current === key) return;
    handledSearch.current = key;
    const mine = o.so_id === s.userId;
    const remaining = o.order_items.reduce((a, i) => a + (i.qty - i.delivered_qty), 0);
    if (search.report === "1") {
      void downloadOrderReport(o as OrderReport).catch((e) => toast.error(errorMessage(e)));
    }
    if (search.do === "deliver" && (mine || (o.stock_from === "central" && s.isAdmin)) && o.status === "CONFIRMED" && remaining > 0) {
      setDialog("deliver");
    }
    if (search.do === "collect" && mine && Number(o.due) > 0) setDialog("collect");
    navigate({ to: "/orders/$id", params: { id }, search: {}, replace: true });
  }, [o, search.report, search.do, id, navigate, s.userId, s.isAdmin]);

  if (isLoading || !o) return <PageLoader />;
  const mine = o.so_id === s.userId;
  const remaining = o.order_items.reduce((a, i) => a + (i.qty - i.delivered_qty), 0);
  const due = Number(o.due);
  const overdueOn = o.first_delivered_at ? addDays(o.first_delivered_at, o.chemists?.payment_terms_days ?? 30) : null;
  const overdue = due > 0 && overdueOn !== null && overdueOn < todayBD();
  const validCollections = o.collections.filter((c) => c.status === "VALID");

  return (
    <div>
      <PageHeader
        eyebrow={<Link to="/orders" className="hover:underline">Orders</Link>}
        title={<span className="num">{o.order_no}</span>}
        description={`${o.chemists?.business_name ?? ""} · booked ${formatDate(o.order_date)} by ${o.profiles?.full_name ?? ""}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/orders"><ArrowLeft /> Back</Link>
            </Button>
            {(mine || s.isSuper) && ["PENDING_APPROVAL", "CONFIRMED"].includes(o.status) && o.delivery_status === "NOT_DELIVERED" && (
              <Button asChild variant="outline">
                <Link to="/orders/new" search={{ edit: o.id }}><Pencil /> Edit</Link>
              </Button>
            )}
            <Button variant="outline" onClick={() => void downloadOrderReport(o as OrderReport).catch((e) => toast.error(errorMessage(e)))}>
              <Download /> Order report
            </Button>
            {s.isAdmin && o.status === "PENDING_APPROVAL" && !mine && (
              <>
                <Button variant="outline" onClick={() => setDialog("reject")}>Reject</Button>
                <Button onClick={() => approve.mutate()} disabled={approve.isPending}>Approve</Button>
              </>
            )}
            {(mine || s.isAdmin) && ["PENDING_APPROVAL", "CONFIRMED"].includes(o.status) && o.delivery_status === "NOT_DELIVERED" && (
              <Button variant="ghost" onClick={() => setDialog("cancel")}>Cancel order</Button>
            )}
            {(mine || (o.stock_from === "central" && s.isAdmin)) && o.status === "CONFIRMED" && remaining > 0 && (
              <Button onClick={() => setDialog("deliver")}><Truck /> Deliver</Button>
            )}
            {mine && due > 0 && (
              <Button variant="highlight" onClick={() => setDialog("collect")}><HandCoins /> Collect payment</Button>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <StatusBadge status={o.status} />
        <StatusBadge status={o.delivery_status} />
        <StatusBadge status={o.payment_status} />
        {overdue && <StatusBadge status="UNPAID" label={`overdue since ${formatDate(overdueOn)}`} />}
      </div>

      {o.status === "PENDING_APPROVAL" && o.approval_reason && (
        <div className="mb-6 rounded-xl border border-warning bg-warning-soft p-4 text-sm text-warning-foreground">
          <strong>Waiting for approval:</strong> {o.approval_reason}
        </div>
      )}
      {o.status === "CANCELLED" && o.cancel_reason && (
        <div className="mb-6 rounded-xl bg-muted p-4 text-sm text-muted-foreground">Cancelled: {o.cancel_reason}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Section title="Order lines (prices locked at booking)" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead className="text-right">Base TRP</TableHead>
                <TableHead className="text-right">Net unit</TableHead>
                <TableHead className="text-right">Line net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.order_items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <div className="font-medium">{i.products?.name}</div>
                    <div className="num text-xs text-muted-foreground">{i.products?.code}</div>
                  </TableCell>
                  <TableCell className="text-right"><Qty value={i.qty} /></TableCell>
                  <TableCell className="text-right">
                    <Qty value={i.delivered_qty} className={i.delivered_qty === i.qty ? "text-success" : ""} />
                  </TableCell>
                  <TableCell className="text-right"><Money value={i.mrp} /></TableCell>
                  <TableCell className="text-right"><Money value={i.base_trp} /></TableCell>
                  <TableCell className="text-right"><Money value={i.net_unit_price} /></TableCell>
                  <TableCell className="text-right font-semibold"><Money value={i.line_net} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section title="Money">
          <dl className="flex flex-col gap-2 text-sm">
            <Line label="Total MRP" value={o.total_mrp} />
            <Line label="Base TRP" value={o.total_base_trp} />
            <Line label={`SO discount (${formatPct(o.so_discount_pct)})`} value={-Number(o.so_discount_amt)} muted />
            <Line label={`Extra discount (${formatPct(o.extra_discount_pct)})`} value={-Number(o.extra_discount_amt)} muted />
            <Line label="Net order value" value={o.net_total} strong />
            <div className="my-1 border-t" />
            <Line label="Delivered value" value={o.delivered_value} />
            <Line label="Collected" value={o.collected_value} />
            <div className="flex items-baseline justify-between rounded-lg bg-muted px-3 py-2">
              <dt className="font-semibold">Outstanding due</dt>
              <dd><Money value={o.due} className={`text-lg font-semibold ${due > 0 ? "text-destructive" : "text-success"}`} /></dd>
            </div>
          </dl>
          <div className="mt-4">
            <KeyValue
              items={[
                ["Chemist", o.chemists?.business_name],
                ["Payment terms", `${o.chemists?.payment_terms_days ?? 30} days`],
                ["Approved", o.approved_at ? formatDateTime(o.approved_at) : "—"],
                ["Remarks", o.remarks || "—"],
              ]}
            />
          </div>
        </Section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title={`Deliveries (${o.deliveries.length})`} bodyClassName="p-0">
          {o.deliveries.length === 0 ? (
            <div className="p-5"><EmptyState title="Nothing delivered yet" description="Stock leaves your inventory only when a delivery is confirmed." /></div>
          ) : (
            <Table>
              <TableBody>
                {o.deliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link to="/deliveries/$id" params={{ id: d.id }} className="num font-medium text-primary hover:underline">{d.delivery_no}</Link>
                      <div className="text-xs text-muted-foreground">{formatDate(d.delivery_date)}</div>
                    </TableCell>
                    <TableCell><StatusBadge status={d.delivery_type} /></TableCell>
                    <TableCell className="text-right"><Money value={d.total_value} /></TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="icon" variant="ghost" aria-label="Challan">
                        <Link to="/deliveries/$id" params={{ id: d.id }}><FileText /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
        <Section title={`Collections (${validCollections.length})`} bodyClassName="p-0">
          {o.collections.length === 0 ? (
            <div className="p-5"><EmptyState title="No payments yet" /></div>
          ) : (
            <Table>
              <TableBody>
                {o.collections.map((c) => (
                  <TableRow key={c.id} className={c.status === "REVERSED" ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="num font-medium">{c.collection_no}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(c.collection_date)} · {c.method}{c.reference ? ` · ${c.reference}` : ""}</div>
                      {c.status === "REVERSED" && <div className="text-xs text-destructive">Reversed: {c.reversal_reason}</div>}
                    </TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-right"><Money value={c.amount} /></TableCell>
                    <TableCell className="text-right">
                      {s.isFinance && c.status === "VALID" && (
                        <Button size="icon" variant="ghost" onClick={() => setReverse(c.id)} aria-label="Reverse collection"><Undo2 /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </div>

      {dialog === "deliver" && <DeliverDialog order={o} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === "collect" && <CollectDialog order={o} onClose={() => setDialog(null)} onDone={refresh} />}
      {(dialog === "reject" || dialog === "cancel") && (
        <ReasonDialog
          title={dialog === "reject" ? "Reject order" : "Cancel order"}
          confirm={dialog === "reject" ? "Reject order" : "Cancel order"}
          onClose={() => setDialog(null)}
          run={async (reason) => {
            const { error } =
              dialog === "reject"
                ? await api.rpc("decide_order", { p_id: id, p_approve: false, p_note: reason })
                : await api.rpc("cancel_order", { p_id: id, p_reason: reason });
            if (error) throw error;
            refresh();
          }}
        />
      )}
      {reverse && (
        <ReasonDialog
          title="Reverse collection"
          confirm="Post reversal"
          note="The original payment stays on record; a reversal entry is added and the SO wallet is debited."
          onClose={() => setReverse(null)}
          run={async (reason) => {
            const { error } = await api.rpc("reverse_collection", { p_id: reverse, p_reason: reason });
            if (error) throw error;
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Line({ label, value, muted, strong }: { label: string; value: unknown; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={muted ? "text-muted-foreground" : strong ? "font-semibold" : ""}>{label}</dt>
      <dd><Money value={value} className={strong ? "font-semibold" : ""} /></dd>
    </div>
  );
}

function DeliverDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const { data: stock = [] } = useQuery(myAvailableStockQuery);
  const onHand = new Map(stock.map((r) => [r.product_id, r.on_hand]));
  const open = order.order_items.filter((i) => i.qty - i.delivered_qty > 0);
  const [mode, setMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [now, setNow] = useState<Record<string, number>>(() => Object.fromEntries(open.map((i) => [i.id, i.qty - i.delivered_qty])));
  const [remarks, setRemarks] = useState("");
  const [idem] = useState(() => newId());
  const qtyFor = (i: (typeof open)[number]) => (mode === "FULL" ? i.qty - i.delivered_qty : (now[i.id] ?? 0));
  const value = round2(open.reduce((a, i) => a + qtyFor(i) * Number(i.net_unit_price), 0));
  const short = open.filter((i) => qtyFor(i) > (onHand.get(i.product_id) ?? 0));
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await api.rpc("deliver_order", {
        p_order: order.id,
        p_items: open.map((i) => ({ order_item_id: i.id, qty: qtyFor(i) })),
        p_remarks: opt(remarks),
        p_idempotency_key: idem,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Delivery confirmed — challan generated");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deliver · {order.order_no}</DialogTitle>
        </DialogHeader>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as "FULL" | "PARTIAL")} className="flex gap-6">
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="FULL" /> Full delivery</label>
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="PARTIAL" /> Partial delivery</label>
        </RadioGroup>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Delivered</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead className="text-right">Deliver now</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {open.map((i) => {
              const rem = i.qty - i.delivered_qty;
              const have = onHand.get(i.product_id) ?? 0;
              return (
                <TableRow key={i.id}>
                  <TableCell>
                    <div className="font-medium">{i.products?.name}</div>
                    <div className={`text-xs ${qtyFor(i) > have ? "font-semibold text-destructive" : "text-muted-foreground"}`}>In your stock: {have}</div>
                  </TableCell>
                  <TableCell className="num text-right">{i.qty}</TableCell>
                  <TableCell className="num text-right">{i.delivered_qty}</TableCell>
                  <TableCell className="num text-right">{rem}</TableCell>
                  <TableCell className="text-right">
                    {mode === "FULL" ? (
                      <span className="num font-semibold">{rem}</span>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        max={rem}
                        className="num ml-auto w-20 text-right"
                        value={now[i.id] ?? 0}
                        onChange={(e) => setNow({ ...now, [i.id]: Math.max(0, Math.min(rem, Math.floor(Number(e.target.value) || 0))) })}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>Delivery value (net)</TableCell>
              <TableCell className="text-right"><Money value={value} className="font-semibold" /></TableCell>
            </TableRow>
          </TableFooter>
        </Table>
        <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
        <p className="text-xs text-muted-foreground">Batches are picked first-expiry-first-out from your stock. Expired batches are never delivered.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || value <= 0 || short.length > 0}>
            {m.isPending ? "Confirming…" : "Confirm delivery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CollectDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const due = Number(order.due);
  const [mode, setMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [amount, setAmount] = useState(String(due));
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(todayBD());
  const [remarks, setRemarks] = useState("");
  const [idem] = useState(() => newId());
  const amt = mode === "FULL" ? due : Number(amount) || 0;
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await api.rpc("record_collection", {
        p_order: order.id,
        p_amount: amt,
        p_method: method,
        p_reference: opt(reference),
        p_date: date,
        p_remarks: opt(remarks),
        p_idempotency_key: idem,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded — added to your wallet");
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Collect payment · {order.order_no}</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg bg-muted px-4 py-3 text-sm">
          Delivered <Money value={order.delivered_value} /> · collected <Money value={order.collected_value} /> · due{" "}
          <Money value={due} className="font-semibold text-destructive" />
        </div>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as "FULL" | "PARTIAL")} className="flex gap-6">
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="FULL" /> Full payment</label>
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="PARTIAL" /> Partial payment</label>
        </RadioGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (৳)">
            <Input type="number" step="0.01" min={0.01} max={due} disabled={mode === "FULL"} value={mode === "FULL" ? due : amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Method">
            <NativeSelect value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="MFS">MFS (bKash / Nagad / Rocket)</option>
              <option value="CHEQUE">Cheque</option>
              <option value="OTHER">Other</option>
            </NativeSelect>
          </Field>
          <Field label="Transaction / cheque ref."><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          <Field label="Collection date"><Input type="date" max={todayBD()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Remarks"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
        {amt > due && <p className="text-xs text-destructive">Amount can't exceed the due.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || amt <= 0 || amt > due}>
            {m.isPending ? "Saving…" : `Record ${mode === "FULL" ? "full" : "partial"} payment`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
