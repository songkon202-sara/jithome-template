import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('ไม่ได้เข้าสู่ระบบ')

    const { targetUserId } = await req.json()
    if (!targetUserId) throw new Error('ไม่ได้ระบุ targetUserId')

    const sbUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await sbUser.auth.getUser()
    if (!user) throw new Error('ไม่ได้เข้าสู่ระบบ')

    const sbAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: callerProfile } = await sbAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'admin') throw new Error('ต้องเป็น admin เท่านั้น')

    const { data: target } = await sbAdmin
      .from('user_profiles')
      .select('role, email, display_name')
      .eq('id', targetUserId)
      .single()

    if (!target) throw new Error('ไม่พบสมาชิก')
    if (target.role !== 'aosomo') throw new Error('ใช้ได้เฉพาะบัญชี อสม. เท่านั้น')
    if (!target.email?.endsWith('@jithome.local')) throw new Error('บัญชีนี้ไม่ใช่บัญชี อสม. ของระบบ')

    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const bytes = new Uint8Array(10)
    crypto.getRandomValues(bytes)
    const newPassword = Array.from(bytes).map(b => chars[b % chars.length]).join('')

    const { error } = await sbAdmin.auth.admin.updateUserById(targetUserId, { password: newPassword })
    if (error) throw error

    return new Response(JSON.stringify({ ok: true, password: newPassword }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
