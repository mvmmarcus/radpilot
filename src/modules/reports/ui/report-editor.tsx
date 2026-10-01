"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GeneratedReportSchema } from "@/modules/ai";
import type { SectionKey, Template } from "@/modules/templates";
import { GENERATION_ID_HEADER } from "../application/generate-constants";
import { setAiSection, type ReportContent } from "../domain/content";
import { AiPendingMark } from "./tiptap/ai-pending-mark";
import { reportContentToTiptapDoc, tiptapDocToReportContent } from "./tiptap/content-mapping";
import { MacroExpansionExtension } from "./tiptap/macro-expansion-extension";
import { ReportSectionExtension } from "./tiptap/report-section-extension";

export interface ReportEditorExamContext {
  modality: string;
  bodyPart: string;
  indication: string;
  patientSex: string;
  patientAgeYears: number;
}

export interface ReportEditorProps {
  template: Pick<Template, "sections" | "macros">;
  initialContent: ReportContent;
  /** Called on every content change (debounced upstream for autosave). */
  onChange: (content: ReportContent) => void;
  /** Streaming generation endpoint. See src/app/api/generate/route.ts. */
  generateApi?: string;
  examContext?: ReportEditorExamContext;
  reportId?: string;
  disabled?: boolean;
}

/**
 * GeneratedReportSchema's fields double as SectionKeys (see ai/domain/generation.ts):
 * every field the model produces is written into the report section of the same name.
 */
const AI_ASSISTED_SECTIONS = ["technique", "findings", "impression", "recommendations"] as const;

function partialSectionText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const lines = value.filter((line): line is string => typeof line === "string" && line.length > 0);
    return lines.length ? lines.join("\n") : null;
  }
  return null;
}

/**
 * The report body: one editable section per template section, built from
 * ReportContent and converted back to it on every change. AI text is
 * highlighted (AiPendingMark) while ai.review is "pending"; editing it
 * demotes it to "edited" (tiptap/content-mapping.ts). Macro triggers (e.g.
 * ".nopte") expand on space/Enter. "Generate draft" streams a partial
 * GeneratedReport into the AI-assisted sections as it arrives.
 */
export function ReportEditor({
  template,
  initialContent,
  onChange,
  generateApi = "/api/generate",
  examContext,
  reportId,
  disabled = false,
}: ReportEditorProps) {
  const contentRef = useRef<ReportContent>(initialContent);
  const [content, setContentState] = useState(initialContent);
  const [shorthand, setShorthand] = useState("");
  const generationIdRef = useRef<string | null>(null);

  const setContent = useCallback(
    (next: ReportContent) => {
      contentRef.current = next;
      setContentState(next);
      onChange(next);
    },
    [onChange],
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      ReportSectionExtension,
      AiPendingMark,
      MacroExpansionExtension.configure({ template }),
    ],
    content: reportContentToTiptapDoc(initialContent, template),
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const next = tiptapDocToReportContent(editor.getJSON(), contentRef.current);
      contentRef.current = next;
      setContentState(next);
      onChange(next);
    },
  });

  const replaceDoc = useCallback(
    (next: ReportContent) => {
      editor?.commands.setContent(reportContentToTiptapDoc(next, template), { emitUpdate: false });
    },
    [editor, template],
  );

  // Adopt content changed outside the editor (a viewer measurement, a copilot
  // fix). Our own edits come back through the parent as the same object, so
  // they are skipped here.
  useEffect(() => {
    if (!editor || initialContent === contentRef.current) return;
    contentRef.current = initialContent;
    setContentState(initialContent);
    replaceDoc(initialContent);
  }, [editor, initialContent, replaceDoc]);

  const { object, submit, isLoading, error } = useObject({
    api: generateApi,
    schema: GeneratedReportSchema,
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      generationIdRef.current = response.headers.get(GENERATION_ID_HEADER);
      return response;
    },
  });

  // Stream partial sections into the editor as they arrive.
  useEffect(() => {
    if (!object) return;
    let next = contentRef.current;
    for (const key of AI_ASSISTED_SECTIONS) {
      const text = partialSectionText(object[key]);
      if (text !== null) next = setAiSection(next, key, text, generationIdRef.current);
    }
    if (next !== contentRef.current) {
      contentRef.current = next;
      setContentState(next);
      onChange(next);
      replaceDoc(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object]);

  const handleGenerate = useCallback(() => {
    if (!examContext) return;
    submit({
      reportId: reportId ?? null,
      sections: template.sections
        .filter((s) => s.aiAssisted)
        .map((s) => ({ key: s.key, label: s.label, required: s.required })),
      exam: examContext,
      shorthand,
    });
  }, [examContext, reportId, shorthand, submit, template.sections]);

  const handleAccept = useCallback(
    (key: SectionKey) => {
      const current = contentRef.current.sections[key];
      if (!current?.ai) return;
      const next: ReportContent = {
        ...contentRef.current,
        sections: {
          ...contentRef.current.sections,
          [key]: { ...current, ai: { ...current.ai, review: "accepted" } },
        },
      };
      setContent(next);
      replaceDoc(next);
    },
    [replaceDoc, setContent],
  );

  const handleRegenerate = useCallback(
    (key: SectionKey) => {
      if (!examContext) return;
      // Re-runs the full draft prompt; the response only overwrites sections
      // still aiAssisted, so a per-section "Regenerate" is a scoped rerun of
      // the same generation rather than a separate prompt (keeps one prompt
      // version to reason about; see report-draft.v1.ts).
      submit({
        reportId: reportId ?? null,
        sections: template.sections
          .filter((s) => s.aiAssisted && s.key === key)
          .map((s) => ({ key: s.key, label: s.label, required: s.required })),
        exam: examContext,
        shorthand,
      });
    },
    [examContext, reportId, shorthand, submit, template.sections],
  );

  const pendingSections = template.sections.filter((s) => content.sections[s.key]?.ai?.review === "pending");

  return (
    <div className="flex flex-col gap-4">
      {examContext && (
        <div className="flex items-end gap-2">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-muted-foreground">Shorthand</span>
            <input
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              placeholder='e.g. "RLL 8mm solid nodule, no effusion"'
              value={shorthand}
              onChange={(e) => setShorthand(e.target.value)}
              disabled={disabled}
            />
          </label>
          <Button type="button" onClick={handleGenerate} disabled={disabled || isLoading}>
            {isLoading ? "Generating…" : "Generate draft"}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {pendingSections.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pendingSections.map((s) => (
            <Badge key={s.key} variant="outline" className="gap-2">
              {s.label} pending review
              <button type="button" className="underline" onClick={() => handleAccept(s.key)} disabled={disabled}>
                Accept
              </button>
              <button
                type="button"
                className="underline"
                onClick={() => handleRegenerate(s.key)}
                disabled={disabled || isLoading}
              >
                Regenerate
              </button>
            </Badge>
          ))}
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
