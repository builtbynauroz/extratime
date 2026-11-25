# extratime

A terminal coding agent on your own Anthropic API key. Built on the Claude Agent SDK, powered by Claude. Runs on macOS, Linux and Windows.

When Claude Code says you've hit your plan's usage limit, run `extratime -c` in the same folder. extratime picks up that conversation where it stopped and carries on, billed to your API key instead of your plan.

```bash
npm install -g extratime
extratime key add work --credit 50 --days 30   # asks for the key without showing it
extratime -c                                   # carries on the newest conversation in this folder
```

- [How it works](#how-it-works)
- [What it costs](#what-it-costs)
- [Requirements](#requirements)
- [Install](#install)
- [Commands](#commands)
- [Inside extratime](#inside-extratime)
- [Keys and budgets](#keys-and-budgets)
- [With Claude Code](#with-claude-code)
- [Where things live](#where-things-live)
- [Troubleshooting](#troubleshooting)
- [Uninstall](#uninstall)

## How it works

Claude Code saves each conversation on disk. extratime runs the same engine through the Claude Agent SDK, with Claude Code's system prompt and tools, and opens that conversation again on your API key. Your CLAUDE.md files, settings, permission rules and skills work as they do in Claude Code.

Before anything is sent, extratime checks that the agent is running on your API key. If anything else would be used, a Claude subscription login included, it stops.

It keeps its own record of what each reply costs, meters that against a budget you give each key, and moves the conversation to your next key when one runs out.

## What it costs

extratime bills your Anthropic API key at the API's per-token prices; it never touches your Claude subscription. It can't see your real balance, so you give each key a budget (`--credit` in US dollars over `--days`) and extratime meters its spending against that, from the SDK's cost estimates. Check your real balance at console.anthropic.com.

## Requirements

- macOS, Linux, or Windows 10 or 11. extratime runs Claude Code's engine, so on Windows set up what Claude Code needs there first.
- Node.js 20.6 or newer
- An Anthropic API key, from console.anthropic.com → API keys
- Claude Code, only if you want to continue its conversations

## Install

```bash
npm install -g extratime
```

Update with `npm install -g extratime@latest`.

- **`EACCES` on macOS or Linux:** don't use sudo. Run `npm config set prefix ~/.npm-global`, put `~/.npm-global/bin` on your `PATH`, and install again.
- **Windows PowerShell says running scripts is disabled:** run `extratime.cmd` instead, or allow npm's scripts with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

From source: `git clone https://github.com/builtbynauroz/extratime && cd extratime && npm install && npm link`.

### Add a key

```bash
extratime key add work --credit 50 --days 30
```

It asks for the key without showing it. To paste it from the clipboard instead, pipe it in:

```bash
pbpaste | extratime key add work                          # macOS
wl-paste | extratime key add work                         # Linux, Wayland
xclip -selection clipboard -o | extratime key add work    # Linux, X11
Get-Clipboard | extratime key add work                    # Windows PowerShell
```

Add a second key the same way, and extratime moves to it when the first runs out.

## Commands

```
extratime                  start a new conversation in this folder
extratime -c               continue the newest conversation in this folder (it shows where you left off),
                           including one started in Claude Code
extratime -r <id>          continue a conversation by its ID
extratime -p "<prompt>"    one reply, printed, with no screen (add -c to continue)
extratime usage            spending by day and model, and how long each key lasts
extratime status           one line of credit, for Claude Code's status line
extratime key add <name> [--credit 100] [--days 30] [--from <YYYY-MM-DD>]
extratime key list         your keys, credit left and days left
extratime --help           this list
```

The long forms work too: `--continue`, `--resume <id>`, `--print "<prompt>"`, `-h`.

### `key add`

- `<name>`: lowercase letters, digits and dashes, up to 24 characters, like `work` or `personal`.
- `--credit`: the budget in US dollars, 1 to 100,000. The default is 100, or the key's current budget.
- `--days`: how many days the budget lasts, 1 to 366. The default is 30, or the key's current window.
- `--from`: the day the window starts, as `YYYY-MM-DD`.

Run it again for a key you already have to change its budget. At the prompt, Enter keeps the stored key and its window; entering a key, new or the same one after a top-up, starts the window again today unless you give `--from`. Either way the key's out-of-credit mark is cleared.

### `-p`, for scripts

`extratime -p "<prompt>"` prints the reply, a line for each tool Claude uses, and a last line with the cost, the time taken and what the key has left. Errors go to stderr, and the exit code is 1 if the turn failed. Add `-c` to continue the newest conversation in this folder.

It can't stop to ask for permission, so any tool call that would ask is refused. Allow the tools a script needs in your Claude Code settings (`permissions.allow`).

### `key list`

```
● work       $31.20 left of $50 · 21 days left, until Dec 16
○ spare      $50.00 left of $50 · 30 days left, until Dec 25
```

● marks the key in use. A key with nothing stored says `no key stored`; one whose window has passed says when it ended.

## Inside extratime

Type a message and press Enter.

| Key | What it does |
|---|---|
| Enter | send |
| `\` then Enter | a new line |
| ↑ ↓ | earlier messages |
| Esc | interrupt Claude |
| Ctrl+C | interrupt Claude; on a typed line, clear it; on an empty line, quit |
| Ctrl+D | quit, on an empty line |
| Ctrl+K | switch key |
| Ctrl+E | effort |
| Shift+Tab | permission mode: ask first, auto-edit, auto, plan |
| Ctrl+A or Home, End | start or end of the line |
| Ctrl+U | clear the line |

In a picker, ↑ and ↓ choose, Enter picks and Esc closes.

| Command | What it does |
|---|---|
| `/key [name]` | switch key; the conversation carries on. With no name, a picker |
| `/effort [level]` | low, medium, high (the default), xhigh or max |
| `/model [name]` | opus (the default), sonnet or haiku |
| `/usage` | spending by day and model, and how long the credit lasts |
| `/new` | start a new conversation |
| `/help` | the keys and commands |
| `/exit` | quit (`/quit` works too) |

Any other `/command` goes to the agent: `/compact`, your skills.

When Claude wants to use a tool that needs your OK, press `y` to allow it, `n` or Esc to refuse, or `a` to always allow it. `a` is offered when there's a rule to save, and the prompt says where it goes.

**Models:** opus is Claude Opus 5.5, sonnet is Claude Sonnet 5.5, haiku is Claude Haiku 5.5.
**Effort**, how hard Claude thinks: low for quick answers and small edits, medium for everyday work, high for careful work, xhigh for hard bugs and big changes, max for the hardest problems. Higher effort uses more credit. extratime remembers both.

## Keys and budgets

- Each key gets a budget: `--credit` dollars over `--days` from `--from`. extratime adds up what its replies cost against it.
- When the API says a key is out of credit, extratime marks it out and moves the conversation to your next key with budget left, without stopping.
- When a reply spends the last of a key's budget, the next message goes on another key with budget left. The key isn't marked out, since the API key itself may still have money.
- After you top a key up, run `extratime key add <name>` and press Enter to clear its out-of-credit mark.
- When a key's window ends, its credit counts as spent. Start a new one with `extratime key add <name> --from <YYYY-MM-DD>`.
- extratime counts only its own replies. The Console's Usage page shows everything a key spent.

## With Claude Code

### Carry on a conversation

Run `extratime -c` in the folder Claude Code was working in. It finds that folder's newest conversation in Claude Code's home (`$CLAUDE_CONFIG_DIR`, then `~/.claude`), shows the last thing you said and the reply, and carries on from there. `extratime -r <id>` picks one by its ID. extratime saves its conversations where Claude Code keeps its own.

### Status line

To see extratime's credit in Claude Code's status line, add this to `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "extratime status" }
```

It shows the key in use with a ten-cell meter, then your other keys:

```
extratime ● work ▰▰▰▰▰▰▱▱▱▱ $31.20 left · 21d  ○ spare $50.00
```

### The plugin

The Claude Code plugin warns you with a toast when your 5-hour or weekly limit passes 90%, and again when it runs out, with the command to carry on. It needs Claude Code 2.1.275 or later:

```
/plugin install extratime --marketplace builtbynauroz/extratime
```

From a shell: `claude plugin install extratime --marketplace builtbynauroz/extratime`. Then ask Claude Code to "set up extratime", and it installs the command and your key by following [INSTALL.md](https://github.com/builtbynauroz/extratime/blob/main/INSTALL.md).

## Where things live

- **API keys:** on macOS, in the Keychain (service `extratime`). On Linux, in `~/.extratime/keys.json`, which only you can read. On Windows, in that same file in your user folder, each key sealed with DPAPI so that only your Windows account can open it. Keys never show on screen.
- **Budgets, the key in use, the model and effort:** `~/.extratime/config.json`.
- **Spending:** `~/.extratime/ledger.jsonl`, a line per reply.
- **Conversations:** where Claude Code keeps its own, in `~/.claude/projects`.

On Windows, `~` is your user folder. Nothing goes anywhere except Anthropic's API.

## Troubleshooting

- **"Stopped before sending anything: the agent would use …"**: the agent would have run on another login or key, not yours, so extratime stopped before sending anything. The message names what it found.
- **"No API key stored for work"**: run `extratime key add work`.
- **"The work key was refused"**: the key was mistyped or revoked. Run `extratime key add work` and enter it again.
- **"work is out of credit"**: top it up in the Console, then run `extratime key add work` and press Enter.
- **"Nothing to continue in this folder"**: run extratime in the folder Claude Code was in.
- **"Windows couldn't seal the key"**: extratime uses Windows PowerShell (`powershell.exe`), which comes with Windows. Check that it runs.

## Uninstall

```bash
npm uninstall -g extratime
rm -rf ~/.extratime                                           # Windows PowerShell: Remove-Item -Recurse ~\.extratime
security delete-generic-password -s extratime -a <key name>   # macOS only, once per key
```

## License

MIT. Made by [builtbynauroz](https://builtbynauroz.tech). Not affiliated with or endorsed by Anthropic.
