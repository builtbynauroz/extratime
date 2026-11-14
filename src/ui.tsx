import type { EffortLevel, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { Box, Static, Text } from "ink";
import type { ReactNode } from "react";
import { EFFORTS, isModel, type ModelName, type Usage } from "./config.js";
import { duration, money, shortDate, tilde, whole } from "./format.js";
import type { RunningTool } from "./session.js";

/** The whole screen as plain data, so every state can be rendered without a session (design/frames.tsx). */
export type Tone = "info" | "ok" | "warn" | "bad";
export type KeyView = {
  label: string;
  accent: string;
  left: number;
  credit: number;
  ends: Date;
  daysLeft: number;
  ended: boolean;
  out: boolean;
  active: boolean;
  stored: boolean;
};
export type UsageRow = Usage & { accent: string; active: boolean };
export const ACCENTS = ["cyan", "magenta", "blue", "yellow"];
export type Item =
  | { kind: "welcome"; cwd: string; home: string; keys: KeyView[] }
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; detail: string; ok: boolean; summary: string }
  | { kind: "notice"; tone: Tone; text: string }
  | { kind: "recap"; user: string; reply: string | undefined }
  | { kind: "turn"; usd: number; ms: number; ok: boolean };
export type Overlay = { kind: "keys" | "effort" | "model"; index: number } | { kind: "help" } | { kind: "usage" };
export type Ask = { tool: string; detail: string; remember?: string | undefined };
export type ViewState = {
  items: Item[];
  live: string;
  tools: RunningTool[];
  busy: boolean;
  status: string;
  overlay: Overlay | undefined;
  ask: Ask | undefined;
  input: string;
  cursor: number;
  hint: string | undefined;
  keys: KeyView[];
  usage: UsageRow[];
  model: ModelName;
  modelNames: readonly ModelName[];
  effort: EffortLevel;
  mode: PermissionMode | undefined;
  sessionUsd: number;
};

export const MODEL_LABEL: Record<ModelName, string> = { opus: "Opus 5.5", sonnet: "Sonnet 5.5", haiku: "Haiku 5.5" };
const MODEL_NOTE: Record<ModelName, string> = {
  opus: "$4 in · $20 out per million tokens",
  sonnet: "$2 in · $10 out, about half the cost",
  haiku: "$0.10 in · $0.50 out, for quick jobs",
};
export const EFFORT_NOTE: Record<EffortLevel, string> = {
  low: "quick answers and small edits; cheapest",
  medium: "everyday work",
  high: "careful work; capi's default",
  xhigh: "hard bugs and big changes; uses more credit",
  max: "the hardest problems; uses the most credit",
};
const MODE_LABEL: Record<PermissionMode, string> = {
  default: "ask first",
  acceptEdits: "auto-edit",
  auto: "auto",
  plan: "plan",
  dontAsk: "don't ask",
  bypassPermissions: "bypass",
};
const TONE: Record<Tone, { glyph: string; color: string }> = {
  info: { glyph: "•", color: "blue" },
  ok: { glyph: "✓", color: "green" },
  warn: { glyph: "▲", color: "yellow" },
  bad: { glyph: "✗", color: "red" },
};
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PICK = "↑↓ choose · enter select · esc close";
const CLOSE = "any key closes";

function Meter({ left, credit, cells }: { left: number; credit: number; cells: number }) {
  const share = credit > 0 ? Math.max(0, Math.min(1, left / credit)) : 0;
  const filled = left > 0 ? Math.max(1, Math.round(share * cells)) : 0;
  const color = share >= 0.25 ? "green" : share >= 0.1 ? "yellow" : "red";
  return (
    <Text>
      <Text color={color}>{"▰".repeat(filled)}</Text>
      <Text dimColor>{"▱".repeat(cells - filled)}</Text>
    </Text>
  );
}

function KeyLine({ k, pointer }: { k: KeyView; pointer?: boolean }) {
  return (
    <Text>
      {pointer === undefined ? null : <Text color={k.accent}>{pointer ? "› " : "  "}</Text>}
      <Text color={k.accent}>{k.active ? "● " : "○ "}</Text>
      <Text bold={k.active}>{k.label.padEnd(10)}</Text>
      <Meter left={k.left} credit={k.credit} cells={10} />
      <Text color={k.stored ? undefined : "red"}> {k.stored ? `${money(k.left)} left of ${whole(k.credit)}` : "no key stored"}</Text>
      <Text dimColor>
        {k.out ? " · out of credit" : ""}
        {k.ended ? ` · ended ${shortDate(k.ends)}` : ` · ${k.daysLeft} days left`}
      </Text>
    </Text>
  );
}

function ItemView({ item, accent, columns }: { item: Item; accent: string; columns: number }) {
  switch (item.kind) {
    case "welcome":
      return (
        <Box borderStyle="round" borderColor={accent} paddingX={1} flexDirection="column" width={Math.min(columns - 2, 92)}>
          <Text>
            <Text color={accent} bold>
              ◆ capi
            </Text>
            <Text dimColor>  coding on your own API key · Powered by Claude</Text>
          </Text>
          <Text dimColor>{tilde(item.cwd)}</Text>
          <Text dimColor>conversations are saved in {tilde(item.home)}</Text>
          <Box flexDirection="column" marginTop={1}>
            {item.keys.map((k) => (
              <KeyLine key={k.label} k={k} />
            ))}
          </Box>
          <Box marginTop={1}>
            <Text dimColor>⌃K switch key · ⌃E effort · ⇧⇥ permissions · /help</Text>
          </Box>
        </Box>
      );
    case "user":
      return (
        <Box marginTop={1}>
          <Text color="gray">› </Text>
          <Text>{item.text}</Text>
        </Box>
      );
    case "assistant":
      return (
        <Box marginTop={1}>
          <Text>{item.text}</Text>
        </Box>
      );
    case "tool":
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color={item.ok ? "green" : "red"}>{item.ok ? "● " : "✗ "}</Text>
            <Text bold>{item.name}</Text>
            {item.detail ? <Text dimColor>  {item.detail}</Text> : null}
          </Text>
          <Text color={item.ok ? "gray" : "red"}>  ⎿ {item.summary}</Text>
        </Box>
      );
    case "notice":
      return (
        <Box marginTop={1}>
          <Text color={TONE[item.tone].color}>{TONE[item.tone].glyph} </Text>
          <Text>{item.text}</Text>
        </Box>
      );
    case "recap":
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Where you left off</Text>
          <Text>
            <Text color="gray">› </Text>
            <Text dimColor>{item.user}</Text>
          </Text>
          <Text dimColor>{item.reply ?? "No reply yet. Say go on and Claude picks it up from here."}</Text>
        </Box>
      );
    case "turn":
      return (
        <Text dimColor>
          {"  "}
          {item.ok ? "✓" : "✗"} {money(item.usd)} · {duration(item.ms)}
        </Text>
      );
  }
}

function Live({ s, accent, frame, elapsed }: { s: ViewState; accent: string; frame: number; elapsed: number }) {
  const spin = SPIN[frame % SPIN.length] ?? "·";
  const tail = s.live.split("\n").slice(-8).join("\n");
  return (
    <Box flexDirection="column" marginTop={1}>
      {s.tools.map((t) => (
        <Text key={t.id}>
          <Text color="yellow">{spin} </Text>
          <Text bold>{t.name}</Text>
          {t.detail ? <Text dimColor>  {t.detail}</Text> : null}
        </Text>
      ))}
      {tail ? <Text>{tail}</Text> : null}
      {s.busy ? (
        <Text>
          <Text color={accent}>{spin} </Text>
          <Text>{s.status}…</Text>
          <Text dimColor> {elapsed}s · esc to interrupt</Text>
        </Text>
      ) : null}
    </Box>
  );
}

function InputBox({ s, accent }: { s: ViewState; accent: string }) {
  const at = s.input.slice(s.cursor, s.cursor + 1);
  return (
    <Box borderStyle="round" borderColor={s.busy ? "gray" : accent} paddingX={1} marginTop={1}>
      <Text color={accent}>› </Text>
      {s.input ? (
        <Text>
          {s.input.slice(0, s.cursor)}
          <Text inverse>{at === "" || at === "\n" ? " " : at}</Text>
          {at === "\n" ? "\n" : ""}
          {s.input.slice(s.cursor + 1)}
        </Text>
      ) : (
        <Text>
          <Text inverse> </Text>
          <Text dimColor>{s.busy ? " Claude is working. You can type your next message." : " Ask anything · / for commands"}</Text>
        </Text>
      )}
    </Box>
  );
}

function Panel({ title, color, hint, children }: { title: string; color: string; hint: string; children: ReactNode }) {
  return (
    <Box borderStyle="round" borderColor={color} paddingX={1} flexDirection="column" marginTop={1}>
      <Text bold>{title}</Text>
      <Box flexDirection="column" marginY={1}>
        {children}
      </Box>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}

function Choice({ pointer, chosen, name, note, accent }: { pointer: boolean; chosen: boolean; name: string; note: string; accent: string }) {
  return (
    <Text>
      <Text color={accent}>{pointer ? "› " : "  "}</Text>
      <Text color={chosen ? accent : undefined}>{chosen ? "● " : "○ "}</Text>
      <Text bold={pointer}>{name.padEnd(11)}</Text>
      <Text dimColor>{note}</Text>
    </Text>
  );
}

const HELP: [string, string][] = [
  ["/key [name]", "switch key; the conversation carries on (⌃K)"],
  ["/effort [level]", "low, medium, high, xhigh or max (⌃E)"],
  ["/model [name]", "opus, sonnet or haiku"],
  ["/usage", "spending by day and model, and how long the credit lasts"],
  ["/new", "start a new conversation"],
  ["/exit", "quit (⌃C on an empty line)"],
  ["⇧⇥", "permissions: ask first, auto-edit, auto, plan"],
  ["esc", "interrupt Claude"],
  ["\\ then enter", "new line · ↑↓ earlier messages"],
];

function OverlayView({ s, overlay, accent }: { s: ViewState; overlay: Overlay; accent: string }) {
  switch (overlay.kind) {
    case "help":
      return (
        <Panel title="capi" color={accent} hint={CLOSE}>
          {HELP.map(([key, what]) => (
            <Text key={key}>
              <Text color={accent}>{key.padEnd(17)}</Text>
              <Text>{what}</Text>
            </Text>
          ))}
          <Box marginTop={1}>
            <Text dimColor>Any other /command goes to the agent: /compact, your skills.</Text>
          </Box>
        </Panel>
      );
    case "usage":
      return (
        <Panel title="Usage" color={accent} hint={CLOSE}>
          <UsageView rows={s.usage} />
        </Panel>
      );
    case "keys":
      return (
        <Panel title="Switch key · the conversation carries on" color={accent} hint={PICK}>
          {s.keys.map((k, i) => (
            <KeyLine key={k.label} k={k} pointer={i === overlay.index} />
          ))}
        </Panel>
      );
    case "effort":
      return (
        <Panel title="Effort · how hard Claude thinks" color={accent} hint={PICK}>
          {EFFORTS.map((e, i) => (
            <Choice key={e} pointer={i === overlay.index} chosen={e === s.effort} name={e} note={EFFORT_NOTE[e]} accent={accent} />
          ))}
        </Panel>
      );
    case "model":
      return (
        <Panel title="Model" color={accent} hint={PICK}>
          {s.modelNames.map((m, i) => (
            <Choice key={m} pointer={i === overlay.index} chosen={m === s.model} name={MODEL_LABEL[m]} note={MODEL_NOTE[m]} accent={accent} />
          ))}
        </Panel>
      );
  }
}

const modelName = (m: string): string => (isModel(m) ? MODEL_LABEL[m] : m);
const midnight = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysBetween = (a: Date, b: Date): number => Math.max(0, Math.round((midnight(b) - midnight(a)) / 86_400_000));

/** Where each key's credit went, for /usage and `capi usage`. */
export function UsageView({ rows }: { rows: UsageRow[] }) {
  return (
    <Box flexDirection="column">
      {rows.map((u) => {
        const top = Math.max(...u.perDay.map((d) => d.usd), Number.EPSILON);
        return (
          <Box key={u.label} flexDirection="column" marginBottom={1}>
            <Text>
              <Text color={u.accent} bold>
                {u.active ? "● " : "○ "}
                {u.label.padEnd(10)}
              </Text>
              <Meter left={u.left} credit={u.credit} cells={10} />
              <Text> {money(u.left)} left of {whole(u.credit)}</Text>
              <Text dimColor>{u.ended ? ` · ended ${shortDate(u.ends)}` : ` · ${u.daysLeft} days left`}</Text>
            </Text>
            <Text dimColor>
              {"  "}
              {money(u.spent)} spent since {shortDate(u.start)} ({u.replies} {u.replies === 1 ? "reply" : "replies"}) · about {money(u.pace)} a day
            </Text>
            {u.runsOut && u.runsOut < u.ends ? (
              <Text color="yellow">
                {"  "}▲ At this pace it runs out {shortDate(u.runsOut)}, {daysBetween(u.runsOut, u.ends)} days before it ends on {shortDate(u.ends)}.
              </Text>
            ) : u.ended ? null : u.replies > 0 ? (
              <Text color="green">
                {"  "}✓ At this pace it lasts until it ends on {shortDate(u.ends)}.
              </Text>
            ) : (
              <Text dimColor>{"  "}Ends {shortDate(u.ends)}.</Text>
            )}
            {u.perDay.slice(-14).map((d) => (
              <Text key={d.day}>
                <Text dimColor>{`  ${shortDate(new Date(`${d.day}T12:00:00`)).padEnd(7)} `}</Text>
                <Text color={u.accent}>{"█".repeat(Math.max(1, Math.round((d.usd / top) * 20)))}</Text>
                <Text> {money(d.usd)}</Text>
                <Text dimColor>
                  {" "}
                  · {d.replies} {d.replies === 1 ? "reply" : "replies"}
                </Text>
              </Text>
            ))}
            {u.perModel.length > 0 ? (
              <Text dimColor>
                {"  "}by model: {u.perModel.map((m) => `${modelName(m.model)} ${money(m.usd)}`).join(" · ")}
              </Text>
            ) : null}
          </Box>
        );
      })}
      <Text dimColor>capi counts only its own replies; the Console's Usage page has the rest.</Text>
    </Box>
  );
}

function PermissionBox({ ask }: { ask: Ask }) {
  return (
    <Panel title={`Allow ${ask.tool}?`} color="yellow" hint={`y yes · ${ask.remember ? `a yes, and don't ask again ${ask.remember} · ` : ""}n no, and stop`}>
      <Text>{ask.detail || "(no details)"}</Text>
    </Panel>
  );
}

function StatusBar({ s, columns }: { s: ViewState; columns: number }) {
  const k = s.keys.find((x) => x.active);
  const narrow = columns < 80;
  return (
    <Box paddingX={1}>
      <Box flexGrow={1}>
        <Text wrap="truncate-end">
          {k ? (
            <Text>
              <Text color={k.accent} bold>
                ● {k.label}{" "}
              </Text>
              <Meter left={k.left} credit={k.credit} cells={narrow ? 5 : 10} />
              <Text> {money(k.left)} left</Text>
              {narrow && !k.ended ? null : <Text dimColor> · {k.ended ? "ended" : `${k.daysLeft}d`}</Text>}
            </Text>
          ) : (
            <Text color="red">no key</Text>
          )}
          <Text dimColor> · </Text>
          <Text>{MODEL_LABEL[s.model]}</Text>
          {/* Under 80 columns the days and the effort give way, so the permission mode (auto: Claude acts unasked) stays. */}
          {narrow ? null : (
            <Text>
              <Text dimColor> · </Text>
              <Text>{s.effort}</Text>
              <Text dimColor> effort</Text>
            </Text>
          )}
          <Text dimColor> · </Text>
          <Text>{s.mode ? MODE_LABEL[s.mode] : "starting"}</Text>
          {columns >= 100 ? (
            <Text>
              <Text dimColor> · this run </Text>
              <Text>{money(s.sessionUsd)}</Text>
            </Text>
          ) : null}
        </Text>
      </Box>
      {columns >= 110 ? <Text dimColor>⌃K key · ⌃E effort</Text> : null}
    </Box>
  );
}

export function View({ s, columns, frame, elapsed }: { s: ViewState; columns: number; frame: number; elapsed: number }) {
  const accent = s.keys.find((k) => k.active)?.accent ?? "cyan";
  return (
    <>
      <Static items={s.items}>
        {(item, i) => (
          <Box key={i} paddingX={1}>
            <ItemView item={item} accent={accent} columns={columns} />
          </Box>
        )}
      </Static>
      <Box flexDirection="column" paddingX={1}>
        {s.busy || s.live || s.tools.length > 0 ? <Live s={s} accent={accent} frame={frame} elapsed={elapsed} /> : null}
        {s.ask ? <PermissionBox ask={s.ask} /> : s.overlay ? <OverlayView s={s} overlay={s.overlay} accent={accent} /> : <InputBox s={s} accent={accent} />}
        {s.hint ? <Text dimColor>{s.hint}</Text> : null}
      </Box>
      <StatusBar s={s} columns={columns} />
    </>
  );
}
