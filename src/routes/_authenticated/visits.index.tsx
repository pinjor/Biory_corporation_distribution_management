import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Users } from "lucide-react";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar } from "@/components/app/list-toolbar";
import { PageHeader, Section, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { salesOfficersQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { addDays, formatDate, todayBD } from "@/lib/format";
export const Route = createFileRoute("/_authenticated/visits/")({
  head: () => ({ meta: [{ title: "Doctor visits — BIORY Corporation" }] }),
  component: VisitsPage,
});

function VisitsPage() {
  const s = useSession();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(addDays(todayBD(), -30));
  const [to, setTo] = useState(todayBD());
  const [so, setSo] = useState("");
  const { data: sos = [] } = useQuery({ ...salesOfficersQuery, enabled: s.isStaff });
  const { data = [], isLoading } = useQuery({
    queryKey: ["visits", from, to, so],
    queryFn: async () => {
      let q = api
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
  const rows = useMemo(() => data.filter((v) => {
    const hay = `${v.visit_no} ${v.doctors?.name ?? ""} ${v.purpose ?? ""} ${v.profiles?.full_name ?? ""}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  }), [data, q]);
  const promoUnits = rows.reduce((a, v) => a + v.visit_items.reduce((b, i) => b + i.qty, 0), 0);
  const page = usePagedRows(rows, `${q}|${from}|${to}|${so}`);
  return (
    <div>
      <PageHeader
        title="Doctor visits"
        description="Visits and the samples or gifts handed over — each one draws down the SO's promotional stock."
        actions={
          <>
            {(s.isSO || s.isSuper) && (
              <Button asChild>
                <Link to="/visits/new"><Plus /> Log visit</Link>
              </Button>
            )}
          </>
        }
      />
      <Section
        bodyClassName="p-0"
        title={`${rows.length} visits · ${promoUnits} promo units`}
        actions={
          <ListToolbar query={q} onQuery={setQ} placeholder="Visit / doctor…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
            {s.isStaff && (
              <NativeSelect leading={<Users />} value={so} onChange={(e) => setSo(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Sales officer">
                <option value="">All SOs</option>
                {sos.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </NativeSelect>
            )}
            <FilterClear onClick={() => { setQ(""); setSo(""); setFrom(addDays(todayBD(), -30)); setTo(todayBD()); }} />
          </ListToolbar>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No visits in this period" /></div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visit</TableHead>
                <TableHead>Date & time</TableHead>
                <TableHead>Doctor</TableHead>
                {s.isStaff && <TableHead>SO</TableHead>}
                <TableHead>Purpose</TableHead>
                <TableHead>Promotional items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.pageRows.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="num font-medium">{v.visit_no}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(v.visit_date)}
                    {v.start_time ? ` · ${v.start_time.slice(0, 5)}${v.end_time ? `–${v.end_time.slice(0, 5)}` : ""}` : ""}
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
          <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="visits" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
    </div>
  );
}
