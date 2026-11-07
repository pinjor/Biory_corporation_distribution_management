import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Paperclip, Plus } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader, Section, StatusBadge, EmptyState, Money } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { categoryLabel, EXPENSE_CATEGORIES } from "@/lib/expenses";

export const Route = createFileRoute("/_authenticated/expenses/")({
  head: () => ({ meta: [{ title: "Expenses — BIORY Corporation" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const s = useSession();
  const [status, setStatus] = useState(s.isFinance ? "SUBMITTED" : "");
  const [scope, setScope] = useState<"all" | "mine">(s.isFinance ? "all" : "mine");
  const [category, setCategory] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["expenses", status, scope, category],
    queryFn: async () => {
      let q = api
        .from("expenses")
        .select("*, profiles!expenses_submitted_by_fkey(full_name, so_code)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (status) q = q.eq("status", status);
      if (category) q = q.eq("category", category);
      if (scope === "mine") q = q.eq("submitted_by", s.userId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
  const total = data.reduce((a, d) => a + Number(d.amount), 0);
  const showWho = s.isFinance && scope === "all";

  return (
    <div>
      <PageHeader
        title="Expenses"
        description={
          s.isFinance
            ? "Check each claim against its receipts before approving. You can't review your own expenses."
            : "Claim field expenses with a photo of the receipt. Finance reviews every claim."
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv("expenses.csv", [
                  ["expense_no", "date", "submitted_by", "category", "description", "amount", "receipts", "status", "reviewed_at", "review_note"],
                  ...data.map((d) => [
                    d.expense_no,
                    d.expense_date,
                    d.profiles?.full_name,
                    d.category,
                    d.description,
                    d.amount,
                    d.receipt_paths.length,
                    d.status,
                    d.reviewed_at,
                    d.review_note,
                  ]),
                ])
              }
            >
              Export CSV
            </Button>
            <Button asChild variant="highlight">
              <Link to="/expenses/new">
                <Plus /> New expense
              </Link>
            </Button>
          </>
        }
      />
      <Section
        bodyClassName="p-0"
        title={
          <span>
            {data.length} expenses · <Money value={total} />
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {s.isFinance && (
              <NativeSelect value={scope} onChange={(e) => setScope(e.target.value as "all" | "mine")} className="h-8 w-32">
                <option value="all">Everyone</option>
                <option value="mine">Mine</option>
              </NativeSelect>
            )}
            <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 w-40">
              <option value="">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="h-8 w-36">
              <option value="">All statuses</option>
              <option value="SUBMITTED">Pending review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Withdrawn</option>
            </NativeSelect>
          </div>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No expenses here"
              action={
                <Button asChild size="sm">
                  <Link to="/expenses/new">Submit an expense</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Expense</TableHead>
                {showWho && <TableHead>Submitted by</TableHead>}
                <TableHead>Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link to="/expenses/$id" params={{ id: d.id }} className="num font-medium text-primary hover:underline">
                      {d.expense_no}
                    </Link>
                    <div className="text-xs text-muted-foreground">{formatDate(d.expense_date)}</div>
                  </TableCell>
                  {showWho && (
                    <TableCell className="text-sm">
                      {d.profiles?.full_name} <span className="num text-xs text-muted-foreground">{d.profiles?.so_code}</span>
                    </TableCell>
                  )}
                  <TableCell className="max-w-xs text-sm">
                    <div className="font-medium">{categoryLabel(d.category)}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {d.receipt_paths.length > 0 ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Paperclip className="size-3" />
                          {d.receipt_paths.length}
                        </span>
                      ) : (
                        <span className="font-semibold text-warning-foreground">No receipt</span>
                      )}
                      <span className="truncate">· {d.description}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={d.status} label={d.status === "SUBMITTED" ? "pending review" : d.status === "CANCELLED" ? "withdrawn" : undefined} />
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    <Money value={d.amount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
