import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/app/page";
import { ChallanTable, StockChallanForm } from "@/components/app/challans";
import { OpeningStockImport } from "@/components/app/stock-forms";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/inventory/opening")({
  head: () => ({ meta: [{ title: "Opening stock — BIORY Corporation" }] }),
  component: OpeningStockPage,
});

function OpeningStockPage() {
  const s = useSession();
  if (!s.isWarehouse) {
    return (
      <PageHeader
        title="Opening stock"
        description="Only Warehouse Admins and Admins can post opening stock."
      />
    );
  }
  return (
    <div>
      <PageHeader
        title="Opening stock"
        eyebrow="Inventory"
        description="Load the stock you already hold, challan by challan. One challan can carry many products, each with its own batch and expiry."
      />
      <Tabs defaultValue="challan">
        <TabsList className="mb-4">
          <TabsTrigger value="challan">
            <ScrollText /> Challan entry
          </TabsTrigger>
          <TabsTrigger value="bulk">
            <FileSpreadsheet /> Import CSV as one challan
          </TabsTrigger>
        </TabsList>
        <TabsContent value="challan">
          <StockChallanForm kind="OPENING" />
        </TabsContent>
        <TabsContent value="bulk">
          <OpeningStockImport />
        </TabsContent>
      </Tabs>
      <ChallanTable
        kind="OPENING"
        title="Opening stock challans"
        empty="Opening challans you post will appear here."
        className="mt-6"
      />
    </div>
  );
}
