// The ui-ux-engineer pipeline's screenshots, for a terminal: every state of the View at 80 and 120 columns (the mode
// line at 60 too), rendered without a session. Run: npm run frames [out folder], then read <out>/*.txt; the .ansi files
// keep the colours (`cat` one in a light and a dark terminal).
import { renderToString } from "ink";
import { mkdirSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { stripVTControlCharacters } from "node:util";
import { usageOf, type Spend } from "../src/config.js";
import { renderMarkdown } from "../src/markdown.js";
import { View, type Item, type KeyView, type UsageRow, type ViewState } from "../src/ui.js";

const out = process.argv[2] ?? "design/frames";
const ends = new Date(2026, 11, 14);
const work: KeyView = { label: "work", accent: "cyan", left: 31.2, credit: 50, ends, daysLeft: 23, ended: false, out: false, active: true, stored: true };
const personal: KeyView = { label: "personal", accent: "magenta", left: 20, credit: 20, ends, daysLeft: 23, ended: false, out: false, active: false, stored: true };
const spend = (day: number, usd: number, model: string): Spend => ({ t: new Date(2026, 10, day, 15).toISOString(), key: "work", usd, model });
const ledger = [spend(14, 3.1, "claude-opus-5-5"), spend(15, 1.4, "claude-opus-5-5"), spend(16, 6.2, "claude-opus-5-5"), spend(18, 0.4, "claude-haiku-5-5"), spend(19, 5.3, "claude-sonnet-5-5"), spend(20, 2.4, "claude-opus-5-5")];
const now = new Date(2026, 10, 21, 18);
const usage: UsageRow[] = [
  { ...usageOf({ label: "work", credit: 50, start: "2026-11-14", days: 30 }, ledger, now), accent: "cyan", active: true },
  { ...usageOf({ label: "personal", credit: 20, start: "2026-11-14", days: 30 }, ledger, now), accent: "magenta", active: false },
];
const welcome = (keys: KeyView[]): Item => ({ kind: "welcome", cwd: "~/code/shop-app", home: "~/.claude", keys });

const base: ViewState = {
  items: [welcome([work, personal])],
  live: "",
  tools: [],
  busy: false,
  status: "Thinking",
  overlay: undefined,
  ask: undefined,
  input: "",
  cursor: 0,
  hint: undefined,
  keys: [work, personal],
  usage,
  model: "opus",
  modelNames: ["opus", "sonnet", "haiku"],
  effort: "high",
  mode: "default",
  sessionUsd: 1.84,
};

const conversation = (width: number): Item[] => [
  welcome([work, personal]),
  { kind: "notice", tone: "info", text: "Continuing the last conversation in this folder, from ~/.claude." },
  { kind: "user", text: "the checkout test is failing, fix it" },
  { kind: "tool", name: "Read", detail: "src/lib/cart.ts", ok: true, summary: 'import { prices } from "./prices"; (+212 lines)' },
  { kind: "tool", name: "Bash", detail: "npm test cart", ok: false, summary: "FAIL cart.test.ts › applies the discount once (+38 lines)" },
  {
    kind: "assistant",
    text: renderMarkdown(
      "The test fails because the **discount** is applied twice: once in `addItem` and again at checkout.\n\n```ts\nconst total = subtotal - discount;\n```\n\nI removed the second one and the test passes now.",
      width - 4,
    ),
  },
  { kind: "turn", usd: 0.42, ms: 38000, ok: true },
];

const states: Record<string, (width: number) => Partial<ViewState>> = {
  start: () => ({}),
  conversation: (w) => ({ items: conversation(w), input: "now run the whole suite", cursor: 23 }),
  writing: (w) => ({ items: conversation(w), busy: true, status: "Writing", live: "The whole suite passes: 214 tests in 41 seconds.\nOne warning is left in" }),
  tool: (w) => ({ items: conversation(w), busy: true, status: "Running Bash", tools: [{ id: "t1", name: "Bash", detail: "npm test" }], input: "then commit", cursor: 11, hint: "Claude is still on the last message · esc to interrupt" }),
  permission: (w) => ({ items: conversation(w), busy: true, status: "Running Bash", ask: { tool: "Bash", detail: "git push origin main" } }),
  keys: (w) => ({ items: conversation(w), overlay: { kind: "keys", index: 1 } }),
  effort: (w) => ({ items: conversation(w), overlay: { kind: "effort", index: 3 } }),
  model: (w) => ({ items: conversation(w), overlay: { kind: "model", index: 1 } }),
  "mode-auto": (w) => ({ items: conversation(w), mode: "auto" }),
  "mode-auto-edit": (w) => ({ items: conversation(w), mode: "acceptEdits" }),
  "mode-plan": (w) => ({ items: conversation(w), mode: "plan" }),
  help: (w) => ({ items: conversation(w), overlay: { kind: "help" } }),
  usage: (w) => ({ items: conversation(w), overlay: { kind: "usage" } }),
  "low-credit": (w) => ({ items: conversation(w), keys: [{ ...work, left: 4.2 }, personal] }),
  "budget-spent": (w) => ({
    items: [...conversation(w), { kind: "notice", tone: "warn", text: "work's $50 budget is spent. The next message goes on personal ($20.00 left)." }],
    keys: [{ ...work, left: 0, active: false }, { ...personal, active: true }],
  }),
  "out-of-credit": (w) => ({
    items: [...conversation(w), { kind: "notice", tone: "warn", text: "work is out of credit. Switched to personal ($20.00 left) and carrying on." }],
    keys: [{ ...work, left: 0, out: true, active: false }, { ...personal, active: true }],
    busy: true,
    status: "Thinking",
  }),
  "no-key": (w) => ({
    items: [...conversation(w), { kind: "notice", tone: "bad", text: "No API key stored for personal. In another terminal: capi key add personal" }],
    keys: [work, { ...personal, stored: false }],
  }),
};

mkdirSync(out, { recursive: true });
for (const [name, state] of Object.entries(states)) {
  for (const columns of name.startsWith("mode-") ? [60, 80, 120] : [80, 120]) {
    // createElement, not JSX: this file sits outside the tsconfig, so tsx wouldn't use the automatic JSX runtime.
    const frame = renderToString(createElement(View, { s: { ...base, ...state(columns) }, columns, frame: 3, elapsed: 12 }), { columns });
    writeFileSync(`${out}/${name}-${columns}.ansi`, frame);
    writeFileSync(`${out}/${name}-${columns}.txt`, stripVTControlCharacters(frame));
  }
}
console.log(`${Object.keys(states).length} states written to ${out}`);
