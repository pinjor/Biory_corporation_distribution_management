import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, StatusBadge, EmptyState } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/lib/session";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/requisitions/")({
  head: () => ({ meta: [{ title: "Requisitions — BIORY Corporation" }] }),
  component: RequisitionsPage,
});

const STATUSES = ["SUBMITTED", "APPROVED", "PARTIALLY_APPROVED", "ISSUED", "RECEIVED", "REJECTED", "CANCELLED"];

function RequisitionsPage() {
  const s = useSession();
  const [status, setStatus] = useState(s.isWarehouse ? "SUBMITTED" : "");
  const { data = [], isLoading } = useQuery({
    queryKey: ["requisitions", status],
    queryFn: async () => {
      let q = supabase
        .from("requisitions")
        .select("*, profiles!requisitions_so_id_fkey(full_name, so_code), requisition_items(requested_qty, approved_qty)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
  return (
    <div>
      <PageHeader
        title="Requisitions"
        description="SO requests for saleable and promotional stock. Warehouse approves (fully or partly) and issues by FEFO."
        actions={
          s.isSO && (
            <Button asChild>
              <Link to="/requisitions/new"><Plus /> New requisition</Link>
            </Button>
          )
        }
      />
      <Section
        bodyClassName="p-0"
        title={`${data.length} requisitions`}
        actions={
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-48">
            <option value="">All statuses</option>
            {STATUSES.map((x) => <option key={x} value={x}>{x.replace(/_/g, " ").toLowerCase()}</option>)}
          </NativeSelect>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-5"><EmptyState title="No requisitions" description={s.isSO ? "Request stock from the central warehouse." : undefined} /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Sales Officer</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Requested</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id} className="cursor-pointer">
                  <TableCell>
                    <Link to="/requisitions/$id" params={{ id: r.id }} className="num font-medium text-primary hover:underline">
                      {r.req_no}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {r.profiles?.full_name} <span className="num text-xs text-muted-foreground">{r.profiles?.so_code}</span>
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell className="num text-right">{r.requisition_items.length}</TableCell>
                  <TableCell className="num text-right">{r.requisition_items.reduce((a, i) => a + i.requested_qty, 0)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
