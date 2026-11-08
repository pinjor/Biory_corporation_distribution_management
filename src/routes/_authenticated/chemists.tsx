import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { MapPin, Pencil, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { api } from "@/lib/api/client";
import { ConfirmDelete } from "@/components/app/confirm-delete";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { PageHeader, Section, StatusBadge, EmptyState, Money } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { PartyDialog } from "@/components/app/party-form";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { territoriesQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { inDateRange } from "@/lib/format";
export const Route = createFileRoute("/_authenticated/chemists")({
  validateSearch: (s: Record<string, unknown>): { name?: string } =>
    typeof s["name"] === "string" && s["name"].trim() ? { name: s["name"].trim() } : {},
  head: () => ({ meta: [{ title: "Chemists — BIORY Corporation" }] }),
  component: ChemistsPage,
});

function ChemistsPage() {
  const s = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { data: territories = [] } = useQuery(territoriesQuery);
  const [q, setQ] = useState("");
  const [territory, setTerritory] = useState("");
  const { from, to, setFrom, setTo, reset } = useListRange();
  const [edit, setEdit] = useState<Record<string, string | number | null> | null | "new">(null);
  const [remove, setRemove] = useState<{ id: string; business_name: string } | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["chemists"],
    queryFn: async () => {
      const { data, error } = await api
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
      const { data, error } = await api.from("orders").select("chemist_id, due").gt("due", 0).neq("status", "CANCELLED");
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
      inDateRange(c.created_at, from, to) &&
      (!territory || c.territory_id === territory) &&
      (!q || `${c.code} ${c.business_name} ${c.owner_name ?? ""} ${c.mobile ?? ""} ${c.upazila ?? ""}`.toLowerCase().includes(q.toLowerCase())),
  );
  const page = usePagedRows(rows, `${q}|${territory}|${from}|${to}`);

  useEffect(() => {
    if (!search.name) return;
    setEdit({ business_name: search.name });
    void navigate({ to: "/chemists", search: {}, replace: true });
  }, [search.name, navigate]);

  return (
    <div>
      <PageHeader
        title="Chemists"
        description="Chemist shops."
        actions={
          <>
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
          <ListToolbar query={q} onQuery={setQ} placeholder="Name, mobile, area…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
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
          <div className="p-5">
            <EmptyState title="No chemists yet" description="Add the pharmacies you sell to." />
          </div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chemist</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Area</TableHead>
                <TableHead className="text-right">Credit limit</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.pageRows.map((c) => (
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
                  <TableCell className="text-right">{Number(c.credit_limit) > 0 ? <Money value={c.credit_limit} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right">
                    <Money value={dueMap.get(c.id) ?? 0} className={(dueMap.get(c.id) ?? 0) > 0 ? "font-semibold text-destructive" : "text-muted-foreground"} />
                  </TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {((s.isSO && c.assigned_so === s.userId) || (s.isSuper && c.assigned_so)) && c.status === "active" && (
                      <Button asChild variant="ghost" size="icon" aria-label="New order">
                        <Link to="/orders/new" search={{ chemist: c.id, so: c.assigned_so ?? undefined }}><ShoppingCart /></Link>
                      </Button>
                    )}
                    {(s.isAdmin || c.assigned_so === s.userId) && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => setEdit(c as never)} aria-label={`Edit ${c.business_name}`}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setRemove({ id: c.id, business_name: c.business_name })} aria-label={`Delete ${c.business_name}`}>
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="chemists" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
      {edit && <PartyDialog kind="chemist" initial={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {remove && (
        <ConfirmDelete
          title={`Delete ${remove.business_name}?`}
          onClose={() => setRemove(null)}
          run={async () => {
            const { error } = await api.from("chemists").delete().eq("id", remove.id);
            if (error) throw error;
            qc.invalidateQueries({ queryKey: ["chemists"] });
          }}
        />
      )}
    </div>
  );
}
