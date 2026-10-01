-- Private bucket for the synthetic phantom DICOM series.
-- Files are uploaded with the service role (npm run dicom:upload), never by clients.
-- Layout: dicom/<series>/manifest.json + dicom/<series>/<instance>.dcm
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dicom', 'dicom', false, 52428800, array['application/dicom', 'application/json'])
on conflict (id) do nothing;

create policy "dicom: signed-in users read"
  on storage.objects for select to authenticated
  using (bucket_id = 'dicom');
