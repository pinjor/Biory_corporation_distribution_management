import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, ExternalLink, FileText, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { PageHeader, Section, StatusBadge, KeyValue, PageLoader, Money, EmptyState } from "@/components/app/page";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { Button } from "@/components/ui/button";
import { profilesQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, formatDate, formatDateTime } from "@/lib/format";
import { categoryLabel } from "@/lib/expenses";

export const Route = createFileRoute("/_authenticated/expenses/$id")({
  head: () => ({ meta: [{ title: "Expense — BIORY Corporation" }] }),
  component: ExpenseDetail,
});

function ExpenseDetail() {
  const { id } = Route.useParams();
  const s = useSession();
  const qc = useQueryClient();
  const [reject, setReject] = useState(false);
  const { data: profiles = [] } = useQuery(profilesQuery);
  const { data: e, isLoading } = useQuery({
    queryKey: ["expense", id],
    queryFn: async () => {
      const { data, error } = await api
        .from("expenses")
        .select("*, profiles!expenses_submitted_by_fkey(full_name, so_code, email)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const { data: receipts = [] } = useQuery({
    queryKey: ["expense-receipts", id, e?.receipt_paths],
    enabled: !!e && e.receipt_paths.length > 0,
    queryFn: async () => {
      const { data, error } = await api.storage.from("expense-receipts").createSignedUrls(e!.receipt_paths, 600);
      if (error) throw error;
      return data.map((r, i) => ({ path: e!.receipt_paths[i]!, url: r.signedUrl ?? "", isPdf: e!.receipt_paths[i]!.endsWith(".pdf") }));
    },
    staleTime: 5 * 60_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["expense", id] });
    qc.invalidateQueries({ queryKey: ["expenses"] });
  };
  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await api.rpc("review_expense", { p_id: id, p_approve: true, p_note: "" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense approved");
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const withdraw = useMutation({
    mutationFn: async () => {
      const { error } = await api.rpc("cancel_expense", { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense withdrawn");
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading || !e) return <PageLoader />;
  const reviewer = profiles.find((p) => p.id === e.reviewed_by);
  const mine = e.submitted_by === s.userId;
  const canReview = s.isFinance && e.status === "SUBMITTED" && !mine;

  return (
    <div>
      <PageHeader
        eyebrow={<Link to="/expenses" className="hover:underline">Expenses</Link>}
        title={<span className="num">{e.expense_no}</span>}
        actions={
          <>
            <StatusBadge status={e.status} label={e.status === "SUBMITTED" ? "pending review" : e.status === "CANCELLED" ? "withdrawn" : undefined} />
            {mine && e.status === "SUBMITTED" && (
              <Button
                variant="outline"
                disabled={withdraw.isPending}
                onClick={() => {
                  if (window.confirm("Withdraw this expense claim?")) withdraw.mutate();
                }}
              >
                <Undo2 /> Withdraw
              </Button>
            )}
            {canReview && (
              <>
                <Button variant="outline" onClick={() => setReject(true)}>
                  Reject
                </Button>
                <Button variant="success" onClick={() => approve.mutate()} disabled={approve.isPending}>
                  <CheckCircle2 /> Approve
                </Button>
              </>
            )}
          </>
        }
      />
      {s.isFinance && mine && e.status === "SUBMITTED" && (
        <div className="mb-6 rounded-xl bg-info-soft p-4 text-sm text-info">This is your own claim — another Finance or Admin user must review it.</div>
      )}
      {e.status === "REJECTED" && (
        <div className="mb-6 rounded-xl bg-destructive-soft p-4 text-sm text-destructive">Rejected: {e.review_note}</div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Section title="Claim">
          <div className="mb-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Amount</div>
            <Money value={e.amount} className="font-display text-3xl font-semibold text-primary" />
          </div>
          <KeyValue
            items={[
              ["Submitted by", `${e.profiles?.full_name || e.profiles?.email || ""}${e.profiles?.so_code ? ` (${e.profiles.so_code})` : ""}`],
              ["Category", categoryLabel(e.category)],
              ["Date spent", formatDate(e.expense_date)],
              ["Submitted", formatDateTime(e.created_at)],
              ["Reviewed", e.reviewed_at ? `${formatDateTime(e.reviewed_at)} by ${reviewer?.full_name ?? ""}` : "—"],
              ["Review note", e.status === "APPROVED" ? e.review_note || "—" : "—"],
            ]}
          />
          <div className="mt-4 border-t pt-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Description</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{e.description}</p>
          </div>
        </Section>
        <Section title={`Receipts (${e.receipt_paths.length})`}>
          {e.receipt_paths.length === 0 ? (
            <EmptyState title="No receipt attached" description="The submitter didn't attach a receipt for this claim." />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {receipts.map((r, i) => (
                <li key={r.path} className="overflow-hidden rounded-xl border bg-muted">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="block">
                    {r.isPdf ? (
                      <div className="grid aspect-[4/3] place-items-center text-muted-foreground">
                        <FileText className="size-10" />
                      </div>
                    ) : (
                      <img src={r.url} alt={`Receipt ${i + 1}`} className="aspect-[4/3] w-full bg-background object-contain" loading="lazy" />
                    )}
                    <div className="flex items-center justify-between px-3 py-2 text-xs font-medium">
                      Receipt {i + 1}
                      {r.isPdf ? " (PDF)" : ""}
                      <ExternalLink className="size-3.5" />
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      {reject && (
        <ReasonDialog
          title="Reject expense"
          confirm="Reject expense"
          note="The submitter sees this reason. They can submit a corrected claim."
          onClose={() => setReject(false)}
          run={async (reason) => {
            const { error } = await api.rpc("review_expense", { p_id: id, p_approve: false, p_note: reason });
            if (error) throw error;
            refresh();
          }}
        />
      )}
    </div>
  );
}
