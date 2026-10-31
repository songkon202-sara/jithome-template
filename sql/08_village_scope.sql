-- ═══════════════════════════════════════════════════════════════════
-- JitHome — อสม. เห็นข้อมูลผู้ป่วยเฉพาะหมู่บ้านของตัวเอง (PDPA: ใช้เท่าที่จำเป็น)
-- รันซ้ำได้ · install.sql รวมไฟล์นี้ไว้แล้ว — ใช้ไฟล์นี้เฉพาะตอนอัปเกรดระบบที่ติดตั้งก่อนหน้า
-- อสม. ที่ยังไม่ได้กำหนดหมู่บ้าน ยังเห็นทั้งหมด จนกว่าแอดมินจะกำหนด
-- ═══════════════════════════════════════════════════════════════════

-- ─── 2. อสม. เห็นเฉพาะหมู่บ้านของตัวเอง ─────────────────────────────
CREATE OR REPLACE FUNCTION public.jh_village()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(trim(village), '') FROM public.user_profiles
  WHERE id = auth.uid() AND COALESCE(status, 'active') = 'active'
$$;
REVOKE ALL ON FUNCTION public.jh_village() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jh_village() TO authenticated;

-- เห็นข้อมูลของหมู่บ้าน v ได้ไหม: เจ้าหน้าที่/แอดมิน/ผู้สังเกตการณ์ เห็นทั้งหมด
-- อสม. เห็นเฉพาะหมู่บ้านตัวเอง (ยังไม่กำหนดหมู่บ้าน → เห็นทั้งหมด ชั่วคราว)
CREATE OR REPLACE FUNCTION public.jh_sees_village(v TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT CASE public.jh_role()
    WHEN 'admin'  THEN true
    WHEN 'staff'  THEN true
    WHEN 'viewer' THEN true
    WHEN 'aosomo' THEN public.jh_village() IS NULL OR v = public.jh_village()
    ELSE false END
$$;
GRANT EXECUTE ON FUNCTION public.jh_sees_village(TEXT) TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  -- ตารางที่มีคอลัมน์ village ของตัวเอง
  FOREACH t IN ARRAY ARRAY['patients', 'home_visits'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS jh_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS jh_update ON public.%I', t);
    EXECUTE format($p$CREATE POLICY jh_select ON public.%I FOR SELECT TO authenticated
                    USING (public.jh_sees_village(village))$p$, t);
    EXECUTE format($p$CREATE POLICY jh_update ON public.%I FOR UPDATE TO authenticated
                    USING (public.jh_role() IN ('admin','staff','aosomo') AND public.jh_sees_village(village))
                    WITH CHECK (public.jh_role() IN ('admin','staff','aosomo'))$p$, t);
  END LOOP;
  -- ตารางที่อ้างผู้ป่วยผ่าน patient_id
  FOREACH t IN ARRAY ARRAY['injection_records', 'doctor_appointments'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS jh_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS jh_update ON public.%I', t);
    EXECUTE format($p$CREATE POLICY jh_select ON public.%I FOR SELECT TO authenticated
                    USING (public.jh_role() IN ('admin','staff','viewer')
                           OR (public.jh_role() = 'aosomo' AND (public.jh_village() IS NULL
                               OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.village = public.jh_village()))))$p$, t);
    EXECUTE format($p$CREATE POLICY jh_update ON public.%I FOR UPDATE TO authenticated
                    USING (public.jh_role() IN ('admin','staff')
                           OR (public.jh_role() = 'aosomo' AND (public.jh_village() IS NULL
                               OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.village = public.jh_village()))))
                    WITH CHECK (public.jh_role() IN ('admin','staff','aosomo'))$p$, t);
  END LOOP;
END $$;

-- ─── ตรวจผล ──────────────────────────────────────────────────────────
-- (ข) อสม. ที่ยังไม่ได้กำหนดหมู่บ้าน (ยังเห็นผู้ป่วยทุกหมู่บ้าน — แอดมินควรกำหนดให้)
-- (ค) หมู่บ้านของ อสม. ที่ไม่ตรงกับหมู่บ้านใดในทะเบียนผู้ป่วย (สะกดไม่ตรง → จะไม่เห็นผู้ป่วยเลย)
SELECT 'ข) อสม. ไม่มีหมู่บ้าน' AS ตรวจ, count(*)::text || ' คน' AS ผล
FROM public.user_profiles WHERE role = 'aosomo' AND COALESCE(status,'active') = 'active' AND NULLIF(trim(village), '') IS NULL
UNION ALL
SELECT 'ค) หมู่บ้าน อสม. ที่ไม่มีในทะเบียนผู้ป่วย', COALESCE(string_agg(DISTINCT u.village, ', '), 'ไม่มี (ถูกต้อง)')
FROM public.user_profiles u
WHERE u.role = 'aosomo' AND COALESCE(u.status,'active') = 'active' AND NULLIF(trim(u.village), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.village = u.village);
