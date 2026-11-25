# extratime

A terminal coding agent on your own Anthropic API key. Built on the Claude Agent SDK, powered by Claude.

When Claude Code says you've hit your plan's usage limit, run `extratime -c` in the same folder. extratime picks up that conversation where it stopped and carries on, billed to your API key instead of your plan.

## What it costs

extratime bills your Anthropic API key at the API's per-token prices; it never touches your Claude subscription, and it refuses to start on a subscription login. It can't see your real balance, so you give each key a budget (`--credit` in USD over `--days`) and extratime meters its spending against that, from the SDK's cost estimates. Check your real balance at console.anthropic.com.

## What you need

- macOS (keys are kept in the macOS Keychain)
- Node.js 20.6 or newer
- An Anthropic API key, from console.anthropic.com → API keys
- Claude Code, only if you want to continue its conversations

## Install

As a Claude Code plugin, in one step (Claude Code 2.1.275 or later):

```
/plugin install extratime --marketplace builtbynauroz/extratime
```

Then ask Claude Code to "set up extratime": it follows INSTALL.md, and from then on a toast warns you when your 5-hour or weekly limit passes 90%, and tells you to run `extratime -c` when it runs out. From a shell: `claude plugin install extratime --marketplace builtbynauroz/extratime`.

Without the plugin, open Claude Code in a terminal and paste

> Install extratime from https://github.com/builtbynauroz/extratime and follow its INSTALL.md.

By hand:

```bash
npm install -g extratime
extratime key add work --credit 50 --days 30   # asks for the key without showing it
```

If `npm install -g` fails with `EACCES`, don't use sudo: `npm config set prefix ~/.npm-global`, put `~/.npm-global/bin` on your `PATH`, and run it again.

From source: `git clone https://github.com/builtbynauroz/extratime && cd extratime && npm install && npm link`.

## Use

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
```

Inside extratime: ⌃K switch key · ⌃E effort · ⇧⇥ permissions · esc interrupt · /help. With two keys, extratime moves to the other one when a key's budget is spent or its API balance runs out, and carries on. `extratime key add <name>` again after topping a key up clears its out-of-credit mark.

Your CLAUDE.md files, settings and skills work as they do in Claude Code. To see extratime's credit in Claude Code's status line, set this in `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "extratime status" }
```

## Privacy

Keys live in your macOS Keychain (service `extratime`), never in a file or on screen. Spending is logged on your Mac in `~/.extratime/`. Conversations are saved in `~/.claude`, like Claude Code's. Nothing goes anywhere except Anthropic's API.

## Uninstall

```bash
npm uninstall -g extratime
rm -rf ~/.extratime
security delete-generic-password -s extratime -a <key name>   # once per key
```

## License

MIT. Made by [builtbynauroz](https://builtbynauroz.tech). Not affiliated with or endorsed by Anthropic.
