-- ═══════════════════════════════════════════════════════════════════
-- JitHome — บันทึกการยอมรับข้อตกลงรักษาความลับข้อมูลผู้ป่วย
-- รันใน Supabase SQL Editor (รันซ้ำได้ · ไม่เปลี่ยนข้อมูลเดิม)
--
-- ผู้ใช้แต่ละคนบันทึกการยอมรับของตัวเองได้ (trigger jh_protect_profile
-- ห้ามแก้แค่ role / status / village / email) · แอดมินดูได้ในหน้าจัดการสมาชิก
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS confidentiality_version     TEXT,
  ADD COLUMN IF NOT EXISTS confidentiality_accepted_at TIMESTAMPTZ;

-- ตรวจผล: รายชื่อผู้ใช้และสถานะการยอมรับ (ตอนแรกทุกคนจะยังเป็น "ยังไม่ยอมรับ")
SELECT display_name, role,
       CASE WHEN confidentiality_accepted_at IS NULL THEN 'ยังไม่ยอมรับ'
            ELSE 'ยอมรับแล้ว ' || to_char(confidentiality_accepted_at AT TIME ZONE 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI') END AS สถานะ
FROM public.user_profiles
WHERE COALESCE(status, 'active') = 'active'
ORDER BY role, display_name;
