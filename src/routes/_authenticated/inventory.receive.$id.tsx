import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, FileDown, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { EmptyState, KeyValue, PageHeader, PageLoader, Qty, Section, StatusBadge } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadReceiveReport } from "@/lib/issue-report";
import { locationsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory/receive/$id")({
  head: () => ({ meta: [{ title: "Receive stock — BIORY Corporation" }] }),
  component: ReceiveDetailPage,
});

type IssuedLine = {
  key: string;
  productId: string;
  code: string;
  name: string;
  batch: string;
  expiry: string | null;
  qty: number;
};

function ReceiveDetailPage() {
  const { id } = Route.useParams();
  const s = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [posting, setPosting] = useState(false);
  const { data: locations = [] } = useQuery(locationsQuery);

  const { data: row, isLoading } = useQuery({
    queryKey: ["requisition", "receive", id],
    queryFn: async () => {
      const { data, error } = await api
        .from("requisitions")
        .select("id, req_no, status, so_id, issued_by, issued_at, received_at, remarks, profiles!requisitions_so_id_fkey(full_name, so_code), requisition_items(product_id, requested_qty, issued_qty, products(name, code))")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["requisition-batches", id],
    enabled: !!row,
    queryFn: async () => {
      const { data, error } = await api
        .from("requisition_batches")
        .select("id, product_id, qty, products(name, code), batches(batch_no, expiry_date)")
        .eq("requisition_id", id);
      if (error) throw error;
      return data;
    },
  });

  const { data: issuer } = useQuery({
    queryKey: ["profile", row?.issued_by],
    enabled: !!row?.issued_by,
    queryFn: async () => {
      const { data, error } = await api.from("profiles").select("full_name").eq("id", row!.issued_by).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const soLocation = locations.find((location) => location.so_id === row?.so_id);
  const { data: stock = [] } = useQuery({
    queryKey: ["stock", soLocation?.id, "receive"],
    enabled: !!soLocation?.id,
    queryFn: async () => {
      const { data, error } = await api
        .from("v_stock")
        .select("product_id, qty, days_to_expiry")
        .eq("location_id", soLocation!.id);
      if (error) throw error;
      return data;
    },
  });

  const lines = useMemo<IssuedLine[]>(() => {
    if (batches.length) {
      return batches.map((batch) => ({
        key: batch.id,
        productId: batch.product_id,
        code: batch.products?.code ?? "",
        name: batch.products?.name ?? "Product",
        batch: batch.batches?.batch_no ?? "",
        expiry: batch.batches?.expiry_date ?? null,
        qty: batch.qty,
      }));
    }
    return (row?.requisition_items ?? [])
      .filter((item) => (item.issued_qty ?? 0) > 0)
      .map((item) => ({
        key: item.product_id,
        productId: item.product_id,
        code: item.products?.code ?? "",
        name: item.products?.name ?? "Product",
        batch: "",
        expiry: null,
        qty: item.issued_qty ?? item.requested_qty,
      }));
  }, [batches, row]);

  const onHand = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of stock) {
      if (item.days_to_expiry != null && item.days_to_expiry <= 0) continue;
      totals.set(item.product_id, (totals.get(item.product_id) ?? 0) + (item.qty ?? 0));
    }
    return totals;
  }, [stock]);

  if (isLoading) return <PageLoader />;
  if (!row || !["ISSUED", "RECEIVED"].includes(row.status)) {
    return (
      <div>
        <PageHeader title="Receive stock" description="This challan is not waiting to be received." />
        <Button asChild variant="outline"><Link to="/inventory/receive"><ArrowLeft /> Back</Link></Button>
      </div>
    );
  }

  const pending = row.status === "ISSUED";
  const mine = row.so_id === s.userId;
  const canReceive = pending && (mine || s.isAdmin);
  const allChecked = lines.length > 0 && lines.every((line) => checked[line.key]);
  const officer = [row.profiles?.full_name, row.profiles?.so_code].filter(Boolean).join(" · ");

  function toggle(key: string, value: boolean) {
    setChecked((cur) => ({ ...cur, [key]: value }));
  }

  async function receive() {
    if (!allChecked) {
      toast.error("Check every issued line before receiving");
      return;
    }
    setPosting(true);
    const { error } = await api.rpc("receive_requisition", { p_id: row!.id });
    setPosting(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Received into Sales Officer stock");
    qc.invalidateQueries({ queryKey: ["requisitions"] });
    qc.invalidateQueries({ queryKey: ["requisition"] });
    qc.invalidateQueries({ queryKey: ["stock"] });
    qc.invalidateQueries({ queryKey: ["movements"] });
    void navigate({ to: "/inventory/receive" });
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={row.req_no}
        description="Check the issued lines, then receive them into the Sales Officer's stock."
        actions={
          <div className="flex flex-wrap gap-2">
            {row.status === "RECEIVED" && (
              <Button variant="outline" onClick={() => void downloadReceiveReport(row.id).catch((e) => toast.error(errorMessage(e)))}>
                <FileDown /> Receive report
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/inventory/receive"><ArrowLeft /> Back</Link>
            </Button>
          </div>
        }
      />
      <Section title="Challan">
        <KeyValue
          items={[
            ["Date", formatDate(row.issued_at ?? row.received_at)],
            ["Issued by", issuer?.full_name || "—"],
            ["Requested by", officer || "—"],
            ["Status", pending ? <StatusBadge status="PENDING_APPROVAL" label="Pending" /> : <StatusBadge status="RECEIVED" label="Received" />],
          ]}
        />
      </Section>
      <Section
        title="Issued items"
        actions={canReceive ? (
          <Button disabled={!allChecked || posting} onClick={() => void receive()}>
            <PackageCheck /> {posting ? "Receiving…" : "Receive"}
          </Button>
        ) : undefined}
      >
        {lines.length === 0 ? (
          <EmptyState title="No issued lines" description="This challan has no issued products to receive." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {canReceive && (
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Check all issued lines"
                      checked={allChecked}
                      onChange={(e) => {
                        const next: Record<string, boolean> = {};
                        if (e.target.checked) for (const line of lines) next[line.key] = true;
                        setChecked(next);
                      }}
                    />
                  </TableHead>
                )}
                <TableHead>Code</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Issued qty</TableHead>
                <TableHead className="text-right">Current stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.key}>
                  {canReceive && (
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Check ${line.name}`}
                        checked={!!checked[line.key]}
                        onChange={(e) => toggle(line.key, e.target.checked)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="num">{line.code || "—"}</TableCell>
                  <TableCell className="font-medium">{line.name}</TableCell>
                  <TableCell className="num">{line.batch || "—"}</TableCell>
                  <TableCell>{line.expiry ? formatDate(line.expiry) : "—"}</TableCell>
                  <TableCell className="text-right"><Qty value={line.qty} /></TableCell>
                  <TableCell className="text-right"><Qty value={onHand.get(line.productId) ?? 0} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
