import type { EffortLevel, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { useAnimation, useApp, useInput, usePaste, useWindowSize, type Key } from "ink";
import { useEffect, useRef, useState } from "react";
import { EFFORTS, MODELS, creditOf, isEffort, isModel, readKey, readLedger, recordSpend, saveConfig, usageOf, type Config, type ModelName, type Spend } from "./config.js";
import { money, tilde, whole } from "./format.js";
import { renderMarkdown } from "./markdown.js";
import { Session, type PermissionAnswer, type PermissionAsk, type RunningTool, type SessionEvent } from "./session.js";
import { ACCENTS, EFFORT_NOTE, MODEL_LABEL, View, type Item, type KeyView, type Overlay } from "./ui.js";

export type Boot = { config: Config; key: string; ledger: Spend[]; home: string; resume: string | undefined; cwd: string };
type Pending = { tool: string; detail: string; remember: string | undefined; resolve: (a: PermissionAnswer) => void };

const MODES: PermissionMode[] = ["default", "acceptEdits", "auto", "plan"];
const MODEL_NAMES: ModelName[] = Object.keys(MODELS).filter(isModel);

export function App({ boot }: { boot: Boot }) {
  const { exit } = useApp();
  const { columns } = useWindowSize();
  const [config, setConfig] = useState(boot.config);
  const [ledger, setLedger] = useState(boot.ledger);
  const [stored] = useState(() => new Set(boot.config.keys.map((k) => k.label).filter((label) => readKey(label))));
  const keysView = (cfg: Config, spends: Spend[]): KeyView[] =>
    cfg.keys.map((k, i) => ({ ...creditOf(k, spends), accent: ACCENTS[i % ACCENTS.length] ?? "cyan", active: k.label === cfg.active, stored: stored.has(k.label) }));

  const [items, setItems] = useState<Item[]>(() => [{ kind: "welcome", cwd: boot.cwd, home: boot.home, keys: keysView(boot.config, boot.ledger) }]);
  const [live, setLive] = useState("");
  const [tools, setTools] = useState<RunningTool[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Thinking");
  const [overlay, setOverlay] = useState<Overlay | undefined>();
  const [asks, setAsks] = useState<Pending[]>([]);
  const [input, setInput] = useState({ value: "", cursor: 0 });
  const [hint, setHint] = useState<string | undefined>();
  const [mode, setMode] = useState<PermissionMode | undefined>();
  const [sessionUsd, setSessionUsd] = useState(0);
  const toolsRef = useRef<RunningTool[]>([]);
  const history = useRef<string[]>([]);
  const historyAt = useRef(-1);
  const turnStart = useRef(0);
  const latest = useRef({ config, ledger, columns });
  latest.current = { config, ledger, columns };
  const onEvent = useRef<(e: SessionEvent) => void>(() => undefined);

  const add = (item: Item): void => setItems((prev) => [...prev, item]);
  const note = (tone: "info" | "warn" | "bad", text: string): void => add({ kind: "notice", tone, text });
  const commit = (cfg: Config): void => {
    saveConfig(cfg);
    setConfig(cfg);
    latest.current.config = cfg;
  };
  const hasKey = (label: string): boolean => {
    if (!stored.has(label) && readKey(label)) stored.add(label);
    return stored.has(label);
  };
  const setRunning = (next: RunningTool[]): void => {
    toolsRef.current = next;
    setTools(next);
  };

  const requestPermission = (a: PermissionAsk): Promise<PermissionAnswer> =>
    new Promise((resolve) => {
      let settled = false;
      const pending: Pending = {
        tool: a.tool,
        detail: a.detail,
        remember: a.remember,
        resolve: (answer) => {
          if (settled) return;
          settled = true;
          setAsks((queue) => queue.filter((p) => p !== pending));
          resolve(answer);
        },
      };
      a.signal.addEventListener("abort", () => pending.resolve("no"), { once: true });
      setAsks((queue) => [...queue, pending]);
    });

  const [session] = useState(
    () =>
      new Session({
        cwd: boot.cwd,
        home: boot.home,
        key: boot.key,
        model: boot.config.model,
        effort: boot.config.effort,
        resume: boot.resume,
        on: (e) => onEvent.current(e),
        ask: requestPermission,
      }),
  );

  const outOfCredit = (label: string): void => {
    const { config: cfg, ledger: spends } = latest.current;
    const keys = cfg.keys.map((k) => (k.label === label ? { ...k, outSince: new Date().toISOString() } : k));
    const next = keys.map((k) => creditOf(k, spends)).find((c) => c.label !== label && c.left > 0 && hasKey(c.label));
    commit({ ...cfg, keys, ...(next ? { active: next.label } : {}) });
    if (next) {
      note("warn", `${label} is out of credit. Switched to ${next.label} (${money(next.left)} left) and carrying on.`);
      session.switchKey(next.label, true);
      return;
    }
    note("bad", `${label} is out of credit, and no other key has any left. Add one with: capi key add <name>`);
  };

  /** The reply that spends a key's last budget hands the next message to a key with budget left. Unlike a billing
   * error it doesn't mark the key out: the API key itself may still have money. */
  const budgetSpent = (label: string, before: Spend[], after: Spend[]): void => {
    const cfg = latest.current.config;
    const k = cfg.keys.find((x) => x.label === label);
    if (!k || label !== cfg.active || creditOf(k, before).left <= 0 || creditOf(k, after).left > 0) return;
    const next = cfg.keys.map((x) => creditOf(x, after)).find((c) => c.label !== label && c.left > 0 && hasKey(c.label));
    if (next) {
      commit({ ...cfg, active: next.label });
      session.switchKey(next.label);
      note("warn", `${label}'s ${whole(k.credit)} budget is spent. The next message goes on ${next.label} (${money(next.left)} left).`);
      return;
    }
    note("warn", `${label}'s ${whole(k.credit)} budget is spent, and no other key has budget left. Raise it: capi key add ${label} --credit <more>`);
  };

  onEvent.current = (e) => {
    switch (e.type) {
      case "ready":
        return;
      case "session":
        setMode(e.mode);
        return;
      case "turnStart":
        turnStart.current = Date.now();
        setBusy(true);
        setStatus("Thinking");
        return;
      case "status":
        setStatus(e.label);
        return;
      case "text":
        setLive((text) => text + e.delta);
        setStatus("Writing");
        return;
      case "message":
        add({ kind: "assistant", text: renderMarkdown(e.text, Math.max(40, latest.current.columns - 4)) });
        setLive("");
        return;
      case "tool":
        setRunning([...toolsRef.current, e.tool]);
        setStatus(`Running ${e.tool.name}`);
        return;
      case "toolDone": {
        const tool = toolsRef.current.find((t) => t.id === e.id);
        if (tool) add({ kind: "tool", name: tool.name, detail: tool.detail, ok: e.ok, summary: e.summary });
        setRunning(toolsRef.current.filter((t) => t.id !== e.id));
        setStatus("Thinking");
        return;
      }
      case "turnEnd": {
        const before = latest.current.ledger;
        let spends = before;
        if (e.usd > 0) {
          recordSpend(e.key, e.usd, e.model);
          // Read it back rather than append: another capi window may be spending the same key.
          spends = readLedger();
          setLedger(spends);
          latest.current.ledger = spends;
          setSessionUsd((usd) => usd + e.usd);
        }
        add({ kind: "turn", usd: e.usd, ms: e.ms, ok: e.ok });
        setRunning([]);
        setLive("");
        setBusy(false);
        if (e.usd > 0) budgetSpent(e.key, before, spends);
        return;
      }
      case "billing":
        outOfCredit(e.key);
        return;
      case "error":
        note("bad", e.message);
        return;
    }
  };

  useEffect(() => {
    if (boot.resume) note("info", `Continuing the last conversation in this folder, from ${tilde(boot.home)}.`);
    session.open();
    return () => {
      void session.stop();
    };
  }, []);

  const quit = (): void => {
    void session.stop().finally(() => exit());
  };

  const switchTo = (label: string): void => {
    const cfg = latest.current.config;
    if (!cfg.keys.some((k) => k.label === label)) return note("bad", `There's no key called ${label}. Add one with: capi key add ${label}`);
    if (label === cfg.active) return;
    if (!hasKey(label)) return note("bad", `No API key stored for ${label}. In another terminal: capi key add ${label}`);
    commit({ ...cfg, active: label });
    session.switchKey(label);
    note("info", session.busy ? `Switching to ${label} when this reply ends.` : `Now on ${label}. Same conversation.`);
  };

  const setEffort = (effort: EffortLevel): void => {
    commit({ ...latest.current.config, effort });
    session.setEffort(effort);
    note("info", `Effort ${effort}: ${EFFORT_NOTE[effort]}.`);
  };

  const setModel = (model: ModelName): void => {
    commit({ ...latest.current.config, model });
    session.setModel(model);
    note("info", `Model: ${MODEL_LABEL[model]}.`);
  };

  const cycleMode = (): void => {
    const next = MODES[(MODES.indexOf(mode ?? "default") + 1) % MODES.length] ?? "default";
    setMode(next);
    session.setMode(next);
  };

  const open = (kind: "keys" | "effort" | "model" | "help" | "usage"): void => {
    if (kind === "help") return setOverlay({ kind: "help" });
    if (kind === "usage") return setOverlay({ kind: "usage" });
    const index =
      kind === "keys" ? config.keys.findIndex((k) => k.label === config.active) : kind === "effort" ? EFFORTS.indexOf(config.effort) : MODEL_NAMES.indexOf(config.model);
    setOverlay({ kind, index: Math.max(0, index) });
  };

  /** capi's own commands; anything else starting with / goes to the agent (/compact, skills). */
  const runCommand = (text: string): boolean => {
    const [command = "", arg] = text.slice(1).split(/\s+/);
    switch (command) {
      case "key":
      case "keys":
        if (arg) switchTo(arg);
        else open("keys");
        return true;
      case "effort":
        if (isEffort(arg)) setEffort(arg);
        else open("effort");
        return true;
      case "model":
        if (isModel(arg)) setModel(arg);
        else open("model");
        return true;
      case "new":
        void session.fresh().then(() => note("info", "New conversation."));
        return true;
      case "help":
        open("help");
        return true;
      case "usage":
        open("usage");
        return true;
      case "exit":
      case "quit":
        quit();
        return true;
      default:
        return false;
    }
  };

  const submit = (raw: string): void => {
    const text = raw.trim();
    if (!text) return;
    if (session.busy) return setHint("Claude is still on the last message · esc to interrupt");
    history.current.push(text);
    historyAt.current = -1;
    setInput({ value: "", cursor: 0 });
    setHint(undefined);
    if (text.startsWith("/") && runCommand(text)) return;
    add({ kind: "user", text });
    session.send(text);
  };

  const insert = (text: string): void => setInput(({ value, cursor }) => ({ value: value.slice(0, cursor) + text + value.slice(cursor), cursor: cursor + text.length }));

  const recall = (step: -1 | 1): void => {
    const past = history.current;
    if (!past.length) return;
    const at = Math.max(0, Math.min(past.length, (historyAt.current === -1 ? past.length : historyAt.current) + step));
    historyAt.current = at === past.length ? -1 : at;
    const value = past[at] ?? "";
    setInput({ value, cursor: value.length });
  };

  const edit = (ch: string, key: Key): void => {
    if (key.backspace || key.delete) setInput(({ value, cursor }) => (cursor > 0 ? { value: value.slice(0, cursor - 1) + value.slice(cursor), cursor: cursor - 1 } : { value, cursor }));
    else if (key.leftArrow) setInput(({ value, cursor }) => ({ value, cursor: Math.max(0, cursor - 1) }));
    else if (key.rightArrow) setInput(({ value, cursor }) => ({ value, cursor: Math.min(value.length, cursor + 1) }));
    else if (key.home || (key.ctrl && ch === "a")) setInput(({ value }) => ({ value, cursor: 0 }));
    else if (key.end) setInput(({ value }) => ({ value, cursor: value.length }));
    else if (key.ctrl && ch === "u") setInput({ value: "", cursor: 0 });
    else if (key.upArrow) recall(-1);
    else if (key.downArrow) recall(1);
    else if (ch && !key.ctrl && !key.meta) insert(ch);
  };

  const onOverlayKey = (key: Key): void => {
    if (!overlay) return;
    if (overlay.kind === "help" || overlay.kind === "usage" || key.escape) return setOverlay(undefined);
    const count = overlay.kind === "keys" ? config.keys.length : overlay.kind === "effort" ? EFFORTS.length : MODEL_NAMES.length;
    if (key.upArrow) setOverlay({ ...overlay, index: (overlay.index + count - 1) % count });
    else if (key.downArrow) setOverlay({ ...overlay, index: (overlay.index + 1) % count });
    else if (key.return) {
      setOverlay(undefined);
      if (overlay.kind === "keys") {
        const k = config.keys[overlay.index];
        if (k) switchTo(k.label);
      } else if (overlay.kind === "effort") {
        const effort = EFFORTS[overlay.index];
        if (effort) setEffort(effort);
      } else {
        const model = MODEL_NAMES[overlay.index];
        if (model) setModel(model);
      }
    }
  };

  useInput((ch, key) => {
    const ask = asks[0];
    if (ask) {
      // "a" only where there's a rule to save; the prompt then says where it goes.
      const answer: PermissionAnswer | undefined =
        ch === "y" ? "yes" : ch === "a" && ask.remember ? "always" : ch === "n" || key.escape || (key.ctrl && ch === "c") ? "no" : undefined;
      if (answer) ask.resolve(answer);
      return;
    }
    if (overlay) return onOverlayKey(key);
    if (key.ctrl && ch === "c") {
      if (session.busy) session.interrupt();
      else if (input.value) setInput({ value: "", cursor: 0 });
      else quit();
    } else if (key.ctrl && ch === "d") {
      if (!input.value) quit();
    } else if (key.escape) {
      if (session.busy) session.interrupt();
    } else if (key.ctrl && ch === "k") open("keys");
    else if (key.ctrl && ch === "e") open("effort");
    else if (key.shift && key.tab) cycleMode();
    else if (key.return) {
      if (input.value.endsWith("\\")) setInput(({ value }) => ({ value: `${value.slice(0, -1)}\n`, cursor: value.length }));
      else submit(input.value);
    } else edit(ch, key);
  });

  usePaste((text) => insert(text.replace(/\r\n?/g, "\n")), { isActive: asks.length === 0 && !overlay });

  const { frame } = useAnimation({ interval: 80, isActive: busy });
  const firstAsk = asks[0];
  return (
    <View
      s={{
        items,
        live,
        tools,
        busy,
        status,
        overlay,
        ask: firstAsk ? { tool: firstAsk.tool, detail: firstAsk.detail, remember: firstAsk.remember } : undefined,
        input: input.value,
        cursor: input.cursor,
        hint,
        keys: keysView(config, ledger),
        usage: config.keys.map((k, i) => ({ ...usageOf(k, ledger), accent: ACCENTS[i % ACCENTS.length] ?? "cyan", active: k.label === config.active })),
        model: config.model,
        modelNames: MODEL_NAMES,
        effort: config.effort,
        mode,
        sessionUsd,
      }}
      columns={columns}
      frame={frame}
      elapsed={busy ? Math.floor((Date.now() - turnStart.current) / 1000) : 0}
    />
  );
}
