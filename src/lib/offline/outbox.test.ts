import { describe, expect, it } from "vitest";
import { classifyRpcError, Outbox, queuedQtyByProduct, syncOutbox, type KeyValueStore, type QueuedOrder, type RpcResult } from "./outbox";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const order = (id: string, qty = 2): Omit<QueuedOrder, "status" | "attempts" | "createdAt"> => ({
  id,
  chemistId: "chem-1",
  chemistName: "Rahman Pharmacy",
  items: [{ product_id: "p1", qty, name: "Napa 500", mrp: 100, base_trp: 85 }],
  soPct: 0,
  extraPct: 0,
  remarks: "",
  netEstimate: 85 * qty,
});

const ok = (id: string): RpcResult => ({ data: id, error: null, status: 200 });
const offline: RpcResult = { data: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 };
const noStock: RpcResult = { data: null, error: { message: "Not enough stock for Napa 500", code: "P0001" }, status: 400 };

describe("offline order outbox", () => {
  it("keeps queued orders across reloads (new Outbox instance, same storage)", () => {
    const store = memoryStore();
    new Outbox(store, "so-1").add(order("k1"));
    expect(new Outbox(store, "so-1").list().map((o) => o.id)).toEqual(["k1"]);
    expect(new Outbox(store, "so-2").list()).toEqual([]);
  });

  it("submits each queued order with its own idempotency key and removes it once synced", async () => {
    const ob = new Outbox(memoryStore(), "so-1");
    ob.add(order("k1"));
    ob.add(order("k2"));
    const sentKeys: string[] = [];
    const report = await syncOutbox(ob, async (o) => {
      sentKeys.push(o.id);
      return ok(`order-${o.id}`);
    });
    expect(sentKeys).toEqual(["k1", "k2"]);
    expect(report.synced.map((s) => s.orderId)).toEqual(["order-k1", "order-k2"]);
    expect(ob.list()).toEqual([]);
  });

  it("keeps the order pending when the connection drops, and resends the same key next time", async () => {
    const ob = new Outbox(memoryStore(), "so-1");
    ob.add(order("k1"));
    ob.add(order("k2"));
    const first = await syncOutbox(ob, async () => offline);
    expect(first.interrupted).toBe(true);
    expect(ob.list().map((o) => [o.id, o.status, o.attempts])).toEqual([
      ["k1", "pending", 1],
      ["k2", "pending", 0],
    ]);
    const sentKeys: string[] = [];
    await syncOutbox(ob, async (o) => {
      sentKeys.push(o.id);
      return ok(`order-${o.id}`);
    });
    expect(sentKeys).toEqual(["k1", "k2"]);
    expect(ob.list()).toEqual([]);
  });

  it("parks an order the server refuses and carries on with the rest", async () => {
    const ob = new Outbox(memoryStore(), "so-1");
    ob.add(order("bad"));
    ob.add(order("good"));
    const report = await syncOutbox(ob, async (o) => (o.id === "bad" ? noStock : ok("order-good")));
    expect(report.rejected.map((r) => r.message)).toEqual(["Not enough stock for Napa 500"]);
    expect(ob.list().map((o) => [o.id, o.status])).toEqual([["bad", "failed"]]);
    // Failed orders are not resent automatically…
    let calls = 0;
    await syncOutbox(ob, async () => (calls++, ok("x")));
    expect(calls).toBe(0);
    // …only after the user chooses Retry.
    ob.retry("bad");
    await syncOutbox(ob, async () => ok("order-bad"));
    expect(ob.list()).toEqual([]);
  });

  it("treats a thrown network error as retry, not rejection", async () => {
    const ob = new Outbox(memoryStore(), "so-1");
    ob.add(order("k1"));
    await syncOutbox(ob, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(ob.list()[0]?.status).toBe("pending");
  });

  it("does not queue the same idempotency key twice", () => {
    const ob = new Outbox(memoryStore(), "so-1");
    ob.add(order("k1"));
    ob.add(order("k1"));
    expect(ob.list()).toHaveLength(1);
  });

  it("classifies server answers", () => {
    expect(classifyRpcError(offline)).toBe("retry");
    expect(classifyRpcError({ error: { message: "upstream", code: "" }, status: 503 })).toBe("retry");
    expect(classifyRpcError({ error: { message: "JWT expired", code: "PGRST303" }, status: 401 })).toBe("retry");
    expect(classifyRpcError(noStock)).toBe("reject");
    expect(classifyRpcError({ error: { message: "Extra discount must be between 0 and 20 percent", code: "P0001" }, status: 400 })).toBe("reject");
  });

  it("counts stock promised to pending queued orders only", () => {
    const ob = new Outbox(memoryStore(), "so-1");
    ob.add(order("a", 3));
    ob.add(order("b", 4));
    ob.update("b", { status: "failed" });
    expect(queuedQtyByProduct(ob.list()).get("p1")).toBe(3);
  });
});
