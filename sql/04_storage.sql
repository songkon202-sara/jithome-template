-- ═══════════════════════════════════════════════════════════════════
-- JitHome Security — ขั้นที่ 5: สิทธิ์ไฟล์ผู้ป่วย (Storage bucket patient-files)
-- รันหลัง 01_prepare.sql (ต้องมี jh_role) — ย้อนกลับด้วย 04_storage_rollback.sql
--
-- ปัญหาเดิม:
--   • allow_upload_patient_files ให้ role "public" (รวมคนไม่ได้ login) อัปโหลดได้
--   • policy ตรวจแค่ role ไม่ตรวจ status → บัญชีรออนุมัติ/ถูกลบ ยังเปิดไฟล์ได้
--
-- สิทธิ์ใหม่ (เฉพาะบัญชี active ผ่าน jh_role()):
--   อ่าน:     admin, staff, อสม.
--   อัปโหลด:  admin, staff, อสม. + ผู้สมัครที่ login แล้ว (เฉพาะโฟลเดอร์ members/ ตอนสมัคร)
--   แก้ไข:    admin, staff
--   ลบ:      admin
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.jh_role()') IS NULL THEN
    RAISE EXCEPTION 'ยังไม่ได้รัน 01_prepare.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
             AND tablename = 'objects' AND policyname = 'jh_files_select') THEN
    RAISE EXCEPTION 'รันไปแล้ว — ถ้าต้องการรันใหม่ ให้รัน 04_storage_rollback.sql ก่อน';
  END IF;
END $$;

-- สำรอง policy เดิมของ patient-files
CREATE TABLE IF NOT EXISTS public.jh_storage_backup (
  id     BIGSERIAL PRIMARY KEY,
  batch  TIMESTAMPTZ NOT NULL,
  name   TEXT NOT NULL,
  stmt   TEXT NOT NULL
);
ALTER TABLE public.jh_storage_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jh_storage_backup FROM anon, authenticated;

DO $$
DECLARE
  b TIMESTAMPTZ := now();
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM pg_policies
           WHERE schemaname = 'storage' AND tablename = 'objects'
             AND policyname IN ('allow_upload_patient_files', 'patient_files_select',
                                'patient_files_insert', 'patient_files_update', 'patient_files_delete') LOOP
    INSERT INTO public.jh_storage_backup(batch, name, stmt) VALUES (b, r.policyname,
      format('CREATE POLICY %I ON storage.objects AS %s FOR %s TO %s%s%s',
        r.policyname, r.permissive, r.cmd,
        (SELECT string_agg(quote_ident(x), ', ') FROM unnest(r.roles) x),
        CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
        CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END));
    EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

CREATE POLICY jh_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'patient-files' AND public.jh_role() IN ('admin', 'staff', 'aosomo'));

CREATE POLICY jh_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'patient-files'
    AND (public.jh_role() IN ('admin', 'staff', 'aosomo')
         OR (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = 'members'))
  );

CREATE POLICY jh_files_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'patient-files' AND public.jh_role() IN ('admin', 'staff'))
  WITH CHECK (bucket_id = 'patient-files' AND public.jh_role() IN ('admin', 'staff'));

CREATE POLICY jh_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'patient-files' AND public.jh_role() = 'admin');

COMMIT;

-- ตรวจผล: ควรเห็น jh_files_* 4 รายการ และไม่มี policy ที่เปิดให้ public/anon สำหรับ patient-files
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
