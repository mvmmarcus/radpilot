# Demo script (5 minutes)

A tight walkthrough for an interview: log in once, touch every major feature, narrate
the architecture while the UI does the work. All data is synthetic (`supabase/seed.sql`);
see the study table in [README.md](../README.md#demo-data) for the full list.

Setup beforehand: `npm run dev`, logged out, on `/login`. `AI_PROVIDER=mock` (default)
needs no API key and is fully deterministic — good for a live demo with no network risk.

## 0. One-liner (30s)

"RadPilot is an AI-native radiology reporting tool: a worklist, a DICOM viewer next to a
structured report editor, streaming AI drafts from shorthand, and a hybrid copilot that
mixes deterministic safety rules with LLM review and guideline calculators (Fleischner,
BI-RADS, TI-RADS, LI-RADS). Everything is enforced twice — once in the app for a
friendly message, once in the database as the last line of defense — and every report
has version history and an audit trail."

## 1. Log in, worklist (30s)

- Log in as `radiologist@radpilot.test` / `radpilot-demo`.
- Point out: **STAT studies sort first** (`compareWorklistOrder`), then oldest within a
  priority. Study 1 (CTA chest, suspected PE) and study 5 (CT head, fall on
  anticoagulation) are both STAT and should be at the top.
- Claim an unassigned study — the row flips from "Claim" to "Release"; mention this is
  RLS-enforced (`studies: claim or release`), not just a UI check.

## 2. Reading room: viewer + streaming generation (90s)

Open **study 2** (CT chest, incidental right lung nodule, 30 pack-year smoker,
`routine`).

- **Viewer (left):** scroll the stack (mouse wheel), switch the **Lung** window/level
  preset, draw a **Length** measurement over the nodule, click **Insert into Findings**
  — the measurement text lands in the report's Findings section, not just a side panel.
- **Editor (middle):** type shorthand into the generate box, e.g.
  `RLL 8mm solid nodule, no effusion, no consolidation`, click **Generate draft**. The
  structured sections (technique, findings, impression, recommendations) stream in
  section by section (`streamObject` under the hood) and are visibly marked **pending
  review** until accepted or edited — signing is blocked while any AI text is pending.
  Accept them.
- Narrate: every model call is logged to `ai_generations` (provider, model, latency,
  tokens, prompt version) without ever logging the prompt text itself (PHI policy).

## 3. Copilot: guideline suggestion (60s)

- The **copilot panel (right)** re-runs automatically ~800ms after each edit. For the
  nodule finding, the guideline rule should surface a Fleischner-2017 follow-up
  recommendation as a one-click **Fix** (an "append" fix into Recommendations).
- Click **Fix** — the recommendation is appended and the issue resolves, with an audit
  event (`copilot_issue.resolved`) recorded server-side.
- Mention the rules that run on every report: laterality conflicts (left/right
  disagreement between indication/findings/impression), sex-mismatch (e.g. "uterus" on
  a male patient), findings missing from the impression, measurement units, and
  critical-finding detection (PE, pneumothorax, intracranial hemorrhage, free air,
  aortic dissection) — the last one is **blocking**: it cannot be dismissed, only
  resolved, and signing is refused while it is open.

## 4. Critical finding + laterality (60s, optional if time allows)

Open **study 5** (CT head, fall on apixaban, right subdural hemorrhage) in a second tab,
or navigate there instead of continuing study 2.

- Generate a draft from shorthand mentioning "right subdural hematoma". The
  critical-finding rule flags it, the panel shows a **red blocking banner**, and the
  **Sign** button is disabled with a tooltip until it's resolved — this is the "a
  radiologist must consciously acknowledge this before the report goes out" guardrail.

## 5. Sign and export (60s)

Back in study 2 (now clean of blocking issues):

- Click **Sign**. The app runs `evaluateSignGate` first (missing sections, pending AI
  text, open blocking issues) before calling the database, so a bad sign attempt gets a
  specific, friendly reason instead of a raw Postgres error. The DB trigger enforces the
  same gate unconditionally as a second line of defense.
- Once **Final**, the **Export FHIR** and **Export PDF** links appear. Open each:
  - FHIR: a `DiagnosticReport` + `Observation` Bundle (`application/fhir+json`),
    `conclusion` = impression, `presentedForm` = the report as base64 plain text.
  - PDF: header with the synthetic-data notice, patient/exam block, sections in
    template order, signature line, critical-finding flag if set.
  - Both record a `report.exported` audit event.
- Mention **amend**: a final report can be reopened (`Amend` button), edited, and
  re-signed — content is otherwise locked once final (`isEditable`), and every status
  change is snapshotted in `report_versions`.

## 6. Already-final example + wrap-up (30s)

- Open **study 4** (pre-op chest X-ray, already signed) to show a report that is
  final from the start — good for showing the PDF/FHIR export without re-doing the
  sign flow, and to show that content is read-only (no editor focus, Export buttons
  immediately available).
- Close with: "It's a modular monolith — four parallel tracks (worklist, editor/AI,
  copilot/lifecycle, viewer/interop) each owned their module end to end (domain →
  application → infrastructure → UI), landed independently, and Session 5 only wired
  the reading room, the eval suite and the happy-path test on top." See
  [docs/architecture.md](architecture.md) for the module map and
  [docs/adr/](adr/) for the key decisions (LLM provider port, hybrid copilot,
  DB-enforced invariants, PHI policy).

## Fallback if the AI provider errors or times out

`AI_PROVIDER=mock` is deterministic and offline, so this should not happen in the
demo setup above. If a live `openai`/`anthropic` key is configured instead and the
call fails, the editor surfaces the error inline and the rest of the demo (viewer,
copilot rules on manually-typed findings, sign, export) still works without a draft.
