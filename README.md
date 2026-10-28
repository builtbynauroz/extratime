# capi

A terminal coding agent on your own Anthropic API key. Built on the Claude Agent SDK, powered by Claude.

When Claude Code says you've hit your plan's usage limit, run `capi -c` in the same folder. capi picks up that conversation where it stopped and carries on, billed to your API key instead of your plan.

## What it costs

capi bills your Anthropic API key at the API's per-token prices; it never touches your Claude subscription, and it refuses to start on a subscription login. It can't see your real balance, so you give each key a budget (`--credit` in USD over `--days`) and capi meters its spending against that, from the SDK's cost estimates. Check your real balance at console.anthropic.com.

## What you need

- macOS (keys are kept in the macOS Keychain)
- Node.js 20 or newer
- An Anthropic API key, from console.anthropic.com → API keys
- Claude Code, only if you want to continue its conversations

## Install

The easy way: open Claude Code in a terminal and paste

> Install capi from https://github.com/OWNER/capi and follow its INSTALL.md.

By hand:

```bash
git clone https://github.com/OWNER/capi ~/capi
cd ~/capi && npm install && npm link
capi key add work --credit 50 --days 30   # asks for the key without showing it
```

## Use

```
capi                  start a new conversation in this folder
capi -c               continue the newest conversation in this folder,
                      including one started in Claude Code
capi -r <id>          continue a conversation by its ID
capi -p "<prompt>"    one reply, printed, with no screen (add -c to continue)
capi usage            spending by day and model, and how long each key lasts
capi status           one line of credit, for Claude Code's status line
capi key add <name> [--credit 100] [--days 30] [--from <YYYY-MM-DD>]
capi key list         your keys, credit left and days left
```

Inside capi: ⌃K switch key · ⌃E effort · ⇧⇥ permissions · esc interrupt · /help. With two keys, capi moves to the other one when a key runs out and carries on.

Your CLAUDE.md files, settings and skills work as they do in Claude Code. To see capi's credit in Claude Code's status line, set this in `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "capi status" }
```

## Privacy

Keys live in your macOS Keychain (service `capi`), never in a file or on screen. Spending is logged on your Mac in `~/.capi/`. Conversations are saved in `~/.claude`, like Claude Code's. Nothing goes anywhere except Anthropic's API.

## Uninstall

```bash
npm unlink -g capi
rm -rf ~/.capi ~/capi
security delete-generic-password -s capi -a <key name>   # once per key
```

## License

MIT. Made by Runtime Studio. Not affiliated with or endorsed by Anthropic.
