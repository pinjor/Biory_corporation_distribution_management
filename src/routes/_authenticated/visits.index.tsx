import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { salesOfficersQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { addDays, formatDate, todayBD } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/visits/")({
  head: () => ({ meta: [{ title: "Doctor visits — BIORY Corporation" }] }),
  component: VisitsPage,
});

function VisitsPage() {
  const s = useSession();
  const [from, setFrom] = useState(addDays(todayBD(), -30));
  const [to, setTo] = useState(todayBD());
  const [so, setSo] = useState("");
  const { data: sos = [] } = useQuery({ ...salesOfficersQuery, enabled: s.isStaff });
  const { data = [], isLoading } = useQuery({
    queryKey: ["visits", from, to, so],
    queryFn: async () => {
      let q = supabase
        .from("doctor_visits")
        .select("*, doctors(name, speciality, chamber), profiles!doctor_visits_so_id_fkey(full_name), visit_items(qty, products(name))")
        .gte("visit_date", from)
        .lte("visit_date", to)
        .order("visit_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (so) q = q.eq("so_id", so);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
  const promoUnits = data.reduce((a, v) => a + v.visit_items.reduce((b, i) => b + i.qty, 0), 0);
  return (
    <div>
      <PageHeader
        title="Doctor visits"
        description="Visits and the samples or gifts handed over — each one draws down the SO's promotional stock."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv("doctor-visits.csv", [
                  ["visit_no", "date", "doctor", "speciality", "so", "purpose", "items"],
                  ...data.map((v) => [v.visit_no, v.visit_date, v.doctors?.name, v.doctors?.speciality, v.profiles?.full_name, v.purpose, v.visit_items.map((i) => `${i.products?.name} x${i.qty}`).join("; ")]),
                ])
              }
            >
              Export CSV
            </Button>
            {s.isSO && (
              <Button asChild>
                <Link to="/visits/new"><Plus /> Log visit</Link>
              </Button>
            )}
          </>
        }
      />
      <Section
        bodyClassName="p-0"
        title={`${data.length} visits · ${promoUnits} promo units`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" />
            <Input type="date" value={to} max={todayBD()} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" />
            {s.isStaff && (
              <NativeSelect value={so} onChange={(e) => setSo(e.target.value)} className="h-8 w-40">
                <option value="">All SOs</option>
                {sos.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </NativeSelect>
            )}
          </div>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-5"><EmptyState title="No visits in this period" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visit</TableHead>
                <TableHead>Doctor</TableHead>
                {s.isStaff && <TableHead>SO</TableHead>}
                <TableHead>Purpose</TableHead>
                <TableHead>Promotional items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <div className="num font-medium">{v.visit_no}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(v.visit_date)} {v.start_time ? `· ${v.start_time.slice(0, 5)}–${v.end_time?.slice(0, 5) ?? ""}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{v.doctors?.name}</div>
                    <div className="text-xs text-muted-foreground">{[v.doctors?.speciality, v.doctors?.chamber].filter(Boolean).join(" · ")}</div>
                  </TableCell>
                  {s.isStaff && <TableCell className="text-sm">{v.profiles?.full_name}</TableCell>}
                  <TableCell className="max-w-56 text-sm">
                    <div>{v.purpose ?? "—"}</div>
                    {v.notes && <div className="line-clamp-2 text-xs text-muted-foreground">{v.notes}</div>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {v.visit_items.length === 0 ? <span className="text-muted-foreground">—</span> : v.visit_items.map((i, k) => <div key={k}>{i.products?.name} × {i.qty}</div>)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
