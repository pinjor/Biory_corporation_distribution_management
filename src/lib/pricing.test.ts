import { describe, expect, it } from "vitest";
import { baseTrp, checkDiscounts, computeOrderTotals, outstandingDue, paymentStatus } from "./pricing";

const policy = { so_discount_max_pct: 5, extra_discount_max_pct: 20, extra_discount_so_limit_pct: 5 };

describe("pricing rules", () => {
  it("MRP ৳100 at 15% standard trade discount gives Base TRP ৳85", () => {
    expect(baseTrp(100, 15)).toBe(85);
  });

  it("Base TRP ৳75 only comes from a 25% trade discount", () => {
    expect(baseTrp(100, 25)).toBe(75);
  });

  it("order lines: 3 × Napa (MRP 100, TRP 85) + 2 × X (MRP 200, TRP 170)", () => {
    const t = computeOrderTotals(
      [
        { mrp: 100, base_trp: 85, qty: 3 },
        { mrp: 200, base_trp: 170, qty: 2 },
      ],
      0,
      0,
    );
    expect(t.totalMrp).toBe(700);
    expect(t.totalTrp).toBe(595);
    expect(t.net).toBe(595);
  });

  it("SO and extra discounts are both taken off Base TRP", () => {
    const t = computeOrderTotals([{ mrp: 700, base_trp: 595, qty: 1 }], 5, 7);
    expect(t.soAmt).toBe(29.75);
    expect(t.net).toBe(523.6);
    expect(t.extraAmt).toBe(41.65);
  });

  it("SO discount above 5% is rejected", () => {
    expect(checkDiscounts(5.5, 0, policy).errors.length).toBe(1);
    expect(checkDiscounts(5, 0, policy).errors.length).toBe(0);
  });

  it("extra discount above 20% is rejected", () => {
    expect(checkDiscounts(0, 20.5, policy).errors.length).toBe(1);
    expect(checkDiscounts(0, 20, policy).errors.length).toBe(0);
  });

  it("extra discount above the 5% SO authority needs approval", () => {
    expect(checkDiscounts(0, 5, policy).needsApproval).toBe(false);
    expect(checkDiscounts(0, 7, policy).needsApproval).toBe(true);
  });

  it("due is delivered value minus valid collections (৳10,000 − ৳6,000 = ৳4,000)", () => {
    expect(outstandingDue(10000, [6000])).toBe(4000);
  });

  it("payment status follows collections against delivered value", () => {
    expect(paymentStatus(8500, 0, false)).toBe("UNPAID");
    expect(paymentStatus(8500, 6500, true)).toBe("PARTIALLY_PAID");
    expect(paymentStatus(8500, 8500, true)).toBe("PAID");
    expect(paymentStatus(5000, 5000, false)).toBe("PARTIALLY_PAID");
  });
});
