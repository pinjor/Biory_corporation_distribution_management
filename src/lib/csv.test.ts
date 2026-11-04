import { describe, expect, it } from "vitest";
import { parseCsv, validateOpeningStock } from "./csv";

const products = new Map([["NAP500", "Napa 500"]]);
const header = "product_code,batch_no,mfg_date,expiry_date,qty,remarks";

describe("bulk opening stock validation", () => {
  it("accepts a valid row", () => {
    const r = validateOpeningStock(parseCsv(`${header}\nNAP500,B1,2026-01-01,2028-01-01,100,`), products, "2026-11-04");
    expect(r.issues).toEqual([]);
    expect(r.rows[0]?.qty).toBe(100);
  });

  it("rejects an already-expired batch", () => {
    const r = validateOpeningStock(parseCsv(`${header}\nNAP500,B1,2025-01-01,2026-11-04,10,`), products, "2026-11-04");
    expect(r.rows.length).toBe(0);
    expect(r.issues[0]?.message).toContain("expired");
  });

  it("flags duplicate product + batch in the same file", () => {
    const r = validateOpeningStock(
      parseCsv(`${header}\nNAP500,B1,,2028-01-01,10,\nNAP500,B1,,2028-01-01,5,`),
      products,
      "2026-11-04",
    );
    expect(r.rows.length).toBe(1);
    expect(r.issues[0]?.line).toBe(3);
  });

  it("rejects unknown products and non-positive quantities", () => {
    const r = validateOpeningStock(parseCsv(`${header}\nXXX,B1,,2028-01-01,0,`), products, "2026-11-04");
    expect(r.issues[0]?.message).toContain("unknown product");
    expect(r.issues[0]?.message).toContain("qty");
  });
});
