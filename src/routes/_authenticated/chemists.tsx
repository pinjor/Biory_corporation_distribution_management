import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pencil, Plus, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, StatusBadge, EmptyState, Money } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { PartyDialog } from "@/components/app/party-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { territoriesQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/chemists")({
  head: () => ({ meta: [{ title: "Chemists — BIORY Corporation" }] }),
  component: ChemistsPage,
});

function ChemistsPage() {
  const s = useSession();
  const { data: territories = [] } = useQuery(territoriesQuery);
  const [q, setQ] = useState("");
  const [territory, setTerritory] = useState("");
  const [edit, setEdit] = useState<Record<string, string | number | null> | null | "new">(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["chemists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chemists")
        .select("*, profiles!chemists_assigned_so_fkey(full_name, so_code), territories(name)")
        .order("business_name");
      if (error) throw error;
      return data;
    },
  });
  const { data: dues = [] } = useQuery({
    queryKey: ["chemist-dues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("chemist_id, due").gt("due", 0).neq("status", "CANCELLED");
      if (error) throw error;
      return data;
    },
  });
  const dueMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dues) m.set(d.chemist_id, (m.get(d.chemist_id) ?? 0) + Number(d.due));
    return m;
  }, [dues]);
  const rows = data.filter(
    (c) =>
      (!territory || c.territory_id === territory) &&
      (!q || `${c.code} ${c.business_name} ${c.owner_name ?? ""} ${c.mobile ?? ""} ${c.upazila ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div>
      <PageHeader
        title="Chemists"
        description={s.isStaff ? "Company-wide chemist master, consolidated from every Sales Officer." : "Chemist shops assigned to you."}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv("chemists.csv", [
                  ["code", "business_name", "owner", "mobile", "district", "upazila", "territory", "assigned_so", "credit_limit", "terms_days", "outstanding", "status"],
                  ...rows.map((c) => [c.code, c.business_name, c.owner_name, c.mobile, c.district, c.upazila, c.territories?.name, c.profiles?.full_name, c.credit_limit, c.payment_terms_days, dueMap.get(c.id) ?? 0, c.status]),
                ])
              }
            >
              Export CSV
            </Button>
            {(s.isSO || s.isAdmin) && (
              <Button onClick={() => setEdit("new")}>
                <Plus /> New chemist
              </Button>
            )}
          </>
        }
      />
      <Section
        bodyClassName="p-0"
        title={`${rows.length} chemists`}
        actions={
          <div className="flex gap-2">
            <Input placeholder="Search name, mobile, area…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-56" />
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
          <div className="p-5">
            <EmptyState title="No chemists yet" description="Add the pharmacies you sell to." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chemist</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Area</TableHead>
                {s.isStaff && <TableHead>Sales Officer</TableHead>}
                <TableHead className="text-right">Credit limit</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.business_name}</div>
                    <div className="num text-xs text-muted-foreground">{c.code}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{c.owner_name ?? "—"}</div>
                    <div className="num text-xs text-muted-foreground">{c.mobile}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{[c.upazila, c.district].filter(Boolean).join(", ") || "—"}</div>
                    <div className="text-xs text-muted-foreground">{c.territories?.name}</div>
                  </TableCell>
                  {s.isStaff && <TableCell className="text-sm">{c.profiles?.full_name ?? "—"}</TableCell>}
                  <TableCell className="text-right">{Number(c.credit_limit) > 0 ? <Money value={c.credit_limit} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right">
                    <Money value={dueMap.get(c.id) ?? 0} className={(dueMap.get(c.id) ?? 0) > 0 ? "font-semibold text-destructive" : "text-muted-foreground"} />
                  </TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {s.isSO && c.assigned_so === s.userId && c.status === "active" && (
                      <Button asChild variant="ghost" size="icon" aria-label="New order">
                        <Link to="/orders/new" search={{ chemist: c.id }}><ShoppingCart /></Link>
                      </Button>
                    )}
                    {(s.isAdmin || c.assigned_so === s.userId) && (
                      <Button variant="ghost" size="icon" onClick={() => setEdit(c as never)} aria-label="Edit">
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
      {edit && <PartyDialog kind="chemist" initial={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
