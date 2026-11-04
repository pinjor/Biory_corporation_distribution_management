import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, StatusBadge, EmptyState, Money } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/deposits/")({
  head: () => ({ meta: [{ title: "Deposits — BIORY Corporation" }] }),
  component: DepositsPage,
});

function DepositsPage() {
  const s = useSession();
  const [status, setStatus] = useState(s.isFinance ? "SUBMITTED" : "");
  const { data = [], isLoading } = useQuery({
    queryKey: ["deposits", status],
    queryFn: async () => {
      let q = supabase.from("deposits").select("*, profiles!deposits_so_id_fkey(full_name, so_code)").order("created_at", { ascending: false }).limit(300);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
  const total = data.reduce((a, d) => a + Number(d.amount), 0);
  return (
    <div>
      <PageHeader
        title="Company deposits"
        description={s.isFinance ? "Verify SO remittances against the bank/MFS statement before approving." : "Money you've handed to the company."}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv("deposits.csv", [
                  ["deposit_no", "so", "amount", "method", "provider", "txn_id", "date", "status", "receipt_no", "reviewed_at"],
                  ...data.map((d) => [d.deposit_no, d.profiles?.full_name, d.amount, d.method, d.provider, d.transaction_id, d.deposit_date, d.status, d.receipt_no, d.reviewed_at]),
                ])
              }
            >
              Export CSV
            </Button>
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
        title={<span>{data.length} deposits · <Money value={total} /></span>}
        actions={
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-40">
            <option value="">All statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </NativeSelect>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-5"><EmptyState title="No deposits here" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deposit</TableHead>
                {s.isFinance && <TableHead>SO</TableHead>}
                <TableHead>Method</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((d) => (
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
