// The credit math every meter, key switch and budget warning rests on, and the recap `extratime -c` shows. Run: npm test
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { creditOf, lastExchange, type KeyConfig, type Spend } from "./config.js";

/** A Claude Code home holding one conversation for /work/shop, made of these transcript lines. */
function transcript(lines: unknown[]): { home: string; cwd: string; id: string } {
  const home = mkdtempSync(join(tmpdir(), "extratime-test-"));
  const cwd = "/work/shop";
  mkdirSync(join(home, "projects", "-work-shop"), { recursive: true });
  writeFileSync(join(home, "projects", "-work-shop", "s1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return { home, cwd, id: "s1" };
}
const user = (content: unknown, extra: object = {}) => ({ type: "user", message: { role: "user", content }, ...extra });
const assistant = (content: unknown[]) => ({ type: "assistant", message: { role: "assistant", content } });

test("the recap is the last message and Claude's reply to it, skipping tools and Claude Code's own lines", () => {
  const t = transcript([
    user("<command-name>/model</command-name>"),
    user("the checkout test is failing, fix it"),
    assistant([{ type: "tool_use", id: "t1", name: "Bash", input: { command: "npm test" } }]),
    user([{ type: "tool_result", tool_use_id: "t1", content: "FAIL" }]),
    user("Caveat: internal", { isMeta: true }),
    { ...assistant([{ type: "text", text: "Side work." }]), isSidechain: true },
    assistant([{ type: "text", text: "The discount was applied twice.\n\nFixed." }]),
  ]);
  assert.deepEqual(lastExchange(t.home, t.cwd, t.id), { user: "the checkout test is failing, fix it", reply: "The discount was applied twice. Fixed." });
});

test("a message the limit cut off has no reply yet", () => {
  const t = transcript([user("first"), assistant([{ type: "text", text: "done" }]), user("now run the whole suite")]);
  assert.deepEqual(lastExchange(t.home, t.cwd, t.id), { user: "now run the whole suite", reply: undefined });
});

test("no conversation file means no recap", () => {
  assert.equal(lastExchange(tmpdir(), "/nowhere", "missing"), undefined);
});

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
