---
name: extratime
description: Set up, update or use extratime, the terminal coding agent that carries on a Claude Code conversation on the user's own Anthropic API key once the plan's usage limit runs out (extratime -c). Use for "set up extratime", "install extratime", "update extratime", "my limit is almost used up", "keep going on my API key".
---

# extratime

extratime carries on a conversation on the user's own Anthropic API key when Claude Code's plan limit runs out. The user opens a terminal in the same folder and runs `extratime -c`: same conversation, billed per token to their key, never to their subscription.

- **Set up, or set up again:** follow `INSTALL.md` at this plugin's root (two folders up from this skill) step by step. It checks the Mac, installs the `extratime` command from npm, and handles the API key and the optional status line.
- **Update:** `npm install -g extratime@latest`.
- **The limit is near or used up:** tell the user to open a terminal in this folder and run `extratime -c`. Claude Code itself can't continue past its plan's limit, and extratime can.
- **API keys never go into this conversation.** The user adds a key with `extratime key add <name>` in another terminal (it hides what they type), or by copying it and typing `! pbpaste | extratime key add <name>` here (Linux: `wl-paste` or `xclip -selection clipboard -o`; Windows PowerShell: `Get-Clipboard`).
- `extratime --help` lists the rest: `extratime usage` for spending, `extratime key list` for each key's budget and days left.
