import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ClipboardList, Eye, Paperclip } from "lucide-react";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { PageHeader, Section, StatusBadge, EmptyState, Money } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/lib/session";
import { formatDate, formatDateTime, inDateRange } from "@/lib/format";
export const Route = createFileRoute("/_authenticated/deposits/")({
  head: () => ({ meta: [{ title: "Deposits — BIORY Corporation" }] }),
  component: DepositsPage,
});

function DepositsPage() {
  const s = useSession();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(s.isFinance ? "SUBMITTED" : "");
  const { from, to, setFrom, setTo, reset } = useListRange();
  const { data = [], isLoading } = useQuery({
    queryKey: ["deposits", status],
    queryFn: async () => {
      let q = api.from("deposits").select("*, profiles!deposits_so_id_fkey(full_name, so_code)").order("created_at", { ascending: false }).limit(300);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
  const rows = useMemo(() => data.filter((d) => {
    if (!inDateRange(d.created_at, from, to)) return false;
    const hay = `${d.deposit_no} ${d.method ?? ""} ${d.transaction_id ?? ""} ${d.profiles?.full_name ?? ""}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  }), [data, q, from, to]);
  const total = rows.reduce((a, d) => a + Number(d.amount), 0);
  const page = usePagedRows(rows, `${q}|${status}|${from}|${to}`);
  return (
    <div>
      <PageHeader
        title="Company deposits"
        description={s.isFinance ? "Verify SO remittances against the bank/MFS statement before approving." : "Money you've handed to the company."}
        actions={
          <>
            {s.isSO && (
              <Button asChild variant="highlight">
                <Link to="/wallet">New deposit</Link>
              </Button>
            )}
          </>
        }
      />
      <Section
        bodyClassName="p-0"
        title={<span>{rows.length} deposits · <Money value={total} /></span>}
        actions={
          <ListToolbar query={q} onQuery={setQ} placeholder="Deposit / officer…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
            <NativeSelect leading={<ClipboardList />} value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Status">
              <option value="">All statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </NativeSelect>
            <FilterClear onClick={() => { setQ(""); setStatus(s.isFinance ? "SUBMITTED" : ""); reset(); }} />
          </ListToolbar>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No deposits here" /></div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deposit</TableHead>
                {s.isFinance && <TableHead>SO</TableHead>}
                <TableHead>Method</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.pageRows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link to="/deposits/$id" params={{ id: d.id }} className="num font-medium text-primary hover:underline">{d.deposit_no}</Link>
                    <div className="text-xs text-muted-foreground">{formatDate(d.deposit_date)}</div>
                  </TableCell>
                  {s.isFinance && <TableCell className="text-sm">{d.profiles?.full_name} <span className="num text-xs text-muted-foreground">{d.profiles?.so_code}</span></TableCell>}
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1">
                      {d.method} {d.attachment_path && <Paperclip className="size-3 text-muted-foreground" />}
                    </div>
                    <div className="num text-xs text-muted-foreground">{d.transaction_id ?? d.received_by ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(d.created_at)}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-right font-semibold"><Money value={d.amount} /></TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="icon" variant="ghost" aria-label={`View ${d.deposit_no}`} className="size-8">
                      <Link to="/deposits/$id" params={{ id: d.id }}><Eye /></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="deposits" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
    </div>
  );
}
