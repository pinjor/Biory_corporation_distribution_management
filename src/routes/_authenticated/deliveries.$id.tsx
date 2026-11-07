import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { api } from "@/lib/api/client";
import { PageHeader, PageLoader, Money, Qty } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { settingsQuery } from "@/lib/queries";
import { formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/deliveries/$id")({
  head: () => ({ meta: [{ title: "Delivery challan — BIORY Corporation" }] }),
  component: Challan,
});

function Challan() {
  const { id } = Route.useParams();
  const { data: settings } = useQuery(settingsQuery);
  const { data: d, isLoading } = useQuery({
    queryKey: ["delivery", id],
    queryFn: async () => {
      const { data, error } = await api
        .from("deliveries")
        .select("*, orders(order_no, order_date), chemists(*), profiles!deliveries_so_id_fkey(full_name, so_code, phone), delivery_items(*, products(name, code, pack_size), batches(batch_no, expiry_date))")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });
  if (isLoading || !d) return <PageLoader />;
  const totalMrp = d.delivery_items.reduce((a, i) => a + Number(i.mrp) * i.qty, 0);
  return (
    <div>
      <PageHeader
        eyebrow={<Link to="/orders/$id" params={{ id: d.order_id }} className="hover:underline">Order {d.orders?.order_no}</Link>}
        title="Delivery challan"
        actions={<Button onClick={() => window.print()}><Printer /> Print / save PDF</Button>}
      />
      <article className="print-sheet surface-card mx-auto max-w-3xl p-6 sm:p-10">
        <header className="flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row">
          <div>
            <div className="font-display text-xl font-semibold">{settings?.company_name}</div>
            <div className="text-sm text-muted-foreground">{settings?.company_address}</div>
            {settings?.company_phone && <div className="text-sm text-muted-foreground">{settings.company_phone}</div>}
          </div>
          <div className="text-left sm:text-right">
            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Delivery challan</div>
            <div className="num text-lg font-semibold">{d.delivery_no}</div>
            <div className="text-sm">{formatDate(d.delivery_date)} · {d.delivery_type === "FULL" ? "Full" : "Partial"} delivery</div>
          </div>
        </header>
        <section className="grid gap-6 border-b py-6 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Deliver to</div>
            <div className="font-semibold">{d.chemists?.business_name}</div>
            <div className="text-sm">{d.chemists?.owner_name}</div>
            <div className="text-sm text-muted-foreground">{[d.chemists?.address, d.chemists?.upazila, d.chemists?.district].filter(Boolean).join(", ")}</div>
            <div className="num text-sm">{d.chemists?.mobile}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Sales Officer</div>
            <div className="font-semibold">{d.profiles?.full_name}</div>
            <div className="num text-sm">{d.profiles?.so_code}</div>
            <div className="text-sm text-muted-foreground">Order {d.orders?.order_no} · {formatDate(d.orders?.order_date)}</div>
          </div>
        </section>
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2">Product</th>
              <th className="py-2">Batch · Expiry</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">MRP</th>
              <th className="py-2 text-right">Net unit</th>
              <th className="py-2 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {d.delivery_items.map((i) => (
              <tr key={i.id} className="border-b">
                <td className="py-2">
                  <div className="font-medium">{i.products?.name}</div>
                  <div className="text-xs text-muted-foreground">{i.products?.pack_size}</div>
                </td>
                <td className="num py-2 text-xs">{i.batches?.batch_no} · {formatDate(i.batches?.expiry_date)}</td>
                <td className="py-2 text-right"><Qty value={i.qty} /></td>
                <td className="py-2 text-right"><Money value={i.mrp} /></td>
                <td className="py-2 text-right"><Money value={i.net_unit_price} /></td>
                <td className="py-2 text-right font-medium"><Money value={i.line_value} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="pt-3 text-right text-muted-foreground">Total at MRP</td>
              <td className="pt-3 text-right"><Money value={totalMrp} /></td>
            </tr>
            <tr>
              <td colSpan={5} className="pt-1 text-right font-semibold">Net delivered value</td>
              <td className="pt-1 text-right"><Money value={d.total_value} className="text-lg font-semibold" /></td>
            </tr>
          </tfoot>
        </table>
        <footer className="mt-16 grid grid-cols-2 gap-10 text-xs text-muted-foreground">
          <div className="border-t pt-2">Received by (chemist signature & seal)</div>
          <div className="border-t pt-2 text-right">Delivered by {d.profiles?.full_name}</div>
        </footer>
        <p className="mt-6 text-center text-[10px] text-muted-foreground">Generated {formatDateTime(d.created_at)} · {d.delivery_no}</p>
      </article>
    </div>
  );
}
