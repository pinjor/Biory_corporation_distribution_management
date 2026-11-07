import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import type { Database } from "@/lib/database.types";
import { PageHeader, Section, Field, PageLoader, Money } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { settingsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { baseTrp, computeOrderTotals } from "@/lib/pricing";
import { errorMessage } from "@/lib/format";

type Settings = Database["public"]["Tables"]["app_settings"]["Row"];

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Pricing & policy — BIORY Corporation" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const s = useSession();
  const qc = useQueryClient();
  const { data } = useQuery(settingsQuery);
  const [f, setF] = useState<Settings | null>(null);
  useEffect(() => {
    if (data) setF(data);
  }, [data]);
  const save = useMutation({
    mutationFn: async () => {
      if (!f) return;
      const { id: _id, updated_at: _u, ...rest } = f;
      const { error } = await api
        .from("app_settings")
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Policy saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!f) return <PageLoader />;
  const ro = !s.isSuper;
  const set = (k: keyof Settings, v: unknown) => setF((x) => (x ? { ...x, [k]: v } : x));
  const example = computeOrderTotals([{ mrp: 100, base_trp: baseTrp(100, Number(f.default_trade_discount_pct)), qty: 1 }], 5, 7);

  return (
    <div>
      <PageHeader
        title="Pricing & policy"
        description="Company-wide commercial rules. The server enforces these on every order — they can't be bypassed from a phone."
        actions={!ro && <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Button>}
      />
      {ro && <p className="mb-4 rounded-lg bg-muted px-4 py-2 text-sm text-muted-foreground">Only a Super Admin can change these settings.</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Discounts">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default standard trade discount (%)" hint="Pre-filled on new products">
              <Input disabled={ro} type="number" step="0.01" value={f.default_trade_discount_pct} onChange={(e) => set("default_trade_discount_pct", e.target.value)} />
            </Field>
            <Field label="SO discount maximum (%)" hint="SOs can apply 0 up to this">
              <Input disabled={ro} type="number" step="0.01" value={f.so_discount_max_pct} onChange={(e) => set("so_discount_max_pct", e.target.value)} />
            </Field>
            <Field label="Extra discount maximum (%)" hint="Hard ceiling, nobody can exceed">
              <Input disabled={ro} type="number" step="0.01" value={f.extra_discount_max_pct} onChange={(e) => set("extra_discount_max_pct", e.target.value)} />
            </Field>
            <Field label="Extra discount SO authority (%)" hint="Above this, the order waits for Admin approval">
              <Input disabled={ro} type="number" step="0.01" value={f.extra_discount_so_limit_pct} onChange={(e) => set("extra_discount_so_limit_pct", e.target.value)} />
            </Field>
          </div>
          <div className="mt-5 rounded-lg bg-primary-soft p-4 text-sm text-accent-foreground">
            <div className="font-semibold">Worked example</div>
            MRP <Money value={100} /> at {f.default_trade_discount_pct}% trade discount → Base TRP <Money value={example.totalTrp} />. With 5% SO
            and 7% extra discount the net is <Money value={example.net} />.
          </div>
        </Section>
        <Section title="Stock & credit">
          <div className="grid gap-4">
            <Field label="Near-expiry warning window">
              <NativeSelect disabled={ro} value={f.near_expiry_days} onChange={(e) => set("near_expiry_days", Number(e.target.value))}>
                {[30, 60, 90, 120, 180].map((d) => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Enforce chemist credit limits</div>
                <div className="text-xs text-muted-foreground">Orders that push a chemist over their limit need approval</div>
              </div>
              <Switch disabled={ro} checked={f.enforce_credit_limit} onCheckedChange={(v) => set("enforce_credit_limit", v)} />
            </div>
          </div>
        </Section>
        <Section title="Company details (printed on challans & receipts)">
          <div className="grid gap-4">
            <Field label="Company name"><Input disabled={ro} value={f.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
            <Field label="Address"><Input disabled={ro} value={f.company_address} onChange={(e) => set("company_address", e.target.value)} /></Field>
            <Field label="Phone"><Input disabled={ro} value={f.company_phone ?? ""} onChange={(e) => set("company_phone", e.target.value)} /></Field>
          </div>
        </Section>
      </div>
    </div>
  );
}
