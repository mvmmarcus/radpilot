import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * Visually marks AI-generated text whose ai.review is still "pending".
 * Typing inside marked text naturally drops the mark on the edited
 * characters (ProseMirror's default mark-splitting behavior), which is what
 * content-mapping.ts reads to demote a section from "pending" to "edited".
 */
export const AiPendingMark = Mark.create({
  name: "aiPending",
  inclusive: false,

  parseHTML() {
    return [{ tag: "span[data-ai-pending]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        { "data-ai-pending": "", class: "bg-amber-100 dark:bg-amber-900/40 rounded-sm" },
        HTMLAttributes,
      ),
      0,
    ];
  },
});
