import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Camera, HandCoins } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, StatCard, Money, EmptyState, Field } from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { opt } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, formatBDT, formatDateTime, humanize, todayBD } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({ meta: [{ title: "Wallet — BIORY Corporation" }] }),
  component: WalletPage,
});

function WalletPage() {
  const s = useSession();
  const [soFilter, setSoFilter] = useState<string>("");
  const [open, setOpen] = useState(false);
  const viewing = s.isFinance ? soFilter : s.userId;

  const { data: summaries = [] } = useQuery({
    queryKey: ["wallet-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_wallet_summary").select("*").order("full_name");
      if (error) throw error;
      return data;
    },
  });
  const { data: ledger = [] } = useQuery({
    queryKey: ["wallet-ledger", viewing],
    queryFn: async () => {
      let q = supabase.from("wallet_ledger").select("*, profiles!wallet_ledger_so_id_fkey(full_name)").order("created_at", { ascending: false }).limit(300);
      if (viewing) q = q.eq("so_id", viewing);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const mine = summaries.find((x) => x.so_id === s.userId);
  const scope = viewing ? summaries.filter((x) => x.so_id === viewing) : summaries;
  const agg = scope.reduce(
    (a, x) => ({ balance: a.balance + Number(x.balance), pending: a.pending + Number(x.pending), settled: a.settled + Number(x.settled) }),
    { balance: 0, pending: 0, settled: 0 },
  );

  return (
    <div>
      <PageHeader
        title={s.isFinance && !s.isSO ? "SO wallets" : "My wallet"}
        description="A ledger, not an editable balance: collections add, deposits subtract, rejected deposits come back as reversals."
        actions={
          <>
            {s.isFinance && (
              <NativeSelect value={soFilter} onChange={(e) => setSoFilter(e.target.value)} className="w-52">
                <option value="">All Sales Officers</option>
                {summaries.map((x) => <option key={x.so_id!} value={x.so_id!}>{x.full_name}</option>)}
              </NativeSelect>
            )}
            {s.isSO && (
              <Button variant="highlight" onClick={() => setOpen(true)} disabled={Number(mine?.balance ?? 0) <= 0}>
                <HandCoins /> Deposit to company
              </Button>
            )}
          </>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Cash held by SO" value={formatBDT(agg.balance)} tone="warning" hint="Available to deposit" />
        <StatCard label="Pending settlement" value={formatBDT(agg.pending)} tone="info" hint="Submitted, awaiting Finance" />
        <StatCard label="Settled with company" value={formatBDT(agg.settled)} tone="success" hint="Approved deposits" />
      </div>

      {s.isFinance && !viewing && (
        <Section title="By Sales Officer" className="mb-6" bodyClassName="p-0">
          {summaries.length === 0 ? (
            <div className="p-5"><EmptyState title="No Sales Officers yet" /></div>
          ) : (
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
                {summaries.map((x) => (
                  <TableRow key={x.so_id!} className="cursor-pointer" onClick={() => setSoFilter(x.so_id!)}>
                    <TableCell>
                      <div className="font-medium">{x.full_name}</div>
                      <div className="num text-xs text-muted-foreground">{x.so_code}</div>
                    </TableCell>
                    <TableCell className="text-right"><Money value={x.total_collected} /></TableCell>
                    <TableCell className="text-right font-semibold"><Money value={x.balance} /></TableCell>
                    <TableCell className="text-right"><Money value={x.pending} /></TableCell>
                    <TableCell className="text-right"><Money value={x.settled} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      )}

      <Section
        title="Wallet ledger"
        bodyClassName="p-0"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadCsv("wallet-ledger.csv", [
                ["time", "so", "type", "amount", "reference", "note"],
                ...ledger.map((l) => [l.created_at, l.profiles?.full_name, l.entry_type, l.amount, l.reference_no, l.note]),
              ])
            }
          >
            Export
          </Button>
        }
      >
        {ledger.length === 0 ? (
          <div className="p-5"><EmptyState title="No wallet entries yet" description="Collections from chemists show up here." /></div>
        ) : (
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
              {ledger.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(l.created_at)}</TableCell>
                  {s.isFinance && <TableCell className="text-sm">{l.profiles?.full_name}</TableCell>}
                  <TableCell className="text-sm">
                    <div className="font-medium">{humanize(l.entry_type)}</div>
                    {l.note && <div className="text-xs text-muted-foreground">{l.note}</div>}
                  </TableCell>
                  <TableCell className="num text-xs">
                    {l.reference_type === "DEPOSIT" && l.reference_id ? (
                      <Link to="/deposits/$id" params={{ id: l.reference_id }} className="text-primary hover:underline">{l.reference_no}</Link>
                    ) : (
                      l.reference_no
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={l.amount} className={Number(l.amount) >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
        const { error: upErr } = await supabase.storage.from("deposit-proofs").upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
      }
      const { data, error } = await supabase.rpc("submit_deposit", {
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
      return data;
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
