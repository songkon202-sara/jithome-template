-- ═══════════════════════════════════════════════════════════════════
-- JitHome Security — ย้อนกลับ 04_storage.sql
-- คืน policy เดิมของ bucket patient-files จากข้อมูลสำรองชุดล่าสุด
-- ═══════════════════════════════════════════════════════════════════
BEGIN;
DO $$
DECLARE b TIMESTAMPTZ; r RECORD;
BEGIN
  SELECT max(batch) INTO b FROM public.jh_storage_backup;
  IF b IS NULL THEN RAISE EXCEPTION 'ไม่พบข้อมูลสำรอง — ยังไม่เคยรัน 04_storage.sql'; END IF;
  DROP POLICY IF EXISTS jh_files_select ON storage.objects;
  DROP POLICY IF EXISTS jh_files_insert ON storage.objects;
  DROP POLICY IF EXISTS jh_files_update ON storage.objects;
  DROP POLICY IF EXISTS jh_files_delete ON storage.objects;
  FOR r IN SELECT stmt FROM public.jh_storage_backup WHERE batch = b ORDER BY id LOOP
    EXECUTE r.stmt;
  END LOOP;
  RAISE NOTICE 'ย้อนกลับเป็นสถานะ ณ %', b;
END $$;
COMMIT;
