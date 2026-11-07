import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Stethoscope } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader, Section, StatusBadge, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { PartyDialog } from "@/components/app/party-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { territoriesQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/doctors")({
  head: () => ({ meta: [{ title: "Doctors — BIORY Corporation" }] }),
  component: DoctorsPage,
});

function DoctorsPage() {
  const s = useSession();
  const { data: territories = [] } = useQuery(territoriesQuery);
  const [q, setQ] = useState("");
  const [territory, setTerritory] = useState("");
  const [edit, setEdit] = useState<Record<string, string | number | null> | null | "new">(null);
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
      (!territory || d.territory_id === territory) &&
      (!q || `${d.code} ${d.name} ${d.speciality ?? ""} ${d.chamber ?? ""} ${d.mobile ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <div>
      <PageHeader
        title="Doctors"
        description={s.isStaff ? "Company-wide doctor master." : "Doctors you call on."}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv("doctors.csv", [
                  ["code", "name", "speciality", "qualification", "hospital", "chamber", "mobile", "territory", "assigned_so", "status"],
                  ...rows.map((d) => [d.code, d.name, d.speciality, d.qualification, d.hospital, d.chamber, d.mobile, d.territories?.name, d.profiles?.full_name, d.status]),
                ])
              }
            >
              Export CSV
            </Button>
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
          <div className="flex gap-2">
            <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-52" />
            <NativeSelect value={territory} onChange={(e) => setTerritory(e.target.value)} className="h-8 w-40">
              <option value="">All territories</option>
              {territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </NativeSelect>
          </div>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No doctors yet" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doctor</TableHead>
                <TableHead>Chamber / hospital</TableHead>
                <TableHead>Mobile</TableHead>
                {s.isStaff && <TableHead>Sales Officer</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
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
                  {s.isStaff && <TableCell className="text-sm">{d.profiles?.full_name ?? "—"}</TableCell>}
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {s.isSO && d.assigned_so === s.userId && d.status === "active" && (
                      <Button asChild variant="ghost" size="icon" aria-label="Log visit">
                        <Link to="/visits/new" search={{ doctor: d.id }}><Stethoscope /></Link>
                      </Button>
                    )}
                    {(s.isAdmin || d.assigned_so === s.userId) && (
                      <Button variant="ghost" size="icon" onClick={() => setEdit(d as never)} aria-label="Edit">
                        <Pencil />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      {edit && <PartyDialog kind="doctor" initial={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
