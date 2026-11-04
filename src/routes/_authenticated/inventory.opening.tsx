import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, PackageOpen } from "lucide-react";
import { PageHeader } from "@/components/app/page";
import {
  BatchReceiptForm,
  OpeningStockImport,
  RecentMovements,
} from "@/components/app/stock-forms";
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
        description="Load the stock you already hold when you start using the system — one batch at a time or many at once from a CSV. Each entry becomes an OPENING movement in the ledger."
      />
      <Tabs defaultValue="single">
        <TabsList className="mb-4">
          <TabsTrigger value="single">
            <PackageOpen /> Single batch
          </TabsTrigger>
          <TabsTrigger value="bulk">
            <FileSpreadsheet /> Bulk import (CSV)
          </TabsTrigger>
        </TabsList>
        <TabsContent value="single">
          <BatchReceiptForm type="OPENING" />
        </TabsContent>
        <TabsContent value="bulk">
          <OpeningStockImport />
        </TabsContent>
      </Tabs>
      <RecentMovements
        title="Opening stock entries"
        types={["OPENING"]}
        empty="Opening balances you post will appear here."
      />
    </div>
  );
}
