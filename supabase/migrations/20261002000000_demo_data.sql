-- Demo data as a function, so it can be restored on demand and on a schedule.
--
-- RadPilot is a public demo with a shared login: whatever one visitor signs or
-- edits is what the next visitor finds. reset_demo_data() puts the studies
-- back to a known set in mixed states (unread, half-drafted, blocked by a
-- critical finding, preliminary, signed, amended) so every feature has
-- something to show. It runs every night and from the admin menu.
--
-- SYNTHETIC DATA ONLY. Every patient, study and report below is invented.
-- Not for clinical use. See docs/adr/0004-phi-policy.md.
--
-- Users and templates are not touched: they stay in supabase/seed.sql.
-- src/lib/supabase/seed.test.ts parses the inserts below with the domain zod
-- schemas, so this file cannot drift from ReportContentSchema.

create or replace function public.seed_demo_data()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- ---------------------------------------------------------------------------
  -- Synthetic patients. Ages are kept constant relative to current_date.
  -- ---------------------------------------------------------------------------
  insert into public.patients (id, mrn, full_name, sex, birth_date) values
    ('10000000-0000-4000-8000-000000000001', 'RP-100001', 'Helen Carter',     'F', (current_date - interval '58 years 4 months')::date),
    ('10000000-0000-4000-8000-000000000002', 'RP-100002', 'Robert Hayes',     'M', (current_date - interval '64 years 7 months')::date),
    ('10000000-0000-4000-8000-000000000003', 'RP-100003', 'Walter Brooks',    'M', (current_date - interval '71 years 2 months')::date),
    ('10000000-0000-4000-8000-000000000004', 'RP-100004', 'Laura Mitchell',   'F', (current_date - interval '45 years 9 months')::date),
    ('10000000-0000-4000-8000-000000000005', 'RP-100005', 'George Patterson', 'M', (current_date - interval '82 years 1 month')::date),
    ('10000000-0000-4000-8000-000000000006', 'RP-100006', 'Sofia Ramirez',    'F', (current_date - interval '27 years 5 months')::date),
    ('10000000-0000-4000-8000-000000000007', 'RP-100007', 'Daniel Okafor',    'M', (current_date - interval '59 years 3 months')::date),
    ('10000000-0000-4000-8000-000000000008', 'RP-100008', 'Priya Nair',       'F', (current_date - interval '39 years 8 months')::date),
    ('10000000-0000-4000-8000-000000000009', 'RP-100009', 'Anne Lindqvist',   'F', (current_date - interval '52 years 6 months')::date),
    ('10000000-0000-4000-8000-000000000010', 'RP-100010', 'Thomas Becker',    'M', (current_date - interval '68 years 2 months')::date);

  -- ---------------------------------------------------------------------------
  -- Studies. Each one is built to demo a feature (see the comment per row).
  -- ---------------------------------------------------------------------------
  insert into public.studies (
    id, accession, patient_id, modality, body_part, description, indication, priority,
    study_date, dicom_path, assigned_to
  ) values
    -- 1. Critical finding (PE) on the CT chest phantom.
    ('20000000-0000-4000-8000-000000000001', 'RP26000001', '10000000-0000-4000-8000-000000000001',
     'CT', 'chest', 'CTA chest, pulmonary embolism protocol',
     'Acute pleuritic chest pain and dyspnea, tachycardia, elevated D-dimer. Suspected pulmonary embolism.',
     'stat', now() - interval '25 minutes', 'ct-chest-phantom', null),
    -- 2. Incidental nodule in a high-risk smoker: Fleischner recommendation.
    ('20000000-0000-4000-8000-000000000002', 'RP26000002', '10000000-0000-4000-8000-000000000002',
     'CT', 'chest', 'CT chest with contrast',
     'Incidental right lung nodule on outside chest radiograph. Former smoker, 30 pack-years.',
     'routine', now() - interval '5 hours', 'ct-chest-phantom', 'a0000000-0000-4000-8000-000000000001'),
    -- 3. Pneumothorax after a left subclavian line: critical finding + laterality.
    ('20000000-0000-4000-8000-000000000003', 'RP26000003', '10000000-0000-4000-8000-000000000003',
     'CR', 'chest', 'XR chest, 1 view (portable)',
     'Status post left subclavian central venous catheter placement. Rule out pneumothorax.',
     'stat', now() - interval '12 minutes', 'cr-chest-pneumothorax', null),
    -- 4. Already signed normal report: FHIR and PDF export demo.
    ('20000000-0000-4000-8000-000000000004', 'RP26000004', '10000000-0000-4000-8000-000000000004',
     'CR', 'chest', 'XR chest, PA and lateral',
     'Preoperative evaluation before elective laparoscopic cholecystectomy.',
     'routine', now() - interval '1 day 2 hours', 'cr-chest-normal', 'a0000000-0000-4000-8000-000000000001'),
    -- 5. Intracranial hemorrhage on anticoagulation: critical finding + laterality.
    ('20000000-0000-4000-8000-000000000005', 'RP26000005', '10000000-0000-4000-8000-000000000005',
     'CT', 'head', 'CT head without contrast',
     'Fall from standing on apixaban, now confused. Rule out intracranial hemorrhage.',
     'stat', now() - interval '8 minutes', 'ct-head-phantom', null),
    -- 6. Right lower quadrant pain in a young woman: laterality + sex checks.
    ('20000000-0000-4000-8000-000000000006', 'RP26000006', '10000000-0000-4000-8000-000000000006',
     'CT', 'abdomen_pelvis', 'CT abdomen and pelvis with contrast',
     'Right lower quadrant pain and fever for 2 days. Evaluate for appendicitis; right ovarian torsion also considered.',
     'urgent', now() - interval '50 minutes', null, null),
    -- 7. Cirrhosis, HCC surveillance: LI-RADS.
    ('20000000-0000-4000-8000-000000000007', 'RP26000007', '10000000-0000-4000-8000-000000000007',
     'CT', 'abdomen_pelvis', 'CT abdomen and pelvis, multiphase liver protocol',
     'Cirrhosis secondary to hepatitis C. HCC surveillance; 2 cm liver observation on recent ultrasound.',
     'routine', now() - interval '7 hours', null, 'a0000000-0000-4000-8000-000000000002'),
    -- 8. Palpable left thyroid nodule: TI-RADS + laterality.
    ('20000000-0000-4000-8000-000000000008', 'RP26000008', '10000000-0000-4000-8000-000000000008',
     'US', 'thyroid', 'US thyroid',
     'Palpable left thyroid nodule.',
     'routine', now() - interval '3 hours', null, null),
    -- 9. Screening mammogram: BI-RADS.
    ('20000000-0000-4000-8000-000000000009', 'RP26000009', '10000000-0000-4000-8000-000000000009',
     'MG', 'breast', 'Screening mammogram, bilateral, digital',
     'Routine screening. No breast symptoms.',
     'routine', now() - interval '2 hours', null, null),
    -- 10. Hematuria in a man: sex-mismatch demo (e.g. a report that mentions the uterus).
    ('20000000-0000-4000-8000-000000000010', 'RP26000010', '10000000-0000-4000-8000-000000000010',
     'CT', 'abdomen_pelvis', 'CT abdomen and pelvis with contrast',
     'Painless gross hematuria. Evaluate for urinary tract malignancy.',
     'urgent', now() - interval '90 minutes', null, null);

  -- ---------------------------------------------------------------------------
  -- Report for study 4: inserted already signed (status final). The triggers
  -- write the report_versions snapshot, the report.created audit event and set
  -- the study status to 'final'.
  -- ---------------------------------------------------------------------------
  insert into public.reports (
    id, study_id, template_id, status, content, is_critical, created_by, signed_by, signed_at,
    created_at
  ) values (
    '40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000004', 'final',
    $json${
      "schemaVersion": 1,
      "sections": {
        "clinical_indication": {"text": "Preoperative evaluation before elective laparoscopic cholecystectomy.", "source": "template", "ai": null},
        "technique": {"text": "PA and lateral views of the chest.", "source": "template", "ai": null},
        "comparison": {"text": "None.", "source": "template", "ai": null},
        "findings": {"text": "Lines and tubes: None.\nLungs: Clear. No focal consolidation.\nPleura: No pleural effusion or pneumothorax.\nHeart and mediastinum: Normal cardiomediastinal silhouette.\nBones: No acute osseous abnormality.", "source": "template", "ai": null},
        "impression": {"text": "No acute cardiopulmonary abnormality.", "source": "template", "ai": null},
        "recommendations": {"text": "", "source": "human", "ai": null}
      }
    }$json$,
    false,
    'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
    now() - interval '20 hours', now() - interval '21 hours'
  );

  -- -------------------------------------------------------------------------
  -- Studies 11-25: the same exam types in other states.
  -- -------------------------------------------------------------------------
  insert into public.patients (id, mrn, full_name, sex, birth_date) values
    ('10000000-0000-4000-8000-000000000011', 'RP-100011', 'Marcus Feld', 'M', (current_date - interval '55 years 3 months')::date),
    ('10000000-0000-4000-8000-000000000012', 'RP-100012', 'Irene Castellanos', 'F', (current_date - interval '67 years 8 months')::date),
    ('10000000-0000-4000-8000-000000000013', 'RP-100013', 'Dorothy Pike', 'F', (current_date - interval '74 years 1 month')::date),
    ('10000000-0000-4000-8000-000000000014', 'RP-100014', 'Victor Almeida', 'M', (current_date - interval '61 years 5 months')::date),
    ('10000000-0000-4000-8000-000000000015', 'RP-100015', 'Samuel Whitaker', 'M', (current_date - interval '49 years 10 months')::date),
    ('10000000-0000-4000-8000-000000000016', 'RP-100016', 'Beatriz Santos', 'F', (current_date - interval '63 years 2 months')::date),
    ('10000000-0000-4000-8000-000000000017', 'RP-100017', 'Henry Nakamura', 'M', (current_date - interval '46 years 7 months')::date),
    ('10000000-0000-4000-8000-000000000018', 'RP-100018', 'Olivia Brandt', 'F', (current_date - interval '60 years 4 months')::date),
    ('10000000-0000-4000-8000-000000000019', 'RP-100019', 'Margaret Doyle', 'F', (current_date - interval '79 years 6 months')::date),
    ('10000000-0000-4000-8000-000000000020', 'RP-100020', 'Lucas Ferreira', 'M', (current_date - interval '33 years 9 months')::date),
    ('10000000-0000-4000-8000-000000000021', 'RP-100021', 'Eleanor Voss', 'F', (current_date - interval '70 years 2 months')::date),
    ('10000000-0000-4000-8000-000000000022', 'RP-100022', 'Andre Kowalski', 'M', (current_date - interval '52 years 11 months')::date),
    ('10000000-0000-4000-8000-000000000023', 'RP-100023', 'Hannah Lee', 'F', (current_date - interval '31 years 3 months')::date),
    ('10000000-0000-4000-8000-000000000024', 'RP-100024', 'Grace Okonkwo', 'F', (current_date - interval '48 years 5 months')::date),
    ('10000000-0000-4000-8000-000000000025', 'RP-100025', 'Arthur Lindholm', 'M', (current_date - interval '66 years 8 months')::date);

  insert into public.studies (
    id, accession, patient_id, modality, body_part, description, indication, priority,
    study_date, dicom_path, assigned_to
  ) values
    -- 11. Draft with an AI draft still pending review: Accept / Regenerate, and the sign gate.
    ('20000000-0000-4000-8000-000000000011', 'RP26000011', '10000000-0000-4000-8000-000000000011',
     'CT', 'chest', 'CT chest with contrast',
     'Chronic cough for 3 months. Former smoker, 20 pack-years.',
     'routine', now() - interval '4 hours', 'ct-chest-phantom', 'a0000000-0000-4000-8000-000000000001'),
    -- 12. Draft with a critical finding: the copilot blocks signing until it is acknowledged.
    ('20000000-0000-4000-8000-000000000012', 'RP26000012', '10000000-0000-4000-8000-000000000012',
     'CR', 'chest', 'XR chest, 1 view (portable)',
     'Sudden dyspnea after right thoracentesis.',
     'urgent', now() - interval '35 minutes', 'cr-chest-pneumothorax', 'a0000000-0000-4000-8000-000000000001'),
    -- 13. Preliminary report, ready to sign.
    ('20000000-0000-4000-8000-000000000013', 'RP26000013', '10000000-0000-4000-8000-000000000013',
     'CT', 'head', 'CT head without contrast',
     'Dizziness and unsteady gait for 1 week.',
     'routine', now() - interval '6 hours', 'ct-head-phantom', 'a0000000-0000-4000-8000-000000000001'),
    -- 14. Signed critical report: critical badge, PDF flag, FHIR export.
    ('20000000-0000-4000-8000-000000000014', 'RP26000014', '10000000-0000-4000-8000-000000000014',
     'CT', 'chest', 'CTA chest, pulmonary embolism protocol',
     'Sudden dyspnea 5 days after knee replacement. Suspected pulmonary embolism.',
     'urgent', now() - interval '1 day 4 hours', 'ct-chest-phantom', 'a0000000-0000-4000-8000-000000000002'),
    -- 15. Signed, then re-opened: seeded final and amended below (edit and sign again).
    ('20000000-0000-4000-8000-000000000015', 'RP26000015', '10000000-0000-4000-8000-000000000015',
     'CR', 'chest', 'XR chest, PA and lateral',
     'Cough and low-grade fever for 4 days.',
     'routine', now() - interval '2 days', 'cr-chest-normal', 'a0000000-0000-4000-8000-000000000001'),
    -- 16. Signed normal CT.
    ('20000000-0000-4000-8000-000000000016', 'RP26000016', '10000000-0000-4000-8000-000000000016',
     'CT', 'abdomen_pelvis', 'CT abdomen and pelvis with contrast',
     'Intermittent epigastric pain. Weight stable.',
     'routine', now() - interval '1 day 6 hours', null, 'a0000000-0000-4000-8000-000000000001'),
    -- 17. Signed thyroid report with a TI-RADS assessment.
    ('20000000-0000-4000-8000-000000000017', 'RP26000017', '10000000-0000-4000-8000-000000000017',
     'US', 'thyroid', 'US thyroid',
     'Thyroid nodule seen incidentally on carotid ultrasound.',
     'routine', now() - interval '2 days 3 hours', null, 'a0000000-0000-4000-8000-000000000002'),
    -- 18. Signed screening mammogram, BI-RADS 2.
    ('20000000-0000-4000-8000-000000000018', 'RP26000018', '10000000-0000-4000-8000-000000000018',
     'MG', 'breast', 'Screening mammogram, bilateral, digital',
     'Routine screening. No breast symptoms.',
     'routine', now() - interval '3 days', null, 'a0000000-0000-4000-8000-000000000001'),
    -- 19. Unread: open it to start a report from scratch.
    ('20000000-0000-4000-8000-000000000019', 'RP26000019', '10000000-0000-4000-8000-000000000019',
     'CT', 'head', 'CT head without contrast',
     'Acute left-sided weakness and facial droop, onset 40 minutes ago. Stroke code.',
     'stat', now() - interval '6 minutes', 'ct-head-phantom', null),
    -- 20. Unread: open it to start a report from scratch.
    ('20000000-0000-4000-8000-000000000020', 'RP26000020', '10000000-0000-4000-8000-000000000020',
     'CR', 'chest', 'XR chest, PA and lateral',
     'Left chest wall pain after a bicycle fall. Rule out rib fracture and pneumothorax.',
     'urgent', now() - interval '40 minutes', 'cr-chest-normal', null),
    -- 21. Unread: open it to start a report from scratch.
    ('20000000-0000-4000-8000-000000000021', 'RP26000021', '10000000-0000-4000-8000-000000000021',
     'CT', 'chest', 'CT chest without contrast, low dose',
     'Lung cancer screening, annual follow-up. Current smoker, 40 pack-years.',
     'routine', now() - interval '9 hours', 'ct-chest-phantom', null),
    -- 22. Draft with a laterality conflict between the findings and the impression.
    ('20000000-0000-4000-8000-000000000022', 'RP26000022', '10000000-0000-4000-8000-000000000022',
     'CT', 'abdomen_pelvis', 'CT abdomen and pelvis without contrast',
     'Left flank pain radiating to the groin, microscopic hematuria. Evaluate for renal calculus.',
     'urgent', now() - interval '1 hour 20 minutes', null, 'a0000000-0000-4000-8000-000000000001'),
    -- 23. Unread: open it to start a report from scratch.
    ('20000000-0000-4000-8000-000000000023', 'RP26000023', '10000000-0000-4000-8000-000000000023',
     'US', 'thyroid', 'US thyroid',
     'Family history of thyroid cancer. Screening ultrasound.',
     'routine', now() - interval '10 hours', null, null),
    -- 24. Unread: open it to start a report from scratch.
    ('20000000-0000-4000-8000-000000000024', 'RP26000024', '10000000-0000-4000-8000-000000000024',
     'MG', 'breast', 'Diagnostic mammogram, bilateral, digital',
     'Palpable lump in the upper outer left breast for 3 weeks.',
     'routine', now() - interval '11 hours', null, null),
    -- 25. Preliminary report by the other radiologist.
    ('20000000-0000-4000-8000-000000000025', 'RP26000025', '10000000-0000-4000-8000-000000000025',
     'CT', 'head', 'CT head without contrast',
     'Headache for 2 weeks, worse in the morning. No focal deficit.',
     'routine', now() - interval '8 hours', 'ct-head-phantom', 'a0000000-0000-4000-8000-000000000002');

  -- Study 11. Draft with an AI draft still pending review: Accept / Regenerate, and the sign gate.
  insert into public.reports (
    id, study_id, template_id, status, content, is_critical, created_by, signed_by, signed_at,
    created_at
  ) values (
    '40000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000001', 'draft',
    $json$
    {
      "schemaVersion": 1,
      "sections": {
        "clinical_indication": {
          "text": "Chronic cough for 3 months. Former smoker, 20 pack-years.",
          "source": "template",
          "ai": null
        },
        "technique": {
          "text": "Helical CT of the chest after intravenous administration of 75 mL of iodinated contrast. Axial images reconstructed at 1.25 mm and 5 mm, with coronal and sagittal reformats.",
          "source": "template",
          "ai": null
        },
        "comparison": {
          "text": "None.",
          "source": "template",
          "ai": null
        },
        "findings": {
          "text": "Lungs: 6 mm solid nodule in the right upper lobe.\nPleura: No pleural effusion.\nMediastinum and hila: No lymphadenopathy.",
          "source": "ai",
          "ai": {
            "generationId": null,
            "review": "pending"
          }
        },
        "impression": {
          "text": "6 mm solid right upper lobe nodule.",
          "source": "ai",
          "ai": {
            "generationId": null,
            "review": "pending"
          }
        },
        "recommendations": {
          "text": "",
          "source": "human",
          "ai": null
        }
      }
    }
    $json$,
    false,
    'a0000000-0000-4000-8000-000000000001', null,
    null, now() - interval '3 hours'
  );

  -- Study 12. Draft with a critical finding: the copilot blocks signing until it is acknowledged.
  insert into public.reports (
    id, study_id, template_id, status, content, is_critical, created_by, signed_by, signed_at,
    created_at
  ) values (
    '40000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000012',
    '30000000-0000-4000-8000-000000000004', 'draft',
    $json$
    {
      "schemaVersion": 1,
      "sections": {
        "clinical_indication": {
          "text": "Sudden dyspnea after right thoracentesis.",
          "source": "template",
          "ai": null
        },
        "technique": {
          "text": "PA and lateral views of the chest.",
          "source": "template",
          "ai": null
        },
        "comparison": {
          "text": "None.",
          "source": "template",
          "ai": null
        },
        "findings": {
          "text": "Lines and tubes: None.\nLungs: No focal consolidation.\nPleura: Right apical pneumothorax with the visceral pleural line 2 cm from the chest wall.\nHeart and mediastinum: No mediastinal shift.",
          "source": "human",
          "ai": null
        },
        "impression": {
          "text": "Right apical pneumothorax, 2 cm.",
          "source": "human",
          "ai": null
        },
        "recommendations": {
          "text": "",
          "source": "human",
          "ai": null
        }
      }
    }
    $json$,
    false,
    'a0000000-0000-4000-8000-000000000001', null,
    null, now() - interval '20 minutes'
  );

  -- Study 13. Preliminary report, ready to sign.
  insert into public.reports (
    id, study_id, template_id, status, content, is_critical, created_by, signed_by, signed_at,
    created_at
  ) values (
    '40000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000013',
    '30000000-0000-4000-8000-000000000002', 'preliminary',
    $json$
    {
      "schemaVersion": 1,
      "sections": {
        "clinical_indication": {
          "text": "Dizziness and unsteady gait for 1 week.",
          "source": "template",
          "ai": null
        },
        "technique": {
          "text": "Axial CT of the head without intravenous contrast, with coronal and sagittal reformats.",
          "source": "template",
          "ai": null
        },
        "comparison": {
          "text": "None.",
          "source": "template",
          "ai": null
        },
        "findings": {
          "text": "Brain parenchyma: No acute territorial infarct, hemorrhage or mass. Gray-white matter differentiation is preserved.\nExtra-axial spaces: No extra-axial collection.\nVentricles: Normal size and configuration. No midline shift.\nBasal cisterns: Patent.\nCalvarium and skull base: No fracture.\nParanasal sinuses and mastoid air cells: Clear.",
          "source": "template",
          "ai": null
        },
        "impression": {
          "text": "No acute intracranial abnormality.",
          "source": "template",
          "ai": null
        },
        "recommendations": {
          "text": "",
          "source": "human",
          "ai": null
        }
      }
    }
    $json$,
    false,
    'a0000000-0000-4000-8000-000000000001', null,
    null, now() - interval '5 hours'
  );

  -- Study 14. Signed critical report: critical badge, PDF flag, FHIR export.
  insert into public.reports (
    id, study_id, template_id, status, content, is_critical, created_by, signed_by, signed_at,
    created_at
  ) values (
    '40000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000014',
    '30000000-0000-4000-8000-000000000001', 'final',
    $json$
    {
      "schemaVersion": 1,
      "sections": {
        "clinical_indication": {
          "text": "Sudden dyspnea 5 days after knee replacement. Suspected pulmonary embolism.",
          "source": "template",
          "ai": null
        },
        "technique": {
          "text": "Helical CT of the chest after intravenous administration of 75 mL of iodinated contrast. Axial images reconstructed at 1.25 mm and 5 mm, with coronal and sagittal reformats.",
          "source": "template",
          "ai": null
        },
        "comparison": {
          "text": "None.",
          "source": "template",
          "ai": null
        },
        "findings": {
          "text": "Pulmonary arteries: Filling defects in the right lower lobe segmental pulmonary arteries, consistent with acute pulmonary embolism. RV/LV diameter ratio 0.8.\nLungs: No consolidation or infarct.\nPleura: No pleural effusion.\nHeart: Normal size.",
          "source": "human",
          "ai": null
        },
        "impression": {
          "text": "Acute pulmonary embolism in the right lower lobe segmental arteries. No right heart strain.",
          "source": "human",
          "ai": null
        },
        "recommendations": {
          "text": "Findings discussed by telephone with the referring clinician at the time of reporting.",
          "source": "human",
          "ai": null
        }
      }
    }
    $json$,
    true,
    'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
    now() - interval '1 day 2 hours', now() - interval '1 day 3 hours'
  );

  -- Study 15. Signed, then re-opened: seeded final and amended below (edit and sign again).
  insert into public.reports (
    id, study_id, template_id, status, content, is_critical, created_by, signed_by, signed_at,
    created_at
  ) values (
    '40000000-0000-4000-8000-000000000015', '20000000-0000-4000-8000-000000000015',
    '30000000-0000-4000-8000-000000000004', 'final',
    $json$
    {
      "schemaVersion": 1,
      "sections": {
        "clinical_indication": {
          "text": "Cough and low-grade fever for 4 days.",
          "source": "template",
          "ai": null
        },
        "technique": {
          "text": "PA and lateral views of the chest.",
          "source": "template",
          "ai": null
        },
        "comparison": {
          "text": "None.",
          "source": "template",
          "ai": null
        },
        "findings": {
          "text": "Lines and tubes: None.\nLungs: Clear. No focal consolidation.\nPleura: No pleural effusion or pneumothorax.\nHeart and mediastinum: Normal cardiomediastinal silhouette.\nBones: No acute osseous abnormality.",
          "source": "template",
          "ai": null
        },
        "impression": {
          "text": "No acute cardiopulmonary abnormality.",
          "source": "template",
          "ai": null
        },
        "recommendations": {
          "text": "",
          "source": "human",
          "ai": null
        }
      }
    }
    $json$,
    false,
    'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
    now() - interval '1 day 21 hours', now() - interval '1 day 22 hours'
  );

  -- Study 16. Signed normal CT.
  insert into public.reports (
    id, study_id, template_id, status, content, is_critical, created_by, signed_by, signed_at,
    created_at
  ) values (
    '40000000-0000-4000-8000-000000000016', '20000000-0000-4000-8000-000000000016',
    '30000000-0000-4000-8000-000000000003', 'final',
    $json$
    {
      "schemaVersion": 1,
      "sections": {
        "clinical_indication": {
          "text": "Intermittent epigastric pain. Weight stable.",
          "source": "template",
          "ai": null
        },
        "technique": {
          "text": "Helical CT of the abdomen and pelvis in the portal venous phase after intravenous administration of 100 mL of iodinated contrast. Coronal and sagittal reformats.",
          "source": "template",
          "ai": null
        },
        "comparison": {
          "text": "None.",
          "source": "template",
          "ai": null
        },
        "findings": {
          "text": "Lower chest: Clear lung bases.\nLiver: Normal size and attenuation. No focal lesion.\nGallbladder and bile ducts: Normal gallbladder. No biliary dilatation.\nPancreas: Normal.\nSpleen: Normal size.\nAdrenal glands: Normal.\nKidneys and ureters: Symmetric enhancement. No hydronephrosis or calculi.\nBladder: Unremarkable.\nPelvic organs: Unremarkable.\nBowel and appendix: Normal caliber bowel. Normal appendix.\nPeritoneum: No free air or free fluid.\nLymph nodes: No lymphadenopathy.\nVessels: Normal caliber abdominal aorta.\nBones and soft tissues: No acute or suspicious osseous lesion.",
          "source": "template",
          "ai": null
        },
        "impression": {
          "text": "No acute abnormality in the abdomen or pelvis.",
          "source": "template",
          "ai": null
        },
        "recommendations": {
          "text": "",
          "source": "human",
          "ai": null
        }
      }
    }
    $json$,
    false,
    'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
    now() - interval '1 day 4 hours', now() - interval '1 day 5 hours'
  );

  -- Study 17. Signed thyroid report with a TI-RADS assessment.
  insert into public.reports (
    id, study_id, template_id, status, content, is_critical, created_by, signed_by, signed_at,
    created_at
  ) values (
    '40000000-0000-4000-8000-000000000017', '20000000-0000-4000-8000-000000000017',
    '30000000-0000-4000-8000-000000000005', 'final',
    $json$
    {
      "schemaVersion": 1,
      "sections": {
        "clinical_indication": {
          "text": "Thyroid nodule seen incidentally on carotid ultrasound.",
          "source": "template",
          "ai": null
        },
        "technique": {
          "text": "Grayscale and color Doppler ultrasound of the thyroid gland and central neck.",
          "source": "template",
          "ai": null
        },
        "comparison": {
          "text": "None.",
          "source": "template",
          "ai": null
        },
        "findings": {
          "text": "Right lobe: Normal size with homogeneous echotexture. No nodule.\nLeft lobe: Nodule measuring 1.2 x 0.9 x 0.8 cm. Composition: solid. Echogenicity: isoechoic. Shape: wider than tall. Margin: smooth. Echogenic foci: none. ACR TI-RADS 3 points (TR3).\nIsthmus: Normal thickness. No nodule.\nCervical lymph nodes: No abnormal lymph nodes.",
          "source": "human",
          "ai": null
        },
        "impression": {
          "text": "1.2 cm left thyroid nodule, ACR TI-RADS 3 (mildly suspicious).",
          "source": "human",
          "ai": null
        },
        "recommendations": {
          "text": "No fine-needle aspiration or follow-up at this size per ACR TI-RADS.",
          "source": "human",
          "ai": null
        }
      }
    }
    $json$,
    false,
    'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
    now() - interval '2 days 1 hour', now() - interval '2 days 2 hours'
  );

  -- Study 18. Signed screening mammogram, BI-RADS 2.
  insert into public.reports (
    id, study_id, template_id, status, content, is_critical, created_by, signed_by, signed_at,
    created_at
  ) values (
    '40000000-0000-4000-8000-000000000018', '20000000-0000-4000-8000-000000000018',
    '30000000-0000-4000-8000-000000000006', 'final',
    $json$
    {
      "schemaVersion": 1,
      "sections": {
        "clinical_indication": {
          "text": "Routine screening. No breast symptoms.",
          "source": "template",
          "ai": null
        },
        "technique": {
          "text": "Bilateral full-field digital mammography with craniocaudal and mediolateral oblique views.",
          "source": "template",
          "ai": null
        },
        "comparison": {
          "text": "None.",
          "source": "template",
          "ai": null
        },
        "findings": {
          "text": "Breast composition: Scattered areas of fibroglandular density (ACR category B).\nRight breast: No suspicious mass, calcifications or architectural distortion.\nLeft breast: Benign-appearing coarse calcifications in the upper outer quadrant. No suspicious mass or architectural distortion.",
          "source": "human",
          "ai": null
        },
        "impression": {
          "text": "BI-RADS 2: Benign.",
          "source": "human",
          "ai": null
        },
        "recommendations": {
          "text": "Routine screening mammography in 1 year.",
          "source": "human",
          "ai": null
        }
      }
    }
    $json$,
    false,
    'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
    now() - interval '2 days 22 hours', now() - interval '2 days 23 hours'
  );

  -- Study 22. Draft with a laterality conflict between the findings and the impression.
  insert into public.reports (
    id, study_id, template_id, status, content, is_critical, created_by, signed_by, signed_at,
    created_at
  ) values (
    '40000000-0000-4000-8000-000000000022', '20000000-0000-4000-8000-000000000022',
    '30000000-0000-4000-8000-000000000003', 'draft',
    $json$
    {
      "schemaVersion": 1,
      "sections": {
        "clinical_indication": {
          "text": "Left flank pain radiating to the groin, microscopic hematuria. Evaluate for renal calculus.",
          "source": "template",
          "ai": null
        },
        "technique": {
          "text": "Helical CT of the abdomen and pelvis in the portal venous phase after intravenous administration of 100 mL of iodinated contrast. Coronal and sagittal reformats.",
          "source": "template",
          "ai": null
        },
        "comparison": {
          "text": "None.",
          "source": "template",
          "ai": null
        },
        "findings": {
          "text": "Kidneys and ureters: 5 mm calculus in the left distal ureter with mild left hydronephrosis. Right kidney is normal.\nBladder: Unremarkable.\nBowel and appendix: Normal appendix.\nPeritoneum: No free air or free fluid.",
          "source": "human",
          "ai": null
        },
        "impression": {
          "text": "5 mm right distal ureteral calculus with mild hydronephrosis.",
          "source": "human",
          "ai": null
        },
        "recommendations": {
          "text": "",
          "source": "human",
          "ai": null
        }
      }
    }
    $json$,
    false,
    'a0000000-0000-4000-8000-000000000001', null,
    null, now() - interval '50 minutes'
  );

  -- Study 25. Preliminary report by the other radiologist.
  insert into public.reports (
    id, study_id, template_id, status, content, is_critical, created_by, signed_by, signed_at,
    created_at
  ) values (
    '40000000-0000-4000-8000-000000000025', '20000000-0000-4000-8000-000000000025',
    '30000000-0000-4000-8000-000000000002', 'preliminary',
    $json$
    {
      "schemaVersion": 1,
      "sections": {
        "clinical_indication": {
          "text": "Headache for 2 weeks, worse in the morning. No focal deficit.",
          "source": "template",
          "ai": null
        },
        "technique": {
          "text": "Axial CT of the head without intravenous contrast, with coronal and sagittal reformats.",
          "source": "template",
          "ai": null
        },
        "comparison": {
          "text": "None.",
          "source": "template",
          "ai": null
        },
        "findings": {
          "text": "Brain parenchyma: No acute territorial infarct, hemorrhage or mass. Gray-white matter differentiation is preserved.\nExtra-axial spaces: No extra-axial collection.\nVentricles: Normal size and configuration. No midline shift.\nBasal cisterns: Patent.\nCalvarium and skull base: No fracture.\nParanasal sinuses and mastoid air cells: Clear.",
          "source": "template",
          "ai": null
        },
        "impression": {
          "text": "No acute intracranial abnormality.",
          "source": "template",
          "ai": null
        },
        "recommendations": {
          "text": "",
          "source": "human",
          "ai": null
        }
      }
    }
    $json$,
    false,
    'a0000000-0000-4000-8000-000000000002', null,
    null, now() - interval '7 hours'
  );

  -- The insert trigger logs report.created. Add the signing event too, so the
  -- audit trail of a seeded final report reads like one signed in the app.
  insert into public.audit_events (actor_id, entity, entity_id, action, payload)
  select r.signed_by, 'report', r.id, 'report.signed',
         jsonb_build_object('from', 'draft', 'to', 'final', 'version', r.version, 'study_id', r.study_id)
  from public.reports r
  where r.status = 'final';

  -- Study 14: the critical finding was acknowledged before signing.
  insert into public.copilot_issues (
    report_id, source, rule_id, severity, category, message, span, suggested_fix,
    resolved, resolved_by, resolved_at
  ) values (
    '40000000-0000-4000-8000-000000000014', 'rule', 'critical-finding', 'blocking', 'critical_finding',
    'Critical finding detected: pulmonary embolism. Confirm direct communication with the referring clinician before signing.',
    null, null, true, 'a0000000-0000-4000-8000-000000000002', now() - interval '1 day 2 hours'
  );

  -- Study 15: re-opened after signing. The status trigger writes the
  -- report.amended audit event and the version snapshot.
  update public.reports set status = 'amended' where id = '40000000-0000-4000-8000-000000000015';
end;
$fn$;

-- Wipes everything visitors created and restores the demo set. Callable by an
-- admin from the app, and by the nightly job (no signed-in user).
create or replace function public.reset_demo_data()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can reset the demo data' using errcode = 'insufficient_privilege';
  end if;

  truncate table
    public.copilot_issues, public.ai_generations, public.audit_events,
    public.report_versions, public.reports, public.studies, public.patients
    restart identity cascade;

  perform public.seed_demo_data();
end;
$fn$;

revoke all on function public.seed_demo_data() from public, anon, authenticated;
revoke all on function public.reset_demo_data() from public, anon;
grant execute on function public.reset_demo_data() to authenticated;

-- Nightly restore at 07:00 UTC (04:00 in Sao Paulo).
create extension if not exists pg_cron;
select cron.schedule('reset-demo-data', '0 7 * * *', 'select public.reset_demo_data()');
