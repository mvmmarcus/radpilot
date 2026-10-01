import { z } from "zod";

/**
 * Report lifecycle:
 *
 *   draft ──> preliminary ──sign──> final ──amend──> amended ──sign──> final
 *     └──────────────sign──────────────┘
 */
export const REPORT_STATUSES = ["draft", "preliminary", "final", "amended"] as const;
export const ReportStatusSchema = z.enum(REPORT_STATUSES);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const REPORT_ACTIONS = ["mark_preliminary", "sign", "amend"] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

export const REPORT_TRANSITIONS: Readonly<
  Record<ReportStatus, readonly { action: ReportAction; to: ReportStatus }[]>
> = {
  draft: [
    { action: "mark_preliminary", to: "preliminary" },
    { action: "sign", to: "final" },
  ],
  preliminary: [{ action: "sign", to: "final" }],
  final: [{ action: "amend", to: "amended" }],
  amended: [{ action: "sign", to: "final" }],
};

/** The status an action leads to, or null if the action is not allowed from `from`. */
export function nextStatus(from: ReportStatus, action: ReportAction): ReportStatus | null {
  return REPORT_TRANSITIONS[from].find((t) => t.action === action)?.to ?? null;
}

export function allowedActions(from: ReportStatus): ReportAction[] {
  return REPORT_TRANSITIONS[from].map((t) => t.action);
}

/** Content can only change before signing, or after an amendment is opened. */
export function isEditable(status: ReportStatus): boolean {
  return status !== "final";
}
