import type { SectionKey } from "@/modules/templates";
import type { TextSpan } from "../issue";

/** A case-insensitive match of `pattern` inside `text`, as a TextSpan. */
export function findSpan(section: SectionKey, text: string, pattern: RegExp): TextSpan | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return { section, start: match.index, end: match.index + match[0].length, quote: match[0] };
}

/** All case-insensitive matches of `pattern` inside `text`, as TextSpans. */
export function findAllSpans(section: SectionKey, text: string, pattern: RegExp): TextSpan[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  const spans: TextSpan[] = [];
  for (const match of text.matchAll(global)) {
    if (match.index === undefined) continue;
    spans.push({ section, start: match.index, end: match.index + match[0].length, quote: match[0] });
  }
  return spans;
}
