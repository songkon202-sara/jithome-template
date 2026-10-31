// JitHome — ส่งแจ้งเตือน LINE / Telegram ฝั่งเซิร์ฟเวอร์
// token ทั้งหมดอ่านจาก app_settings ด้วย service role — ไม่ส่งถึง browser
// ต้อง login และเป็นบัญชี active เท่านั้น
//
// body: { kind, message }
//   kind = 'visit_report'  → LINE กลุ่มหลัก (เมื่อเปิด line_enabled)         admin/staff/อสม.
//          'referral'      → LINE + Telegram กลุ่ม รพ. แม่ข่าย               admin/staff/อสม.
//          'test_line' | 'test_referral' | 'test_telegram' → ทดสอบค่าที่บันทึกไว้  admin
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_MESSAGE = 4500 // LINE จำกัด 5000 ตัวอักษร
const WRITERS = ['admin', 'staff', 'aosomo']
const KINDS: Record<string, string[]> = {
  visit_report: WRITERS,
  referral: WRITERS,
  test_line: ['admin'],
  test_referral: ['admin'],
  test_telegram: ['admin'],
}

async function sendLine(token: string, to: string, text: string) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  })
  if (!res.ok) throw new Error('LINE: ' + (await res.text()).slice(0, 300))
}

async function sendTelegram(token: string, chatId: string, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.ok) throw new Error('Telegram: ' + (data.description || 'ส่งไม่สำเร็จ'))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    // ── ตรวจผู้เรียก ──
    const authHeader = req.headers.get('Authorization') || ''
    const sbUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await sbUser.auth.getUser()
    if (!user) return json({ error: 'กรุณาเข้าสู่ระบบ' }, 401)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: prof } = await sb.from('user_profiles').select('role,status').eq('id', user.id).maybeSingle()
    const role = prof && (prof.status ?? 'active') === 'active' ? prof.role : null

    const { kind, message } = await req.json()
    const allowed = KINDS[kind]
    if (!allowed) return json({ error: 'kind ไม่ถูกต้อง' }, 400)
    if (!role || !allowed.includes(role)) return json({ error: 'ไม่มีสิทธิ์' }, 403)
    if (typeof message !== 'string' || !message.trim()) return json({ error: 'ไม่มีข้อความ' }, 400)
    const text = message.slice(0, MAX_MESSAGE)

    // ── อ่านค่าตั้งค่า ──
    const { data: rows } = await sb.from('app_settings').select('setting_key,setting_value')
    const s: Record<string, string> = Object.fromEntries((rows || []).map((r: any) => [r.setting_key, r.setting_value || '']))

    const sent: string[] = []
    const errors: string[] = []
    const attempt = async (label: string, fn: () => Promise<void>) => {
      try { await fn(); sent.push(label) } catch (e: any) { errors.push(e.message) }
    }

    if (kind === 'visit_report' || kind === 'test_line') {
      if (kind === 'visit_report' && s.line_enabled !== '1') return json({ ok: true, sent, skipped: 'line_disabled' })
      if (!s.line_token || !s.line_group_id) {
        if (kind === 'test_line') return json({ error: 'ยังไม่ได้ตั้งค่า LINE Token หรือ Group ID' }, 400)
      } else {
        await attempt('line', () => sendLine(s.line_token, s.line_group_id, text))
      }
    }

    if (kind === 'referral' || kind === 'test_referral') {
      const lineToken = s.refer_line_token || s.line_token
      const hasLine = !!(s.refer_line_group_id && lineToken)
      const hasTg = !!(s.refer_telegram_token && s.refer_telegram_chatid)
      if (!hasLine && !hasTg && kind === 'test_referral') {
        return json({ error: 'ยังไม่ได้บันทึก LINE Group ID หรือ Telegram ของ รพ. แม่ข่าย' }, 400)
      }
      if (hasLine) await attempt('line', () => sendLine(lineToken, s.refer_line_group_id, text))
      if (hasTg) await attempt('telegram', () => sendTelegram(s.refer_telegram_token, s.refer_telegram_chatid, text))
    }

    if (kind === 'test_telegram') {
      if (!s.telegram_token || !s.telegram_chatid) return json({ error: 'ยังไม่ได้บันทึก Telegram Chat ID และ Bot Token' }, 400)
      await attempt('telegram', () => sendTelegram(s.telegram_token, s.telegram_chatid, text))
    }

    if (errors.length) return json({ error: errors.join(' | '), sent }, 502)
    return json({ ok: true, sent })
  } catch (e: any) {
    return json({ error: e.message || 'เกิดข้อผิดพลาด' }, 500)
  }
})
