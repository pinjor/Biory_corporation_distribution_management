import { describe, expect, it } from "vitest";
import { receiptProblem } from "./expenses";

const f = (name: string, type: string, mb: number) => ({ name, type, size: mb * 1024 * 1024 });

describe("expense receipts", () => {
  it("accepts photos and PDFs up to 5 MB each", () => {
    expect(receiptProblem([f("a.jpg", "image/jpeg", 4.9), f("b.pdf", "application/pdf", 1)])).toBeNull();
  });
  it("rejects files over 5 MB", () => {
    expect(receiptProblem([f("big.png", "image/png", 5.1)])).toMatch(/5 MB/);
  });
  it("rejects more than 5 receipts", () => {
    expect(receiptProblem(Array.from({ length: 6 }, (_, i) => f(`${i}.jpg`, "image/jpeg", 1)))).toMatch(/at most 5/);
  });
  it("rejects other file types", () => {
    expect(receiptProblem([f("x.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 1)])).toMatch(/JPG, PNG, WEBP or PDF/);
  });
});
