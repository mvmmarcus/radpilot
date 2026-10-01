import { describe, expect, it } from "vitest";
import type { CopilotIssue } from "@/modules/copilot";
import type { Template } from "@/modules/templates";
import { createReportContent, setAiSection, type ReportContent } from "../domain/content";
import type { Report, ReportVersion } from "../domain/report";
import {
  amendReport,
  describeSignBlockReason,
  evaluateSignGate,
  getVersionHistory,
  InvalidTransitionError,
  markPreliminary,
  OptimisticConcurrencyError,
  signReport,
  SignBlockedError,
  type ReportLifecycleRepository,
} from "./lifecycle";

const template: Pick<Template, "sections"> = {
  sections: [
    { key: "clinical_indication", label: "Clinical indication", required: true, aiAssisted: false },
    { key: "findings", label: "Findings", required: true, aiAssisted: true },
    { key: "impression", label: "Impression", required: true, aiAssisted: true },
  ],
};

function makeContent(overrides?: Partial<ReportContent["sections"]>): ReportContent {
  const base = createReportContent(template, { indication: "Suspected PE" });
  const content = { ...base, sections: { ...base.sections, ...overrides } };
  return content;
}

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: "report-1",
    studyId: "study-1",
    templateId: "template-1",
    status: "draft",
    content: makeContent({
      findings: { text: "Lungs are clear.", source: "human", ai: null },
      impression: { text: "No acute abnormality.", source: "human", ai: null },
    }),
    isCritical: false,
    version: 1,
    createdBy: "user-1",
    signedBy: null,
    signedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

/** In-memory fake implementing optimistic concurrency the same way the DB trigger does. */
class InMemoryLifecycleRepository implements ReportLifecycleRepository {
  report: Report;
  versions: ReportVersion[] = [];
  openIssues: CopilotIssue[] = [];

  constructor(report: Report) {
    this.report = report;
    this.versions.push({
      id: "v1",
      reportId: report.id,
      version: report.version,
      status: report.status,
      content: report.content,
      createdBy: report.createdBy,
      createdAt: report.createdAt,
    });
  }

  async getReport(): Promise<Report> {
    return this.report;
  }

  async getTemplate(): Promise<Pick<Template, "sections">> {
    return template;
  }

  async listOpenIssues(): Promise<CopilotIssue[]> {
    return this.openIssues;
  }

  async listVersions(): Promise<ReportVersion[]> {
    return this.versions;
  }

  async updateStatus(
    reportId: string,
    expectedVersion: number,
    update: { status: Report["status"]; signedBy?: string; signedAt?: string },
  ): Promise<Report> {
    if (this.report.version !== expectedVersion) throw new OptimisticConcurrencyError(reportId);
    this.report = {
      ...this.report,
      status: update.status,
      signedBy: update.signedBy ?? this.report.signedBy,
      signedAt: update.signedAt ?? this.report.signedAt,
      version: this.report.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.versions.push({
      id: `v${this.report.version}`,
      reportId: this.report.id,
      version: this.report.version,
      status: this.report.status,
      content: this.report.content,
      createdBy: this.report.createdBy,
      createdAt: this.report.updatedAt,
    });
    return this.report;
  }
}

describe("evaluateSignGate", () => {
  it("passes a complete report with no pending AI text and no blocking issues", () => {
    const report = makeReport();
    const result = evaluateSignGate(report, report.content, template, []);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("blocks on missing required sections", () => {
    const report = makeReport({ content: createReportContent(template, { indication: "x" }) });
    const result = evaluateSignGate(report, report.content, template, []);
    expect(result.ok).toBe(false);
    expect(result.reasons[0]).toMatchObject({ kind: "missing_sections" });
    expect(describeSignBlockReason(result.reasons[0])).toMatch(/findings, impression/);
  });

  it("blocks on pending AI sections", () => {
    const content = setAiSection(makeContent({ impression: { text: "", source: "human", ai: null } }), "impression", "Pending AI text.", null);
    const report = makeReport({ content });
    const result = evaluateSignGate(report, content, template, []);
    expect(result.reasons.some((r) => r.kind === "pending_ai_sections")).toBe(true);
  });

  it("blocks on an open blocking issue", () => {
    const report = makeReport();
    const issue: CopilotIssue = {
      id: "issue-1",
      reportId: report.id,
      source: "rule",
      ruleId: "critical-finding",
      severity: "blocking",
      category: "critical_finding",
      message: "Pneumothorax",
      span: null,
      suggestedFix: null,
      resolved: false,
      createdAt: "2026-10-01T00:00:00.000Z",
    };
    const result = evaluateSignGate(report, report.content, template, [issue]);
    expect(result.reasons.some((r) => r.kind === "open_blocking_issues")).toBe(true);
  });

  it("does not block on a resolved or non-blocking issue", () => {
    const report = makeReport();
    const resolved: CopilotIssue = {
      id: "issue-1",
      reportId: report.id,
      source: "rule",
      ruleId: "measurement-units",
      severity: "blocking",
      category: "measurement",
      message: "x",
      span: null,
      suggestedFix: null,
      resolved: true,
      createdAt: "2026-10-01T00:00:00.000Z",
    };
    const warning: CopilotIssue = { ...resolved, id: "issue-2", severity: "warning", resolved: false };
    expect(evaluateSignGate(report, report.content, template, [resolved, warning]).ok).toBe(true);
  });

  it("blocks when the status cannot transition to final", () => {
    const report = makeReport({ status: "final" });
    const result = evaluateSignGate(report, report.content, template, []);
    expect(result.reasons.some((r) => r.kind === "invalid_transition")).toBe(true);
  });
});

describe("markPreliminary", () => {
  it("moves a draft to preliminary and bumps the version", async () => {
    const repo = new InMemoryLifecycleRepository(makeReport());
    const report = await markPreliminary(repo, "report-1");
    expect(report.status).toBe("preliminary");
    expect(report.version).toBe(2);
  });

  it("rejects marking a final report preliminary", async () => {
    const repo = new InMemoryLifecycleRepository(makeReport({ status: "final" }));
    await expect(markPreliminary(repo, "report-1")).rejects.toThrow(InvalidTransitionError);
  });
});

describe("signReport", () => {
  it("signs a complete draft report", async () => {
    const repo = new InMemoryLifecycleRepository(makeReport());
    const report = await signReport(repo, "report-1", "user-1");
    expect(report.status).toBe("final");
    expect(report.signedBy).toBe("user-1");
    expect(report.signedAt).not.toBeNull();
  });

  it("throws SignBlockedError with reasons when required sections are missing", async () => {
    const repo = new InMemoryLifecycleRepository(
      makeReport({ content: createReportContent(template, { indication: "x" }) }),
    );
    await expect(signReport(repo, "report-1", "user-1")).rejects.toThrow(SignBlockedError);
  });

  it("throws SignBlockedError when a blocking issue is open", async () => {
    const repo = new InMemoryLifecycleRepository(makeReport());
    repo.openIssues = [
      {
        id: "issue-1",
        reportId: "report-1",
        source: "rule",
        ruleId: "critical-finding",
        severity: "blocking",
        category: "critical_finding",
        message: "Pneumothorax",
        span: null,
        suggestedFix: null,
        resolved: false,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ];
    await expect(signReport(repo, "report-1", "user-1")).rejects.toThrow(SignBlockedError);
  });

  it("signs an amended report back to final", async () => {
    const repo = new InMemoryLifecycleRepository(makeReport({ status: "amended", version: 3 }));
    const report = await signReport(repo, "report-1", "user-2");
    expect(report.status).toBe("final");
    expect(report.signedBy).toBe("user-2");
  });
});

describe("amendReport", () => {
  it("moves a final report to amended", async () => {
    const repo = new InMemoryLifecycleRepository(
      makeReport({ status: "final", signedBy: "user-1", signedAt: "2026-10-01T00:00:00.000Z" }),
    );
    const report = await amendReport(repo, "report-1");
    expect(report.status).toBe("amended");
  });

  it("rejects amending a draft", async () => {
    const repo = new InMemoryLifecycleRepository(makeReport());
    await expect(amendReport(repo, "report-1")).rejects.toThrow(InvalidTransitionError);
  });
});

describe("getVersionHistory", () => {
  it("returns versions oldest first", async () => {
    const repo = new InMemoryLifecycleRepository(makeReport());
    await markPreliminary(repo, "report-1");
    const history = await getVersionHistory(repo, "report-1");
    expect(history.map((v) => v.version)).toEqual([1, 2]);
    expect(history.map((v) => v.status)).toEqual(["draft", "preliminary"]);
  });
});
