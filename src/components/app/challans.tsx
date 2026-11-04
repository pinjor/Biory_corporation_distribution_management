import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Field, Qty, Section, StatusBadge } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { locationsQuery, productsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { errorMessage, formatDate, todayBD } from "@/lib/format";

export type ChallanKind = "OPENING" | "RECEIPT" | "ISSUE" | "ADJUSTMENT";

export const CHALLAN_KIND_LABEL: Record<ChallanKind, string> = {
  OPENING: "Opening stock",
  RECEIPT: "Purchase receipt",
  ISSUE: "Issue to SO",
  ADJUSTMENT: "Adjustment",
};

export const CHALLAN_STATUS_LABEL: Record<string, string> = {
  POSTED: "posted",
  IN_TRANSIT: "in transit",
  RECEIVED: "received",
};

const newKey = () => crypto.randomUUID();

/* ------------------------------------------------------------------ */
/* Opening stock / purchase receipt challan: many products, one post.  */
/* ------------------------------------------------------------------ */

type ReceiptLine = {
  key: string;
  product: string;
  batch: string;
  mfg: string;
  expiry: string;
  qty: string;
};
const blankLine = (): ReceiptLine => ({
  key: newKey(),
  product: "",
  batch: "",
  mfg: "",
  expiry: "",
  qty: "",
});

export function StockChallanForm({ kind }: { kind: "OPENING" | "RECEIPT" }) {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery(productsQuery);
  const active = products.filter((p) => p.active);
  const [date, setDate] = useState(todayBD());
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([blankLine()]);
  const [idem, setIdem] = useState(newKey);
  const setLine = (key: string, patch: Partial<ReceiptLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const units = lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const ready =
    lines.length > 0 &&
    lines.every((l) => l.product && l.batch.trim() && l.expiry && Number(l.qty) > 0);

  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("post_stock_challan", {
        p_kind: kind,
        p_date: date,
        p_reference: reference,
        p_remarks: remarks,
        p_items: lines.map((l) => ({
          product_id: l.product,
          batch_no: l.batch.trim(),
          mfg_date: l.mfg || null,
          expiry_date: l.expiry,
          qty: Number(l.qty),
        })),
        p_idempotency_key: idem,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(
        kind === "OPENING" ? "Opening stock challan posted" : "Receipt challan posted",
        {
          description: `${lines.length} product line(s), ${units} units into Central Warehouse`,
        },
      );
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["challans"] });
      setLines([blankLine()]);
      setReference("");
      setRemarks("");
      setIdem(newKey());
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Section
      title={kind === "OPENING" ? "New opening stock challan" : "New purchase receipt challan"}
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) m.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Challan date">
            <Input
              type="date"
              required
              value={date}
              max={todayBD()}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field
            label={
              kind === "OPENING" ? "Reference (e.g. count sheet)" : "Supplier invoice / GRN ref."
            }
          >
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Remarks">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Products on this challan</h3>
            <span className="text-xs text-muted-foreground">
              Challan number is assigned when you post
            </span>
          </div>
          {lines.map((l, i) => {
            const p = active.find((x) => x.id === l.product);
            return (
              <div key={l.key} className="rounded-xl border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Line {i + 1}
                  </span>
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove line ${i + 1}`}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1fr_1fr_0.8fr]">
                  <Field label="Product">
                    <NativeSelect
                      value={l.product}
                      onChange={(e) => setLine(l.key, { product: e.target.value })}
                    >
                      <option value="">Choose product…</option>
                      {active.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} ({x.code}){x.pack_size ? ` · ${x.pack_size}` : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label="Batch no.">
                    <Input
                      required
                      value={l.batch}
                      onChange={(e) => setLine(l.key, { batch: e.target.value })}
                    />
                  </Field>
                  <Field label="Mfg date">
                    <Input
                      type="date"
                      value={l.mfg}
                      max={todayBD()}
                      onChange={(e) => setLine(l.key, { mfg: e.target.value })}
                    />
                  </Field>
                  <Field label="Expiry">
                    <Input
                      type="date"
                      required
                      min={todayBD()}
                      value={l.expiry}
                      onChange={(e) => setLine(l.key, { expiry: e.target.value })}
                    />
                  </Field>
                  <Field label={`Qty${p?.uom ? ` (${p.uom})` : ""}`}>
                    <Input
                      type="number"
                      required
                      min={1}
                      value={l.qty}
                      onChange={(e) => setLine(l.key, { qty: e.target.value })}
                      className="num"
                    />
                  </Field>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => setLines((ls) => [...ls, blankLine()])}
          >
            <Plus /> Add product
          </Button>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {lines.length} line(s) · <Qty value={units} /> units into{" "}
            <span className="font-medium text-foreground">Central Warehouse</span>
          </span>
          <Button type="submit" disabled={!ready || m.isPending} className="sm:min-w-48">
            {m.isPending
              ? "Posting…"
              : kind === "OPENING"
                ? "Post opening challan"
                : "Post receipt challan"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Adjustment challan: one location, many batch lines.                 */
/* ------------------------------------------------------------------ */

export const ADJUSTMENT_TYPES = [
  { value: "DAMAGE", label: "Damage", dir: "out" },
  { value: "EXPIRED", label: "Expired write-off", dir: "out" },
  { value: "LOSS", label: "Loss / theft", dir: "out" },
  { value: "MANUAL_ADJUSTMENT_OUT", label: "Count correction (−)", dir: "out" },
  { value: "MANUAL_ADJUSTMENT_IN", label: "Count correction (+)", dir: "in" },
  { value: "CUSTOMER_RETURN", label: "Customer return (+)", dir: "in" },
] as const;

type AdjLine = { key: string; batch: string; type: string; qty: string };
const blankAdj = (): AdjLine => ({ key: newKey(), batch: "", type: "DAMAGE", qty: "" });

export function AdjustmentChallanForm() {
  const qc = useQueryClient();
  const { data: locations = [] } = useQuery(locationsQuery);
  const usable = locations.filter((l) => l.kind !== "transit");
  const [loc, setLoc] = useState("");
  const location = loc || usable.find((l) => l.kind === "central")?.id || "";
  const [date, setDate] = useState(todayBD());
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<AdjLine[]>([blankAdj()]);
  const [idem, setIdem] = useState(newKey);
  const setLine = (key: string, patch: Partial<AdjLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const { data: stock = [] } = useQuery({
    queryKey: ["stock", location, "adjust"],
    enabled: !!location,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_stock")
        .select("*")
        .eq("location_id", location)
        .order("product_name")
        .order("expiry_date");
      if (error) throw error;
      return data;
    },
  });
  const byBatch = useMemo(() => new Map(stock.map((r) => [r.batch_id!, r])), [stock]);

  // Net change per batch across all lines, so two lines can't together remove more than is on hand.
  const after = (batch: string) => {
    const on = byBatch.get(batch)?.qty ?? 0;
    return lines
      .filter((l) => l.batch === batch)
      .reduce(
        (a, l) =>
          a +
          (ADJUSTMENT_TYPES.find((t) => t.value === l.type)?.dir === "in" ? 1 : -1) *
            (Number(l.qty) || 0),
        on,
      );
  };
  const lineError = (l: AdjLine) => (l.batch && after(l.batch) < 0 ? "More than on hand" : null);
  const ready =
    lines.length > 0 &&
    reason.trim() &&
    lines.every((l) => l.batch && Number(l.qty) > 0 && !lineError(l));

  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("post_adjustment_challan", {
        p_location: location,
        p_date: date,
        p_reason: reason,
        p_items: lines.map((l) => ({ batch_id: l.batch, type: l.type, qty: Number(l.qty) })),
        p_idempotency_key: idem,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Adjustment challan posted to the ledger");
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["challans"] });
      setLines([blankAdj()]);
      setReason("");
      setIdem(newKey());
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Section title="New adjustment challan">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) m.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Location">
            <NativeSelect
              value={location}
              onChange={(e) => {
                setLoc(e.target.value);
                setLines([blankAdj()]);
              }}
            >
              {usable.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Challan date">
            <Input
              type="date"
              required
              value={date}
              max={todayBD()}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Reason (required)">
            <Textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Monthly physical count, 4 Nov"
              className="min-h-9"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Lines</h3>
          {lines.map((l, i) => {
            const row = byBatch.get(l.batch);
            const dir = ADJUSTMENT_TYPES.find((t) => t.value === l.type)?.dir ?? "out";
            const err = lineError(l);
            const options = dir === "out" ? stock.filter((r) => (r.qty ?? 0) > 0) : stock;
            return (
              <div key={l.key} className="rounded-xl border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {dir === "out" ? (
                      <ArrowDownCircle className="size-4 text-destructive" />
                    ) : (
                      <ArrowUpCircle className="size-4 text-success" />
                    )}
                    Line {i + 1}
                  </span>
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove line ${i + 1}`}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-[1.2fr_2fr_0.8fr]">
                  <Field label="Type">
                    <NativeSelect
                      value={l.type}
                      onChange={(e) => setLine(l.key, { type: e.target.value })}
                    >
                      <optgroup label="Decrease stock">
                        {ADJUSTMENT_TYPES.filter((t) => t.dir === "out").map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Increase stock">
                        {ADJUSTMENT_TYPES.filter((t) => t.dir === "in").map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </optgroup>
                    </NativeSelect>
                  </Field>
                  <Field label="Product · batch">
                    <NativeSelect
                      value={l.batch}
                      onChange={(e) => setLine(l.key, { batch: e.target.value })}
                    >
                      <option value="">
                        {options.length ? "Choose batch…" : "No batches at this location"}
                      </option>
                      {options.map((r) => (
                        <option key={r.batch_id} value={r.batch_id!}>
                          {r.product_name} · {r.batch_no} · exp {formatDate(r.expiry_date)} · on
                          hand {r.qty}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field
                    label="Qty"
                    hint={
                      err ? (
                        <span className="text-destructive">{err}</span>
                      ) : row ? (
                        <span>
                          <Qty value={row.qty} /> →{" "}
                          <span className="font-semibold text-foreground">
                            <Qty value={after(l.batch)} />
                          </span>
                        </span>
                      ) : undefined
                    }
                  >
                    <Input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => setLine(l.key, { qty: e.target.value })}
                      className={cn("num", err && "border-destructive")}
                    />
                  </Field>
                </div>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => setLines((ls) => [...ls, blankAdj()])}
          >
            <Plus /> Add line
          </Button>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {lines.length} line(s) at {usable.find((l) => l.id === location)?.name ?? "—"}
          </span>
          <Button type="submit" disabled={!ready || m.isPending} className="sm:min-w-48">
            {m.isPending ? "Posting…" : "Post adjustment challan"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Challan list                                                        */
/* ------------------------------------------------------------------ */

export function useChallans(kind?: ChallanKind, status?: string) {
  return useQuery({
    queryKey: ["challans", kind ?? "all", status ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("stock_challans")
        .select(
          "*, profiles!stock_challans_so_id_fkey(full_name, so_code), stock_challan_items(qty)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (kind) q = q.eq("kind", kind);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function ChallanTable({
  kind,
  status,
  title,
  empty,
  className,
}: {
  kind?: ChallanKind;
  status?: string;
  title: string;
  empty: string;
  className?: string | undefined;
}) {
  const { data = [], isLoading } = useChallans(kind, status);
  const { data: locations = [] } = useQuery(locationsQuery);
  const lmap = new Map(locations.map((l) => [l.id, l.name]));
  return (
    <Section title={title} bodyClassName="p-0" {...(className ? { className } : {})}>
      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : data.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No challans yet" description={empty} />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Challan</TableHead>
              {!kind && <TableHead>Type</TableHead>}
              <TableHead>Date</TableHead>
              <TableHead>From → To</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    to="/challans/$id"
                    params={{ id: c.id }}
                    className="num font-medium text-primary hover:underline"
                  >
                    {c.challan_no}
                  </Link>
                </TableCell>
                {!kind && (
                  <TableCell className="text-xs">
                    {CHALLAN_KIND_LABEL[c.kind as ChallanKind] ?? c.kind}
                  </TableCell>
                )}
                <TableCell className="text-xs">{formatDate(c.challan_date)}</TableCell>
                <TableCell className="text-xs">
                  {c.kind === "ADJUSTMENT"
                    ? (lmap.get(c.to_location ?? "") ?? "—")
                    : `${c.from_location ? (lmap.get(c.from_location) ?? "—") : "Supplier / opening"} → ${lmap.get(c.to_location ?? "") ?? "—"}`}
                </TableCell>
                <TableCell className="num text-right">{c.stock_challan_items.length}</TableCell>
                <TableCell className="num text-right font-semibold">
                  <Qty value={c.stock_challan_items.reduce((a, i) => a + i.qty, 0)} />
                </TableCell>
                <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                  {c.reference || c.remarks || "—"}
                </TableCell>
                <TableCell>
                  <ChallanStatus status={c.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}

export function ChallanStatus({ status }: { status: string }) {
  if (status === "IN_TRANSIT") return <StatusBadge status="PENDING_APPROVAL" label="in transit" />;
  if (status === "RECEIVED") return <StatusBadge status="RECEIVED" label="received" />;
  return <StatusBadge status="APPROVED" label="posted" />;
}
