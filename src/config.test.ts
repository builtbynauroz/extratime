// The credit math every meter, key switch and budget warning rests on. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { creditOf, type KeyConfig, type Spend } from "./config.js";

const key: KeyConfig = { label: "work", credit: 50, start: "2026-11-01", days: 30 };
const now = new Date("2026-11-10T12:00:00Z");
const spend = (t: string, usd: number, label = "work"): Spend => ({ t, key: label, usd });

test("spend in the window counts against its own key only", () => {
  const c = creditOf(key, [spend("2026-11-02T10:00:00Z", 12.5), spend("2026-11-03T10:00:00Z", 2.5, "max")], now);
  assert.equal(c.spent, 12.5);
  assert.equal(c.left, 37.5);
  assert.equal(c.ended, false);
});

test("spend from before the window started doesn't count", () => {
  assert.equal(creditOf(key, [spend("2026-10-30T10:00:00Z", 40)], now).left, 50);
});

test("left never goes below zero, and a window that has ended has nothing left", () => {
  assert.equal(creditOf(key, [spend("2026-11-02T10:00:00Z", 80)], now).left, 0);
  const ended = creditOf(key, [], new Date("2026-12-02T12:00:00Z"));
  assert.equal(ended.ended, true);
  assert.equal(ended.left, 0);
});

test("a billing error in this window marks the key out; one from an earlier window doesn't", () => {
  assert.equal(creditOf({ ...key, outSince: "2026-11-05T09:00:00Z" }, [], now).left, 0);
  assert.equal(creditOf({ ...key, outSince: "2026-10-20T09:00:00Z" }, [], now).left, 50);
});
