import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, Field, Qty } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { RecentMovements } from "@/components/app/stock-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { locationsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { errorMessage, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory/adjust")({
  head: () => ({ meta: [{ title: "Stock adjustment — BIORY Corporation" }] }),
  component: AdjustPage,
});

const TYPES = [
  { value: "DAMAGE", label: "Damage", dir: "out" },
  { value: "EXPIRED", label: "Expired write-off", dir: "out" },
  { value: "LOSS", label: "Loss / theft", dir: "out" },
  { value: "MANUAL_ADJUSTMENT_OUT", label: "Count correction (decrease)", dir: "out" },
  { value: "MANUAL_ADJUSTMENT_IN", label: "Count correction (increase)", dir: "in" },
  { value: "CUSTOMER_RETURN", label: "Customer return", dir: "in" },
] as const;

const ADJUSTMENT_TYPES = TYPES.map((t) => t.value);

function AdjustPage() {
  const s = useSession();
  const qc = useQueryClient();
  const { data: locations = [] } = useQuery(locationsQuery);
  const [loc, setLoc] = useState("");
  const location = loc || locations.find((l) => l.kind === "central")?.id || "";
  const [batch, setBatch] = useState("");
  const [type, setType] = useState<string>("DAMAGE");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const dir = TYPES.find((t) => t.value === type)?.dir ?? "out";

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
  // Decreases need stock on hand; increases may target any batch already known at this location.
  const options = useMemo(
    () => (dir === "out" ? stock.filter((r) => (r.qty ?? 0) > 0) : stock),
    [stock, dir],
  );
  const row = options.find((r) => r.batch_id === batch);
  const n = Number(qty);
  const tooMuch = dir === "out" && row && n > (row.qty ?? 0);

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("adjust_stock", {
        p_location: location,
        p_batch: batch,
        p_qty: n,
        p_type: type,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Adjustment posted to the ledger");
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      setQty("");
      setReason("");
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

  return (
    <div>
      <PageHeader
        title="Stock adjustment"
        eyebrow="Inventory"
        description="Write off damaged, expired or lost stock, or correct a physical count. Adjustments are new ledger entries with a reason — history is never edited."
      />
      <Section title="New adjustment">
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <Field label="Location">
            <NativeSelect
              value={location}
              onChange={(e) => {
                setLoc(e.target.value);
                setBatch("");
              }}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Adjustment type">
            <NativeSelect
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setBatch("");
              }}
            >
              <optgroup label="Decrease stock">
                {TYPES.filter((t) => t.dir === "out").map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Increase stock">
                {TYPES.filter((t) => t.dir === "in").map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            </NativeSelect>
          </Field>
          <Field label="Product · batch">
            <NativeSelect required value={batch} onChange={(e) => setBatch(e.target.value)}>
              <option value="">
                {options.length ? "Choose batch…" : "No batches at this location"}
              </option>
              {options.map((r) => (
                <option key={r.batch_id} value={r.batch_id!}>
                  {r.product_name} · {r.batch_no} · exp {formatDate(r.expiry_date)} · on hand{" "}
                  {r.qty}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Quantity"
            hint={
              tooMuch ? (
                <span className="text-destructive">More than the {row?.qty} on hand</span>
              ) : undefined
            }
          >
            <Input
              required
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Reason (required)">
              <Textarea
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. 3 pots crushed in transit, count on 4 Nov"
                className="min-h-9"
              />
            </Field>
          </div>

          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm sm:col-span-2 lg:col-span-2",
              dir === "out" ? "bg-destructive-soft/60" : "bg-success-soft/60",
            )}
          >
            {dir === "out" ? (
              <ArrowDownCircle className="size-5 shrink-0 text-destructive" />
            ) : (
              <ArrowUpCircle className="size-5 shrink-0 text-success" />
            )}
            <span>
              {row ? (
                <>
                  {row.product_name} · {row.batch_no}: <Qty value={row.qty} /> on hand
                  {n > 0 && (
                    <>
                      {" → "}
                      <span className="font-semibold">
                        <Qty value={(row.qty ?? 0) + (dir === "out" ? -n : n)} />
                      </span>{" "}
                      after this adjustment
                    </>
                  )}
                </>
              ) : dir === "out" ? (
                "This adjustment will reduce stock."
              ) : (
                "This adjustment will increase stock."
              )}
            </span>
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              className="w-full"
              variant={dir === "out" ? "destructive" : "default"}
              disabled={m.isPending || !batch || !(n > 0) || !reason.trim() || !!tooMuch}
            >
              {m.isPending ? "Posting…" : "Post adjustment"}
            </Button>
          </div>
        </form>
      </Section>
      <RecentMovements
        title="Recent adjustments"
        types={ADJUSTMENT_TYPES}
        empty="Damage, write-offs and count corrections will appear here."
      />
    </div>
  );
}
