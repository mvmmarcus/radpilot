"use client";

import * as React from "react";
import { AlertTriangle, Check, Sparkles, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ISSUE_SEVERITIES, isBlockingOpen, type CopilotIssue, type IssueSeverity } from "../domain/issue";

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  blocking: "Blocking",
  warning: "Warning",
  info: "Suggestion",
};

const SEVERITY_BADGE_VARIANT: Record<IssueSeverity, "destructive" | "secondary" | "outline"> = {
  blocking: "destructive",
  warning: "secondary",
  info: "outline",
};

const SOURCE_LABEL: Record<CopilotIssue["source"], string> = {
  rule: "Rule",
  llm: "AI review",
  guideline: "Guideline",
};

export interface CopilotPanelProps {
  issues: CopilotIssue[];
  /** Called when the radiologist clicks "Fix" on an issue that has a suggestedFix. Omitted (or undefined) issues show no fix button. */
  onApplyFix?: (issue: CopilotIssue) => void;
  /** Called when the radiologist dismisses a non-blocking issue. Not offered for blocking issues. */
  onDismiss?: (issue: CopilotIssue) => void;
  /** Called when the radiologist acknowledges a blocking issue that has no fix (a communicated critical finding). */
  onAcknowledge?: (issue: CopilotIssue) => void;
  /** Called when the radiologist asks for the LLM review (it does not run on every edit). */
  onRunReview?: () => void;
  /** True while the LLM review is running. */
  reviewing?: boolean;
  className?: string;
}

/**
 * Issue list grouped by severity (blocking first), with a persistent banner
 * while any critical/blocking issue is open, one-click fix for issues that
 * have a suggestedFix, and dismiss for non-blocking issues.
 */
export function CopilotPanel({
  issues,
  onApplyFix,
  onDismiss,
  onAcknowledge,
  onRunReview,
  reviewing = false,
  className,
}: CopilotPanelProps) {
  const open = issues.filter((i) => !i.resolved);
  const blockingOpen = open.filter((i) => isBlockingOpen(i));
  const grouped = ISSUE_SEVERITIES.map((severity) => ({
    severity,
    items: open.filter((i) => i.severity === severity),
  })).filter((group) => group.items.length > 0);

  return (
    <div data-slot="copilot-panel" className={cn("flex h-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          Copilot
        </h2>
        <div className="flex items-center gap-2">
          {open.length > 0 && <Badge variant="secondary">{open.length} open</Badge>}
          {onRunReview && (
            <Button size="xs" variant="outline" onClick={onRunReview} disabled={reviewing}>
              {reviewing ? "Reviewing…" : "AI review"}
            </Button>
          )}
        </div>
      </div>

      {blockingOpen.length > 0 && (
        <Alert variant="destructive" data-slot="copilot-critical-banner">
          <AlertTriangle />
          <AlertTitle>
            {blockingOpen.length} blocking issue{blockingOpen.length > 1 ? "s" : ""} must be resolved before signing
          </AlertTitle>
          <AlertDescription>
            {blockingOpen.some((i) => i.category === "critical_finding")
              ? "A critical finding was detected. Confirm direct communication with the referring clinician."
              : "Review and fix each blocking issue, or acknowledge it is not applicable."}
          </AlertDescription>
        </Alert>
      )}

      {open.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No open issues.</p>
      ) : (
        <ScrollArea className="-mx-1 flex-1 px-1">
          <div className="flex flex-col gap-3">
            {grouped.map((group) => (
              <IssueGroup key={group.severity} severity={group.severity} issues={group.items} onApplyFix={onApplyFix} onDismiss={onDismiss} onAcknowledge={onAcknowledge} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function IssueGroup({
  severity,
  issues,
  onApplyFix,
  onDismiss,
  onAcknowledge,
}: {
  severity: IssueSeverity;
  issues: CopilotIssue[];
  onApplyFix?: (issue: CopilotIssue) => void;
  onDismiss?: (issue: CopilotIssue) => void;
  onAcknowledge?: (issue: CopilotIssue) => void;
}) {
  return (
    <div data-slot="copilot-issue-group" className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
        <Badge variant={SEVERITY_BADGE_VARIANT[severity]}>{SEVERITY_LABEL[severity]}</Badge>
        <span>{issues.length}</span>
      </div>
      {issues.map((issue) => (
        <IssueCard key={issue.id} issue={issue} onApplyFix={onApplyFix} onDismiss={onDismiss} onAcknowledge={onAcknowledge} />
      ))}
    </div>
  );
}

function IssueCard({
  issue,
  onApplyFix,
  onDismiss,
  onAcknowledge,
}: {
  issue: CopilotIssue;
  onApplyFix?: (issue: CopilotIssue) => void;
  onDismiss?: (issue: CopilotIssue) => void;
  onAcknowledge?: (issue: CopilotIssue) => void;
}) {
  const blocking = isBlockingOpen(issue);
  return (
    <div
      data-slot="copilot-issue-card"
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2.5 text-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-foreground">{issue.message}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {SOURCE_LABEL[issue.source]}
          {issue.span ? ` · ${issue.span.section}` : ""}
        </span>
        <div className="flex gap-1.5">
          {issue.suggestedFix && onApplyFix && (
            <Button size="xs" variant="outline" onClick={() => onApplyFix(issue)}>
              <Check data-icon="inline-start" />
              Fix
            </Button>
          )}
          {blocking && !issue.suggestedFix && onAcknowledge && (
            <Button size="xs" variant="outline" onClick={() => onAcknowledge(issue)}>
              <Check data-icon="inline-start" />
              Acknowledge
            </Button>
          )}
          {!blocking && onDismiss && (
            <Button size="xs" variant="ghost" onClick={() => onDismiss(issue)}>
              <X data-icon="inline-start" />
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
