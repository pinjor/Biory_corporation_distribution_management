import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page";
import { BatchReceiptForm, RecentMovements } from "@/components/app/stock-forms";
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
        description="Post purchase receipts into the central warehouse, batch by batch. For balances carried over from before the system, use Opening stock."
      />
      <BatchReceiptForm type="PURCHASE_RECEIPT" />
      <RecentMovements
        title="Recent receipts"
        types={["PURCHASE_RECEIPT"]}
        empty="Purchase receipts you post will appear here."
      />
    </div>
  );
}
