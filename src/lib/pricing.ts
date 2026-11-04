/**
 * Client-side mirror of the server pricing rules (create_order in the database).
 * The server always recalculates; this is only for the live order preview.
 *
 *   Base TRP      = MRP × (1 − standard trade discount %)
 *   Line TRP      = Base TRP × qty
 *   SO discount   = % of Base TRP (0 – SO max)
 *   Extra discount= % of Base TRP (0 – extra max; above SO authority needs approval)
 *   Net           = Line TRP × (1 − (SO% + Extra%) / 100)
 */

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export function baseTrp(mrp: number, tradeDiscountPct: number): number {
  return round2(mrp * (1 - tradeDiscountPct / 100));
}

export interface PricingLineInput {
  mrp: number;
  base_trp: number;
  qty: number;
}

export interface DiscountPolicy {
  so_discount_max_pct: number;
  extra_discount_max_pct: number;
  extra_discount_so_limit_pct: number;
}

export function computeOrderTotals(lines: PricingLineInput[], soPct: number, extraPct: number) {
  const factor = 1 - (soPct + extraPct) / 100;
  let totalMrp = 0;
  let totalTrp = 0;
  let net = 0;
  const computed = lines.map((l) => {
    const lineMrp = round2(l.mrp * l.qty);
    const lineTrp = round2(l.base_trp * l.qty);
    const lineNet = round2(lineTrp * factor);
    totalMrp += lineMrp;
    totalTrp += lineTrp;
    net += lineNet;
    return { ...l, lineMrp, lineTrp, lineNet };
  });
  totalMrp = round2(totalMrp);
  totalTrp = round2(totalTrp);
  net = round2(net);
  const soAmt = round2((totalTrp * soPct) / 100);
  const extraAmt = round2(totalTrp - net - soAmt);
  return {
    lines: computed,
    totalMrp,
    totalTrp,
    standardDiscount: round2(totalMrp - totalTrp),
    soAmt,
    extraAmt,
    net,
  };
}

export function checkDiscounts(soPct: number, extraPct: number, policy: DiscountPolicy) {
  const errors: string[] = [];
  if (!Number.isFinite(soPct) || soPct < 0 || soPct > policy.so_discount_max_pct)
    errors.push(`SO discount must be between 0% and ${policy.so_discount_max_pct}%`);
  if (!Number.isFinite(extraPct) || extraPct < 0 || extraPct > policy.extra_discount_max_pct)
    errors.push(`Extra discount must be between 0% and ${policy.extra_discount_max_pct}%`);
  const needsApproval = extraPct > policy.extra_discount_so_limit_pct;
  return { errors, needsApproval };
}

/** Outstanding due is never entered by hand: delivered value minus valid collections. */
export function outstandingDue(deliveredValue: number, validCollections: number[]): number {
  return round2(deliveredValue - validCollections.reduce((a, b) => a + b, 0));
}

export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export function paymentStatus(
  deliveredValue: number,
  collected: number,
  fullyDelivered: boolean,
): PaymentStatus {
  if (collected <= 0) return "UNPAID";
  if (fullyDelivered && collected >= deliveredValue) return "PAID";
  return "PARTIALLY_PAID";
}
