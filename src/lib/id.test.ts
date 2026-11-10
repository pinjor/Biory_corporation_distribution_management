import { describe, expect, it } from "vitest";
import { newId } from "@/lib/id";

describe("newId", () => {
  it("returns a uuid even when randomUUID is missing", () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { getRandomValues: (bytes: Uint8Array) => bytes.fill(1) },
    });
    try {
      expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: original });
    }
  });
});
