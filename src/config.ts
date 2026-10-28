import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk";

export const CAPI_DIR = join(homedir(), ".capi");
const CONFIG_FILE = join(CAPI_DIR, "config.json");
const LEDGER_FILE = join(CAPI_DIR, "ledger.jsonl");
const KEYCHAIN_SERVICE = "capi";

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const satisfies readonly EffortLevel[];
export const MODELS = { opus: "claude-opus-5-5", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-5-5" } as const;
export type ModelName = keyof typeof MODELS;

/** A key's own settings: its credit lasts `days` from `start` (a local YYYY-MM-DD). The key itself lives in the Keychain. */
export type KeyConfig = { label: string; credit: number; start: string; days: number; outSince?: string };
export type Config = { keys: KeyConfig[]; active?: string; model: ModelName; effort: EffortLevel };
export type Spend = { t: string; key: string; usd: number; model?: string };
export type Credit = { label: string; credit: number; spent: number; left: number; start: Date; ends: Date; daysLeft: number; ended: boolean; out: boolean };
export type DaySpend = { day: string; usd: number; replies: number };
export type Usage = Credit & { replies: number; pace: number; runsOut: Date | undefined; perDay: DaySpend[]; perModel: { model: string; usd: number }[] };

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number): string => String(n).padStart(2, "0");
export const localDate = (d = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isDate = (s: string): boolean => DATE.test(s) && !Number.isNaN(fromLocal(s).getTime());

function fromLocal(date: string): Date {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const isEffort = (v: unknown): v is EffortLevel => EFFORTS.some((e) => e === v);
export const isModel = (v: unknown): v is ModelName => typeof v === "string" && Object.hasOwn(MODELS, v);

const LABEL = /^[a-z0-9][a-z0-9-]{0,23}$/;
const API_KEY = /^sk-ant-[A-Za-z0-9_-]{20,}$/;
export const validLabel = (s: string): boolean => LABEL.test(s);

function parseKey(v: unknown): KeyConfig[] {
  if (!isRecord(v) || typeof v.label !== "string" || !validLabel(v.label)) return [];
  const credit = typeof v.credit === "number" && v.credit > 0 ? v.credit : 100;
  const start = typeof v.start === "string" && isDate(v.start) ? v.start : localDate();
  const days = typeof v.days === "number" && v.days >= 1 && v.days <= 366 ? Math.floor(v.days) : 30;
  return [{ label: v.label, credit, start, days, ...(typeof v.outSince === "string" ? { outSince: v.outSince } : {}) }];
}

export function loadConfig(): Config {
  let raw: unknown = {};
  try {
    if (existsSync(CONFIG_FILE)) raw = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    raw = {};
  }
  const c = isRecord(raw) ? raw : {};
  const keys = Array.isArray(c.keys) ? c.keys.flatMap(parseKey) : [];
  const active = typeof c.active === "string" && keys.some((k) => k.label === c.active) ? c.active : keys[0]?.label;
  return {
    keys,
    ...(active ? { active } : {}),
    model: isModel(c.model) ? c.model : "opus",
    effort: isEffort(c.effort) ? c.effort : "high",
  };
}

export function saveConfig(c: Config): void {
  mkdirSync(CAPI_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2) + "\n");
}

export function readLedger(): Spend[] {
  if (!existsSync(LEDGER_FILE)) return [];
  return readFileSync(LEDGER_FILE, "utf8")
    .split("\n")
    .flatMap((line) => {
      if (!line.trim()) return [];
      try {
        const v: unknown = JSON.parse(line);
        return isRecord(v) && typeof v.t === "string" && typeof v.key === "string" && typeof v.usd === "number"
          ? [{ t: v.t, key: v.key, usd: v.usd, ...(typeof v.model === "string" ? { model: v.model } : {}) }]
          : [];
      } catch {
        return [];
      }
    });
}

export function recordSpend(key: string, usd: number, model: ModelName): Spend {
  const spend = { t: new Date().toISOString(), key, usd, model };
  mkdirSync(CAPI_DIR, { recursive: true, mode: 0o700 });
  appendFileSync(LEDGER_FILE, JSON.stringify(spend) + "\n");
  return spend;
}

/** What a key has left in its window, from capi's own ledger. A billing error from the API, or the window ending, zeroes it. */
export function creditOf(k: KeyConfig, ledger: Spend[], now = new Date()): Credit {
  const start = fromLocal(k.start);
  const ends = new Date(start.getFullYear(), start.getMonth(), start.getDate() + k.days);
  const spent = ledger.filter((s) => s.key === k.label && new Date(s.t) >= start).reduce((sum, s) => sum + s.usd, 0);
  const ended = now >= ends;
  const out = k.outSince !== undefined && new Date(k.outSince) >= start;
  const daysLeft = Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / DAY_MS));
  return { label: k.label, credit: k.credit, spent, left: out || ended ? 0 : Math.max(0, k.credit - spent), start, ends, daysLeft, ended, out };
}

/** Where a key's credit went: by day and by model, the daily pace, and when it runs out at that pace. */
export function usageOf(k: KeyConfig, ledger: Spend[], now = new Date()): Usage {
  const credit = creditOf(k, ledger, now);
  const spends = ledger.filter((s) => s.key === k.label && new Date(s.t) >= credit.start);
  const byDay = new Map<string, DaySpend>();
  const byModel = new Map<string, number>();
  for (const s of spends) {
    const day = localDate(new Date(s.t));
    const d = byDay.get(day) ?? { day, usd: 0, replies: 0 };
    byDay.set(day, { day, usd: d.usd + s.usd, replies: d.replies + 1 });
    byModel.set(s.model ?? "unknown", (byModel.get(s.model ?? "unknown") ?? 0) + s.usd);
  }
  const daysIn = Math.max(1, Math.ceil((Math.min(now.getTime(), credit.ends.getTime()) - credit.start.getTime()) / DAY_MS));
  const pace = credit.spent / daysIn;
  return {
    ...credit,
    replies: spends.length,
    pace,
    runsOut: pace > 0 && credit.left > 0 ? new Date(now.getTime() + (credit.left / pace) * DAY_MS) : undefined,
    perDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    perModel: [...byModel].map(([model, usd]) => ({ model, usd })).sort((a, b) => b.usd - a.usd),
  };
}

export function readKey(label: string): string | undefined {
  const r = spawnSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", label, "-w"], { encoding: "utf8" });
  const key = r.status === 0 ? r.stdout.trim() : "";
  return key || undefined;
}

export function storeKey(label: string, key: string): void {
  if (!validLabel(label) || !API_KEY.test(key)) throw new Error("That doesn't look like an Anthropic API key (sk-ant-…).");
  // `security -i` reads the command from stdin, so the key never shows up in a process listing.
  spawnSync("security", ["-i"], { input: `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${label} -w ${key}\n`, encoding: "utf8" });
  if (readKey(label) !== key) throw new Error("The Keychain didn't keep the key.");
}

/** Claude Code's home on this Mac: conversations live here, whichever key pays for them. */
export function homes(): string[] {
  const list = [process.env.CLAUDE_CONFIG_DIR, join(homedir(), ".claude")];
  return [...new Set(list.filter((h): h is string => typeof h === "string" && existsSync(h)))];
}

export const defaultHome = (): string => homes()[0] ?? join(homedir(), ".claude");

/** The newest conversation for this folder across every home, or the one with this ID. */
export function findSession(cwd: string, id?: string): { home: string; sessionId: string } | undefined {
  const folder = cwd.replace(/[^A-Za-z0-9]/g, "-");
  let best: { home: string; sessionId: string; mtime: number } | undefined;
  for (const home of homes()) {
    const dir = join(home, "projects", folder);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".jsonl")) continue;
      const sessionId = file.slice(0, -".jsonl".length);
      if (id && sessionId !== id) continue;
      const mtime = statSync(join(dir, file)).mtimeMs;
      if (!best || mtime > best.mtime) best = { home, sessionId, mtime };
    }
  }
  return best && { home: best.home, sessionId: best.sessionId };
}
