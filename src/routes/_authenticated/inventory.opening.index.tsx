import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, FileDown, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { NativeSelect } from "@/components/app/select-native";
import { EmptyState, PageHeader, Qty, StatusBadge } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadOpeningReport } from "@/lib/issue-report";
import { useSession } from "@/lib/session";
import { errorMessage, formatDate, inDateRange } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory/opening/")({
  head: () => ({ meta: [{ title: "Opening stock — BIORY Corporation" }] }),
  component: OpeningListPage,
});

type Item = { qty: number };
type Row = {
  id: string;
  entry_no: string;
  status: string;
  entry_date: string;
  created_at: string;
  profiles?: { full_name?: string | null } | null;
  opening_entry_items: Item[];
};

function OpeningListPage() {
  const s = useSession();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { from, to, setFrom, setTo, reset } = useListRange();
  const { data = [], isLoading } = useQuery({
    queryKey: ["opening-entries"],
    enabled: s.isWarehouse,
    queryFn: async () => {
      const { data, error } = await api
        .from("opening_entries")
        .select("id, entry_no, status, entry_date, created_at, profiles!opening_entries_created_by_fkey(full_name), opening_entry_items(qty)")
        .neq("status", "CANCELLED")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const rows = useMemo(() => data.filter((row) => {
    if (status && row.status !== status) return false;
    if (!inDateRange(row.entry_date, from, to)) return false;
    const hay = `${row.entry_no} ${row.profiles?.full_name ?? ""}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  }), [data, q, status, from, to]);
  const page = usePagedRows(rows, `${q}|${status}|${from}|${to}`);

  if (!s.isWarehouse) {
    return (
      <PageHeader
        title="Opening stock"
        description="Only Warehouse Admins and Admins can post opening stock."
      />
    );
  }

  async function remove(row: Row) {
    if (!window.confirm(`Delete pending opening entry ${row.entry_no}?`)) return;
    const { error } = await api.rpc("cancel_opening_entry", { p_id: row.id });
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Opening entry deleted");
    qc.invalidateQueries({ queryKey: ["opening-entries"] });
  }

  async function approve(row: Row) {
    if (!window.confirm(`Approve ${row.entry_no}? This adds the quantities to the central warehouse.`)) return;
    const { error } = await api.rpc("approve_opening_entry", { p_id: row.id });
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Approved. Central warehouse stock increased.");
    qc.invalidateQueries({ queryKey: ["opening-entries"] });
    qc.invalidateQueries({ queryKey: ["stock"] });
    qc.invalidateQueries({ queryKey: ["movements"] });
  }

  return (
    <div>
      <PageHeader
        title="Opening stock"
        description="A saved entry stays pending and does not change stock. Approve it to add the quantities to the central warehouse."
        actions={
          <Button asChild>
            <Link to="/inventory/opening/new"><Plus /> New opening stock</Link>
          </Button>
        }
      />
      <section className="surface-card overflow-hidden">
        <header className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-base font-semibold">{rows.length} entries</h2>
          <ListToolbar query={q} onQuery={setQ} placeholder="Entry no…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-36 shrink-0" aria-label="Status">
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
            </NativeSelect>
            <FilterClear onClick={() => { setQ(""); setStatus(""); reset(); }} />
          </ListToolbar>
        </header>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No opening entries" description="Save an opening stock challan and it stays pending here until you approve it." />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Opening date</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.pageRows.map((row) => {
                  const qty = row.opening_entry_items.reduce((sum, item) => sum + item.qty, 0);
                  const pending = row.status === "PENDING";
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="num font-semibold">{row.entry_no}</TableCell>
                      <TableCell className="text-sm">{row.profiles?.full_name || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(row.entry_date)}</TableCell>
                      <TableCell className="text-right"><Qty value={qty} /></TableCell>
                      <TableCell>
                        {pending
                          ? <StatusBadge status="PENDING_APPROVAL" label="Pending" />
                          : <StatusBadge status="APPROVED" label="Approved" />}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {pending && (
                          <>
                            <Button asChild size="icon" variant="ghost" aria-label={`Edit ${row.entry_no}`} className="size-8">
                              <Link to="/inventory/opening/new" search={{ edit: row.id }}><Pencil /></Link>
                            </Button>
                            <Button size="icon" variant="ghost" aria-label={`Delete ${row.entry_no}`} className="size-8 text-destructive" onClick={() => void remove(row)}>
                              <Trash2 />
                            </Button>
                            <Button size="sm" className="ml-1 h-8" onClick={() => void approve(row)}>
                              <Check /> Approve
                            </Button>
                          </>
                        )}
                        {!pending && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Opening report ${row.entry_no}`}
                            className="size-8"
                            onClick={() => void downloadOpeningReport(row.id).catch((e) => toast.error(errorMessage(e)))}
                          >
                            <FileDown />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="entries" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </section>
    </div>
  );
}
