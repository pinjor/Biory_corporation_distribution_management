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
import { downloadAdjustmentReport } from "@/lib/issue-report";
import { useSession } from "@/lib/session";
import { errorMessage, formatDate, inDateRange } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory/adjust/")({
  head: () => ({ meta: [{ title: "Stock adjustment — BIORY Corporation" }] }),
  component: AdjustListPage,
});

type Item = { qty: number; movement_type: string };
type Row = {
  id: string;
  entry_no: string;
  status: string;
  entry_date: string;
  created_at: string;
  locations?: { name?: string | null } | null;
  profiles?: { full_name?: string | null } | null;
  adjustment_entry_items: Item[];
};

function netQty(items: Item[]) {
  return items.reduce((sum, item) => {
    const increase = item.movement_type === "MANUAL_ADJUSTMENT_IN" || item.movement_type === "CUSTOMER_RETURN";
    return sum + (increase ? item.qty : -item.qty);
  }, 0);
}

function AdjustListPage() {
  const s = useSession();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { from, to, setFrom, setTo, reset } = useListRange();
  const { data = [], isLoading } = useQuery({
    queryKey: ["adjustment-entries"],
    enabled: s.isWarehouse,
    queryFn: async () => {
      const { data, error } = await api
        .from("adjustment_entries")
        .select("id, entry_no, status, entry_date, created_at, locations(name), profiles!adjustment_entries_created_by_fkey(full_name), adjustment_entry_items(qty, movement_type)")
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
    const hay = `${row.entry_no} ${row.locations?.name ?? ""} ${row.profiles?.full_name ?? ""}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  }), [data, q, status, from, to]);
  const page = usePagedRows(rows, `${q}|${status}|${from}|${to}`);

  if (!s.isWarehouse) {
    return (
      <PageHeader
        title="Stock adjustment"
        description="Only Warehouse Admins and Admins can adjust stock."
      />
    );
  }

  async function remove(row: Row) {
    if (!window.confirm(`Delete pending adjustment ${row.entry_no}?`)) return;
    const { error } = await api.rpc("cancel_adjustment_entry", { p_id: row.id });
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Adjustment deleted");
    qc.invalidateQueries({ queryKey: ["adjustment-entries"] });
  }

  async function approve(row: Row) {
    if (!window.confirm(`Approve ${row.entry_no}? This will increase or decrease stock.`)) return;
    const { error } = await api.rpc("approve_adjustment_entry", { p_id: row.id });
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Approved. Stock was updated.");
    qc.invalidateQueries({ queryKey: ["adjustment-entries"] });
    qc.invalidateQueries({ queryKey: ["stock"] });
    qc.invalidateQueries({ queryKey: ["movements"] });
  }

  return (
    <div>
      <PageHeader
        title="Stock adjustment"
        description="A saved adjustment stays pending and does not change stock. Approve it to increase or decrease the store."
        actions={
          <Button asChild>
            <Link to="/inventory/adjust/new"><Plus /> New adjustment</Link>
          </Button>
        }
      />
      <section className="surface-card overflow-hidden">
        <header className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-base font-semibold">{rows.length} adjustments</h2>
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
            <EmptyState title="No adjustments" description="Save an adjustment and it stays pending here until you approve it." />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Adjustment date</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="text-right">Net qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.pageRows.map((row) => {
                  const pending = row.status === "PENDING";
                  const net = netQty(row.adjustment_entry_items);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="num font-semibold">{row.entry_no}</TableCell>
                      <TableCell className="text-sm">{row.profiles?.full_name || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(row.entry_date)}</TableCell>
                      <TableCell className="text-sm">{row.locations?.name || "—"}</TableCell>
                      <TableCell className="text-right"><Qty value={net} /></TableCell>
                      <TableCell>
                        {pending
                          ? <StatusBadge status="PENDING_APPROVAL" label="Pending" />
                          : <StatusBadge status="APPROVED" label="Approved" />}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {pending && (
                          <>
                            <Button asChild size="icon" variant="ghost" aria-label={`Edit ${row.entry_no}`} className="size-8">
                              <Link to="/inventory/adjust/new" search={{ edit: row.id }}><Pencil /></Link>
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
                            aria-label={`Adjustment report ${row.entry_no}`}
                            className="size-8"
                            onClick={() => void downloadAdjustmentReport(row.id).catch((e) => toast.error(errorMessage(e)))}
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
            <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="adjustments" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </section>
    </div>
  );
}
