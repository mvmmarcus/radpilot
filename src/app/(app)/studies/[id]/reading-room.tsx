"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import type { CopilotIssue } from "@/modules/copilot";
import { CopilotPanel } from "@/modules/copilot/ui";
import { editSection, type Report, type ReportContent } from "@/modules/reports";
import { ReportEditor } from "@/modules/reports/ui";
import type { PatientSex, Study } from "@/modules/studies";
import type { Template } from "@/modules/templates";
import type { LoadSeriesResult } from "@/modules/viewer/server";
import {
  amendReportAction,
  applyCopilotFixAction,
  dismissCopilotIssueAction,
  evaluateSignGateAction,
  markPreliminaryAction,
  runCopilotAction,
  saveReportContentAction,
  signReportAction,
} from "./actions";

const DicomViewer = dynamic(
  () => import("@/modules/viewer/ui").then((m) => m.DicomViewer),
  { ssr: false, loading: () => <ViewerPlaceholder message="Loading viewer…" /> },
);

function ViewerPlaceholder({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-black text-sm text-white/70">
      {message}
    </div>
  );
}

const AUTOSAVE_DEBOUNCE_MS = 800;
const COPILOT_DEBOUNCE_MS = 800;

const STATUS_LABEL: Record<Report["status"], string> = {
  draft: "Draft",
  preliminary: "Preliminary",
  final: "Final",
  amended: "Amended",
};

export interface ReadingRoomProps {
  study: Study;
  patientName: string;
  patientLabel: string;
  patientSex: PatientSex;
  patientAgeYears: number;
  template: Template;
  report: Report;
  seriesResult: LoadSeriesResult | null;
}

export function ReadingRoom({
  study,
  patientName,
  patientLabel,
  patientSex,
  patientAgeYears,
  template,
  report: initialReport,
  seriesResult,
}: ReadingRoomProps) {
  const [report, setReport] = useState(initialReport);
  const [content, setContent] = useState<ReportContent>(initialReport.content);
  const [issues, setIssues] = useState<CopilotIssue[]>([]);
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);

  const reportRef = useRef(report);
  const contentRef = useRef(content);
  useEffect(() => {
    reportRef.current = report;
    contentRef.current = content;
  }, [report, content]);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copilotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disabled = report.status === "final";

  const examContext = useMemo(
    () => ({
      modality: study.modality,
      bodyPart: study.bodyPart,
      indication: study.indication,
      patientSex,
      patientAgeYears,
    }),
    [study.modality, study.bodyPart, study.indication, patientSex, patientAgeYears],
  );

  const runCopilot = useCallback(async (nextContent: ReportContent) => {
    const result = await runCopilotAction({
      reportId: reportRef.current.id,
      content: nextContent,
      study: { modality: study.modality, bodyPart: study.bodyPart, indication: study.indication },
      patient: { sex: patientSex, ageYears: patientAgeYears },
    });
    if (result.ok && result.data) {
      setIssues(result.data.issues);
    }
  }, [study.modality, study.bodyPart, study.indication, patientSex, patientAgeYears]);

  // Run copilot once on load so the panel is not empty before the first edit.
  useEffect(() => {
    void runCopilot(initialReport.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleAutosave = useCallback((nextContent: ReportContent) => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      const result = await saveReportContentAction(reportRef.current.id, reportRef.current.version, nextContent);
      if (result.ok && result.data) {
        setReport(result.data);
      } else if (result.error) {
        toast.error("Autosave failed", { description: result.error });
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  const scheduleCopilot = useCallback(
    (nextContent: ReportContent) => {
      if (copilotTimer.current) clearTimeout(copilotTimer.current);
      copilotTimer.current = setTimeout(() => {
        void runCopilot(nextContent);
      }, COPILOT_DEBOUNCE_MS);
    },
    [runCopilot],
  );

  const handleEditorChange = useCallback(
    (next: ReportContent) => {
      setContent(next);
      scheduleAutosave(next);
      scheduleCopilot(next);
    },
    [scheduleAutosave, scheduleCopilot],
  );

  const handleInsertMeasurement = useCallback(
    (event: { text: string }) => {
      const next = editSection(
        contentRef.current,
        "findings",
        [contentRef.current.sections.findings?.text, event.text].filter((t) => t?.trim()).join("\n"),
      );
      setContent(next);
      scheduleAutosave(next);
      scheduleCopilot(next);
    },
    [scheduleAutosave, scheduleCopilot],
  );

  const handleApplyFix = useCallback(
    async (issue: CopilotIssue) => {
      if (!issue.suggestedFix) return;
      setBusy(true);
      const result = await applyCopilotFixAction({
        reportId: reportRef.current.id,
        issue: { id: issue.id },
        fix: issue.suggestedFix,
        content: contentRef.current,
        expectedVersion: reportRef.current.version,
      });
      setBusy(false);
      if (result.ok && result.data) {
        setReport(result.data);
        setContent(result.data.content);
        setIssues((prev) => prev.filter((i) => i.id !== issue.id));
        void runCopilot(result.data.content);
      } else if (result.error) {
        toast.error("Could not apply fix", { description: result.error });
      }
    },
    [runCopilot],
  );

  const handleDismiss = useCallback(async (issue: CopilotIssue) => {
    setBusy(true);
    const result = await dismissCopilotIssueAction({ id: issue.id, severity: issue.severity });
    setBusy(false);
    if (result.ok) {
      setIssues((prev) => prev.filter((i) => i.id !== issue.id));
    } else if (result.error) {
      toast.error("Could not dismiss issue", { description: result.error });
    }
  }, []);

  const handleMarkPreliminary = useCallback(async () => {
    setBusy(true);
    const result = await markPreliminaryAction(reportRef.current.id);
    setBusy(false);
    if (result.ok && result.data) {
      setReport(result.data);
      toast.success("Marked preliminary");
    } else if (result.error) {
      toast.error("Could not mark preliminary", { description: result.error });
    }
  }, []);

  const handleSign = useCallback(async () => {
    setSigning(true);
    const gate = await evaluateSignGateAction(reportRef.current.id);
    if (gate.ok && gate.data && !gate.data.ok) {
      setSigning(false);
      toast.error("Cannot sign yet", { description: gate.data.messages.join(" ") });
      return;
    }
    const result = await signReportAction(reportRef.current.id);
    setSigning(false);
    if (result.ok && result.data) {
      setReport(result.data);
      toast.success("Report signed");
    } else if (result.error) {
      toast.error("Sign failed", { description: result.error });
    }
  }, []);

  const handleAmend = useCallback(async () => {
    setBusy(true);
    const result = await amendReportAction(reportRef.current.id);
    setBusy(false);
    if (result.ok && result.data) {
      setReport(result.data);
      toast.success("Report re-opened for amendment");
    } else if (result.error) {
      toast.error("Could not amend", { description: result.error });
    }
  }, []);

  const hasBlockingOpen = issues.some((i) => !i.resolved && i.severity === "blocking");
  const signableStatus = report.status === "draft" || report.status === "preliminary" || report.status === "amended";
  const canMarkPreliminary = report.status === "draft";
  const canAmend = report.status === "final";
  const canExport = report.status === "final" || report.status === "amended";

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-4 border-b bg-card px-4 py-2">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/worklist">&larr; Worklist</Link>
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium">
              {patientName} ({patientLabel})
            </span>
            <span className="text-xs text-muted-foreground">
              {study.accession} &middot; {study.modality} {study.bodyPart.replace("_", "/")} &middot; {study.description}
            </span>
          </div>
          <Badge variant={report.status === "final" ? "default" : "outline"}>{STATUS_LABEL[report.status]}</Badge>
          {report.isCritical && <Badge variant="destructive">Critical finding</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/fhir/DiagnosticReport/${report.id}`} target="_blank" rel="noreferrer">
                  Export FHIR
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`/api/reports/${report.id}/pdf`} target="_blank" rel="noreferrer">
                  Export PDF
                </a>
              </Button>
            </>
          )}
          {canMarkPreliminary && (
            <Button variant="outline" size="sm" onClick={handleMarkPreliminary} disabled={busy}>
              Mark preliminary
            </Button>
          )}
          {canAmend && (
            <Button variant="outline" size="sm" onClick={handleAmend} disabled={busy}>
              Amend
            </Button>
          )}
          {signableStatus && (
            <Button
              size="sm"
              onClick={handleSign}
              disabled={signing || busy || hasBlockingOpen}
              title={hasBlockingOpen ? "Resolve blocking copilot issues before signing." : undefined}
            >
              {signing ? "Signing…" : "Sign"}
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={38} minSize={20}>
            <div className="h-full p-2">
              {seriesResult?.ok ? (
                <DicomViewer series={seriesResult.series} seriesNumber={1} onInsertMeasurement={handleInsertMeasurement} />
              ) : (
                <ViewerPlaceholder
                  message={
                    seriesResult
                      ? `No images available (${seriesResult.reason}).`
                      : "No DICOM series for this study."
                  }
                />
              )}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={42} minSize={25}>
            <div className="h-full overflow-auto p-4">
              <ReportEditor
                template={template}
                initialContent={content}
                onChange={handleEditorChange}
                examContext={examContext}
                reportId={report.id}
                disabled={disabled}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={20} minSize={15}>
            <div className="h-full p-3">
              <CopilotPanel issues={issues} onApplyFix={handleApplyFix} onDismiss={handleDismiss} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
