import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ClipboardList, Eye, Paperclip, Plus, Tag, Users } from "lucide-react";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { PageHeader, Section, StatusBadge, EmptyState, Money } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { masterValuesQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { formatDate, inDateRange } from "@/lib/format";
import { categoryLabel, EXPENSE_CATEGORIES } from "@/lib/expenses";

export const Route = createFileRoute("/_authenticated/expenses/")({
  head: () => ({ meta: [{ title: "Expenses — BIORY Corporation" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const s = useSession();
  const { data: masters = [] } = useQuery(masterValuesQuery);
  const categories = masters.filter((row) => row.kind === "expense_category" && row.active && row.code);
  const categoryOptions = categories.length
    ? categories.map((row) => ({ value: row.code as string, label: row.name }))
    : EXPENSE_CATEGORIES.map((row) => ({ value: row.value, label: row.label }));
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(s.isFinance ? "SUBMITTED" : "");
  const [scope, setScope] = useState<"all" | "mine">(s.isFinance ? "all" : "mine");
  const [category, setCategory] = useState("");
  const { from, to, setFrom, setTo, reset } = useListRange();
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
  const rows = useMemo(() => data.filter((d) => {
    if (!inDateRange(d.expense_date, from, to)) return false;
    const hay = `${d.expense_no} ${d.description ?? ""} ${d.profiles?.full_name ?? ""} ${categoryLabel(d.category, masters)}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  }), [data, q, masters, from, to]);
  const total = rows.reduce((a, d) => a + Number(d.amount), 0);
  const page = usePagedRows(rows, `${q}|${status}|${scope}|${category}|${from}|${to}`);
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
            {rows.length} expenses · <Money value={total} />
          </span>
        }
        actions={
          <ListToolbar query={q} onQuery={setQ} placeholder="Expense / details…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
            {s.isFinance && (
              <NativeSelect leading={<Users />} value={scope} onChange={(e) => setScope(e.target.value as "all" | "mine")} className="h-9 w-36 shrink-0" aria-label="Scope">
                <option value="all">Everyone</option>
                <option value="mine">Mine</option>
              </NativeSelect>
            )}
            <NativeSelect leading={<Tag />} value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Category">
              <option value="">All categories</option>
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect leading={<ClipboardList />} value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-40 shrink-0" aria-label="Status">
              <option value="">All statuses</option>
              <option value="SUBMITTED">Pending review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Withdrawn</option>
            </NativeSelect>
            <FilterClear onClick={() => { setQ(""); setCategory(""); setStatus(s.isFinance ? "SUBMITTED" : ""); setScope(s.isFinance ? "all" : "mine"); reset(); }} />
          </ListToolbar>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
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
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Expense</TableHead>
                {showWho && <TableHead>Submitted by</TableHead>}
                <TableHead>Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.pageRows.map((d) => (
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
                    <div className="font-medium">{categoryLabel(d.category, masters)}</div>
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
                  <TableCell className="text-right">
                    <Button asChild size="icon" variant="ghost" aria-label={`View ${d.expense_no}`} className="size-8">
                      <Link to="/expenses/$id" params={{ id: d.id }}><Eye /></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="expenses" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
    </div>
  );
}
