import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Section, Qty, Field } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { opt, productsQuery, locationsQuery } from "@/lib/queries";
import { useSession } from "@/lib/session";
import { errorMessage } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/requisitions/new")({
  head: () => ({ meta: [{ title: "New requisition — BIORY Corporation" }] }),
  component: NewRequisition,
});

function NewRequisition() {
  const s = useSession();
  const navigate = useNavigate();
  const { data: products = [] } = useQuery(productsQuery);
  const { data: locations = [] } = useQuery(locationsQuery);
  const central = locations.find((l) => l.kind === "central");
  const { data: centralStock = [] } = useQuery({
    queryKey: ["central-available", central?.id],
    enabled: !!central,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_stock").select("product_id, qty, days_to_expiry").eq("location_id", central!.id);
      if (error) throw error;
      return data;
    },
  });
  const avail = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of centralStock) if ((r.days_to_expiry ?? 0) > 0) m.set(r.product_id!, (m.get(r.product_id!) ?? 0) + (r.qty ?? 0));
    return m;
  }, [centralStock]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [remarks, setRemarks] = useState("");
  const list = products.filter((p) => p.active && (!q || `${p.name} ${p.code}`.toLowerCase().includes(q.toLowerCase())));
  const items = Object.entries(qty).filter(([, v]) => v > 0);

  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("submit_requisition", {
        p_items: items.map(([product_id, q]) => ({ product_id, qty: q })),
        p_remarks: opt(remarks),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (id) => {
      toast.success("Requisition submitted");
      navigate({ to: "/requisitions/$id", params: { id: id as string } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!s.isSO) return <PageHeader title="New requisition" description="Only Sales Officers can request stock." />;

  return (
    <div className="pb-24">
      <PageHeader title="New requisition" description="Request saleable and promotional stock from the central warehouse." />
      <Section title="Products" actions={<Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-48" />}>
        <ul className="divide-y">
          {list.map((p) => {
            const v = qty[p.id] ?? 0;
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.kind} · central available <Qty value={avail.get(p.id) ?? 0} />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" size="icon" variant="outline" onClick={() => setQty({ ...qty, [p.id]: Math.max(0, v - 10) })} aria-label="Less">
                    <Minus />
                  </Button>
                  <Input
                    type="number"
                    min={0}
                    className="num w-20 text-center"
                    value={v || ""}
                    placeholder="0"
                    onChange={(e) => setQty({ ...qty, [p.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  />
                  <Button type="button" size="icon" variant="outline" onClick={() => setQty({ ...qty, [p.id]: v + 10 })} aria-label="More">
                    <Plus />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="Remarks" className="mt-6">
        <Field label="Note for the warehouse (optional)">
          <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </Section>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 p-3 backdrop-blur md:left-(--sidebar-width)">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {items.length} products · <Qty value={items.reduce((a, [, v]) => a + v, 0)} /> units
          </span>
          <Button disabled={items.length === 0 || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Submitting…" : "Submit requisition"}
          </Button>
        </div>
      </div>
    </div>
  );
}
