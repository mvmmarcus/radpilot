import { mergeAttributes, Node } from "@tiptap/core";

/**
 * One report section (Findings, Impression, ...). Holds the section key and
 * provenance (source, AI review state, generation id) as node attrs so the
 * editor can render the right label, badge and Accept/Regenerate controls,
 * and so content-mapping.ts can read them back out losslessly.
 */
export const ReportSectionExtension = Node.create({
  name: "reportSection",
  group: "block",
  content: "paragraph+",
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      key: { default: null },
      label: { default: "" },
      source: { default: "human" },
      aiGenerationId: { default: null },
      aiReview: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-report-section]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes({ "data-report-section": "" }, HTMLAttributes), 0];
  },
});
