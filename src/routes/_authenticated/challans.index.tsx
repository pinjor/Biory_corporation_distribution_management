import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeftRight,
  Layers,
  PackageOpen,
  PackagePlus,
  SlidersHorizontal,
  Truck,
} from "lucide-react";
import { PageHeader } from "@/components/app/page";
import { ChallanTable, useChallans, type ChallanKind } from "@/components/app/challans";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/challans/")({
  head: () => ({ meta: [{ title: "Challans — BIORY Corporation" }] }),
  component: ChallansPage,
});

type Tab = "to-receive" | "all" | ChallanKind;

function ChallansPage() {
  const s = useSession();
  const [tab, setTab] = useState<Tab>(s.isWarehouse ? "all" : "to-receive");
  const { data: incoming = [] } = useChallans("ISSUE", "IN_TRANSIT");
  return (
    <div>
      <PageHeader
        title="Challans"
        eyebrow="Inventory"
        description={
          s.isWarehouse
            ? "Every stock document: opening stock, purchase receipts, issues to Sales Officers and adjustments."
            : "Stock issued to you from the central warehouse. Receive a challan to add its stock to your inventory."
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="to-receive">
            <Truck /> In transit{incoming.length > 0 ? ` (${incoming.length})` : ""}
          </TabsTrigger>
          {s.isWarehouse && (
            <>
              <TabsTrigger value="all">
                <Layers /> All
              </TabsTrigger>
              <TabsTrigger value="OPENING">
                <PackageOpen /> Opening
              </TabsTrigger>
              <TabsTrigger value="RECEIPT">
                <PackagePlus /> Receipts
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="ISSUE">
            <ArrowLeftRight /> Issues
          </TabsTrigger>
          {s.isWarehouse && (
            <TabsTrigger value="ADJUSTMENT">
              <SlidersHorizontal /> Adjustments
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>
      {tab === "to-receive" ? (
        <ChallanTable
          kind="ISSUE"
          status="IN_TRANSIT"
          title="Issued, waiting to be received"
          empty={
            s.isWarehouse ? "Nothing is in transit." : "No stock is on its way to you right now."
          }
        />
      ) : tab === "all" ? (
        <ChallanTable title="All challans" empty="Challans appear here as stock is posted." />
      ) : (
        <ChallanTable
          kind={tab}
          title={`${tab.charAt(0)}${tab.slice(1).toLowerCase()} challans`}
          empty="None yet."
        />
      )}
    </div>
  );
}
