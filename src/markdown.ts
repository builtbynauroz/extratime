import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

const byWidth = new Map<number, Marked>();

/** Claude's markdown as terminal text: headings, lists, tables and highlighted code, wrapped to the window. */
export function renderMarkdown(text: string, width: number): string {
  let marked = byWidth.get(width);
  if (!marked) {
    marked = new Marked(markedTerminal({ width, reflowText: true, tab: 2 }));
    byWidth.set(width, marked);
  }
  return marked.parse(text, { async: false }).trimEnd();
}
