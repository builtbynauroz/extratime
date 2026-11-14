# Installing capi: steps for Claude Code

The user asked you to install capi, a terminal coding agent that runs on their own Anthropic API key. Do these steps in order. If one fails, stop and tell the user what failed and why.

1. **Check the machine.** `uname` must print `Darwin` (capi keeps keys in the macOS Keychain) and `node --version` must be 20 or newer. If not, tell the user capi needs macOS and Node.js 20+, and stop.
2. **Check for a clash.** If `command -v capi` already finds a command, tell the user and ask before going on.
3. **Get the code.** From a link: `git clone <link> ~/capi`. From a zip: unzip it to `~/capi`. Use another folder only if the user asks for one.
4. **Install.** `cd ~/capi && npm install && npm link`, then check `capi --help` prints the command list. If `npm link` fails with `EACCES` (Node from the nodejs.org installer keeps npm's global folder where only root can write), never use sudo. Run `npm config set prefix ~/.npm-global`, add `export PATH="$HOME/.npm-global/bin:$PATH"` to `~/.zshrc`, and in a new terminal run `npm link` again.
5. **API key.** Never ask the user to paste an API key into this conversation. Tell them to get one at console.anthropic.com → API keys, then either run `capi key add work --credit 50 --days 30` in a separate terminal window (it asks for the key without showing it), or copy the key and type `! pbpaste | capi key add work --credit 50 --days 30` here. `--credit` is their budget in USD over `--days`: capi can't see their real balance, so it meters against this.
6. **Status line, optional.** Offer to show capi's credit in Claude Code's status line by setting `"statusLine": { "type": "command", "command": "capi status" }` in `~/.claude/settings.json`. If a `statusLine` is already set, ask before replacing it.
7. **Hand over.** Tell the user: when Claude Code says they've hit their usage limit, run `capi -c` in the same folder to carry on with the same conversation on their API key. `capi --help` lists everything else. It bills their API key per token; it never uses their Claude subscription.
