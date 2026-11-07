import { describe, expect, it } from "vitest";
import { canOpen, rolesForPath } from "@/lib/access";

describe("role page access", () => {
  it("gives Super Admin every page and keeps a longer path on its own list", () => {
    expect(canOpen("/users", ["super_admin"])).toBe(true);
    expect(canOpen("/settings", ["super_admin"])).toBe(true);
    expect(canOpen("/inventory/receive", ["super_admin"])).toBe(true);
    expect(rolesForPath("/inventory/receive")).not.toContain("sales_officer");
    expect(rolesForPath("/inventory")).toContain("sales_officer");
  });

  it("keeps finance on money and warehouse on stock", () => {
    expect(canOpen("/deposits", ["finance_admin"])).toBe(true);
    expect(canOpen("/wallet", ["finance_admin"])).toBe(true);
    expect(canOpen("/inventory/adjust", ["finance_admin"])).toBe(false);
    expect(canOpen("/users", ["finance_admin"])).toBe(false);
    expect(canOpen("/inventory/receive", ["warehouse_admin"])).toBe(true);
    expect(canOpen("/expenses", ["warehouse_admin"])).toBe(false);
    expect(canOpen("/visits", ["warehouse_admin"])).toBe(false);
  });

  it("keeps a Sales Officer on field work only", () => {
    expect(canOpen("/orders/new", ["sales_officer"])).toBe(true);
    expect(canOpen("/visits/new", ["sales_officer"])).toBe(true);
    expect(canOpen("/requisitions/new", ["sales_officer"])).toBe(true);
    expect(canOpen("/audit", ["sales_officer"])).toBe(false);
    expect(canOpen("/settings", ["sales_officer"])).toBe(false);
    expect(canOpen("/inventory/opening", ["sales_officer"])).toBe(false);
  });

  it("blocks a signed-in person who has no role", () => {
    expect(canOpen("/dashboard", [])).toBe(false);
  });
});
