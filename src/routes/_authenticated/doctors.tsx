import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, Pencil, Plus, Stethoscope, Trash2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { ConfirmDelete } from "@/components/app/confirm-delete";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { PageHeader, Section, StatusBadge, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { PartyDialog } from "@/components/app/party-form";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { territoriesQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { inDateRange } from "@/lib/format";
export const Route = createFileRoute("/_authenticated/doctors")({
  head: () => ({ meta: [{ title: "Doctors — BIORY Corporation" }] }),
  component: DoctorsPage,
});

function DoctorsPage() {
  const s = useSession();
  const qc = useQueryClient();
  const { data: territories = [] } = useQuery(territoriesQuery);
  const [q, setQ] = useState("");
  const [territory, setTerritory] = useState("");
  const { from, to, setFrom, setTo, reset } = useListRange();
  const [edit, setEdit] = useState<Record<string, string | number | null> | null | "new">(null);
  const [remove, setRemove] = useState<{ id: string; name: string } | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["doctors"],
    queryFn: async () => {
      const { data, error } = await api
        .from("doctors")
        .select("*, profiles!doctors_assigned_so_fkey(full_name, so_code), territories(name)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const rows = data.filter(
    (d) =>
      inDateRange(d.created_at, from, to) &&
      (!territory || d.territory_id === territory) &&
      (!q || `${d.code} ${d.name} ${d.speciality ?? ""} ${d.chamber ?? ""} ${d.mobile ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );
  const page = usePagedRows(rows, `${q}|${territory}|${from}|${to}`);
  return (
    <div>
      <PageHeader
        title="Doctors"
        description={s.isStaff ? "Company-wide doctor master." : "Doctors you call on."}
        actions={
          <>
            {(s.isSO || s.isAdmin) && (
              <Button onClick={() => setEdit("new")}>
                <Plus /> New doctor
              </Button>
            )}
          </>
        }
      />
      <Section
        bodyClassName="p-0"
        title={`${rows.length} doctors`}
        actions={
          <ListToolbar query={q} onQuery={setQ} placeholder="Name, chamber, mobile…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
            <NativeSelect leading={<MapPin />} value={territory} onChange={(e) => setTerritory(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Territory">
              <option value="">All territories</option>
              {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </NativeSelect>
            <FilterClear onClick={() => { setQ(""); setTerritory(""); reset(); }} />
          </ListToolbar>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No doctors yet" /></div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doctor</TableHead>
                <TableHead>Chamber / hospital</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.pageRows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="num">{d.code}</span> · {[d.speciality, d.qualification].filter(Boolean).join(", ")}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{d.chamber ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{d.hospital}</div>
                  </TableCell>
                  <TableCell className="num text-xs">{d.mobile ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {(s.isSO || s.isSuper) && d.status === "active" && (
                      <Button asChild variant="ghost" size="icon" aria-label="Log visit">
                        <Link to="/visits/new" search={{ doctor: d.id }}><Stethoscope /></Link>
                      </Button>
                    )}
                    {(s.isAdmin || d.assigned_so === s.userId) && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => setEdit(d as never)} aria-label={`Edit ${d.name}`}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setRemove({ id: d.id, name: d.name })} aria-label={`Delete ${d.name}`}>
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="doctors" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
      {edit && <PartyDialog kind="doctor" initial={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {remove && (
        <ConfirmDelete
          title={`Delete ${remove.name}?`}
          onClose={() => setRemove(null)}
          run={async () => {
            const { error } = await api.from("doctors").delete().eq("id", remove.id);
            if (error) throw error;
            qc.invalidateQueries({ queryKey: ["doctors"] });
          }}
        />
      )}
    </div>
  );
}
