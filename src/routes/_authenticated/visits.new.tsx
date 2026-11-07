import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { PageHeader, Section, Field, Qty, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { myAvailableStockQuery, opt, optNum, productsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, todayBD } from "@/lib/format";

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
  const { data: products = [] } = useQuery(productsQuery);
  const { data: stock = [] } = useQuery(myAvailableStockQuery);
  const { data: doctors = [] } = useQuery({
    queryKey: ["doctors", "mine"],
    queryFn: async () => {
      const { data, error } = await api.from("doctors").select("*").eq("assigned_so", s.userId).eq("status", "active").order("name");
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
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [idem] = useState(() => crypto.randomUUID());
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
        p_lat: optNum(geo?.lat),
        p_lng: optNum(geo?.lng),
        p_purpose: opt(purpose),
        p_notes: opt(notes),
        p_items: items.map(([product_id, q]) => ({ product_id, qty: q })),
        p_idempotency_key: idem,
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

  if (!s.isSO) return <PageHeader title="Log doctor visit" description="Only Sales Officers can log visits." />;

  return (
    <div>
      <PageHeader title="Log doctor visit" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Visit">
          {doctors.length === 0 ? (
            <EmptyState title="No doctors assigned to you" action={<Button asChild size="sm"><Link to="/doctors">Add a doctor</Link></Button>} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Doctor">
                  <NativeSelect value={doctor} onChange={(e) => setDoctor(e.target.value)}>
                    <option value="">Choose doctor…</option>
                    {doctors.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.speciality ?? ""} {d.chamber ? `· ${d.chamber}` : ""}</option>)}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Date"><Input type="date" max={todayBD()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
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
              <div className="flex items-center gap-3 sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigator.geolocation?.getCurrentPosition(
                      (p) => setGeo({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }),
                      () => toast.error("Couldn't read your location"),
                    )
                  }
                >
                  <MapPin /> Capture location
                </Button>
                <span className="num text-xs text-muted-foreground">{geo ? `${geo.lat}, ${geo.lng}` : "Location not captured"}</span>
              </div>
            </div>
          )}
        </Section>
        <Section title="Samples & gifts (from your promotional stock)">
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
        <Button size="lg" onClick={() => m.mutate()} disabled={!doctor || over || m.isPending}>
          {m.isPending ? "Saving…" : "Confirm visit"}
        </Button>
      </div>
    </div>
  );
}
