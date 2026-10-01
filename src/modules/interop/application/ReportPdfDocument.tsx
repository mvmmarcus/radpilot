import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Patient, Study } from "@/modules/studies";
import { ageSexLabel } from "@/modules/studies";
import type { Report } from "@/modules/reports";
import { SECTION_KEYS, SECTION_LABELS, type Template } from "@/modules/templates";

/**
 * PDF rendering of a signed report, server-rendered with @react-pdf/renderer
 * (GET /api/reports/[id]/pdf). Not a React UI component: it never runs in the
 * browser, so it lives in application/ rather than ui/.
 */

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  notice: {
    marginBottom: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: "#b45309",
    borderStyle: "solid",
    backgroundColor: "#fffbeb",
  },
  noticeText: { fontSize: 8, color: "#92400e" },
  header: { marginBottom: 12, borderBottomWidth: 2, borderBottomColor: "#111", borderBottomStyle: "solid", paddingBottom: 8 },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#444" },
  criticalBanner: {
    marginBottom: 12,
    padding: 6,
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#dc2626",
    borderStyle: "solid",
  },
  criticalText: { fontSize: 10, fontWeight: 700, color: "#991b1b" },
  examBlock: { marginBottom: 14, flexDirection: "row", justifyContent: "space-between" },
  examColumn: { flexDirection: "column", gap: 2 },
  label: { fontSize: 8, color: "#666", textTransform: "uppercase" },
  value: { fontSize: 10, marginBottom: 4 },
  section: { marginBottom: 10 },
  sectionLabel: { fontSize: 10, fontWeight: 700, marginBottom: 2, textTransform: "uppercase" },
  sectionText: { fontSize: 10, lineHeight: 1.4 },
  signatureBlock: { marginTop: 28, borderTopWidth: 1, borderTopColor: "#999", borderTopStyle: "solid", paddingTop: 8 },
  signatureLine: { fontSize: 10, marginBottom: 2 },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7, color: "#888", textAlign: "center" },
});

export interface ReportPdfData {
  report: Report;
  study: Study;
  patient: Patient;
  template: Pick<Template, "sections">;
  signedByName: string | null;
}

function ExamField({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || "—"}</Text>
    </View>
  );
}

export function ReportPdfDocument({ report, study, patient, template, signedByName }: ReportPdfData) {
  const orderedKeys = SECTION_KEYS.filter((key) => template.sections.some((s) => s.key === key));
  const statusLabel = report.status === "amended" ? "AMENDED REPORT" : "FINAL REPORT";
  const signedDate = report.signedAt ? new Date(report.signedAt).toLocaleString("en-US", { timeZone: "UTC" }) : null;

  return (
    <Document title={`${study.description} - ${patient.fullName}`} author="RadPilot">
      <Page size="LETTER" style={styles.page}>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            SYNTHETIC DATA — RadPilot demo. This patient, study and report are fictional and generated for
            demonstration purposes only. Not for clinical use.
          </Text>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>RadPilot Radiology Report</Text>
          <Text style={styles.subtitle}>{statusLabel}</Text>
        </View>

        {report.isCritical ? (
          <View style={styles.criticalBanner}>
            <Text style={styles.criticalText}>CRITICAL FINDING — communicated per protocol</Text>
          </View>
        ) : null}

        <View style={styles.examBlock}>
          <View style={styles.examColumn}>
            <ExamField label="Patient" value={patient.fullName} />
            <ExamField label="MRN" value={patient.mrn} />
            <ExamField label="Age / Sex" value={ageSexLabel(patient)} />
            <ExamField label="Date of birth" value={patient.birthDate} />
          </View>
          <View style={styles.examColumn}>
            <ExamField label="Accession" value={study.accession} />
            <ExamField label="Exam" value={study.description} />
            <ExamField label="Study date" value={new Date(study.studyDate).toLocaleString("en-US", { timeZone: "UTC" })} />
            <ExamField label="Indication" value={study.indication} />
          </View>
        </View>

        {orderedKeys.map((key) => {
          const section = report.content.sections[key];
          if (!section?.text.trim()) return null;
          return (
            <View key={key} style={styles.section} wrap={false}>
              <Text style={styles.sectionLabel}>{SECTION_LABELS[key]}</Text>
              <Text style={styles.sectionText}>{section.text}</Text>
            </View>
          );
        })}

        <View style={styles.signatureBlock}>
          <Text style={styles.signatureLine}>Electronically signed by: {signedByName ?? "—"}</Text>
          <Text style={styles.signatureLine}>Signed at: {signedDate ?? "—"}</Text>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Accession ${study.accession} · Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
