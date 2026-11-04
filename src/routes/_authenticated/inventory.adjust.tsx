import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page";
import { AdjustmentChallanForm, ChallanTable } from "@/components/app/challans";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/inventory/adjust")({
  head: () => ({ meta: [{ title: "Stock adjustment — BIORY Corporation" }] }),
  component: AdjustPage,
});

function AdjustPage() {
  const s = useSession();
  if (!s.isWarehouse) {
    return (
      <PageHeader
        title="Stock adjustment"
        description="Only Warehouse Admins and Admins can adjust stock."
      />
    );
  }
  return (
    <div>
      <PageHeader
        title="Stock adjustment"
        eyebrow="Inventory"
        description="Write off damaged, expired or lost stock, or correct a physical count — as an adjustment challan with a reason. History is never edited."
      />
      <AdjustmentChallanForm />
      <ChallanTable
        kind="ADJUSTMENT"
        title="Adjustment challans"
        empty="Adjustment challans you post will appear here."
        className="mt-6"
      />
    </div>
  );
}
