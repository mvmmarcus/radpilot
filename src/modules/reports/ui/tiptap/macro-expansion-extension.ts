import { Extension, InputRule } from "@tiptap/core";
import { expandMacroAtCaret, type SectionKey, type Template } from "@/modules/templates";

export interface MacroExpansionOptions {
  template: Pick<Template, "macros"> | null;
}

/**
 * Expands macro triggers (e.g. ".nopte ") as the radiologist types, scoped to
 * the reportSection the caret is in. Finds the nearest ancestor reportSection
 * node to know which section (and therefore which macros) apply, then
 * delegates to the pure expandMacroAtCaret (src/modules/templates/domain/macros.ts).
 */
export const MacroExpansionExtension = Extension.create<MacroExpansionOptions>({
  name: "macroExpansion",

  addOptions() {
    return { template: null };
  },

  addInputRules() {
    return [
      new InputRule({
        // Trigger on a trailing space or newline after ".word" (handled by Tiptap's
        // input rule matcher, which fires on every keystroke with the text typed so far).
        find: /\.[a-z0-9-]+[ \n]$/,
        handler: ({ state, range, chain }) => {
          const { template } = this.options;
          if (!template) return;

          const $from = state.doc.resolve(range.from);
          let sectionNode: { attrs: Record<string, unknown> } | null = null;
          for (let depth = $from.depth; depth >= 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name === "reportSection") {
              sectionNode = node;
              break;
            }
          }
          const sectionKey = sectionNode?.attrs.key as SectionKey | undefined;
          if (!sectionKey) return;

          const typed = state.doc.textBetween(range.from, range.to);
          const trigger = typed.replace(/[ \n]$/, "");
          const expansion = expandMacroAtCaret(template, sectionKey, trigger, trigger.length);
          if (!expansion) return;

          const trailing = typed.endsWith("\n") ? "\n" : " ";
          chain().insertContentAt(range, expansion.text + trailing).run();
        },
      }),
    ];
  },
});
