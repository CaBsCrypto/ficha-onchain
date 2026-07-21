/**
 * Regression tests for withSignerLock() — the per-signer serialization that
 * stops concurrent on-chain submits from the same demo secret from racing on the
 * account sequence (which degraded ficha/receta/licencia to "simulated").
 * These lock in: same-key tasks never overlap, different keys run in parallel,
 * and one rejection never breaks the chain for the next waiter.
 */
import { describe, it, expect } from "vitest";
import { withSignerLock } from "@/lib/stellar/serialize";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withSignerLock", () => {
  it("serializes tasks queued under the same key (no overlap)", async () => {
    const events: string[] = [];
    const make = (id: string, delay: number) =>
      withSignerLock("SAME", async () => {
        events.push(`start:${id}`);
        await tick(delay);
        events.push(`end:${id}`);
      });

    // Fire three at once; if they overlapped we'd see interleaved start/end.
    await Promise.all([make("a", 30), make("b", 5), make("c", 15)]);

    // Each task's end must come before the next task's start.
    expect(events).toEqual([
      "start:a", "end:a",
      "start:b", "end:b",
      "start:c", "end:c",
    ]);
  });

  it("runs tasks under different keys concurrently", async () => {
    const order: string[] = [];
    const slow = withSignerLock("K1", async () => { await tick(30); order.push("slow"); });
    const fast = withSignerLock("K2", async () => { await tick(5); order.push("fast"); });
    await Promise.all([slow, fast]);
    // Different signers are independent → the fast one finishes first.
    expect(order).toEqual(["fast", "slow"]);
  });

  it("returns the task's resolved value", async () => {
    await expect(withSignerLock("R", async () => 42)).resolves.toBe(42);
  });

  it("a rejected task does not break the chain for the next waiter", async () => {
    const failing = withSignerLock("CHAIN", async () => { throw new Error("boom"); });
    const next = withSignerLock("CHAIN", async () => "ok");
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });
});
