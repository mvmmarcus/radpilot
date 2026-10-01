import { editSection, type ReportContent } from "@/modules/reports";
import type { SectionKey } from "@/modules/templates";
import type { SuggestedFix } from "./issue";

/**
 * Apply a one-click fix to report content. Pure: no I/O, no ids assigned.
 * "replace" substitutes the span's character range in its section (re-finding
 * the span's `quote` first, in case the text shifted since the issue was
 * raised); "append" adds a new line at the end of the target section.
 */
export function applyFix(content: ReportContent, fix: SuggestedFix): ReportContent {
  if (fix.kind === "append") {
    return appendToSection(content, fix.section, fix.text);
  }
  return replaceSpan(content, fix);
}

function appendToSection(content: ReportContent, key: SectionKey, text: string): ReportContent {
  const current = content.sections[key]?.text ?? "";
  const next = current.trim().length > 0 ? `${current}\n${text}` : text;
  return editSection(content, key, next);
}

function replaceSpan(content: ReportContent, fix: Extract<SuggestedFix, { kind: "replace" }>): ReportContent {
  const { span, text } = fix;
  const section = content.sections[span.section];
  if (!section) return content;

  const current = section.text;
  const atRecordedRange = current.slice(span.start, span.end) === span.quote;
  if (atRecordedRange) {
    const next = current.slice(0, span.start) + text + current.slice(span.end);
    return editSection(content, span.section, next);
  }

  // Text shifted since the issue was raised: fall back to finding the quote.
  const index = current.indexOf(span.quote);
  if (index === -1) return content;
  const next = current.slice(0, index) + text + current.slice(index + span.quote.length);
  return editSection(content, span.section, next);
}
