import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, ExternalLink, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, StatusBadge, KeyValue, PageLoader, Money } from "@/components/app/page";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { Button } from "@/components/ui/button";
import { settingsQuery, profilesQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/deposits/$id")({
  head: () => ({ meta: [{ title: "Deposit — PharmaField" }] }),
  component: DepositDetail,
});

function DepositDetail() {
  const { id } = Route.useParams();
  const s = useSession();
  const qc = useQueryClient();
  const [reject, setReject] = useState(false);
  const { data: settings } = useQuery(settingsQuery);
  const { data: profiles = [] } = useQuery(profilesQuery);
  const { data: d, isLoading } = useQuery({
    queryKey: ["deposit", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("deposits").select("*, profiles!deposits_so_id_fkey(full_name, so_code)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["deposit", id] });
    qc.invalidateQueries({ queryKey: ["deposits"] });
    qc.invalidateQueries({ queryKey: ["wallet-summary"] });
    qc.invalidateQueries({ queryKey: ["wallet-ledger"] });
  };
  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("review_deposit", { p_id: id, p_approve: true, p_reason: "" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deposit approved — receipt issued"); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  async function openProof() {
    if (!d?.attachment_path) return;
    const { data, error } = await supabase.storage.from("deposit-proofs").createSignedUrl(d.attachment_path, 300);
    if (error) return void toast.error(errorMessage(error));
    window.open(data.signedUrl, "_blank", "noopener");
  }
  if (isLoading || !d) return <PageLoader />;
  const reviewer = profiles.find((p) => p.id === d.reviewed_by);
  const canReview = s.isFinance && d.status === "SUBMITTED" && d.so_id !== s.userId;

  return (
    <div>
      <PageHeader
        eyebrow={<Link to="/deposits" className="hover:underline">Deposits</Link>}
        title={<span className="num">{d.deposit_no}</span>}
        actions={
          <>
            <StatusBadge status={d.status} />
            {d.attachment_path && <Button variant="outline" onClick={openProof}><ExternalLink /> View proof</Button>}
            {canReview && (
              <>
                <Button variant="outline" onClick={() => setReject(true)}>Reject</Button>
                <Button variant="success" onClick={() => approve.mutate()} disabled={approve.isPending}><CheckCircle2 /> Approve</Button>
              </>
            )}
            {d.status === "APPROVED" && <Button onClick={() => window.print()}><Printer /> Print receipt</Button>}
          </>
        }
      />
      {d.status === "REJECTED" && (
        <div className="no-print mb-6 rounded-xl bg-destructive-soft p-4 text-sm text-destructive">
          Rejected: {d.rejection_reason}. The amount was returned to the SO wallet as a reversal entry.
        </div>
      )}
      {d.status !== "APPROVED" ? (
        <Section title="Submission">
          <KeyValue
            items={[
              ["Sales Officer", `${d.profiles?.full_name ?? ""} (${d.profiles?.so_code ?? ""})`],
              ["Amount", <Money key="a" value={d.amount} className="text-lg font-semibold" />],
              ["Method", d.method],
              ["Bank / MFS", d.provider || "—"],
              ["Account / reference", d.account_ref || "—"],
              ["Transaction ID", d.transaction_id || "—"],
              ["Received by", d.received_by || "—"],
              ["Deposit date", formatDate(d.deposit_date)],
              ["Submitted", formatDateTime(d.created_at)],
              ["Reviewed", d.reviewed_at ? `${formatDateTime(d.reviewed_at)} by ${reviewer?.full_name ?? ""}` : "—"],
              ["Remarks", d.remarks || "—"],
            ]}
          />
        </Section>
      ) : (
        <article className="print-sheet surface-card mx-auto max-w-2xl p-8 sm:p-10">
          <header className="flex items-start justify-between border-b pb-6">
            <div>
              <div className="font-display text-xl font-semibold">{settings?.company_name}</div>
              <div className="text-sm text-muted-foreground">{settings?.company_address}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Company collection receipt</div>
              <div className="num text-lg font-semibold">{d.receipt_no}</div>
            </div>
          </header>
          <div className="py-8 text-center">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Amount received</div>
            <Money value={d.amount} className="font-display text-4xl font-semibold text-primary" />
          </div>
          <KeyValue
            items={[
              ["Received from", `${d.profiles?.full_name ?? ""} (${d.profiles?.so_code ?? ""})`],
              ["Deposit no.", d.deposit_no],
              ["Payment method", `${d.method}${d.provider ? ` · ${d.provider}` : ""}`],
              ["Transaction reference", d.transaction_id || d.account_ref || d.received_by || "—"],
              ["Submitted", formatDateTime(d.created_at)],
              ["Approved", formatDateTime(d.reviewed_at)],
              ["Approved by", reviewer?.full_name ?? "—"],
              ["Deposit date", formatDate(d.deposit_date)],
            ]}
          />
          <footer className="mt-12 border-t pt-3 text-center text-[11px] text-muted-foreground">
            This receipt is generated from the approved deposit record and can be reproduced at any time.
          </footer>
        </article>
      )}
      {reject && (
        <ReasonDialog
          title="Reject deposit"
          confirm="Reject deposit"
          note="The amount goes back to the SO's wallet as a reversal entry."
          onClose={() => setReject(false)}
          run={async (reason) => {
            const { error } = await supabase.rpc("review_deposit", { p_id: id, p_approve: false, p_reason: reason });
            if (error) throw error;
            refresh();
          }}
        />
      )}
    </div>
  );
}
