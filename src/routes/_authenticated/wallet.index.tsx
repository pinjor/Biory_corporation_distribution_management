import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Camera, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { ListPager, usePagedRows } from "@/components/app/list-pager";
import { PageHeader, Section, StatCard, Money, EmptyState, Field } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { opt } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, formatBDT, todayBD } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/wallet/")({
  head: () => ({ meta: [{ title: "Wallet by SO — BIORY Corporation" }] }),
  component: WalletBySoPage,
});

function WalletBySoPage() {
  const s = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<"" | "held" | "pending" | "settled">("");
  const { data: summaries = [] } = useQuery({
    queryKey: ["wallet-summary"],
    queryFn: async () => {
      const { data, error } = await api.from("v_wallet_summary").select("*").order("full_name");
      if (error) throw error;
      return data;
    },
  });
  const people = s.isFinance ? summaries : summaries.filter((row) => row.so_id === s.userId);
  const rows = people.filter((row) => {
    if (card === "held") return Number(row.balance) > 0;
    if (card === "pending") return Number(row.pending) > 0;
    if (card === "settled") return Number(row.settled) > 0;
    return true;
  });
  const page = usePagedRows(rows, card);
  function pickCard(next: "held" | "pending" | "settled") {
    setCard((cur) => (cur === next ? "" : next));
  }
  const mine = summaries.find((row) => row.so_id === s.userId);
  const agg = people.reduce(
    (a, row) => ({ balance: a.balance + Number(row.balance), pending: a.pending + Number(row.pending), settled: a.settled + Number(row.settled) }),
    { balance: 0, pending: 0, settled: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Wallet by SO"
        description="Cash each Sales Officer is holding, what is waiting on Finance, and what has already been settled."
        actions={
          s.isSO ? (
            <Button variant="highlight" onClick={() => setOpen(true)} disabled={Number(mine?.balance ?? 0) <= 0}>
              <HandCoins /> Deposit to company
            </Button>
          ) : undefined
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Cash held by SO" value={formatBDT(agg.balance)} tone="warning" hint="Available to deposit" active={card === "held"} onClick={() => pickCard("held")} />
        <StatCard label="Pending settlement" value={formatBDT(agg.pending)} tone="info" hint="Submitted, awaiting Finance" active={card === "pending"} onClick={() => pickCard("pending")} />
        <StatCard label="Settled with company" value={formatBDT(agg.settled)} tone="success" hint="Approved deposits" active={card === "settled"} onClick={() => pickCard("settled")} />
      </div>
      <Section title="By Sales Officer" bodyClassName="p-0">
        {rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No Sales Officers yet" /></div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SO</TableHead>
                  <TableHead className="text-right">Collected (all time)</TableHead>
                  <TableHead className="text-right">Held</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Settled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.pageRows.map((row) => (
                  <TableRow
                    key={row.so_id!}
                    className="cursor-pointer"
                    onClick={() => void navigate({ to: "/wallet/ledger", search: { so: row.so_id! } })}
                  >
                    <TableCell>
                      <div className="font-medium">{row.full_name}</div>
                      <div className="num text-xs text-muted-foreground">{row.so_code}</div>
                    </TableCell>
                    <TableCell className="text-right"><Money value={row.total_collected} /></TableCell>
                    <TableCell className="text-right font-semibold"><Money value={row.balance} /></TableCell>
                    <TableCell className="text-right"><Money value={row.pending} /></TableCell>
                    <TableCell className="text-right"><Money value={row.settled} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPager page={page.page} pages={page.pages} total={page.total} pageSize={page.pageSize} noun="officers" onPage={page.setPage} onSize={page.setPageSize} />
          </>
        )}
      </Section>
      {open && <DepositDialog balance={Number(mine?.balance ?? 0)} onClose={() => setOpen(false)} />}
    </div>
  );
}

const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

function DepositDialog({ balance, onClose }: { balance: number; onClose: () => void }) {
  const s = useSession();
  const qc = useQueryClient();
  const [f, setF] = useState({ amount: String(balance), method: "BANK", provider: "", account: "", txn: "", date: todayBD(), receivedBy: "", remarks: "" });
  const [file, setFile] = useState<File | null>(null);
  const [idem] = useState(() => crypto.randomUUID());
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const amt = Number(f.amount) || 0;

  const m = useMutation({
    mutationFn: async () => {
      let path: string | null = null;
      if (file) {
        const ext = OK_TYPES[file.type];
        if (!ext) throw new Error("Proof must be a JPG, PNG, WEBP image or a PDF");
        if (file.size > MAX_BYTES) throw new Error("Proof must be 5 MB or smaller");
        path = `${s.userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await api.storage.from("deposit-proofs").upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
      }
      const { error } = await api.rpc("submit_deposit", {
        p_amount: amt,
        p_method: f.method,
        p_provider: opt(f.provider),
        p_account_ref: opt(f.account),
        p_transaction_id: opt(f.txn),
        p_date: f.date,
        p_received_by: opt(f.receivedBy),
        p_remarks: opt(f.remarks),
        p_attachment_path: path as string,
        p_idempotency_key: idem,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deposit submitted for Finance approval");
      qc.invalidateQueries({ queryKey: ["wallet-summary"] });
      qc.invalidateQueries({ queryKey: ["wallet-ledger"] });
      qc.invalidateQueries({ queryKey: ["deposits"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deposit to company</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Wallet balance available: <Money value={balance} className="font-semibold text-foreground" /></p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (৳)"><Input type="number" step="0.01" min={0.01} max={balance} value={f.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
          <Field label="Method">
            <NativeSelect value={f.method} onChange={(e) => set("method", e.target.value)}>
              <option value="BANK">Bank deposit / transfer</option>
              <option value="MFS">MFS (bKash / Nagad / Rocket)</option>
              <option value="CASH">Cash hand-over</option>
            </NativeSelect>
          </Field>
          {f.method !== "CASH" ? (
            <>
              <Field label={f.method === "BANK" ? "Bank" : "MFS provider"}><Input value={f.provider} onChange={(e) => set("provider", e.target.value)} /></Field>
              <Field label="Account / reference"><Input value={f.account} onChange={(e) => set("account", e.target.value)} /></Field>
              <Field label="Transaction ID (required)"><Input value={f.txn} onChange={(e) => set("txn", e.target.value)} /></Field>
            </>
          ) : (
            <Field label="Received by (name)"><Input value={f.receivedBy} onChange={(e) => set("receivedBy", e.target.value)} /></Field>
          )}
          <Field label="Deposit date"><Input type="date" max={todayBD()} value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
        </div>
        <Field label="Remarks"><Input value={f.remarks} onChange={(e) => set("remarks", e.target.value)} /></Field>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 hover:bg-muted">
          <Camera className="size-5 text-primary" />
          <div className="text-sm">
            <div className="font-medium">{file ? file.name : "Photo or PDF of deposit slip"}</div>
            <div className="text-xs text-muted-foreground">JPG, PNG, WEBP or PDF · up to 5 MB · stored privately</div>
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            capture="environment"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || amt <= 0 || amt > balance || (f.method !== "CASH" && !f.txn.trim())}
          >
            {m.isPending ? "Submitting…" : "Submit deposit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
