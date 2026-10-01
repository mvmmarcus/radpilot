import { findMacro, type Template } from "./template";

/**
 * Macro expansion for the editor. Typing a trigger (e.g. ".nopte") immediately
 * followed by a word boundary (space, newline or end of text) expands it to
 * the macro's text. Pure function over the section's plain text and the
 * caret offset, so it is trivial to unit test and to wire into a Tiptap
 * input rule.
 */
export interface MacroExpansion {
  /** Text with the trigger replaced by the macro body. */
  text: string;
  /** Caret offset after the expansion (end of the inserted text). */
  caret: number;
}

const TRIGGER_CHARS = /^\.[a-z0-9-]+$/;

/**
 * Look backwards from `caret` in `text` for a macro trigger that was just
 * completed by typing `boundaryChar` (a space, newline, or "" at end of
 * input). Returns the expansion, or null if nothing matches.
 */
export function expandMacroAtCaret(
  template: Pick<Template, "macros">,
  section: Template["sections"][number]["key"],
  text: string,
  caret: number,
): MacroExpansion | null {
  const uptoCaret = text.slice(0, caret);
  const start = Math.max(uptoCaret.lastIndexOf(" "), uptoCaret.lastIndexOf("\n")) + 1;
  const candidate = uptoCaret.slice(start);
  if (!TRIGGER_CHARS.test(candidate)) return null;

  const macro = findMacro(template, candidate);
  if (!macro || macro.section !== section) return null;

  const expanded = macro.text;
  const newText = text.slice(0, start) + expanded + text.slice(caret);
  return { text: newText, caret: start + expanded.length };
}
