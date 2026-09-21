import { describe, expect, it } from "vitest";
import {
  backoffCeiling,
  backoffDelay,
  decodeAwareness,
  encodeAwareness,
  RemoteAwareness,
} from "../src";

describe("backoff", () => {
  it("doubles from 500 ms and caps at 30 s", () => {
    expect([0, 1, 2, 3].map(a => backoffCeiling(a))).toEqual([500, 1000, 2000, 4000]);
    expect(backoffCeiling(6)).toBe(30_000);
    expect(backoffCeiling(50)).toBe(30_000);
  });
  it("is full jitter: random(0, ceiling)", () => {
    expect(backoffDelay(3, () => 0)).toBe(0);
    expect(backoffDelay(3, () => 0.5)).toBe(2000);
    expect(backoffDelay(3, () => 0.999999)).toBeLessThan(4000);
  });
});

describe("awareness", () => {
  it("round-trips the JSON payload and rejects garbage", () => {
    const bytes = encodeAwareness({ clientId: 7, state: { name: "Ann" } });
    expect(decodeAwareness(bytes)).toEqual({ clientId: 7, state: { name: "Ann" } });
    expect(decodeAwareness(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("drops remote peers not heard from within the timeout", () => {
    const r = new RemoteAwareness(1000);
    expect(r.update(1, { n: "a" }, 0)).toBe(true);
    expect(r.update(2, { n: "b" }, 600)).toBe(true);
    expect(r.update(1, { n: "a2" }, 700)).toBe(false); // refresh
    expect(r.sweep(1500)).toBe(false); // 1 seen@700, 2 seen@600: both within 1000
    expect(r.sweep(1650)).toBe(true); // 2 is 1050 old
    expect([...r.states().keys()]).toEqual([1]);
    expect(r.sweep(2000)).toBe(true);
    expect(r.size).toBe(0);
  });

  it("null state removes a peer immediately", () => {
    const r = new RemoteAwareness(1000);
    r.update(1, { n: "a" }, 0);
    r.update(1, null, 1);
    expect(r.size).toBe(0);
  });
});
