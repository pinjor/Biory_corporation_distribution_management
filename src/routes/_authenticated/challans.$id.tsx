import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { KeyValue, PageHeader, PageLoader, Qty, Section } from "@/components/app/page";
import { CHALLAN_KIND_LABEL, ChallanStatus, type ChallanKind } from "@/components/app/challans";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { locationsQuery, profilesQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, formatDate, formatDateTime, humanize } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/challans/$id")({
  head: () => ({ meta: [{ title: "Challan — BIORY Corporation" }] }),
  component: ChallanDetail,
});

function ChallanDetail() {
  const { id } = Route.useParams();
  const s = useSession();
  const qc = useQueryClient();
  const { data: locations = [] } = useQuery(locationsQuery);
  const { data: profiles = [] } = useQuery({ ...profilesQuery, enabled: s.isStaff });
  const lmap = new Map(locations.map((l) => [l.id, l.name]));
  const umap = new Map(profiles.map((p) => [p.id, p.full_name]));
  const { data: c, isLoading } = useQuery({
    queryKey: ["challan", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_challans")
        .select(
          "*, profiles!stock_challans_so_id_fkey(full_name, so_code), requisitions(req_no), stock_challan_items(*, products(name, code, pack_size, uom), batches(batch_no, expiry_date))",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const receive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("receive_challan", { p_challan: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Challan received", { description: "The stock is now in the SO's inventory." });
      for (const k of [
        "challan",
        "challans",
        "stock",
        "requisition",
        "requisitions",
        "my-available-stock",
      ])
        qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !c) return <PageLoader />;
  const kind = c.kind as ChallanKind;
  const units = c.stock_challan_items.reduce((a, i) => a + i.qty, 0);
  const canReceive =
    kind === "ISSUE" && c.status === "IN_TRANSIT" && (c.so_id === s.userId || s.isAdmin);

  return (
    <div>
      <PageHeader
        eyebrow={CHALLAN_KIND_LABEL[kind]}
        title={<span className="num">{c.challan_no}</span>}
        description={
          kind === "ISSUE"
            ? c.status === "IN_TRANSIT"
              ? "Issued from the central warehouse and on its way. Stock is added to the SO's inventory when the challan is received."
              : "Received — the stock is in the SO's inventory."
            : undefined
        }
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer /> Print
            </Button>
            {canReceive && (
              <Button
                variant="success"
                onClick={() => receive.mutate()}
                disabled={receive.isPending}
              >
                <PackageCheck />{" "}
                {receive.isPending
                  ? "Receiving…"
                  : c.so_id === s.userId
                    ? "Receive challan"
                    : "Receive for SO"}
              </Button>
            )}
          </>
        }
      />
      <div className="print-sheet flex flex-col gap-6">
        <Section title="Challan details">
          <KeyValue
            items={[
              ["Status", <ChallanStatus key="s" status={c.status} />],
              ["Date", formatDate(c.challan_date)],
              [
                "From",
                c.from_location
                  ? (lmap.get(c.from_location) ?? "—")
                  : kind === "OPENING"
                    ? "Opening balance"
                    : "Supplier",
              ],
              ["To", lmap.get(c.to_location ?? "") ?? "—"],
              ...(c.profiles
                ? ([["Sales Officer", `${c.profiles.full_name} ${c.profiles.so_code ?? ""}`]] as [
                    string,
                    string,
                  ][])
                : []),
              ...(c.requisition_id
                ? ([
                    [
                      "Requisition",
                      <Link
                        key="r"
                        to="/requisitions/$id"
                        params={{ id: c.requisition_id }}
                        className="num text-primary hover:underline"
                      >
                        {c.requisitions?.req_no ?? "Open"}
                      </Link>,
                    ],
                  ] as [string, React.ReactNode][])
                : []),
              ["Reference", c.reference || "—"],
              ["Remarks / reason", c.remarks || "—"],
              [
                "Posted",
                `${formatDateTime(c.created_at)}${c.created_by && umap.get(c.created_by) ? ` by ${umap.get(c.created_by)}` : ""}`,
              ],
              ...(c.received_at
                ? ([
                    [
                      "Received",
                      `${formatDateTime(c.received_at)}${c.received_by && umap.get(c.received_by) ? ` by ${umap.get(c.received_by)}` : ""}`,
                    ],
                  ] as [string, string][])
                : []),
            ]}
          />
        </Section>
        <Section
          title={`${c.stock_challan_items.length} line(s) · ${units} units`}
          bodyClassName="p-0"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Pack · UOM</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                {kind === "ADJUSTMENT" && <TableHead>Type</TableHead>}
                <TableHead className="text-right">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.stock_challan_items.map((it, i) => (
                <TableRow key={it.id}>
                  <TableCell className="num text-xs">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{it.products?.name}</div>
                    <div className="num text-xs text-muted-foreground">{it.products?.code}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {[it.products?.pack_size, it.products?.uom].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="num text-xs">{it.batches?.batch_no}</TableCell>
                  <TableCell className="text-xs">
                    {formatDate(it.batches?.expiry_date ?? null)}
                  </TableCell>
                  {kind === "ADJUSTMENT" && (
                    <TableCell className="text-xs">{humanize(it.movement_type)}</TableCell>
                  )}
                  <TableCell className="text-right font-semibold">
                    <Qty value={it.qty} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>
    </div>
  );
}
