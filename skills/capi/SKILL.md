---
name: capi
description: Set up, update or use capi, the terminal coding agent that carries on a Claude Code conversation on the user's own Anthropic API key once the plan's usage limit runs out (capi -c). Use for "set up capi", "install capi", "update capi", "my limit is almost used up", "keep going on my API key".
---

# capi

capi carries on a conversation on the user's own Anthropic API key when Claude Code's plan limit runs out. The user opens a terminal in the same folder and runs `capi -c`: same conversation, billed per token to their key, never to their subscription.

- **Set up, or set up again:** follow `INSTALL.md` at this plugin's root (two folders up from this skill) step by step. It checks the Mac, installs the `capi` command in `~/capi`, and handles the API key and the optional status line.
- **Update:** `cd ~/capi && git pull && npm install`.
- **The limit is near or used up:** tell the user to open a terminal in this folder and run `capi -c`. Claude Code itself can't continue past its plan's limit, and capi can.
- **API keys never go into this conversation.** The user adds a key with `capi key add <name>` in another terminal (it hides what they type), or by copying it and typing `! pbpaste | capi key add <name>` here.
- `capi --help` lists the rest: `capi usage` for spending, `capi key list` for each key's budget and days left.
