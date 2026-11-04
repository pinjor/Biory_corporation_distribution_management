import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  History,
  PackageOpen,
  PackagePlus,
  SlidersHorizontal,
  Truck,
  UserRound,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  PageHeader,
  Section,
  Money,
  Qty,
  ExpiryBadge,
  EmptyState,
  Field,
  StatCard,
} from "@/components/app/page";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { locationsQuery, myAvailableStockQuery, productsQuery, settingsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage, formatBDT, formatDate } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";

type StockRow = Database["public"]["Views"]["v_stock"]["Row"];

export const Route = createFileRoute("/_authenticated/inventory/")({
  head: () => ({ meta: [{ title: "Stock — BIORY Corporation" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const s = useSession();
  const { data: locations = [] } = useQuery(locationsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const central = locations.find((l) => l.kind === "central");
  const mine = locations.find((l) => l.so_id === s.userId);
  const soLocs = locations.filter((l) => l.kind === "so");
  const [tab, setTab] = useState<"central" | "so" | "transit">(s.isStaff ? "central" : "so");
  const transit = locations.find((l) => l.kind === "transit");
  const [soLoc, setSoLoc] = useState<string>("");
  const locId =
    tab === "central"
      ? central?.id
      : tab === "transit"
        ? transit?.id
        : s.isStaff
          ? soLoc || soLocs[0]?.id
          : mine?.id;
  const [kind, setKind] = useState("");
  const [expiry, setExpiry] = useState("");
  const [q, setQ] = useState("");
  const [transfer, setTransfer] = useState<StockRow | null>(null);
  const near = settings?.near_expiry_days ?? 90;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock", locId],
    enabled: !!locId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_stock")
        .select("*")
        .eq("location_id", locId!)
        .gt("qty", 0)
        .order("product_name")
        .order("expiry_date");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (kind && r.product_kind !== kind) return false;
        const d = r.days_to_expiry ?? 9999;
        if (expiry === "expired" && d > 0) return false;
        if (expiry === "near" && (d <= 0 || d > near)) return false;
        if (expiry === "ok" && d <= near) return false;
        if (
          q &&
          !`${r.product_code} ${r.product_name} ${r.batch_no}`
            .toLowerCase()
            .includes(q.toLowerCase())
        )
          return false;
        return true;
      }),
    [rows, kind, expiry, q, near],
  );

  const totals = useMemo(() => {
    let value = 0,
      units = 0,
      nearN = 0,
      expN = 0;
    for (const r of rows) {
      units += r.qty ?? 0;
      value += Number(r.value_trp ?? 0);
      const d = r.days_to_expiry ?? 9999;
      if (d <= 0) expN++;
      else if (d <= near) nearN++;
    }
    return { value, units, nearN, expN };
  }, [rows, near]);

  const showSoSummary = tab === "so" && !s.isStaff;

  return (
    <div>
      <PageHeader
        title="Stock"
        description="Batch-wise balances derived from the stock ledger. Expired batches are blocked from issue, delivery and promotion."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/inventory/ledger">
                <History /> Ledger
              </Link>
            </Button>
            {s.isWarehouse && (
              <Button asChild variant="outline">
                <Link to="/inventory/adjust">
                  <SlidersHorizontal /> Adjust
                </Link>
              </Button>
            )}
            {s.isWarehouse && (
              <Button asChild>
                <Link to="/inventory/receive">
                  <PackagePlus /> Receive stock
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "central" | "so" | "transit")}>
          <TabsList>
            <TabsTrigger value="central">
              <Warehouse /> Central warehouse
            </TabsTrigger>
            <TabsTrigger value="so">
              <UserRound /> {s.isStaff ? "SO stock" : "My stock"}
            </TabsTrigger>
            {s.isStaff && transit && (
              <TabsTrigger value="transit">
                <Truck /> In transit
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
        {tab === "so" && s.isStaff && (
          <NativeSelect
            className="w-60"
            value={soLoc || soLocs[0]?.id || ""}
            onChange={(e) => setSoLoc(e.target.value)}
          >
            {soLocs.length === 0 && <option value="">No Sales Officers yet</option>}
            {soLocs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Units on hand" value={<Qty value={totals.units} />} />
        <StatCard label="Value at TRP" value={formatBDT(totals.value)} />
        <StatCard
          label="Near expiry batches"
          value={totals.nearN}
          tone={totals.nearN ? "warning" : "default"}
          hint={`Within ${near} days`}
        />
        <StatCard
          label="Expired batches"
          value={totals.expN}
          tone={totals.expN ? "destructive" : "default"}
          hint="Blocked from use"
        />
      </div>

      {showSoSummary && <MyAvailability />}

      <Section
        title="Batches"
        bodyClassName="p-0"
        actions={
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 w-40"
            />
            <NativeSelect
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="h-8 w-32"
            >
              <option value="">All kinds</option>
              <option value="saleable">Saleable</option>
              <option value="promotional">Promotional</option>
            </NativeSelect>
            <NativeSelect
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="h-8 w-32"
            >
              <option value="">Any expiry</option>
              <option value="near">Near expiry</option>
              <option value="expired">Expired</option>
              <option value="ok">Healthy</option>
            </NativeSelect>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadCsv("stock.csv", [
                  [
                    "location",
                    "product_code",
                    "product",
                    "kind",
                    "batch",
                    "expiry",
                    "qty",
                    "base_trp",
                    "value_trp",
                  ],
                  ...filtered.map((r) => [
                    r.location_name,
                    r.product_code,
                    r.product_name,
                    r.product_kind,
                    r.batch_no,
                    r.expiry_date,
                    r.qty,
                    r.base_trp,
                    r.value_trp,
                  ]),
                ])
              }
            >
              Export
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading stock…</div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No stock here"
              description={
                tab === "so" && !s.isStaff
                  ? "Request stock from the central warehouse to start selling."
                  : "Nothing matches these filters."
              }
              action={
                tab === "so" && s.isSO ? (
                  <Button asChild size="sm">
                    <Link to="/requisitions/new">Request stock</Link>
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Base TRP</TableHead>
                <TableHead className="text-right">Value</TableHead>
                {s.isWarehouse && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={`${r.location_id}-${r.batch_id}`}>
                  <TableCell>
                    <div className="font-medium">{r.product_name}</div>
                    <div className="num text-xs text-muted-foreground">
                      {r.product_code} · {r.product_kind}
                    </div>
                  </TableCell>
                  <TableCell className="num text-xs">{r.batch_no}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm">{formatDate(r.expiry_date)}</span>
                      <ExpiryBadge days={r.days_to_expiry} nearDays={near} />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    <Qty value={r.qty} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={r.base_trp} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={r.value_trp} />
                  </TableCell>
                  {s.isWarehouse && (
                    <TableCell className="whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTransfer(r)}
                        aria-label="Transfer"
                      >
                        <ArrowLeftRight />
                      </Button>
                      <Button variant="ghost" size="icon" asChild aria-label="Adjust">
                        <Link to="/inventory/adjust">
                          <SlidersHorizontal />
                        </Link>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      {transfer && <TransferDialog row={transfer} onClose={() => setTransfer(null)} />}
    </div>
  );
}

function MyAvailability() {
  const { data = [] } = useQuery(myAvailableStockQuery);
  const { data: products = [] } = useQuery(productsQuery);
  const byId = new Map(products.map((p) => [p.id, p]));
  if (data.length === 0) return null;
  return (
    <Section title="Available to sell" className="mb-6" bodyClassName="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Usable on hand</TableHead>
            <TableHead className="text-right">Reserved by open orders</TableHead>
            <TableHead className="text-right">Available</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r) => (
            <TableRow key={r.product_id}>
              <TableCell className="font-medium">{byId.get(r.product_id)?.name ?? "—"}</TableCell>
              <TableCell className="text-right">
                <Qty value={r.on_hand} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                <Qty value={r.reserved} />
              </TableCell>
              <TableCell className="text-right font-semibold">
                <Qty value={r.available} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

function TransferDialog({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: locations = [] } = useQuery(locationsQuery);
  const targets = locations.filter(
    (l) =>
      l.kind !== "transit" &&
      l.id !== row.location_id &&
      !(row.location_kind === "central" && l.kind === "central"),
  );
  const [to, setTo] = useState(targets[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("transfer_stock", {
        p_from: row.location_id!,
        p_to: to,
        p_batch: row.batch_id!,
        p_qty: Number(qty),
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer posted");
      qc.invalidateQueries({ queryKey: ["stock"] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Transfer {row.product_name} · {row.batch_no}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          From {row.location_name} (on hand <Qty value={row.qty} />)
        </p>
        <div className="grid gap-4">
          <Field label="To location">
            <NativeSelect value={to} onChange={(e) => setTo(e.target.value)}>
              {targets.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Quantity">
            <Input
              type="number"
              min={1}
              max={row.qty ?? undefined}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
          <Field label="Reason (required)">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || !qty || !reason.trim() || !to}
          >
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
