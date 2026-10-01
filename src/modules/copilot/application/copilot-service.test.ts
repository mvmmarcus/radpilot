import { describe, expect, it, vi } from "vitest";
import type { ReportContent } from "@/modules/reports";
import type { CopilotIssue, CopilotIssueDraft } from "../domain/issue";
import type { CopilotReviewer } from "../domain/reviewer";
import { mockCopilotReviewer } from "../domain/reviewer";
import { CopilotService, type AuditRecorder, type CopilotIssueRepository } from "./copilot-service";

function contentWith(sections: Record<string, string>): ReportContent {
  const out: ReportContent["sections"] = {};
  for (const [key, text] of Object.entries(sections)) {
    out[key as keyof ReportContent["sections"]] = { text, source: "human", ai: null };
  }
  return { schemaVersion: 1, sections: out };
}

/** In-memory fake: inserted drafts become issues with sequential ids, resolved tracked in a map. */
class InMemoryIssueRepository implements CopilotIssueRepository {
  private issues: CopilotIssue[] = [];
  private nextId = 1;

  async listOpenIssues(reportId: string): Promise<CopilotIssue[]> {
    return this.issues.filter((i) => i.reportId === reportId && !i.resolved);
  }

  async replaceOpenIssues(reportId: string, drafts: CopilotIssueDraft[]): Promise<CopilotIssue[]> {
    this.issues = this.issues.filter((i) => i.reportId !== reportId || i.resolved);
    const fresh: CopilotIssue[] = drafts.map((draft) => ({
      ...draft,
      id: `issue-${this.nextId++}`,
      reportId,
      resolved: false,
      createdAt: new Date().toISOString(),
    }));
    this.issues.push(...fresh);
    return this.issues.filter((i) => i.reportId === reportId);
  }

  async resolveIssue(issueId: string): Promise<void> {
    const issue = this.issues.find((i) => i.id === issueId);
    if (issue) issue.resolved = true;
  }
}

class InMemoryAuditRecorder implements AuditRecorder {
  events: Parameters<AuditRecorder["record"]>[0][] = [];
  async record(event: Parameters<AuditRecorder["record"]>[0]): Promise<void> {
    this.events.push(event);
  }
}

const baseInput = {
  reportId: "report-1",
  study: { modality: "CT" as const, bodyPart: "chest" as const, indication: "Suspected PE" },
  patient: { sex: "F" as const, ageYears: 58 },
};

describe("CopilotService.run", () => {
  it("runs deterministic rules and stores the resulting issues", async () => {
    const repo = new InMemoryIssueRepository();
    const audit = new InMemoryAuditRecorder();
    const service = new CopilotService(repo, mockCopilotReviewer, audit);

    const content = contentWith({ impression: "Acute right lower lobe pulmonary embolism." });
    const result = await service.run({ ...baseInput, content });

    expect(result.hasBlockingOpen).toBe(true);
    expect(result.issues.some((i) => i.category === "critical_finding")).toBe(true);
  });

  it("merges rule issues with LLM reviewer issues", async () => {
    const repo = new InMemoryIssueRepository();
    const audit = new InMemoryAuditRecorder();
    const llmDraft: CopilotIssueDraft = {
      source: "llm",
      ruleId: null,
      severity: "info",
      category: "clarity",
      message: "Consider specifying the lobe more precisely.",
      span: null,
      suggestedFix: null,
    };
    const reviewer: CopilotReviewer = { reviewReport: vi.fn().mockResolvedValue([llmDraft]) };
    const service = new CopilotService(repo, reviewer, audit);

    const content = contentWith({ findings: "Lungs are clear.", impression: "No acute abnormality." });
    const result = await service.run({ ...baseInput, content });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ source: "llm", message: llmDraft.message });
    expect(result.hasBlockingOpen).toBe(false);
  });

  it("replaces open issues on a second run but keeps resolved ones untouched", async () => {
    const repo = new InMemoryIssueRepository();
    const audit = new InMemoryAuditRecorder();
    const service = new CopilotService(repo, mockCopilotReviewer, audit);

    const critical = contentWith({ findings: "Pneumothorax on the left." });
    const first = await service.run({ ...baseInput, content: critical });
    await service.applyAndResolve(
      first.issues[0],
      { kind: "append", section: "recommendations", text: "Notify clinician." },
      critical,
      "user-1",
    );

    const normal = contentWith({ findings: "Lungs are clear.", impression: "No acute abnormality." });
    const second = await service.run({ ...baseInput, content: normal });

    // The resolved issue from the first run is kept as history; no new open issue was raised.
    expect(second.issues).toHaveLength(1);
    expect(second.issues[0]).toMatchObject({ id: first.issues[0].id, resolved: true });
    expect(second.hasBlockingOpen).toBe(false);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({ action: "copilot_issue.resolved", entity: "copilot_issue" });
  });
});

describe("CopilotService.dismiss", () => {
  it("dismisses a non-blocking issue and records an audit event", async () => {
    const repo = new InMemoryIssueRepository();
    const audit = new InMemoryAuditRecorder();
    const service = new CopilotService(repo, mockCopilotReviewer, audit);

    const content = contentWith({
      findings: "1. 8mm solid nodule in the right lower lobe.",
      impression: "1. No acute cardiopulmonary abnormality.",
    });
    const result = await service.run({ ...baseInput, content });
    const warning = result.issues.find((i) => i.severity === "warning")!;
    expect(warning).toBeDefined();

    await service.dismiss(warning, "user-1");
    expect(audit.events).toHaveLength(1);
  });

  it("refuses to dismiss a blocking issue", async () => {
    const repo = new InMemoryIssueRepository();
    const audit = new InMemoryAuditRecorder();
    const service = new CopilotService(repo, mockCopilotReviewer, audit);

    const content = contentWith({ findings: "Pneumothorax on the left." });
    const result = await service.run({ ...baseInput, content });
    const blocking = result.issues[0];

    await expect(service.dismiss(blocking, "user-1")).rejects.toThrow(/cannot be dismissed/i);
  });
});
