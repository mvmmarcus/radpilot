# Domain primer: radiology reporting

RadPilot is a radiology reporting tool: a radiologist picks up an imaging study from a
worklist, reads the images, writes a structured report (with AI and safety-rule
assistance), signs it, and the signed report is delivered to other systems. This
document explains that workflow, defines the vocabulary used throughout the codebase,
and lists the pain points the product targets. Code references point at
`src/modules/*/domain` (the canonical, framework-free definitions) and
`supabase/migrations/` (the DB-enforced version of the same rules).

## The workflow: order → study → worklist → read → report → sign → deliver

1. **Order.** A referring clinician orders an imaging exam for a patient, with a reason
   ("indication"), e.g. "Suspected PE". In a real hospital this arrives over HL7 ORM/ORU
   or FHIR `ServiceRequest`. RadPilot seeds this step directly as rows in
   `public.studies` (`supabase/seed.sql`) rather than consuming a live feed — see
   `indication` in `StudySchema` (`src/modules/studies/domain/study.ts:62`).

2. **Study.** The order becomes an imaging study once the patient is scanned: one or
   more series of images (a "study" in DICOM terms is the whole exam; a "series" is one
   acquisition, e.g. one CT phase). RadPilot's `Study` type
   (`src/modules/studies/domain/study.ts:55`) captures modality, body part, priority,
   and `dicomPath`, the folder prefix in the private `dicom` Storage bucket where the
   phantom images live (`supabase/migrations/20261001000200_storage.sql`).

3. **Worklist.** Unread and in-progress studies queue up for a radiologist. RadPilot's
   worklist sort (`compareWorklistOrder`, `src/modules/studies/domain/study.ts:82`) is
   priority first (STAT > urgent > routine, via `PRIORITY_RANK`), then oldest study
   first within a priority — the standard "most urgent, then most overdue" triage a
   reading room uses. `StudyStatus` (`unread → in_progress → preliminary → final`)
   mirrors the report's lifecycle and is kept in sync by a DB trigger
   (`reports_sync_study_status`, `supabase/migrations/20261001000000_init_schema.sql:363`),
   not by application code — a radiologist claims a study (`assigned_to`), which RLS
   allows only when it is unclaimed or already theirs
   (`supabase/migrations/20261001000100_rls.sql:65`).

4. **Read.** The radiologist opens the study in a PACS-like viewer (DICOM images,
   window/level presets, measurement tools — Track D) side by side with a report editor
   seeded from a modality+body-part **template**
   (`selectTemplate`, `src/modules/templates/domain/template.ts:90`). Templates define
   the section schema (`SECTION_KEYS`: clinical indication, technique, comparison,
   findings, impression, recommendations — `src/modules/templates/domain/template.ts:5`),
   text macros (`findMacro`), and a one-click "normal report" shortcut
   (`applyNormalReport`, `src/modules/reports/domain/content.ts:59`).

5. **Report.** The radiologist dictates or types shorthand findings; RadPilot's AI
   provider streams a structured draft (`GeneratedReportSchema`,
   `src/modules/ai/domain/generation.ts:19`) into the matching sections. Each section
   tracks where its text came from (`source`: human/template/ai) and, for AI text, a
   review state (`pending/accepted/edited`) that blocks signing until resolved
   (`ReportSection`, `src/modules/reports/domain/content.ts:23`). A hybrid copilot
   (deterministic rules + LLM review + guideline calculators) flags problems before
   signing — see `CopilotIssue` (`src/modules/copilot/domain/issue.ts:46`).

6. **Sign.** Signing is a status transition (`draft`/`amended` → `final`, or
   `draft`/`preliminary` → `final`; see `REPORT_TRANSITIONS`,
   `src/modules/reports/domain/status.ts:16`) that is gated twice: the application
   checks `missingRequiredSections`, `pendingAiSections` and open blocking copilot
   issues first (for a friendly error message), and the database enforces the same
   gate unconditionally in `reports_before_update`
   (`supabase/migrations/20261001000000_init_schema.sql:288`) so no code path can skip
   it. A signed ("final") report's content is then immutable until **amended**.

7. **Deliver.** A final (or amended) report is exported as a FHIR R4 `DiagnosticReport`
   bundle (`GET /api/fhir/DiagnosticReport/[reportId]`) for downstream systems (EHR,
   referring physician portals) and as a PDF (`GET /api/reports/[id]/pdf`) for humans.
   Every export is an audit event (`report.exported`).

## Glossary

- **PACS (Picture Archiving and Communication System).** The system that stores and
  distributes medical images. RadPilot's `dicom` Storage bucket plus the viewer module
  play a minimal PACS role for the demo; it is not a full PACS (no HL7 ADT feed, no
  DICOM C-STORE/C-FIND network services).

- **DICOM (Digital Imaging and Communications in Medicine).** The standard format and
  network protocol for medical images and their metadata. A DICOM file ("instance") has
  pixel data plus tags (patient, study/series/instance UIDs, geometry, window
  center/width, etc.). RadPilot generates synthetic DICOM Part 10 files
  (`scripts/generate-phantom-dicom.ts`) rather than using a real PACS feed.

- **Modality.** The type of imaging equipment/technique that produced a study: CT
  (computed tomography), MR (magnetic resonance), CR (computed radiography / plain
  film), US (ultrasound), MG (mammography) — `MODALITIES`,
  `src/modules/studies/domain/study.ts:22`.

- **Accession (number).** The unique identifier PACS/RIS assigns to one ordered exam —
  distinct from the patient's MRN (medical record number). RadPilot stores it as
  `studies.accession` (`unique`, `supabase/migrations/20261001000000_init_schema.sql:88`).

- **HL7 (Health Level Seven) / FHIR (Fast Healthcare Interoperability Resources).**
  HL7v2 is the older pipe-delimited messaging standard most hospitals still use for
  orders and results (e.g. ORM^O01, ORU^R01). FHIR is the modern REST/JSON standard;
  RadPilot targets FHIR R4 for export because it's what new integrations expect and
  it's far easier to model as a typed bundle than HL7v2 segments.

- **DiagnosticReport.** The FHIR resource representing a finalized or amended
  diagnostic result — status, code (what exam), conclusion (impression text),
  presentedForm (the PDF/text attachment), and references to the Observations it's
  built from. RadPilot's mapper (`src/modules/interop/domain`) builds one per signed
  report, with `status` following `final`/`amended` (never draft).

- **Observation.** The FHIR resource for one discrete clinical finding (e.g. "8 mm
  right lower lobe nodule"). RadPilot maps each `Findings`/`Impression` line
  (`sectionItems`, `src/modules/reports/domain/content.ts:118`) to one Observation
  referenced by the DiagnosticReport.

- **Laterality.** Left/right/bilateral designation of a finding. A classic reporting
  error is a mismatch between the indication ("left thyroid nodule"), the findings, and
  the impression — RadPilot's `laterality-conflict` copilot rule exists specifically to
  catch this (Track C).

- **Critical finding.** A result requiring immediate communication to the ordering
  physician because delay could harm the patient (e.g. pulmonary embolism,
  pneumothorax, intracranial hemorrhage, free intraperitoneal air, aortic dissection).
  Modeled as `reports.is_critical` and the `critical_finding` issue category
  (`ISSUE_CATEGORIES`, `src/modules/copilot/domain/issue.ts:15`); RadPilot's
  `critical-finding` rule sets this flag and is blocking until acknowledged.

- **Preliminary (report).** A provisional interpretation, typically given verbally or
  as an unsigned draft before a final read (e.g. an overnight resident's read before
  attending sign-off). Modeled as `report_status = 'preliminary'`
  (`REPORT_STATUSES`, `src/modules/reports/domain/status.ts:9`); it can still transition
  straight to `final` or (in this single-radiologist MVP) be signed directly from
  `draft`.

- **Final (report).** The signed, legally authoritative version. Immutable except via
  amendment — enforced by `reports_final_is_signed` (a CHECK constraint,
  `supabase/migrations/20261001000000_init_schema.sql:154`) and by
  `reports_before_update` rejecting content changes on a `final` row.

- **Addendum / amended.** A correction or addition to an already-signed report. DICOM
  and most RIS/PACS distinguish an *addendum* (new text appended, original stays
  intact) from a full *amendment* (the report is reopened and corrected). RadPilot
  models the general case as the `amended` status
  (`final → amended → final`, `REPORT_TRANSITIONS`): the report reopens for editing and
  must be re-signed, with every version preserved in `report_versions`
  (`src/modules/reports/domain/report.ts:24`) for a full audit trail.

- **BI-RADS (Breast Imaging-Reporting and Data System).** ACR's structured category
  system (0-6) for breast imaging (mammography, US, MRI) that maps a finding directly to
  a management recommendation — e.g. category 1 "Negative" (routine screening), category
  4 "Suspicious" (biopsy). RadPilot's seed mammography template defaults to
  `"BI-RADS 1: Negative."` plus a routine-screening recommendation
  (`docs/sessions.md`, Session 0b); the `guidelines` module (Track C) implements the
  category → management-text mapping.

- **TI-RADS (Thyroid Imaging-Reporting and Data System).** ACR's points-based system for
  thyroid nodules on ultrasound: composition, echogenicity, shape, margin and echogenic
  foci each contribute points, which sum to a TR level (TR1-TR5) that, combined with
  nodule size, determines whether FNA biopsy or follow-up imaging is indicated.

- **LI-RADS (Liver Imaging-Reporting and Data System).** ACR's system for categorizing
  liver observations on CT/MRI in patients at risk for hepatocellular carcinoma (HCC),
  e.g. in a cirrhosis surveillance study (seed study 7). Major features (arterial phase
  hyperenhancement, washout, capsule, threshold growth) combine into an LR category
  (LR-1 definitely benign … LR-5 definitely HCC, plus LR-M and LR-TIV).

- **Fleischner (Society) guidelines.** The widely used 2017 Fleischner Society
  recommendations for managing incidentally detected pulmonary nodules on CT, based on
  nodule size, solid vs. subsolid, single vs. multiple, and patient risk level —
  determining whether no follow-up, a follow-up CT at a given interval, or further
  workup is recommended. RadPilot's seed study 2 (incidental RLL nodule, 30 pack-years)
  exists to exercise this rule.

- **W/L (Window/Level, aka window width/window center).** The CT/MR grayscale mapping
  that selects which range of Hounsfield Units (or signal intensities) is displayed as
  black-to-white, since raw pixel data has far more dynamic range than a monitor or eye
  can show at once. Window *center* (level) is the HU value mapped to mid-gray; window
  *width* is the HU range mapped across the full grayscale. Standard presets: lung
  (−600/1500), mediastinum/soft tissue (40/400), bone (400/1800), brain (40/80) — these
  are exactly the presets Track D's viewer implements, and `WindowCenter`/`WindowWidth`
  are DICOM tags the phantom generator writes into every CT instance.

## Pain points RadPilot targets

- **Reporting is slow and repetitive.** Radiologists re-type boilerplate (technique,
  normal findings) for every exam. RadPilot's templates (`defaultText`, `normalText`,
  macros) and AI drafting from terse shorthand attack this directly — the "normal
  report" button and macro expansion exist purely to remove keystrokes for the common
  case, and `streamObject` generation turns a one-line shorthand into a full draft.

- **AI drafts need a trust boundary, not blind trust.** A hallucinated or unreviewed AI
  sentence in a signed report is a patient-safety and liability problem. RadPilot makes
  AI provenance a first-class, persisted field (`ReportSection.source`/`ai.review`)
  rather than a UI-only hint, and the signing gate is enforced in the database itself
  (`reports_before_update`) so it can't be bypassed by a bug in application code, a
  direct SQL client, or a future track. This is the "hybrid copilot" idea: deterministic
  rules (laterality, sex-mismatch, measurement sanity, critical-finding keywords) run
  alongside LLM review and guideline calculators, and only rule/guideline-sourced
  blocking issues or pending AI text can stop a sign.

- **Easy-to-miss safety errors recur in dictation.** Laterality conflicts (left vs.
  right across indication/findings/impression), sex-anatomy mismatches (e.g. "prostate"
  on a female patient), findings dropped from the impression, and missing units on
  measurements are common, well-documented classes of reporting error. RadPilot encodes
  each as its own `CopilotRule` (Track C) with a dedicated test, rather than relying on
  a general LLM pass to catch them reliably.

- **Critical findings must not get lost in a worklist.** STAT/urgent priority plus a
  `critical_finding` rule that blocks signing until acknowledged (and sets
  `reports.is_critical`, which a real deployment would wire to a paging/notification
  system) targets the "callback" workflow radiology departments run for actionable
  findings.

- **Guideline-driven follow-up is inconsistent across radiologists.** Fleischner,
  BI-RADS, TI-RADS and LI-RADS exist precisely because follow-up recommendations vary
  by radiologist and are easy to omit under time pressure. RadPilot's guideline
  calculators (Track C) turn a detected finding into a suggested, guideline-cited
  recommendation as a one-click "append" fix (`SuggestedFix`,
  `src/modules/copilot/domain/issue.ts:40`).

- **Reports need to leave the system in a structured, standard form.** A dictated
  report as plain text is not queryable or interoperable. RadPilot's canonical
  `ReportContent` (editor-independent; see `docs/adr/0005-report-content-model.md`) is
  the single source of truth that both the Tiptap editor and the FHIR/PDF exporters
  read from, so interoperability doesn't require re-parsing rendered document markup.

- **Auditability and concurrent editing.** Optimistic concurrency
  (`reports.version`, checked on every update) and an append-only, trigger-written
  `audit_events`/`report_versions` history (clients cannot write either table directly)
  target both the multi-user editing problem and the "who changed what, when" question
  any clinical system must be able to answer.
