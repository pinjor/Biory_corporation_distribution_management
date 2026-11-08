import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, ClipboardList, Download, Eye, FileDown, PackageCheck, Pencil, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ConfirmDelete } from "@/components/app/confirm-delete";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { NativeSelect } from "@/components/app/select-native";
import { EmptyState, PageHeader, Qty, StatusBadge } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadIssueReport, downloadReceiveReport } from "@/lib/issue-report";
import { useSession } from "@/lib/session";
import { errorMessage, formatDate, inDateRange } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/requisitions/")({
  head: () => ({ meta: [{ title: "Requisitions — BIORY Corporation" }] }),
  component: RequisitionsPage,
});

type Item = { id: string; requested_qty: number; approved_qty: number | null; issued_qty: number | null };
type Row = {
  id: string;
  req_no: string;
  status: string;
  so_id: string;
  created_at: string;
  profiles?: { full_name?: string | null; so_code?: string | null } | null;
  requisition_items: Item[];
};

function RequisitionsPage() {
  const s = useSession();
  const qc = useQueryClient();
  const [remove, setRemove] = useState<Row | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { from, to, setFrom, setTo, reset } = useListRange();
  const { data = [], isLoading } = useQuery({
    queryKey: ["requisitions", "list"],
    queryFn: async () => {
      const { data, error } = await api
        .from("requisitions")
        .select("id, req_no, status, so_id, created_at, profiles!requisitions_so_id_fkey(full_name, so_code), requisition_items(id, requested_qty, approved_qty, issued_qty)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const rows = useMemo(() => data.filter((row) => {
    if (status && row.status !== status) return false;
    if (!inDateRange(row.created_at, from, to)) return false;
    const hay = `${row.req_no} ${row.profiles?.full_name ?? ""} ${row.profiles?.so_code ?? ""}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  }), [data, q, status, from, to]);
  const page = usePagedRows(rows, `${q}|${status}|${from}|${to}`);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["requisitions"] });
    qc.invalidateQueries({ queryKey: ["stock"] });
  };

  async function approve(row: Row) {
    const { error } = await api.rpc("decide_requisition", {
      p_id: row.id,
      p_items: row.requisition_items.map((item) => ({ item_id: item.id, approved_qty: item.requested_qty })),
      p_reject: false,
      p_note: "",
    });
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Approved");
    refresh();
  }

  async function issue(row: Row) {
    const { error } = await api.rpc("issue_requisition", { p_id: row.id });
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Issued from company stock");
    refresh();
  }

  async function receive(row: Row) {
    const { error } = await api.rpc("receive_requisition", { p_id: row.id });
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Received into Sales Officer stock");
    refresh();
  }

  return (
    <div>
      <PageHeader
        title="Requisitions"
        description="Sales Officers request stock from the central warehouse. Edit and delete stay open until the request is approved, rejected, or issued."
        actions={
          (s.isSO || s.isWarehouse) ? (
            <Button asChild>
              <Link to="/requisitions/new"><Plus /> New requisition</Link>
            </Button>
          ) : undefined
        }
      />
      <section className="surface-card overflow-hidden">
        <header className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-4 text-primary" />
            <h2 className="text-base font-semibold">{rows.length} requisitions</h2>
          </div>
          <ListToolbar query={q} onQuery={setQ} placeholder="Requisition / officer…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
            <NativeSelect leading={<ClipboardList />} value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-44 shrink-0" aria-label="Status">
              <option value="">All statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="PARTIALLY_APPROVED">Partially approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="ISSUED">Issued</option>
              <option value="RECEIVED">Received</option>
              <option value="CANCELLED">Cancelled</option>
            </NativeSelect>
            <FilterClear onClick={() => { setQ(""); setStatus(""); reset(); }} />
          </ListToolbar>
        </header>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No requisitions yet" description="A new request waits here until it is approved and issued." /></div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requisition</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Requisition date</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.pageRows.map((row) => {
                  const qty = row.requisition_items.reduce((sum, item) => sum + item.requested_qty, 0);
                  const editable = row.status === "SUBMITTED" || row.status === "DRAFT";
                  const mine = row.so_id === s.userId;
                  const canEdit = editable && (s.isWarehouse || (s.isSO && mine));
                  const canDelete = editable && (s.isAdmin || (s.isSO && mine));
                  const canReceive = s.isSO && mine && row.status === "ISSUED";
                  const canApprove = s.isWarehouse && row.status === "SUBMITTED";
                  const canIssue = s.isWarehouse && ["SUBMITTED", "APPROVED", "PARTIALLY_APPROVED"].includes(row.status);
                  const canReport = s.isWarehouse && ["ISSUED", "RECEIVED"].includes(row.status);
                  const canReceiveReport = row.status === "RECEIVED" && (s.isWarehouse || (s.isSO && mine));
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link to="/requisitions/$id" params={{ id: row.id }} className="num font-semibold hover:text-primary hover:underline">{row.req_no}</Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.profiles?.full_name || "—"}
                        {row.profiles?.so_code && <div className="num text-xs text-muted-foreground">{row.profiles.so_code}</div>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(row.created_at)}</TableCell>
                      <TableCell className="text-right"><Qty value={qty} /></TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button asChild size="icon" variant="ghost" aria-label={`View ${row.req_no}`} className="size-8">
                          <Link to="/requisitions/$id" params={{ id: row.id }}><Eye /></Link>
                        </Button>
                        {canEdit && (
                          <Button asChild size="icon" variant="ghost" aria-label={`Edit ${row.req_no}`} className="size-8">
                            <Link to="/requisitions/new" search={{ edit: row.id }}><Pencil /></Link>
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="icon" variant="ghost" aria-label={`Delete ${row.req_no}`} className="size-8" onClick={() => setRemove(row)}>
                            <Trash2 />
                          </Button>
                        )}
                        {canReceive && (
                          <Button size="icon" variant="ghost" aria-label={`Receive ${row.req_no}`} className="size-8" onClick={() => void receive(row)}>
                            <PackageCheck />
                          </Button>
                        )}
                        {canApprove && (
                          <Button size="icon" variant="ghost" aria-label={`Approve ${row.req_no}`} className="size-8" onClick={() => void approve(row)}>
                            <Check />
                          </Button>
                        )}
                        {canIssue && (
                          <Button size="icon" variant="ghost" aria-label={`Issue ${row.req_no}`} className="size-8" onClick={() => void issue(row)}>
                            <Truck />
                          </Button>
                        )}
                        {canReport && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Issue report ${row.req_no}`}
                            className="size-8"
                            onClick={() => void downloadIssueReport(row.id).catch((e) => toast.error(errorMessage(e)))}
                          >
                            <Download />
                          </Button>
                        )}
                        {canReceiveReport && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Receive report ${row.req_no}`}
                            className="size-8"
                            onClick={() => void downloadReceiveReport(row.id).catch((e) => toast.error(errorMessage(e)))}
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
            <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="requisitions" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </section>
      {remove && (
        <ConfirmDelete
          title={`Delete ${remove.req_no}?`}
          note="This cancels the requisition. It can only be deleted before it is approved, rejected, or issued."
          onClose={() => setRemove(null)}
          run={async () => {
            const { error } = await api.rpc("cancel_requisition", { p_id: remove.id });
            if (error) throw error;
            refresh();
          }}
        />
      )}
    </div>
  );
}
