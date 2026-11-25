// extratime's plugin: when a plan usage window (5-hour, weekly) passes 90% or runs out, a toast says how to carry on in the
// same conversation on the user's own API key. One toast per crossing per window; a window that resets can warn again.
import type { Register } from 'claude-code'

const WARN_AT = 90

/** The last level each window announced: 0, WARN_AT or 100. Module state, so a reload may toast a crossing once more. */
const announced = new Map<string, number>()

const windowName = (kind: string): string => (kind === 'five_hour' ? '5-hour' : kind === 'seven_day' ? 'weekly' : kind.replaceAll('_', ' '))

export const register: Register = (on) => {
  on('session.measure', ($, e, next) => {
    for (const w of e.rateLimits) {
      const level = w.percentUsed >= 100 ? 100 : w.percentUsed >= WARN_AT ? WARN_AT : 0
      const before = announced.get(w.kind) ?? 0
      announced.set(w.kind, level)
      if (level <= before) continue
      $.ui.toast(
        level === 100
          ? `Your ${windowName(w.kind)} limit is used up. In a terminal here, run extratime -c: same conversation, on your API key.`
          : `Your ${windowName(w.kind)} limit is at ${Math.floor(w.percentUsed)}%. When it runs out, extratime -c in a terminal here carries on, on your API key.`,
      )
    }
    return next(e)
  })
}
