import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import {
  PageHeader,
  Section,
  StatusBadge,
  KeyValue,
  PageLoader,
  Qty,
  Field,
} from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/lib/session";
import { errorMessage, formatDateTime } from "@/lib/format";
import { locationsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/requisitions/$id")({
  head: () => ({ meta: [{ title: "Requisition — BIORY Corporation" }] }),
  component: RequisitionDetail,
});

function RequisitionDetail() {
  const { id } = Route.useParams();
  const s = useSession();
  const qc = useQueryClient();
  const { data: locations = [] } = useQuery(locationsQuery);
  const central = locations.find((l) => l.kind === "central");
  const { data: r, isLoading } = useQuery({
    queryKey: ["requisition", id],
    queryFn: async () => {
      const { data, error } = await api
        .from("requisitions")
        .select(
          "*, profiles!requisitions_so_id_fkey(full_name, so_code), requisition_items(*, products(name, code, kind))",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const { data: centralStock = [] } = useQuery({
    queryKey: ["central-available", central?.id],
    enabled: !!central && s.isWarehouse,
    queryFn: async () => {
      const { data, error } = await api
        .from("v_stock")
        .select("product_id, qty, days_to_expiry")
        .eq("location_id", central!.id);
      if (error) throw error;
      return data;
    },
  });
  const { data: moves = [] } = useQuery({
    queryKey: ["req-moves", id],
    enabled: !!r && ["ISSUED", "RECEIVED"].includes(r.status),
    queryFn: async () => {
      const { data, error } = await api
        .from("stock_movements")
        .select("*, products(name), batches(batch_no, expiry_date)")
        .eq("reference_id", id)
        .in("movement_type", ["REQUISITION_ISSUE", "REQUISITION_RECEIPT", "CENTRAL_TO_SO_TRANSFER"]);
      if (error) throw error;
      return data;
    },
  });
  const avail = new Map<string, number>();
  for (const x of centralStock)
    if ((x.days_to_expiry ?? 0) > 0)
      avail.set(x.product_id!, (avail.get(x.product_id!) ?? 0) + (x.qty ?? 0));

  const [approved, setApproved] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  useEffect(() => {
    if (r)
      setApproved(
        Object.fromEntries(
          r.requisition_items.map((i) => [i.id, i.approved_qty ?? i.requested_qty]),
        ),
      );
  }, [r]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["requisition", id] });
    qc.invalidateQueries({ queryKey: ["requisitions"] });
    qc.invalidateQueries({ queryKey: ["stock"] });
  };
  const decide = useMutation({
    mutationFn: async (reject: boolean) => {
      const { error } = await api.rpc("decide_requisition", {
        p_id: id,
        p_items: Object.entries(approved).map(([item_id, approved_qty]) => ({
          item_id,
          approved_qty,
        })),
        p_reject: reject,
        p_note: note,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Decision saved");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const issue = useMutation({
    mutationFn: async () => {
      const { error } = await api.rpc("issue_requisition", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Issued. Company stock is down until the chemist or doctor confirms receipt.");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const receive = useMutation({
    mutationFn: async () => {
      const { error } = await api.rpc("receive_requisition", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        r?.party_kind === "doctor" ? "Doctor received the stock" : r?.party_kind === "chemist" ? "Chemist shop received the stock" : "Receipt confirmed",
      );
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await api.rpc("cancel_requisition", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Requisition cancelled");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const { data: partyName } = useQuery({
    queryKey: ["req-party", r?.party_kind, r?.party_id],
    enabled: !!r?.party_id,
    queryFn: async () => {
      if (r?.party_kind === "doctor") {
        const { data, error } = await api.from("doctors").select("name").eq("id", r.party_id).maybeSingle();
        if (error) throw error;
        return data?.name as string | undefined;
      }
      const { data, error } = await api.from("chemists").select("business_name").eq("id", r!.party_id).maybeSingle();
      if (error) throw error;
      return data?.business_name as string | undefined;
    },
  });

  if (isLoading || !r) return <PageLoader />;
  const canDecide = s.isWarehouse && r.status === "SUBMITTED";
  const canIssue = s.isWarehouse && ["SUBMITTED", "APPROVED", "PARTIALLY_APPROVED"].includes(r.status);
  const canReceive = (r.so_id === s.userId || s.isAdmin) && r.status === "ISSUED";
  const partyLabel = r.party_kind === "doctor" ? "Doctor" : r.party_kind === "chemist" ? "Chemist shop" : "Sales Officer";
  const canCancel = (r.so_id === s.userId || s.isAdmin) && r.status === "SUBMITTED";

  return (
    <div>
      <PageHeader
        eyebrow={
          <Link to="/requisitions" className="hover:underline">
            Requisitions
          </Link>
        }
        title={<span className="num">{r.req_no}</span>}
        actions={
          <>
            <StatusBadge status={r.status} />
            {canCancel && (
              <Button variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                Cancel
              </Button>
            )}
            {canIssue && (
              <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
                {issue.isPending ? "Issuing…" : "Issue stock"}
              </Button>
            )}
            {canReceive && (
              <Button
                variant="success"
                onClick={() => receive.mutate()}
                disabled={receive.isPending}
              >
                {r.party_kind === "doctor" ? "Confirm doctor received" : r.party_kind === "chemist" ? "Confirm chemist received" : "Confirm received"}
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Section title="Items" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Requested</TableHead>
                {canDecide && <TableHead className="text-right">Central avail.</TableHead>}
                <TableHead className="text-right">Approved</TableHead>
                <TableHead className="text-right">Issued</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.requisition_items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <div className="font-medium">{i.products?.name}</div>
                    <div className="num text-xs text-muted-foreground">
                      {i.products?.code} · {i.products?.kind}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Qty value={i.requested_qty} />
                  </TableCell>
                  {canDecide && (
                    <TableCell className="text-right text-muted-foreground">
                      <Qty value={avail.get(i.product_id) ?? 0} />
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    {canDecide ? (
                      <Input
                        type="number"
                        min={0}
                        max={i.requested_qty}
                        className="num ml-auto w-24 text-right"
                        value={approved[i.id] ?? 0}
                        onChange={(e) =>
                          setApproved({
                            ...approved,
                            [i.id]: Math.max(
                              0,
                              Math.min(i.requested_qty, Math.floor(Number(e.target.value) || 0)),
                            ),
                          })
                        }
                      />
                    ) : (
                      <Qty value={i.approved_qty ?? "—"} />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Qty value={i.issued_qty} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
        <div className="flex flex-col gap-6">
          <Section title="Details">
            <KeyValue
              items={[
                [partyLabel, partyName || (r.party_kind ? "—" : `${r.profiles?.full_name ?? ""}`)],
                ["Sales Officer", `${r.profiles?.full_name ?? ""} ${r.profiles?.so_code ?? ""}`],
                ["Submitted", formatDateTime(r.created_at)],
                ["Decided", formatDateTime(r.decided_at)],
                ["Issued", formatDateTime(r.issued_at)],
                ["Received", formatDateTime(r.received_at)],
                ["SO remarks", r.remarks || "—"],
                ["Decision note", r.decision_note || "—"],
              ]}
            />
          </Section>
          {canDecide && (
            <Section title="Decision">
              <Field label="Note (required to reject)">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="mt-4 flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => decide.mutate(false)}
                  disabled={decide.isPending}
                >
                  Approve quantities
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => decide.mutate(true)}
                  disabled={decide.isPending || !note.trim()}
                >
                  Reject
                </Button>
              </div>
            </Section>
          )}
        </div>
      </div>
      {moves.length > 0 && (
        <Section title="Batches issued (FEFO)" className="mt-6" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moves.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.products?.name}</TableCell>
                  <TableCell className="num text-xs">{m.batches?.batch_no}</TableCell>
                  <TableCell className="text-xs">{m.batches?.expiry_date}</TableCell>
                  <TableCell className="text-right">
                    <Qty value={m.qty} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}
    </div>
  );
}
