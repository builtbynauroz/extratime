# capi: UI assessment

Stage A of the ui-ux-engineer pipeline, 2026-11-14, before going public. Path: **refine** (the look stays).

**The baseline:** `npm run frames design/baseline` renders 17 states at 80 and 120 columns, with the mode lines also at 60. `.txt` is plain; `.ansi` keeps colour (`FORCE_COLOR=1`). The frames aren't committed.

**What holds:**
- nothing overflows at any width;
- notices pair a glyph with their colour (• info, ▲ warning, ✗ error), and warning text stays in the default colour, so yellow never carries words on a light theme;
- every meter sits beside its dollar figure;
- the panels share one shape;
- the copy says what happens next.

| # | Finding | Evidence | Severity | Owner | Fix | Size |
|---|---|---|---|---|---|---|
| 1 | Answering **a** on a permission prompt says "don't ask again this session", but the rule can be saved to the project's or the user's settings for good. | `src/ui.tsx:364`; the SDK's `PermissionUpdateDestination` is user, project, local, session or cliArg | Broken (misleading safety copy) | 5 | Word it from the suggestion's destination ("this session", "in this project", "everywhere for you"), and drop **a** when there's nothing to remember | S |
| 2 | A failed tool differs from a passed one only by colour (red ● against green ●). | `conversation-80.ansi`, tool rows; capi's own rule that colour is never the only cue | Broken (colour alone) | 3 | ✗ for a failed tool, ● for one that passed | XS |
| 3 | Help's footer wraps into a stray " to close." line, and help and usage word their footers differently from the pickers. | `help-80.txt`, `usage-80.txt` | Inconsistent | 3 | Put the "/command goes to the agent" sentence in the body; both footers become "any key closes" | XS |
| 4 | The status line is documented as "the key in use, then the others", but lists keys in config order, so the active key can show second. | `capi status`: "○ personal $0.00  ● max …"; `src/cli.tsx:148` | Inconsistent | 5 | Put the active key first | XS |
| 5 | The model is "Opus 5.5" in the status bar but "opus" in the usage view. | `src/ui.tsx` usage view, `MODEL_LABEL` | Inconsistent | 3 | Use `MODEL_LABEL` in the usage view | XS |
| 6 | After `capi -c`, nothing on screen shows where the conversation left off, only a notice, so the moment capi exists for looks like a fresh start. | `conversation-80.txt`: the welcome, then "Continuing the last conversation…" | Weak (the core moment) | 4, 5 | A short "Where you left off": your last message and Claude's last reply, dim and clipped, read from the conversation's file | M |
| 7 | At 60 columns the status bar loses the permission mode first ("high effort ·…"), so "auto" disappears. | `mode-auto-60.txt` | Weak (narrow windows) | 5 | Drop the days and effort before the mode | XS |
| 8 | The welcome line "your API key · Powered by Claude" reads as a fragment. | `start-80.txt` | Weak (copy; needs the owner's yes) | 5 | "◆ capi  coding on your own API key · Powered by Claude" | XS |

No slop or dated patterns: named ANSI colours only, no gradients, and type hierarchy from bold, dim and colour.
