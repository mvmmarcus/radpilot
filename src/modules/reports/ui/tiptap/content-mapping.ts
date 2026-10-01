import type { JSONContent } from "@tiptap/core";
import { SECTION_KEYS, type SectionKey, type Template } from "@/modules/templates";
import { editSection, setAiSection, type ReportContent, type ReportSection } from "../../domain/content";

/**
 * ReportContent <-> Tiptap JSONContent, in both directions, with no live
 * editor instance required (pure functions over plain objects), so they are
 * unit-testable without jsdom. See docs/adr/0005-report-content-model.md.
 *
 * Document shape:
 *   doc
 *     reportSection (attrs: key, label, source, aiGenerationId, aiReview)
 *       paragraph*       (one per non-empty line; a lone empty paragraph when blank)
 *         text (marks: [aiPending] when the section's ai.review is "pending")
 */

const AI_PENDING_MARK = "aiPending";

function linesOf(text: string): string[] {
  return text.length === 0 ? [] : text.split("\n");
}

function sectionToNode(key: SectionKey, section: ReportSection, label: string): JSONContent {
  const lines = linesOf(section.text);
  const pending = section.ai?.review === "pending";
  const paragraphs: JSONContent[] =
    lines.length === 0
      ? [{ type: "paragraph" }]
      : lines.map((line) => ({
          type: "paragraph",
          content: line.length
            ? [{ type: "text", text: line, marks: pending ? [{ type: AI_PENDING_MARK }] : undefined }]
            : undefined,
        }));

  return {
    type: "reportSection",
    attrs: {
      key,
      label,
      source: section.source,
      aiGenerationId: section.ai?.generationId ?? null,
      aiReview: section.ai?.review ?? null,
    },
    content: paragraphs,
  };
}

/** ReportContent -> a Tiptap document, one reportSection node per template section, in template order. */
export function reportContentToTiptapDoc(
  content: ReportContent,
  template: Pick<Template, "sections">,
): JSONContent {
  const sections: JSONContent[] = template.sections.map((templateSection) => {
    const section = content.sections[templateSection.key] ?? { text: "", source: "human" as const, ai: null };
    return sectionToNode(templateSection.key, section, templateSection.label);
  });
  return { type: "doc", content: sections };
}

function nodeText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodeText).join("");
}

function nodeIsPending(node: JSONContent): boolean {
  if (node.type === "text") return (node.marks ?? []).some((m) => m.type === AI_PENDING_MARK);
  return (node.content ?? []).some(nodeIsPending);
}

/**
 * The Tiptap document -> ReportContent. Unknown section keys are ignored
 * (defensive). `previous` supplies the section the doc's attrs describe
 * (source, ai.generationId, ai.review): we never trust the document's own
 * attrs as ground truth, since ProseMirror can carry stale attrs across
 * transactions. The only signal we take from the document itself is whether
 * the aiPending mark is still present on a section's text; the domain's
 * `editSection` already knows that removing it (i.e. a human edit) demotes
 * "pending" to "edited".
 */
export function tiptapDocToReportContent(doc: JSONContent, previous: ReportContent): ReportContent {
  let content = previous;
  for (const node of doc.content ?? []) {
    if (node.type !== "reportSection") continue;
    const key = node.attrs?.key as SectionKey | undefined;
    if (!key || !SECTION_KEYS.includes(key)) continue;

    const text = (node.content ?? []).map(nodeText).join("\n");
    const previousSection = previous.sections[key];
    const wasPending = previousSection?.ai?.review === "pending";
    const stillMarkedPending = wasPending && (node.content ?? []).some(nodeIsPending);

    if (stillMarkedPending) {
      // Unmodified AI text (or re-marked by Regenerate): keep it pending, same generation id.
      content = text === previousSection.text ? content : setAiSection(content, key, text, previousSection.ai!.generationId);
    } else {
      const unchanged = previousSection?.text === text && !wasPending;
      content = unchanged ? content : editSection(content, key, text);
    }
  }
  return content;
}
