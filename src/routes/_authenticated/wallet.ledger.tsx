import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { FilterClear, ListToolbar, useListRange } from "@/components/app/list-toolbar";
import { NativeSelect } from "@/components/app/select-native";
import { EmptyState, KeyValue, Money, PageHeader, PageLoader, Section, StatusBadge } from "@/components/app/page";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/lib/session";
import { formatDate, formatDateTime, humanize, inDateRange } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/wallet/ledger")({
  validateSearch: (s: Record<string, unknown>): { so?: string } =>
    typeof s.so === "string" ? { so: s.so } : {},
  head: () => ({ meta: [{ title: "Wallet ledger — BIORY Corporation" }] }),
  component: WalletLedgerPage,
});

type LedgerRow = {
  id: number;
  created_at: string;
  entry_type: string;
  amount: number;
  note: string | null;
  reference_type: string | null;
  reference_id: string | null;
  reference_no: string | null;
  so_id: string;
  profiles?: { full_name?: string | null } | null;
};

function WalletLedgerPage() {
  const s = useSession();
  const search = Route.useSearch();
  const [soFilter, setSoFilter] = useState(search.so ?? "");
  const [q, setQ] = useState("");
  const [openRef, setOpenRef] = useState<LedgerRow | null>(null);
  const { from, to, setFrom, setTo, reset } = useListRange();
  const viewing = s.isFinance ? soFilter : s.userId;

  const { data: summaries = [] } = useQuery({
    queryKey: ["wallet-summary"],
    enabled: s.isFinance,
    queryFn: async () => {
      const { data, error } = await api.from("v_wallet_summary").select("so_id, full_name").order("full_name");
      if (error) throw error;
      return data;
    },
  });
  const { data: ledger = [], isLoading } = useQuery({
    queryKey: ["wallet-ledger", viewing],
    queryFn: async () => {
      let query = api.from("wallet_ledger").select("*, profiles!wallet_ledger_so_id_fkey(full_name)").order("created_at", { ascending: false }).limit(300);
      if (viewing) query = query.eq("so_id", viewing);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as LedgerRow[];
    },
  });
  const rows = useMemo(() => ledger.filter((row) => {
    if (!inDateRange(row.created_at, from, to)) return false;
    const hay = `${row.entry_type ?? ""} ${row.reference_no ?? ""} ${row.note ?? ""} ${row.profiles?.full_name ?? ""}`.toLowerCase();
    return !q || hay.includes(q.toLowerCase());
  }), [ledger, q, from, to]);
  const page = usePagedRows(rows, `${viewing}|${q}|${from}|${to}`);

  return (
    <div>
      <PageHeader
        title="Ledger"
        description="Every wallet movement. Open a reference to see the collection or deposit it came from."
      />
      <Section
        title={`${rows.length} ledger entries`}
        bodyClassName="p-0"
        actions={
          <ListToolbar query={q} onQuery={setQ} placeholder="Entry / reference…" from={from} to={to} onFrom={setFrom} onTo={setTo}>
            {s.isFinance && (
              <NativeSelect value={soFilter} onChange={(e) => setSoFilter(e.target.value)} className="h-9 w-48 shrink-0" aria-label="Sales Officer">
                <option value="">All Sales Officers</option>
                {summaries.map((row) => <option key={row.so_id!} value={row.so_id!}>{row.full_name}</option>)}
              </NativeSelect>
            )}
            <FilterClear onClick={() => { setQ(""); setSoFilter(""); reset(); }} />
          </ListToolbar>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No wallet entries yet" description="Collections from chemists show up here." /></div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  {s.isFinance && <TableHead>SO</TableHead>}
                  <TableHead>Entry</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.pageRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</TableCell>
                    {s.isFinance && <TableCell className="text-sm">{row.profiles?.full_name}</TableCell>}
                    <TableCell className="text-sm">
                      <div className="font-medium">{humanize(row.entry_type)}</div>
                      {row.note && <div className="text-xs text-muted-foreground">{row.note}</div>}
                    </TableCell>
                    <TableCell className="num text-xs">
                      {row.reference_id ? (
                        <button type="button" className="text-primary hover:underline" onClick={() => setOpenRef(row)}>
                          {row.reference_no || "Open"}
                        </button>
                      ) : (
                        row.reference_no || "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={row.amount} className={Number(row.amount) >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="entries" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
      {openRef && <ReferenceDialog entry={openRef} onClose={() => setOpenRef(null)} />}
    </div>
  );
}

function ReferenceDialog({ entry, onClose }: { entry: LedgerRow; onClose: () => void }) {
  const isDeposit = entry.reference_type === "DEPOSIT";
  const { data, isLoading, isError } = useQuery({
    queryKey: ["wallet-ref", entry.reference_type, entry.reference_id],
    queryFn: async () => {
      if (isDeposit) {
        const { data, error } = await api
          .from("deposits")
          .select("deposit_no, amount, method, provider, account_ref, transaction_id, deposit_date, status, remarks, attachment_path, receipt_no, profiles!deposits_so_id_fkey(full_name, so_code)")
          .eq("id", entry.reference_id!)
          .single();
        if (error) throw error;
        return { kind: "deposit" as const, row: data };
      }
      const { data, error } = await api
        .from("collections")
        .select("collection_no, amount, method, reference, collection_date, status, remarks, profiles!collections_so_id_fkey(full_name, so_code), chemists(business_name), orders(order_no)")
        .eq("id", entry.reference_id!)
        .single();
      if (error) throw error;
      return { kind: "collection" as const, row: data };
    },
  });
  const proofPath = data?.kind === "deposit" ? data.row.attachment_path : null;
  const { data: fileUrl } = useQuery({
    queryKey: ["wallet-ref-file", proofPath],
    enabled: !!proofPath,
    queryFn: async () => {
      const { data: signed, error } = await api.storage.from("deposit-proofs").createSignedUrl(proofPath!, 300);
      if (error) throw error;
      return signed.signedUrl as string;
    },
  });
  const fileIsPdf = !!proofPath && proofPath.toLowerCase().endsWith(".pdf");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry.reference_no || "Reference"}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <PageLoader />
        ) : isError || !data ? (
          <EmptyState title="Reference not available" description="This entry has no document you can open." />
        ) : data.kind === "deposit" ? (
          <div className="flex flex-col gap-4">
            <KeyValue
              items={[
                ["Deposit", data.row.deposit_no],
                ["Sales Officer", [data.row.profiles?.full_name, data.row.profiles?.so_code].filter(Boolean).join(" · ") || "—"],
                ["Amount", <Money key="amount" value={data.row.amount} />],
                ["Method", [data.row.method, data.row.provider].filter(Boolean).join(" · ")],
                ["Account", data.row.account_ref || "—"],
                ["Transaction", data.row.transaction_id || "—"],
                ["Date", formatDate(data.row.deposit_date)],
                ["Status", <StatusBadge key="status" status={data.row.status} />],
                ["Receipt", data.row.receipt_no || "—"],
                ["Remarks", data.row.remarks || "—"],
              ]}
            />
            {fileUrl && (
              fileIsPdf ? (
                <iframe title={data.row.deposit_no} src={fileUrl} className="h-[28rem] w-full rounded-xl border" />
              ) : (
                <img src={fileUrl} alt="Deposit proof" className="max-h-[28rem] w-full rounded-xl border object-contain" />
              )
            )}
          </div>
        ) : (
          <KeyValue
            items={[
              ["Collection", data.row.collection_no],
              ["Order", data.row.orders?.order_no || "—"],
              ["Chemist", data.row.chemists?.business_name || "—"],
              ["Sales Officer", [data.row.profiles?.full_name, data.row.profiles?.so_code].filter(Boolean).join(" · ") || "—"],
              ["Amount", <Money key="amount" value={data.row.amount} />],
              ["Method", data.row.method],
              ["Reference", data.row.reference || "—"],
              ["Date", formatDate(data.row.collection_date)],
              ["Status", <StatusBadge key="status" status={data.row.status} />],
              ["Remarks", data.row.remarks || "—"],
            ]}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
