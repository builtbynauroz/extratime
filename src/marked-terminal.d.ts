// marked-terminal 7 ships no types, and @types/marked-terminal still describes 6, where this returned a renderer.
declare module "marked-terminal" {
  import type { MarkedExtension } from "marked";
  export function markedTerminal(options?: { width?: number; reflowText?: boolean; tab?: number }, highlightOptions?: Record<string, unknown>): MarkedExtension;
}
