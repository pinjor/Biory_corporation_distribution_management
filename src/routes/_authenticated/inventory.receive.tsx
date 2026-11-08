import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Eye, FileDown, PackageCheck, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { NativeSelect } from "@/components/app/select-native";
import { EmptyState, PageHeader, Qty, StatusBadge } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadReceiveReport } from "@/lib/issue-report";
import { useSession } from "@/lib/session";
import { errorMessage, formatDate, inDateRange } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory/receive")({
  head: () => ({ meta: [{ title: "Receive stock — BIORY Corporation" }] }),
  component: ReceivePage,
});

type Item = { requested_qty: number; issued_qty: number | null };
type Row = {
  id: string;
  req_no: string;
  status: string;
  so_id: string;
  created_at: string;
  issued_at: string | null;
  received_at: string | null;
  profiles?: { full_name?: string | null; so_code?: string | null } | null;
  requisition_items: Item[];
};

function ReceivePage() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  if (/\/inventory\/receive\/[^/]+/.test(path)) return <Outlet />;
  return <ReceiveList />;
}

function ReceiveList() {
  const s = useSession();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const { from, to, setFrom, setTo } = useListRange();
  const { data = [], isLoading } = useQuery({
    queryKey: ["requisitions", "receive"],
    queryFn: async () => {
      const { data, error } = await api
        .from("requisitions")
        .select("id, req_no, status, so_id, created_at, issued_at, received_at, profiles!requisitions_so_id_fkey(full_name, so_code), requisition_items(requested_qty, issued_qty)")
        .in("status", ["ISSUED", "RECEIVED"])
        .order("issued_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const rows = useMemo(() => data.filter((row) => {
    if (status && row.status !== status) return false;
    if (!inDateRange(row.issued_at ?? row.created_at, from, to)) return false;
    const hay = `${row.req_no} ${row.profiles?.full_name ?? ""} ${row.profiles?.so_code ?? ""}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  }), [data, q, status, from, to]);
  const page = usePagedRows(rows, `${q}|${status}|${from}|${to}`);

  return (
    <div>
      <PageHeader
        title="Receive stock"
        description="Challans issued from the central warehouse. Open a pending challan, check the issued lines, then receive them into the Sales Officer's stock."
      />
      <section className="surface-card overflow-hidden">
        <header className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <PackagePlus className="size-4 text-primary" />
            <h2 className="text-base font-semibold">{rows.length} challans</h2>
          </div>
          <ListToolbar query={q} onQuery={setQ} placeholder="Chalan / officer…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Status">
              <option value="">All statuses</option>
              <option value="ISSUED">Pending</option>
              <option value="RECEIVED">Received</option>
            </NativeSelect>
          </ListToolbar>
        </header>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No challans to receive" description="An issued requisition from the central warehouse shows up here until it is received." />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chalan</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Issue date</TableHead>
                  <TableHead>Received date</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.pageRows.map((row) => {
                  const qty = row.requisition_items.reduce((sum, item) => sum + (item.issued_qty ?? item.requested_qty), 0);
                  const mine = row.so_id === s.userId;
                  const pending = row.status === "ISSUED";
                  const canReceive = pending && (mine || s.isAdmin);
                  const canReport = row.status === "RECEIVED" && (s.isWarehouse || mine);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link to="/inventory/receive/$id" params={{ id: row.id }} className="num font-semibold hover:text-primary hover:underline">{row.req_no}</Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.profiles?.full_name || "—"}
                        {row.profiles?.so_code && <div className="num text-xs text-muted-foreground">{row.profiles.so_code}</div>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(row.issued_at ?? row.created_at)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{row.received_at ? formatDate(row.received_at) : "—"}</TableCell>
                      <TableCell className="text-right"><Qty value={qty} /></TableCell>
                      <TableCell>
                        {pending
                          ? <StatusBadge status="PENDING_APPROVAL" label="Pending" />
                          : <StatusBadge status="RECEIVED" label="Received" />}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button asChild size="icon" variant="ghost" aria-label={`View ${row.req_no}`} className="size-8">
                          <Link to="/requisitions/$id" params={{ id: row.id }}><Eye /></Link>
                        </Button>
                        {canReceive && (
                          <Button asChild size="icon" variant="ghost" aria-label={`Receive ${row.req_no}`} className="size-8">
                            <Link to="/inventory/receive/$id" params={{ id: row.id }}><PackageCheck /></Link>
                          </Button>
                        )}
                        {canReport && (
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
            <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="challans" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </section>
    </div>
  );
}
