-- ═══════════════════════════════════════════════════════════════════
-- JitHome Security — ขั้นที่ 2: เปิด Row Level Security (RLS)
--
-- ⚠️ รันหลังจาก:
--   (1) รัน 01_prepare.sql แล้ว
--   (2) deploy Edge Function "notify" แล้ว
--   (3) merge โค้ดแอปเวอร์ชันใหม่ และผู้ใช้รีเฟรชแอปแล้ว
-- แนะนำให้รันนอกเวลาใช้งาน ถ้ามีปัญหา → รัน 03_rollback.sql
--
-- สิ่งที่ทำ:
--   • สำรอง policy / สิทธิ์ / สถานะ RLS เดิมไว้ในตาราง jh_security_backup
--   • ถอนสิทธิ์ทั้งหมดของ anon (คนที่ไม่ได้ login)
--   • เปิด RLS ทุกตารางที่แอปใช้ และตั้ง policy ตามบทบาท
--   • ให้ view (patient_status, monthly_trend) เคารพ RLS
--
-- สิทธิ์ตามบทบาท (เฉพาะบัญชี status = active):
--   ข้อมูลผู้ป่วย (patients, injection_records, home_visits, doctor_appointments)
--     อ่าน: ทุกบทบาท | เพิ่ม/แก้: admin, staff, อสม. | ลบ: admin, staff (+อสม. ลบบันทึกเยี่ยม)
--   ตั้งค่า (app_settings): อ่านได้ทุกบทบาท ยกเว้น token (admin เท่านั้น) | แก้: admin
--   สมาชิก (user_profiles): อ่าน: ผู้ใช้ active ทุกคน + แถวของตัวเอง | แก้: ตัวเอง / admin
--   ทะเบียน อสม./เจ้าหน้าที่: อ่าน: ทุกบทบาท | แก้: admin
--   audit_logs: เพิ่มได้ | อ่าน: admin
--   login_lockouts, notification_settings: admin (ผู้ใช้ลบล็อกของตัวเองได้หลัง login สำเร็จ)
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 0. ตรวจความพร้อม ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.jh_role()') IS NULL THEN
    RAISE EXCEPTION 'ยังไม่ได้รัน 01_prepare.sql';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles
                 WHERE role = 'admin' AND COALESCE(status,'active') = 'active') THEN
    RAISE EXCEPTION 'ไม่พบ admin ที่ active — หยุดเพื่อป้องกันการล็อกตัวเองออกจากระบบ';
  END IF;
  -- กันรันซ้ำ: ถ้ารันซ้ำ ข้อมูลสำรองชุดใหม่จะเป็นสถานะที่ล็อกแล้ว ทำให้ย้อนกลับไม่ได้
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
             AND tablename = 'patients' AND policyname = 'jh_select') THEN
    RAISE EXCEPTION 'รันขั้นที่ 2 ไปแล้ว — ถ้าต้องการรันใหม่ ให้รัน 03_rollback.sql ก่อน';
  END IF;
END $$;

-- ─── 1. สำรองสถานะเดิม ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jh_security_backup (
  id        BIGSERIAL PRIMARY KEY,
  batch     TIMESTAMPTZ NOT NULL,
  seq       INT NOT NULL,
  stmt      TEXT NOT NULL
);
ALTER TABLE public.jh_security_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jh_security_backup FROM anon, authenticated;

CREATE TEMP TABLE jh_targets (tbl TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO jh_targets VALUES
  ('patients'), ('injection_records'), ('home_visits'), ('doctor_appointments'),
  ('app_settings'), ('user_profiles'), ('audit_logs'), ('login_lockouts'),
  ('aosomo_directory'), ('staff_directory'), ('notification_settings');
-- ข้ามตารางที่ไม่มีอยู่จริง
DELETE FROM jh_targets WHERE to_regclass('public.' || tbl) IS NULL;

DO $$
DECLARE
  b TIMESTAMPTZ := now();
  n INT := 0;
  r RECORD;
BEGIN
  -- สถานะ RLS เดิม
  FOR r IN SELECT c.relname, c.relrowsecurity FROM pg_class c
           JOIN jh_targets t ON t.tbl = c.relname
           WHERE c.relnamespace = 'public'::regnamespace LOOP
    n := n + 1;
    INSERT INTO public.jh_security_backup(batch, seq, stmt) VALUES (b, n,
      format('ALTER TABLE public.%I %s ROW LEVEL SECURITY', r.relname,
             CASE WHEN r.relrowsecurity THEN 'ENABLE' ELSE 'DISABLE' END));
  END LOOP;
  -- สิทธิ์เดิมของ anon / authenticated
  FOR r IN SELECT g.table_name, g.grantee, string_agg(g.privilege_type, ', ') AS privs
           FROM information_schema.role_table_grants g
           WHERE g.table_schema = 'public' AND g.grantee IN ('anon', 'authenticated')
             AND (g.table_name IN (SELECT tbl FROM jh_targets)
                  OR g.table_name IN ('patient_status', 'monthly_trend'))
           GROUP BY g.table_name, g.grantee LOOP
    n := n + 1;
    INSERT INTO public.jh_security_backup(batch, seq, stmt) VALUES (b, n,
      format('GRANT %s ON public.%I TO %I', r.privs, r.table_name, r.grantee));
  END LOOP;
  -- policy เดิม
  FOR r IN SELECT p.* FROM pg_policies p
           JOIN jh_targets t ON t.tbl = p.tablename
           WHERE p.schemaname = 'public' LOOP
    n := n + 1;
    INSERT INTO public.jh_security_backup(batch, seq, stmt) VALUES (b, n,
      format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
        r.policyname, r.tablename, r.permissive, r.cmd,
        (SELECT string_agg(quote_ident(x), ', ') FROM unnest(r.roles) x),
        CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
        CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END));
  END LOOP;
  -- ค่า security_invoker เดิมของ view
  FOR r IN SELECT c.relname,
                  COALESCE((SELECT split_part(o, '=', 2) FROM unnest(c.reloptions) o
                            WHERE o LIKE 'security_invoker=%'), 'false') AS si
           FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
             AND c.relname IN ('patient_status', 'monthly_trend') LOOP
    n := n + 1;
    INSERT INTO public.jh_security_backup(batch, seq, stmt) VALUES (b, n,
      format('ALTER VIEW public.%I SET (security_invoker = %s)', r.relname, r.si));
  END LOOP;
  RAISE NOTICE 'สำรองแล้ว % รายการ (batch %)', n, b;
END $$;

-- ─── 2. ล้าง policy เดิม + ถอนสิทธิ์ anon + เปิด RLS ─────────────
DO $$
DECLARE r RECORD; t TEXT;
BEGIN
  FOR r IN SELECT p.policyname, p.tablename FROM pg_policies p
           JOIN jh_targets j ON j.tbl = p.tablename
           WHERE p.schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
  FOR t IN SELECT tbl FROM jh_targets LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ─── 3. Policy ใหม่ ───────────────────────────────────────────────
-- ข้อมูลผู้ป่วย
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tbl FROM jh_targets
           WHERE tbl IN ('patients', 'injection_records', 'home_visits', 'doctor_appointments') LOOP
    EXECUTE format($p$CREATE POLICY jh_select ON public.%I FOR SELECT TO authenticated
                    USING (public.jh_role() IS NOT NULL)$p$, t);
    EXECUTE format($p$CREATE POLICY jh_insert ON public.%I FOR INSERT TO authenticated
                    WITH CHECK (public.jh_role() IN ('admin','staff','aosomo'))$p$, t);
    EXECUTE format($p$CREATE POLICY jh_update ON public.%I FOR UPDATE TO authenticated
                    USING (public.jh_role() IN ('admin','staff','aosomo'))
                    WITH CHECK (public.jh_role() IN ('admin','staff','aosomo'))$p$, t);
    EXECUTE format($p$CREATE POLICY jh_delete ON public.%I FOR DELETE TO authenticated
                    USING (public.jh_role() IN ('admin','staff')
                           OR (%L = 'home_visits' AND public.jh_role() = 'aosomo'))$p$, t, t);
  END LOOP;
END $$;

-- app_settings: token อ่านได้เฉพาะ admin
CREATE POLICY jh_select ON public.app_settings FOR SELECT TO authenticated
  USING (
    public.jh_role() = 'admin'
    OR (public.jh_role() IS NOT NULL
        AND setting_key NOT IN ('line_token', 'telegram_token', 'refer_line_token', 'refer_telegram_token'))
  );
CREATE POLICY jh_write ON public.app_settings FOR ALL TO authenticated
  USING (public.jh_role() = 'admin') WITH CHECK (public.jh_role() = 'admin');

-- user_profiles (trigger jh_protect_profile คุม role/status อีกชั้น)
CREATE POLICY jh_select ON public.user_profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.jh_role() IS NOT NULL);
CREATE POLICY jh_insert ON public.user_profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.jh_role() = 'admin');
CREATE POLICY jh_update ON public.user_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.jh_role() = 'admin')
  WITH CHECK (id = auth.uid() OR public.jh_role() = 'admin');
CREATE POLICY jh_delete ON public.user_profiles FOR DELETE TO authenticated
  USING (public.jh_role() = 'admin');

-- audit_logs: ทุกคนเพิ่มได้ (บันทึก login ล้มเหลวก่อน login ด้วย) อ่านได้เฉพาะ admin
DO $$ BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    GRANT INSERT ON public.audit_logs TO anon;
    EXECUTE 'CREATE POLICY jh_insert_anon ON public.audit_logs FOR INSERT TO anon WITH CHECK (user_id IS NULL)';
    EXECUTE 'CREATE POLICY jh_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id IS NULL OR user_id = auth.uid())';
    EXECUTE $p$CREATE POLICY jh_select ON public.audit_logs FOR SELECT TO authenticated USING (public.jh_role() = 'admin')$p$;
  END IF;
END $$;

-- ทะเบียน อสม. / เจ้าหน้าที่
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT tbl FROM jh_targets WHERE tbl IN ('aosomo_directory', 'staff_directory') LOOP
    EXECUTE format($p$CREATE POLICY jh_select ON public.%I FOR SELECT TO authenticated
                    USING (public.jh_role() IS NOT NULL)$p$, t);
    EXECUTE format($p$CREATE POLICY jh_write ON public.%I FOR ALL TO authenticated
                    USING (public.jh_role() = 'admin') WITH CHECK (public.jh_role() = 'admin')$p$, t);
  END LOOP;
END $$;

-- login_lockouts: admin จัดการ, ผู้ใช้ลบล็อกของตัวเองหลัง login สำเร็จ
DO $$ BEGIN
  IF to_regclass('public.login_lockouts') IS NOT NULL THEN
    EXECUTE $p$CREATE POLICY jh_admin ON public.login_lockouts FOR ALL TO authenticated
             USING (public.jh_role() = 'admin') WITH CHECK (public.jh_role() = 'admin')$p$;
    -- DELETE ... WHERE ต้องมองเห็นแถวด้วย จึงต้องมี SELECT ของตัวเองคู่กัน
    EXECUTE $p$CREATE POLICY jh_select_own ON public.login_lockouts FOR SELECT TO authenticated
             USING (email = lower(auth.jwt() ->> 'email'))$p$;
    EXECUTE $p$CREATE POLICY jh_clear_own ON public.login_lockouts FOR DELETE TO authenticated
             USING (email = lower(auth.jwt() ->> 'email'))$p$;
  END IF;
END $$;

-- notification_settings: admin เท่านั้น
DO $$ BEGIN
  IF to_regclass('public.notification_settings') IS NOT NULL THEN
    EXECUTE $p$CREATE POLICY jh_admin ON public.notification_settings FOR ALL TO authenticated
             USING (public.jh_role() = 'admin') WITH CHECK (public.jh_role() = 'admin')$p$;
  END IF;
END $$;

-- ─── 4. View ให้เคารพ RLS ของตารางต้นทาง ─────────────────────────
DO $$
DECLARE v TEXT;
BEGIN
  FOREACH v IN ARRAY ARRAY['patient_status', 'monthly_trend'] LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', v);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ─── ตรวจผล ───────────────────────────────────────────────────────
-- ตารางอื่นใน public ที่ยังไม่ได้เปิด RLS (ถ้ามี ให้ส่งรายชื่อมาตรวจเพิ่ม)
SELECT c.relname AS table_without_rls
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 1;
