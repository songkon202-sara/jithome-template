// ═══════════════════════════════════════════════════════════════════
// JitHome — ตั้งค่าของหน่วยงาน
// แต่ละ รพ.สต. แก้เฉพาะไฟล์นี้ (ดูขั้นตอนใน README.md)
// ═══════════════════════════════════════════════════════════════════
window.JITHOME_CONFIG = {
  // Supabase → Project Settings → API (หรือ API Keys)
  //   SUPABASE_URL      = Project URL เช่น https://abcdefghijkl.supabase.co
  //   SUPABASE_ANON_KEY = anon public key (ขึ้นต้น eyJ...) หรือ publishable key (ขึ้นต้น sb_publishable_...)
  // ⚠️ ห้ามใส่ service_role key / secret key ในไฟล์นี้เด็ดขาด — ไฟล์นี้ทุกคนเปิดอ่านได้
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-KEY',

  // ชื่อหน่วยงาน (แสดงบนหน้าจอและในข้อความแจ้งเตือน — แก้ภายหลังได้ในหน้าแอดมิน)
  HOSPITAL_NAME: 'รพ.สต.ตัวอย่าง',
  APP_SUBTITLE: 'ระบบติดตามผู้ป่วยจิตเวช',

  // รายชื่อหมู่บ้านในเขตรับผิดชอบ (เรียงตามที่ต้องการให้แสดง)
  VILLAGES: ['หมู่ 1', 'หมู่ 2', 'หมู่ 3', 'หมู่ 4', 'หมู่ 5', 'นอกเขต'],
}
