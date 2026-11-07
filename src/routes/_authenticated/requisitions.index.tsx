import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/requisitions/")({
  beforeLoad: () => {
    throw redirect({ to: "/orders", search: { tab: "requisition" } });
  },
});
