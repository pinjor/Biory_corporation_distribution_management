import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page";
import { ChallanTable, StockChallanForm } from "@/components/app/challans";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/inventory/receive")({
  head: () => ({ meta: [{ title: "Receive stock — BIORY Corporation" }] }),
  component: ReceivePage,
});

function ReceivePage() {
  const s = useSession();
  if (!s.isWarehouse) {
    return (
      <PageHeader
        title="Receive stock"
        description="Only Warehouse Admins and Admins can receive stock."
      />
    );
  }
  return (
    <div>
      <PageHeader
        title="Receive stock"
        eyebrow="Inventory"
        description="Post supplier deliveries into the central warehouse as a receipt challan — one challan, many products."
      />
      <StockChallanForm kind="RECEIPT" />
      <ChallanTable
        kind="RECEIPT"
        title="Receipt challans"
        empty="Receipt challans you post will appear here."
        className="mt-6"
      />
    </div>
  );
}
