import {
  creditOf,
  defaultHome,
  findSession,
  isDate,
  keyStored,
  loadConfig,
  localDate,
  readLedger,
  recordSpend,
  saveConfig,
  storeKey,
  usageOf,
  validLabel,
  type KeyConfig,
} from "./config.js";
import { duration, money, shortDate, whole } from "./format.js";

const HELP = `extratime · a coding agent on your Anthropic API key · Powered by Claude

  extratime                  start a new conversation in this folder
  extratime -c               continue the newest conversation in this folder,
                             including one started in Claude Code
  extratime -r <id>          continue a conversation by its ID
  extratime -p "<prompt>"    one reply, printed, with no screen (add -c to continue)
  extratime usage            spending by day and model, and how long each key lasts
  extratime status           one line of credit, for Claude Code's status line
  extratime key add <name> [--credit 100] [--days 30] [--from <YYYY-MM-DD>]
                             store an API key: it asks without showing it,
                             or reads one piped in (from your clipboard, say);
                             the credit lasts --days from --from (default today)
  extratime key list         your keys, credit left and days left

Inside extratime: ⌃K switch key · ⌃E effort · ⇧⇥ permissions · esc interrupt · /help
`;

const ESC = "\u001b[";
const ANSI = { green: `${ESC}32m`, yellow: `${ESC}33m`, red: `${ESC}31m`, dim: `${ESC}2m`, reset: `${ESC}0m` };

const out = (text: string): void => {
  process.stdout.write(text);
};

function flag(args: string[], name: string, min: number, max: number): number | undefined {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = Number(args[at + 1]);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} needs a number from ${min} to ${max}.`);
  return value;
}

function dateFlag(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1] ?? "";
  if (!isDate(value)) throw new Error(`${name} needs a date like ${localDate()}.`);
  return value;
}

/** Reads one line without echoing it, so a key never shows on screen or in shell history. */
function readHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  return new Promise((resolve) => {
    let value = "";
    const finish = (result: string | undefined): void => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (result === undefined) process.exit(130);
      resolve(result.trim());
    };
    const onData = (chunk: Buffer | string): void => {
      for (const ch of chunk.toString()) {
        if (ch === "\r" || ch === "\n") return finish(value);
        if (ch === "\u0003") return finish(undefined);
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    stdin.resume();
  });
}

/** A key piped in (from the clipboard, say) never touches the screen either. */
function readPiped(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: Buffer | string) => {
      data += chunk.toString();
    });
    process.stdin.on("end", () => resolve(data.trim()));
    process.stdin.on("error", reject);
  });
}

async function keyCommand(args: string[]): Promise<void> {
  const [sub, label] = args;
  const config = loadConfig();
  if (sub === "list") {
    if (!config.keys.length) return out("No keys yet. Add one: extratime key add personal\n");
    const ledger = readLedger();
    for (const k of config.keys) {
      const c = creditOf(k, ledger);
      const state = keyStored(k.label) ?`${money(c.left)} left of ${whole(c.credit)}${c.out ? ", out of credit" : ""}` : "no key stored";
      const window = c.ended ? `ended ${shortDate(c.ends)}` : `${c.daysLeft} days left, until ${shortDate(c.ends)}`;
      out(`${k.label === config.active ? "●" : "○"} ${k.label.padEnd(10)} ${state} · ${window}\n`);
    }
    return;
  }
  if (sub !== "add" || !label) {
    out(HELP);
    process.exitCode = 1;
    return;
  }
  if (!validLabel(label)) throw new Error("A key's name is lowercase letters, digits and dashes, like personal or max.");
  const existing = config.keys.find((k) => k.label === label);
  const credit = flag(args, "--credit", 1, 100000) ?? existing?.credit ?? 100;
  const days = Math.floor(flag(args, "--days", 1, 366) ?? existing?.days ?? 30);
  const from = dateFlag(args, "--from");
  const hasKey = keyStored(label);
  const key = process.stdin.isTTY ? await readHidden(`API key for ${label}${hasKey ? " (Enter keeps the stored one)" : ""}: `) : await readPiped();
  if (key) storeKey(label, key);
  else if (!hasKey) throw new Error("No key entered, so nothing was saved.");
  // A new key starts a new window; otherwise the window stays where it was. Saving a key clears its out-of-credit
  // mark: the owner topped it up, or wants it tried again (a real billing error marks it out again).
  const start = from ?? (key || !existing ? localDate() : existing.start);
  const entry: KeyConfig = { label, credit, start, days };
  const keys = existing ? config.keys.map((k) => (k.label === label ? entry : k)) : [...config.keys, entry];
  saveConfig({ ...config, keys, active: config.active ?? label });
  const window = creditOf(entry, []);
  out(`Saved ${label}: ${whole(credit)} for ${days} days, ${shortDate(window.start)} to ${shortDate(window.ends)}.\n`);
}

async function usageCommand(): Promise<void> {
  const config = loadConfig();
  if (!config.keys.length) return out("No keys yet. Add one: extratime key add personal\n");
  const ledger = readLedger();
  const [{ createElement }, { renderToString }, { ACCENTS, UsageView }] = await Promise.all([import("react"), import("ink"), import("./ui.js")]);
  const rows = config.keys.map((k, i) => ({ ...usageOf(k, ledger), accent: ACCENTS[i % ACCENTS.length] ?? "cyan", active: k.label === config.active }));
  out(`${renderToString(createElement(UsageView, { rows }), { columns: process.stdout.columns || 100 })}\n`);
}

/** One line for Claude Code's status line (`statusLine` in settings.json): the key in use, its meter, then the others. */
function statusLine(): void {
  const config = loadConfig();
  if (!config.keys.length) return out("extratime: no keys");
  const ledger = readLedger();
  const inUseFirst = [...config.keys].sort((a, b) => Number(b.label === config.active) - Number(a.label === config.active));
  const parts = inUseFirst.map((k) => {
    const c = creditOf(k, ledger);
    if (k.label !== config.active) return `${ANSI.dim}○ ${k.label} ${money(c.left)}${ANSI.reset}`;
    const share = c.credit > 0 ? c.left / c.credit : 0;
    const filled = c.left > 0 ? Math.max(1, Math.round(share * 10)) : 0;
    const color = share >= 0.25 ? ANSI.green : share >= 0.1 ? ANSI.yellow : ANSI.red;
    return `● ${k.label} ${color}${"▰".repeat(filled)}${ANSI.dim}${"▱".repeat(10 - filled)}${ANSI.reset} ${money(c.left)} left · ${c.ended ? "ended" : `${c.daysLeft}d`}`;
  });
  out(`extratime ${parts.join("  ")}`);
}

/** One turn with no screen, for scripts and for watching extratime from Claude Code. */
async function printMode(prompt: string, resumeWanted: boolean): Promise<void> {
  const config = loadConfig();
  const key = config.active;
  if (!key) throw new Error("No API keys yet. Store one first: extratime key add personal");
  const found = resumeWanted ? findSession(process.cwd()) : undefined;
  const [{ Session }, { renderMarkdown }] = await Promise.all([import("./session.js"), import("./markdown.js")]);
  const ledger = readLedger();
  await new Promise<void>((resolve) => {
    const session = new Session({
      cwd: process.cwd(),
      home: found?.home ?? defaultHome(),
      key,
      model: config.model,
      effort: config.effort,
      resume: found?.sessionId,
      ask: async () => "no",
      on: (e) => {
        if (e.type === "message") out(`${renderMarkdown(e.text, Math.max(40, (process.stdout.columns || 100) - 2))}\n\n`);
        else if (e.type === "tool") out(`● ${e.tool.name}  ${e.tool.detail}\n`);
        else if (e.type === "error") process.stderr.write(`extratime: ${e.message}\n`);
        else if (e.type === "billing") process.stderr.write(`extratime: ${e.key} is out of credit\n`);
        else if (e.type === "turnEnd") {
          if (e.usd > 0) ledger.push(recordSpend(e.key, e.usd, e.model));
          const k = config.keys.find((x) => x.label === e.key);
          const c = k ? creditOf(k, ledger) : undefined;
          out(`${e.ok ? "✓" : "✗"} ${money(e.usd)} · ${duration(e.ms)}${c ? ` · ${e.key}: ${money(c.left)} left of ${whole(c.credit)}, ${c.daysLeft} days` : ""}\n`);
          if (!e.ok) process.exitCode = 1;
          void session.stop().then(resolve);
        }
      },
    });
    session.send(prompt);
  });
}

async function main(args: string[]): Promise<void> {
  if (args[0] === "key") return keyCommand(args.slice(1));
  if (args[0] === "usage") return usageCommand();
  if (args[0] === "status") return statusLine();
  if (args.includes("-h") || args.includes("--help")) return out(HELP);
  const resumeWanted = args.includes("-c") || args.includes("--continue");
  const printAt = args.findIndex((a) => a === "-p" || a === "--print");
  if (printAt >= 0) {
    const prompt = args
      .slice(printAt + 1)
      .filter((a) => a !== "-c" && a !== "--continue")
      .join(" ")
      .trim();
    if (!prompt) throw new Error('Give the prompt after -p, like: extratime -p "summarise this repo"');
    return printMode(prompt, resumeWanted);
  }
  const config = loadConfig();
  const key = config.active;
  if (!key) {
    out("No API keys yet. Store one first, for example:\n  extratime key add personal --credit 100 --days 30\n");
    process.exitCode = 1;
    return;
  }
  const resumeAt = args.findIndex((a) => a === "-r" || a === "--resume");
  const id = resumeAt >= 0 ? args[resumeAt + 1] : undefined;
  if (resumeAt >= 0 && (!id || id.startsWith("-"))) throw new Error("Give the conversation's ID after -r, or use -c for the newest one here.");
  const wanted = id !== undefined || resumeWanted;
  const cwd = process.cwd();
  const found = wanted ? findSession(cwd, id) : undefined;
  if (wanted && !found) out("Nothing to continue in this folder, so this is a new conversation.\n");
  const [{ createElement }, { render }, { App }] = await Promise.all([import("react"), import("ink"), import("./app.js")]);
  const boot = { config, key, ledger: readLedger(), home: found?.home ?? defaultHome(), resume: found?.sessionId, cwd };
  const app = render(createElement(App, { boot }), { exitOnCtrlC: false });
  await app.waitUntilExit();
}

main(process.argv.slice(2)).catch((err: unknown) => {
  process.stderr.write(`extratime: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
