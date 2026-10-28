import { homedir } from "node:os";

export const money = (usd: number): string => `$${usd.toFixed(2)}`;
export const whole = (usd: number): string => (Number.isInteger(usd) ? `$${usd}` : money(usd));
export const shortDate = (d: Date): string => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const tilde = (path: string): string => (path.startsWith(homedir()) ? `~${path.slice(homedir().length)}` : path);

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
