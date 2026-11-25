import {
  query,
  type EffortLevel,
  type PermissionMode,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKAssistantMessageError,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { relative } from "node:path";
import { MODELS, readKey, type ModelName } from "./config.js";

export type RunningTool = { id: string; name: string; detail: string };

export type SessionEvent =
  | { type: "ready"; organization: string | undefined }
  | { type: "session"; sessionId: string; mode: PermissionMode }
  | { type: "turnStart" }
  | { type: "status"; label: string }
  | { type: "text"; delta: string }
  | { type: "message"; text: string }
  | { type: "tool"; tool: RunningTool }
  | { type: "toolDone"; id: string; ok: boolean; summary: string }
  | { type: "turnEnd"; key: string; usd: number; ms: number; ok: boolean; model: ModelName }
  | { type: "billing"; key: string }
  | { type: "error"; message: string };

/** `remember`: where answering "always" saves the rule, in words; undefined when there's nothing to save. */
export type PermissionAsk = { tool: string; detail: string; remember: string | undefined; signal: AbortSignal };
export type PermissionAnswer = "yes" | "always" | "no";

export type SessionOptions = {
  cwd: string;
  home: string;
  key: string;
  model: ModelName;
  effort: EffortLevel;
  resume: string | undefined;
  on: (e: SessionEvent) => void;
  ask: (a: PermissionAsk) => Promise<PermissionAnswer>;
};

/** The prompt stream a long-lived query() reads: messages wait here until it asks for the next. */
class Inbox implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = [];
  private wake: (() => void) | undefined;
  private closed = false;

  push(m: SDKUserMessage): void {
    this.queue.push(m);
    this.wake?.();
  }

  close(): void {
    this.closed = true;
    this.wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    for (;;) {
      const next = this.queue.shift();
      if (next) {
        yield next;
        continue;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
      this.wake = undefined;
    }
  }
}

/** One Claude Code process, on one key. A key switch ends it and resumes the conversation in a new one. */
type Run = { q: Query; inbox: Inbox; abort: AbortController; done: Promise<void>; ready: Promise<boolean>; stopped: boolean };

export class Session {
  sessionId: string | undefined;
  key: string;
  busy = false;
  private readonly o: SessionOptions;
  private model: ModelName;
  private effort: EffortLevel;
  private mode: PermissionMode | undefined;
  private run: Run | undefined;
  private costBase = 0;
  private turnStart = 0;
  /** The model a reply started on: a model switched mid-reply mustn't take its cost. */
  private turnModel: ModelName;
  private pendingKey: string | undefined;
  private carryOn = false;
  private switching: Promise<void> | undefined;

  constructor(o: SessionOptions) {
    this.o = o;
    this.sessionId = o.resume;
    this.key = o.key;
    this.model = o.model;
    this.turnModel = o.model;
    this.effort = o.effort;
  }

  open(): void {
    if (!this.run) this.start();
  }

  send(text: string): void {
    this.busy = true;
    this.turnStart = Date.now();
    this.turnModel = this.model;
    this.o.on({ type: "turnStart" });
    void this.deliver(text);
  }

  /** Waits out a key switch in progress, so a message never starts a run on the old key. */
  private async deliver(text: string): Promise<void> {
    await this.switching;
    const run = this.run ?? this.start();
    if (run && (await run.ready)) run.inbox.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });
    else this.endTurn(0, false);
  }

  /** Takes effect now when idle, or as soon as the current reply ends. `carryOn` resumes the interrupted work. */
  switchKey(label: string, carryOn = false): void {
    this.pendingKey = label;
    this.carryOn = carryOn;
    if (!this.busy) this.afterTurn();
  }

  setEffort(effort: EffortLevel): void {
    this.effort = effort;
    this.run?.q.applyFlagSettings({ effortLevel: effort }).catch((err: unknown) => this.fail(err));
  }

  setModel(model: ModelName): void {
    this.model = model;
    this.run?.q.setModel(MODELS[model]).catch((err: unknown) => this.fail(err));
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
    this.run?.q.setPermissionMode(mode).catch((err: unknown) => this.fail(err));
  }

  interrupt(): void {
    this.run?.q.interrupt().catch((err: unknown) => this.fail(err));
  }

  fresh(): Promise<void> {
    return this.restart(() => {
      this.sessionId = undefined;
    });
  }

  /** Ends the current run and starts the next after `change` (a new key, a new conversation); sends wait for it. */
  private restart(change: () => void): Promise<void> {
    const before = this.switching;
    const next = (async () => {
      try {
        await before;
        await this.stop();
        change();
        this.start();
      } catch (err) {
        this.fail(err);
      }
    })();
    this.switching = next;
    void next.then(() => {
      if (this.switching === next) this.switching = undefined;
    });
    return next;
  }

  async stop(): Promise<void> {
    const run = this.run;
    if (!run) return;
    this.run = undefined;
    run.stopped = true;
    run.inbox.close();
    const timer = setTimeout(() => run.abort.abort(), 4000);
    await run.done;
    clearTimeout(timer);
  }

  private start(): Run | undefined {
    const apiKey = readKey(this.key);
    if (!apiKey) {
      this.o.on({ type: "error", message: `No API key stored for "${this.key}". In another terminal: extratime key add ${this.key}` });
      return undefined;
    }
    const env: Record<string, string | undefined> = { ...process.env, ANTHROPIC_API_KEY: apiKey, CLAUDE_CONFIG_DIR: this.o.home };
    // Each of these would outrank the key or the chosen effort.
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.CLAUDE_CODE_OAUTH_TOKEN;
    delete env.CLAUDE_CODE_EFFORT_LEVEL;
    // Inherited from a Claude Code session, these would label extratime's requests as Claude Code's; extratime is an
    // Agent SDK app, so without them the SDK marks its child sdk-ts.
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDECODE;
    const inbox = new Inbox();
    const abort = new AbortController();
    const q = query({
      prompt: inbox,
      options: {
        cwd: this.o.cwd,
        model: MODELS[this.model],
        effort: this.effort,
        ...(this.mode ? { permissionMode: this.mode } : {}),
        ...(this.sessionId ? { resume: this.sessionId } : {}),
        systemPrompt: { type: "preset", preset: "claude_code" },
        settingSources: ["user", "project", "local"],
        includePartialMessages: true,
        abortController: abort,
        env,
        canUseTool: (tool, input, { signal, suggestions }) => this.permit(tool, input, signal, suggestions),
      },
    });
    const run: Run = { q, inbox, abort, done: Promise.resolve(), ready: Promise.resolve(false), stopped: false };
    this.run = run;
    this.costBase = 0;
    run.done = this.pump(run);
    run.ready = this.verify(run);
    return run;
  }

  /** Nothing is sent until the agent confirms it is running on the API key, never a Claude subscription login. */
  private async verify(run: Run): Promise<boolean> {
    try {
      const { account } = await run.q.initializationResult();
      if (account.apiKeySource === "ANTHROPIC_API_KEY") {
        if (this.sessionId) this.costBase = await this.startingCost(run);
        this.o.on({ type: "ready", organization: account.organization });
        return true;
      }
      const source = account.apiKeySource ?? account.tokenSource ?? "another login";
      this.o.on({ type: "error", message: `Stopped before sending anything: the agent would use "${source}", not your ${this.key} API key.` });
    } catch (err) {
      if (!run.abort.signal.aborted) this.fail(err);
    }
    if (this.run === run) await this.stop();
    return false;
  }

  /** A resumed conversation's results count its earlier spend too, so the meter starts from that. */
  private async startingCost(run: Run): Promise<number> {
    try {
      // shortcut: the SDK marks this experimental; if it goes, the first reply after a resume overcounts once.
      const usage = await run.q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true });
      return usage.session.total_cost_usd;
    } catch {
      return 0;
    }
  }

  private async pump(run: Run): Promise<void> {
    try {
      for await (const m of run.q) this.handle(m);
    } catch (err) {
      if (!run.abort.signal.aborted) this.fail(err);
    } finally {
      if (this.run === run) this.run = undefined;
      // A run stopped on purpose (a key switch) may have the next message waiting for its successor.
      if (this.busy && !run.stopped) this.endTurn(0, false);
    }
  }

  private handle(m: SDKMessage): void {
    switch (m.type) {
      case "system":
        if (m.subtype === "init") {
          this.sessionId = m.session_id;
          this.mode = m.permissionMode;
          this.o.on({ type: "session", sessionId: m.session_id, mode: m.permissionMode });
        }
        return;
      case "stream_event": {
        if (m.parent_tool_use_id !== null) return;
        const ev = m.event;
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") this.o.on({ type: "text", delta: ev.delta.text });
        else if (ev.type === "content_block_start" && ev.content_block.type === "thinking") this.o.on({ type: "status", label: "Thinking" });
        return;
      }
      case "assistant":
        if (m.error) this.onApiError(m.error);
        if (m.parent_tool_use_id !== null) return;
        for (const b of m.message.content) {
          if (b.type === "text" && b.text.trim()) this.o.on({ type: "message", text: b.text });
          else if (b.type === "tool_use") this.o.on({ type: "tool", tool: { id: b.id, name: b.name, detail: describe(b.input, this.o.cwd) } });
        }
        return;
      case "user": {
        const content = m.message.content;
        if (m.parent_tool_use_id !== null || typeof content === "string") return;
        for (const b of content) {
          if (b.type === "tool_result") this.o.on({ type: "toolDone", id: b.tool_use_id, ok: b.is_error !== true, summary: summarize(b.content) });
        }
        return;
      }
      case "result": {
        const usd = Math.max(0, m.total_cost_usd - this.costBase);
        this.costBase = m.total_cost_usd;
        this.endTurn(usd, !m.is_error);
        this.afterTurn();
        return;
      }
      default:
        return;
    }
  }

  private onApiError(e: SDKAssistantMessageError): void {
    if (e === "billing_error") this.o.on({ type: "billing", key: this.key });
    else if (e === "authentication_failed") this.o.on({ type: "error", message: `The ${this.key} key was refused. Store it again: extratime key add ${this.key}` });
    else if (e === "rate_limit" || e === "overloaded") this.o.on({ type: "status", label: "Waiting for the API" });
    else this.o.on({ type: "error", message: `The API said: ${e.replaceAll("_", " ")}` });
  }

  private endTurn(usd: number, ok: boolean): void {
    this.busy = false;
    this.o.on({ type: "turnEnd", key: this.key, usd, ms: Date.now() - this.turnStart, ok, model: this.turnModel });
  }

  private afterTurn(): void {
    const label = this.pendingKey;
    if (!label) return;
    this.pendingKey = undefined;
    void this.restart(() => {
      this.key = label;
    });
    if (this.carryOn) {
      this.carryOn = false;
      this.send("Continue where you left off.");
    }
  }

  private async permit(tool: string, input: Record<string, unknown>, signal: AbortSignal, suggestions: PermissionUpdate[] | undefined): Promise<PermissionResult> {
    const answer = await this.o.ask({ tool, detail: describe(input, this.o.cwd), remember: rememberWhere(suggestions), signal });
    if (answer === "no") return { behavior: "deny", message: "The user said no. Stop here and wait for their next message.", interrupt: true };
    return { behavior: "allow", updatedInput: input, ...(answer === "always" && suggestions ? { updatedPermissions: suggestions } : {}) };
  }

  private fail(err: unknown): void {
    this.o.on({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
}

/** Where Claude Code would save an "always" answer, widest first, so the prompt never promises "this session" for a
 * rule that lands in a settings file for good. */
export function rememberWhere(suggestions: PermissionUpdate[] | undefined): string | undefined {
  const where = new Set((suggestions ?? []).map((s) => s.destination));
  if (where.has("userSettings")) return "in any project";
  if (where.has("projectSettings")) return "in this project's shared settings";
  if (where.has("localSettings")) return "in this project";
  if (where.has("session") || where.has("cliArg")) return "this session";
  return undefined;
}

const FIELDS = ["command", "file_path", "notebook_path", "path", "pattern", "url", "query", "skill", "description", "prompt"];

const oneLine = (s: string, max: number): string => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** The one argument worth showing for a tool call: the command, the file, the pattern. */
export function describe(input: unknown, cwd: string): string {
  if (typeof input !== "object" || input === null) return "";
  const fields = new Map<string, unknown>(Object.entries(input));
  for (const f of FIELDS) {
    const v = fields.get(f);
    if (typeof v === "string" && v.trim()) return oneLine(v.startsWith(`${cwd}/`) ? relative(cwd, v) : v, 120);
  }
  return "";
}

/** A tool result in one line: its first line, and how many more there were. */
export function summarize(content: unknown): string {
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((b: unknown) => (typeof b === "object" && b !== null && "text" in b && typeof b.text === "string" ? b.text : "")).join("\n")
        : "";
  const lines = text.split("\n").filter((l) => l.trim());
  const first = lines[0];
  if (first === undefined) return "(no output)";
  return lines.length > 1 ? `${oneLine(first, 100)} (+${lines.length - 1} lines)` : oneLine(first, 100);
}
