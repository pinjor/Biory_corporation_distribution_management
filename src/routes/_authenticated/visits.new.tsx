import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { PageHeader, Section, Field, Qty, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { myAvailableStockQuery, opt, productsQuery, salesOfficersQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, todayBD } from "@/lib/format";
import { newId } from "@/lib/id";

export const Route = createFileRoute("/_authenticated/visits/new")({
  validateSearch: (s: Record<string, unknown>): { doctor?: string } => (typeof s["doctor"] === "string" ? { doctor: s["doctor"] } : {}),
  head: () => ({ meta: [{ title: "Log doctor visit — BIORY Corporation" }] }),
  component: NewVisit,
});

function nowHHMM() {
  return new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" });
}

function NewVisit() {
  const s = useSession();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canAssign = s.isSuper;
  const [soId, setSoId] = useState(canAssign ? "" : s.userId);
  const { data: products = [] } = useQuery(productsQuery);
  const { data: officers = [] } = useQuery({ ...salesOfficersQuery, enabled: canAssign });
  const { data: ownStock = [] } = useQuery({ ...myAvailableStockQuery, enabled: !canAssign });
  const { data: assignedStock = [] } = useQuery({
    queryKey: ["visit-stock", soId],
    enabled: canAssign && !!soId,
    queryFn: async () => {
      const { data, error } = await api.from("v_stock").select("product_id, qty, days_to_expiry").eq("so_id", soId).gt("qty", 0);
      if (error) throw error;
      const totals = new Map<string, number>();
      for (const row of data) {
        if (!row.product_id) continue;
        if (row.days_to_expiry != null && row.days_to_expiry <= 0) continue;
        totals.set(row.product_id, (totals.get(row.product_id) ?? 0) + (row.qty ?? 0));
      }
      return [...totals.entries()].map(([product_id, on_hand]) => ({ product_id, on_hand }));
    },
  });
  const stock = canAssign ? assignedStock : ownStock;
  const { data: doctors = [] } = useQuery({
    queryKey: ["doctors", "visit", soId],
    enabled: !!soId,
    queryFn: async () => {
      let query = api.from("doctors").select("*").eq("status", "active").order("name");
      if (!(canAssign && soId === s.userId && !s.isSO)) query = query.eq("assigned_so", soId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
  const [doctor, setDoctor] = useState(search.doctor ?? "");
  const [date, setDate] = useState(todayBD());
  const [start, setStart] = useState(() => nowHHMM());
  const [end, setEnd] = useState("");
  const [purpose, setPurpose] = useState("Product detailing");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [idem] = useState(() => newId());
  const onHand = new Map(stock.map((r) => [r.product_id, r.on_hand]));
  const promos = products.filter((p) => p.kind === "promotional" && p.active);
  const items = Object.entries(qty).filter(([, v]) => v > 0);
  const over = items.some(([pid, v]) => v > (onHand.get(pid) ?? 0));

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await api.rpc("record_doctor_visit", {
        p_doctor: doctor,
        p_date: date,
        p_start: opt(start),
        p_end: opt(end),
        p_lat: null,
        p_lng: null,
        p_purpose: opt(purpose),
        p_notes: opt(notes),
        p_items: items.map(([product_id, q]) => ({ product_id, qty: q })),
        p_idempotency_key: idem,
        p_so: canAssign ? soId : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Visit recorded");
      qc.invalidateQueries({ queryKey: ["visits"] });
      qc.invalidateQueries({ queryKey: ["my-available-stock"] });
      navigate({ to: "/visits" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!s.isSO && !canAssign) return <PageHeader title="Log doctor visit" description="Sales Officers log their own visits. Super Admin can log one for any Sales Officer, or for himself." />;

  return (
    <div>
      <PageHeader title="Log doctor visit" description={canAssign ? "Record this visit for a Sales Officer, or for yourself." : undefined} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Visit">
            <div className="grid gap-4 sm:grid-cols-2">
              {canAssign && (
                <div className="sm:col-span-2">
                  <Field label="Sales officer *">
                    <NativeSelect value={soId} onChange={(e) => { setSoId(e.target.value); setDoctor(""); setQty({}); }}>
                      <option value="">Choose Sales Officer…</option>
                      <option value={s.userId}>Myself</option>
                      {officers.filter((officer) => officer.id !== s.userId).map((officer) => (
                        <option key={officer.id} value={officer.id}>{officer.full_name}{officer.so_code ? ` (${officer.so_code})` : ""}</option>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
              )}
              <div className="sm:col-span-2">
                <Field label="Doctor *">
                  <NativeSelect value={doctor} onChange={(e) => setDoctor(e.target.value)} disabled={!soId}>
                    <option value="">{soId ? (doctors.length ? "Choose doctor…" : "No doctors for this officer") : "Choose a Sales Officer first"}</option>
                    {doctors.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.speciality ?? ""} {d.chamber ? `· ${d.chamber}` : ""}</option>)}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Date *"><Input type="date" max={todayBD()} required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Purpose"><Input value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Field>
              <Field label="Start time"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label="End time">
                <div className="flex gap-2">
                  <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                  <Button type="button" variant="outline" size="sm" onClick={() => setEnd(nowHHMM())}>Now</Button>
                </div>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              </div>
            </div>
        </Section>
        <Section title={canAssign ? "Samples & gifts (from that officer's stock)" : "Samples & gifts (from your promotional stock)"}>
          {promos.length === 0 ? (
            <EmptyState title="No promotional products set up" />
          ) : (
            <ul className="divide-y">
              {promos.map((p) => {
                const have = onHand.get(p.id) ?? 0;
                const v = qty[p.id] ?? 0;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className={`text-xs ${v > have ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                        In your stock: <Qty value={have} />
                      </div>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={have}
                      disabled={have === 0}
                      className="num w-20 text-center"
                      value={v || ""}
                      placeholder="0"
                      onChange={(e) => setQty({ ...qty, [p.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          {stock.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              No promotional stock yet — <Link to="/requisitions/new" className="text-primary hover:underline">request some</Link>.
            </p>
          )}
        </Section>
      </div>
      <div className="mt-6 flex justify-end">
        <Button size="lg" onClick={() => m.mutate()} disabled={!soId || !doctor || !date || over || m.isPending}>
          {m.isPending ? "Saving…" : "Confirm visit"}
        </Button>
      </div>
    </div>
  );
}
