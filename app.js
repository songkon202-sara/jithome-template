'use strict'

// ─── Date Picker (flatpickr) ──────────────────────────────────────
function initDatePickers(){
  if(typeof flatpickr==='undefined')return
  document.querySelectorAll('input[type="date"]:not(.flatpickr-input)').forEach(el=>{
    flatpickr(el,{
      dateFormat:'Y-m-d',
      locale:'th',
      allowInput:true,
      disableMobile:true,
      prevArrow:'‹',
      nextArrow:'›',
    })
  })
}
;(()=>{
  let _dpTimer=null
  const obs=new MutationObserver(()=>{clearTimeout(_dpTimer);_dpTimer=setTimeout(initDatePickers,60)})
  document.addEventListener('DOMContentLoaded',()=>obs.observe(document.body,{childList:true,subtree:true}))
})()

// ─── Supabase ────────────────────────────────────────────────────
// ค่าของแต่ละหน่วยงานอยู่ใน config.js — ไฟล์นี้ไม่ต้องแก้
const CFG = window.JITHOME_CONFIG || {}
if(!CFG.SUPABASE_URL||/YOUR-/.test(CFG.SUPABASE_URL+CFG.SUPABASE_ANON_KEY)){
  document.addEventListener('DOMContentLoaded',()=>{document.body.innerHTML='<div style="font-family:sans-serif;max-width:520px;margin:60px auto;padding:24px;line-height:1.7"><h2>ยังไม่ได้ตั้งค่า JitHome</h2><p>แก้ไฟล์ <b>config.js</b> ใส่ SUPABASE_URL และ SUPABASE_ANON_KEY ของหน่วยงาน ตามขั้นตอนใน README.md</p></div>'})
  throw new Error('JitHome: config.js not set')
}
const SUPABASE_URL = CFG.SUPABASE_URL
const SUPABASE_KEY = CFG.SUPABASE_ANON_KEY
const VILLAGES = Array.isArray(CFG.VILLAGES)&&CFG.VILLAGES.length?CFG.VILLAGES:['หมู่ 1','หมู่ 2','หมู่ 3','นอกเขต']
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Constants ───────────────────────────────────────────────────
const TH_MONTHS_S = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
const TH_MONTHS_F = ['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
const PAGES = ['dashboard','patients','timeline','overview','visit','admin','members','guide','audit']

const STAFF_CHECKLIST = [
  ['s1','ประเมินอาการทางจิตเวช (สังเกต พูดคุย)'],
  ['s2','ตรวจสอบการรับประทานยาต่อเนื่อง'],
  ['s3','ประเมินความเสี่ยงทำร้ายตนเอง / ผู้อื่น'],
  ['s4','ตรวจวัด V/S (ความดัน, ชีพจร)'],
  ['s5','ประเมินสภาพแวดล้อมบ้านและความปลอดภัย'],
  ['s6','ให้คำแนะนำ / ให้ความรู้ครอบครัว'],
  ['s7','บันทึกข้อมูลในระบบ HIS'],
  ['s8','นัดติดตามครั้งถัดไป'],
]
const AOSOMO_CHECKLIST = [
  ['a1','ผู้ป่วยอยู่บ้าน ไม่หายออกไปจากชุมชน'],
  ['a2','รับประทานยาตามที่แพทย์สั่งทุกวัน'],
  ['a3','ไม่มีอาการก้าวร้าว หรือพฤติกรรมผิดปกติ'],
  ['a4','ครอบครัวดูแลได้ ไม่ทอดทิ้ง'],
  ['a5','มีนัดฉีดยาตามกำหนด (ทราบวันนัด)'],
  ['a6','สภาพบ้านสะอาด ปลอดภัย ไม่มีสิ่งอันตราย'],
]
const AOSOMO_PROBLEMS = [
  ['p1','ผู้ป่วยหายออกจากชุมชน / ไม่พบตัว'],
  ['p2','ขาดยา / ไม่รับประทานยาตามแพทย์สั่ง'],
  ['p3','พบอาการก้าวร้าว / พฤติกรรมผิดปกติ'],
  ['p4','ครอบครัวทอดทิ้ง / ดูแลผู้ป่วยไม่ได้'],
  ['p5','ขาดนัดฉีดยา / ไม่ทราบวันนัด'],
  ['p6','สภาพบ้านไม่ปลอดภัย / มีสิ่งอันตราย'],
]

// ─── State ───────────────────────────────────────────────────────
let hospitalName = CFG.HOSPITAL_NAME || 'รพ.สต.'
let appSubtitle  = CFG.APP_SUBTITLE || 'ระบบติดตามผู้ป่วยจิตเวช'
let allPatients  = []
let _ptCache=null,_ptCacheAt=0
async function getPatientsCached(maxAgeMs=30000){
  if(_ptCache&&Date.now()-_ptCacheAt<maxAgeMs)return _ptCache
  _ptCache=await getPatients();_ptCacheAt=Date.now();return _ptCache
}
let _visitChecks = []
let _visitProblems = []
let _visitType   = 'aosomo'
let _oasScores   = {s1:0, s2:0, s3:0}
let _redFlags    = []
let _ytAssess    = {ya:null, yati:null, sara:null}
let _assess10    = {}
let _mhAssess    = { twoq:{q1:null,q2:null,q3:null}, rq:[5,5,5], st5:new Array(5).fill(null) }
const AIMS_ITEMS=['กล้ามเนื้อใบหน้า','ริมฝีปาก / รอบปาก','ขากรรไกร','ลิ้น','แขนส่วนบน (ไหล่/ข้อศอก/ข้อมือ)','แขนส่วนล่าง (ข้อเข่า/ข้อเท้า)','มือและนิ้ว','การเคลื่อนไหวแขนและมือโดยรวม','คอ ไหล่ สะโพก','ลำตัว','การเคลื่อนไหวลำตัวโดยรวม','ความรุนแรงโดยรวม']
const CGB_ITEMS=['ผู้ป่วยขอความช่วยเหลือมากเกินไป','ไม่มีเวลาส่วนตัวเพราะต้องดูแล','เครียดเมื่อดูแลควบคู่กับหน้าที่อื่น','รู้สึกอายเพราะพฤติกรรมของผู้ป่วย','รู้สึกโกรธเมื่ออยู่ใกล้ผู้ป่วย','ผู้ป่วยกระทบความสัมพันธ์กับครอบครัว','กลัวเรื่องอนาคตของผู้ป่วย','สุขภาพของท่านแย่ลงเพราะการดูแล','ตึงเครียดเมื่ออยู่ใกล้ผู้ป่วย','ชีวิตทางสังคมแย่ลงเพราะการดูแล','รู้สึกหมดแรงเพราะการดูแล','การดูแลมีผลต่อชีวิตโดยรวม']
let _gaf=null
let _aims=new Array(12).fill(0)
let _cgb=new Array(12).fill(0)

const ASSESS10_DOMAINS = [
  {id:'d1',title:'1. ด้านอาการทางจิต',opts:[[1,'ไม่มีอาการ','รู้สึกดี ช่วยตนเองได้ ดำรงชีวิตได้'],[2,'มีบ้าง','พฤติกรรมผิดปกติ ≥10 วัน/เดือน'],[3,'มีมาก','พฤติกรรมผิดปกติ >10 วัน/เดือน']]},
  {id:'d2',title:'2. ด้านการรับยา',opts:[[1,'สม่ำเสมอ','กินยาตามแพทย์สั่งทุกครั้ง'],[2,'ไม่สม่ำเสมอ','กินยาไม่ครบ แต่ยังกินบางเวลา'],[3,'ไม่กินยา','ไม่รับประทานยาเลย']]},
  {id:'d3',title:'3. ด้านผู้ดูแล/ญาติ',opts:[[1,'ดี','มีผู้ดูแลในครอบครัว มีศักยภาพ'],[2,'ปานกลาง','มีผู้ดูแล แต่เป็นคนนอกครอบครัว'],[3,'ปรับปรุง','ไม่มีผู้ดูแล หรือดูแลไม่ได้']]},
  {id:'d4',title:'4. ด้านกิจวัตรประจำวัน',opts:[[1,'ทำได้','ทำด้วยตนเองได้'],[2,'ทำได้บ้าง','ทำได้ แต่ต้องมีคนช่วย'],[3,'ทำไม่ได้','ทำกิจวัตรไม่ได้เลย']]},
  {id:'d5',title:'5. ด้านการประกอบอาชีพ',opts:[[1,'ทำได้','มีอาชีพ ช่วยตนเองด้านอาชีพได้'],[2,'ทำได้บ้าง','ช่วยตนเองได้ แต่ต้องมีคนกระตุ้น'],[3,'ทำไม่ได้','ประกอบอาชีพไม่ได้เลย']]},
  {id:'d6',title:'6. ด้านสัมพันธภาพในครอบครัว',opts:[[1,'ดี','ครอบครัวสื่อสารดี ให้กำลังใจ'],[2,'ปานกลาง','สื่อสารได้ แต่มีข้อขัดแย้งบ้าง'],[3,'ปรับปรุง','ครอบครัวมีปัญหา ดูถูก ผู้ป่วยรู้สึกไม่เป็นส่วนหนึ่ง']]},
  {id:'d7',title:'7. ด้านสิ่งแวดล้อม',opts:[[1,'ดี','มีที่อยู่อาศัยเป็นหลักแหล่ง'],[2,'ปานกลาง','มีที่อยู่ แต่อยู่คนเดียวหรือเป็นครั้งคราว'],[3,'ปรับปรุง','ไม่มีที่อยู่อาศัย ไม่ปลอดภัย']]},
  {id:'d8',title:'8. ด้านการสื่อสาร',opts:[[1,'ดี','ถ่ายทอดความคิดเห็นกับผู้อื่นได้'],[2,'ปานกลาง','สื่อสารได้บ้างครั้งคราว'],[3,'ปรับปรุง','ไม่พูดคุยกับใครเลย']]},
  {id:'d9',title:'9. ด้านการเรียนรู้',opts:[[1,'ดี','บอกครั้งเดียวจำได้ ทำตามได้'],[2,'ปานกลาง','ต้องสอนซ้ำๆ จึงทำได้'],[3,'ปรับปรุง','สอนเท่าไรก็ทำไม่ได้']]},
  {id:'d10',title:'10. ด้านการใช้สารเสพติด (บุหรี่/สุรา/ยาเสพติด)',opts:[[1,'ไม่ใช้','ไม่ใช้สารเสพติดเลย'],[2,'ใช้บ้าง','ใช้บ้าง แต่ไม่ทุกวัน'],[3,'ใช้ประจำ','ใช้ทุกวันหรือแทบทุกวัน']]},
]
let currentUser        = null
let currentRole        = 'viewer'  // admin | staff | aosomo | viewer
let currentDisplayName = ''
let currentVillage     = ''        // หมู่บ้านที่ อสม. รับผิดชอบ
let _previewOrigRole   = null      // เก็บ role จริงของ admin ขณะ preview
let _previewOrigVillage= null
let _realtimeChannel   = null      // Supabase Realtime channel
let _realtimeDebounce  = null      // debounce timer สำหรับ reload
const _ownWriteIds     = new Set() // IDs ที่ client นี้เพิ่งเขียน (กรองไม่ให้ reload ซ้ำ)
let _mfaFactorId       = null      // factorId สำหรับ verify
let _mfaEnrollId       = null      // factorId สำหรับ enroll ครั้งแรก
let _mfaEnrollData     = null      // { totp: { qr_code, secret } }
let _mfaEmail          = ''        // เก็บ email ชั่วคราวระหว่าง MFA flow

const ROLE_LABEL = {admin:'ผู้ดูแลระบบ',staff:'เจ้าหน้าที่',aosomo:'อสม.',viewer:'ผู้สังเกตการณ์'}
const ROLE_COLOR = {admin:'var(--primary)',staff:'#0d9488',aosomo:'#7c3aed',viewer:'var(--text3)'}
const VIEWER_PAGES = ['overview']
function canDo(action){
  const perms={
    admin:   ['view','record','visit','admin','manage_users'],
    staff:   ['view','record','visit'],
    aosomo:  ['view','visit'],
    viewer:  ['view'],
  }
  return (perms[currentRole]||[]).includes(action)
}

// ─── Helpers ─────────────────────────────────────────────────────
function thDate(d) {
  if (!d) return ''
  const dt = new Date(String(d).slice(0,10) + 'T00:00:00Z')
  return `${dt.getUTCDate()} ${TH_MONTHS_S[dt.getUTCMonth()+1]} ${dt.getUTCFullYear()+543}`
}
function thDateFull(d) {
  if (!d) return ''
  const dt = new Date(String(d).slice(0,10) + 'T00:00:00Z')
  return `${dt.getUTCDate()} ${TH_MONTHS_F[dt.getUTCMonth()+1]} ${dt.getUTCFullYear()+543}`
}
function daysChip(n) {
  n = parseInt(n)
  if (isNaN(n))  return { cls:'upcoming', label:'—' }
  if (n < 0)     return { cls:'overdue',  label:`เกินนัด ${Math.abs(n)} วัน` }
  if (n === 0)   return { cls:'today',    label:'วันนี้' }
  if (n <= 3)    return { cls:'soon',     label:`อีก ${n} วัน` }
  return           { cls:'upcoming',  label:`อีก ${n} วัน` }
}
function groupLabel(g) {
  return {red:'กลุ่มสีแดง',yellow:'กลุ่มสีเหลือง',green:'กลุ่มสีเขียว'}[g] || 'กลุ่มสีเหลือง'
}
let _xlsxP=null
function loadXLSX(){
  if(typeof XLSX!=='undefined')return Promise.resolve()
  if(_xlsxP)return _xlsxP
  _xlsxP=new Promise((res,rej)=>{
    const s=document.createElement('script')
    s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
    s.integrity='sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'
    s.crossOrigin='anonymous'
    s.onload=res
    s.onerror=()=>rej(new Error('โหลด xlsx ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'))
    document.head.appendChild(s)
  })
  return _xlsxP
}
function parseInterval(s) {
  if (!s) return 30
  if (/3\s*เดือน/.test(s))   return 90
  if (/1\s*เดือน/.test(s))   return 30
  if (/4\s*สัปดาห์/.test(s)) return 28
  if (/3\s*สัปดาห์/.test(s)) return 21
  if (/2\s*สัปดาห์/.test(s)) return 14
  return 30
}
function daysToIntervalStr(days){
  if(days<=14)return'2 สัปดาห์'
  if(days<=21)return'3 สัปดาห์'
  if(days<=28)return'4 สัปดาห์'
  if(days<=45)return'1 เดือน'
  return'3 เดือน'
}
function addDaysToDate(dateStr,days){
  const d=new Date(dateStr+'T00:00:00');d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)
}
function syncNextDateFromInterval(fromId,intId,nextId){
  const from=document.getElementById(fromId)?.value
  const intEl=document.getElementById(intId)
  const nextEl=document.getElementById(nextId)
  if(!from||!intEl||!nextEl)return
  const nd=addDaysToDate(from,parseInterval(intEl.value))
  if(nextEl._flatpickr)nextEl._flatpickr.setDate(nd,true);else nextEl.value=nd
}
function syncIntervalFromNextDate(fromId,nextId,intId){
  const from=document.getElementById(fromId)?.value
  const next=document.getElementById(nextId)?.value
  const intEl=document.getElementById(intId)
  if(!from||!next||!intEl)return
  const days=Math.round((new Date(next+'T00:00:00')-new Date(from+'T00:00:00'))/86400000)
  if(days<=0)return
  const str=daysToIntervalStr(days)
  for(const o of intEl.options)if(o.textContent.trim()===str){o.selected=true;break}
}
function getIntervalAndDays(fromDateId,intId,nextDateId){
  const from=document.getElementById(fromDateId)?.value||''
  const next=document.getElementById(nextDateId)?.value||''
  const intVal=document.getElementById(intId)?.value||'1 เดือน'
  if(from&&next){
    const days=Math.round((new Date(next+'T00:00:00')-new Date(from+'T00:00:00'))/86400000)
    if(days>0)return{interval_str:daysToIntervalStr(days),interval_days:days}
  }
  return{interval_str:intVal,interval_days:parseInterval(intVal)}
}
function parseGroupColor(g) {
  if (!g) return 'yellow'
  if (g.includes('แดง') || g === 'red')     return 'red'
  if (g.includes('เขียว') || g === 'green') return 'green'
  return 'yellow'
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function safeUrl(u){
  if(!u)return'#'
  try{const p=new URL(u);return(p.protocol==='https:'||p.protocol==='http:')?esc(u):'#'}catch{return'#'}
}
function extractStoragePath(url){
  if(!url)return null
  const m=url.match(/\/object\/(?:public|sign)\/patient-files\/(.+?)(?:\?|$)/)
  return m?decodeURIComponent(m[1]):(!url.startsWith('http')?url:null)
}
async function getSignedUrl(url,expiresIn=3600){
  const path=extractStoragePath(url)
  if(!path)return safeUrl(url)
  const{data}=await sb.storage.from('patient-files').createSignedUrl(path,expiresIn)
  return data?.signedUrl||''
}
async function batchSignedUrls(urls,expiresIn=3600){
  const valid=(urls||[]).filter(Boolean)
  if(!valid.length)return{}
  const pairs=valid.map(u=>({u,p:extractStoragePath(u)})).filter(x=>x.p)
  if(!pairs.length)return{}
  const{data}=await sb.storage.from('patient-files').createSignedUrls(pairs.map(x=>x.p),expiresIn)
  const map={}
  ;(data||[]).forEach((d,i)=>{if(d?.signedUrl)map[pairs[i].u]=d.signedUrl})
  return map
}
function genPassword(){
  const chars='ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(10))).map(b=>chars[b%chars.length]).join('')
}
async function fetchWithTimeout(url,opts,ms=10000){
  const ctrl=new AbortController()
  const timer=setTimeout(()=>ctrl.abort(),ms)
  try{return await fetch(url,{...opts,signal:ctrl.signal})}
  finally{clearTimeout(timer)}
}
// สำหรับค่าที่ใส่ใน single-quoted JS string ภายใน HTML attribute เช่น onclick="func('${jsStr(val)}')"
function jsStr(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\/g,'\\\\').replace(/'/g,"\\'")
}
function showToast(msg,duration=2500){
  document.getElementById('_toast')?.remove()
  const t=document.createElement('div');t.id='_toast'
  t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:600;z-index:99999;font-family:Sarabun,sans-serif;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,0.3)'
  t.textContent=msg;document.body.appendChild(t)
  setTimeout(()=>t.remove(),duration)
}
function setSubtitle(el,text){if(!el)return;el.innerHTML=esc(text||'').replace(/\n/g,'<br>')}
function todayISO() { return new Date().toISOString().slice(0,10) }
function maskNationalId(id){
  const d=(id||'').replace(/\D/g,'')
  if(!d)return''
  const fmt=n=>`${n.slice(0,1)}-${n.slice(1,5)}-${n.slice(5,10)}-${n.slice(10,12)}-${n.slice(12,13)}`
  if(canDo('admin'))return fmt(d.padEnd(13,'?'))
  if(canDo('record')){
    // PDPA: แสดงเฉพาะหลักที่ 5-8, ซ่อนส่วนที่เหลือ
    const p=d.padEnd(13,'?')
    return fmt('X'.repeat(4)+p.slice(4,8)+'X'.repeat(5))
  }
  return'X-XXXX-XXXXX-XX-X'
}
function formatNationalIdInput(v){
  const d=v.replace(/\D/g,'').slice(0,13)
  if(d.length<=1)return d
  if(d.length<=5)return`${d.slice(0,1)}-${d.slice(1)}`
  if(d.length<=10)return`${d.slice(0,1)}-${d.slice(1,5)}-${d.slice(5)}`
  if(d.length<=12)return`${d.slice(0,1)}-${d.slice(1,5)}-${d.slice(5,10)}-${d.slice(10)}`
  return`${d.slice(0,1)}-${d.slice(1,5)}-${d.slice(5,10)}-${d.slice(10,12)}-${d.slice(12,13)}`
}

function patientCard(p) {
  const chip = daysChip(p.days_until)
  const over = parseInt(p.days_until) < 0
  const gl   = p.group_label || groupLabel(p.group_color)
  const cls  = `patient-card ${p.group_color}${over?' overdue':''} fade-up`
  const disease = canDo('record') && (p.disease_code||p.disease_name) ? `<div class="pc-note" style="color:#0369a1;background:#f0f9ff">${p.disease_code?`<strong>${esc(p.disease_code)}</strong> `:''}${esc(p.disease_name||'')}</div>` : ''
  const note = p.note ? `<div class="pc-note">${esc(p.note)}</div>` : ''
  const nid = canDo('record') && p.national_id ? `<div class="pc-note" style="color:#78350f;background:#fef9c3;font-family:monospace;letter-spacing:0.5px">🪪 ${maskNationalId(p.national_id)}</div>` : ''
  return `<div class="${cls}" onclick="openModal(${p.id})" data-id="${p.id}" data-group="${p.group_color}" data-village="${esc(p.village||'')}">
    <div class="pc-top">
      <div>
        <div class="pc-name">${esc(p.name)}</div>
        <div class="pc-village">${esc(p.village||'')}${p.house_no?` · ${esc(p.house_no)}`:''}</div>
      </div>
      <span class="days-chip ${chip.cls}">${chip.label}</span>
    </div>
    <div class="pc-meta">
      <span class="badge ${p.group_color}"><span class="badge-dot"></span>${esc(gl)}</span>
      <span class="pc-date" style="display:flex;gap:8px;flex-wrap:wrap">
        ${p.next_inject_date?`<span>💉 ${thDate(p.next_inject_date)}</span>`:p.next_date?`<span style="color:var(--text3)">💉 ${thDate(p.next_date)}</span>`:''}
        ${p.next_visit_date?`<span style="color:#ea580c">🏡 ${thDate(p.next_visit_date)}</span>`:''}
      </span>
    </div>
    ${disease}${nid}${note}
  </div>`
}

// ─── Data ────────────────────────────────────────────────────────
async function getPatients() {
  let q = sb.from('patient_status').select('*').order('days_until')
  if (currentRole === 'aosomo' && currentVillage) q = q.eq('village', currentVillage)
  let pq = sb.from('patients').select('id,next_inject_date,next_visit_date')
  if (currentRole === 'aosomo' && currentVillage) pq = pq.eq('village', currentVillage)
  const [{ data, error }, { data: pDates, error: pErr }] = await Promise.all([q, pq])
  // แจ้งให้เห็นชัด — ถ้าเงียบ หน้าจอจะดูเหมือน "ไม่มีผู้ป่วย" ทั้งที่จริงโหลดไม่สำเร็จ
  if (error) { console.error('getPatients:', error); showToast('❌ โหลดรายชื่อผู้ป่วยไม่สำเร็จ: '+error.message, 6000); return [] }
  if (pErr) console.error('getPatients (dates):', pErr)
  // ดึง next_inject_date / next_visit_date ตรงจากตาราง patients (ไม่ผ่าน view)
  const dateMap = {}
  for (const p of (pDates||[])) dateMap[p.id] = p
  const today = todayISO()
  return (data||[]).map(p => {
    const corrected = { ...p, group_label: groupLabel(p.group_color) }
    if (dateMap[p.id]) {
      corrected.next_inject_date = dateMap[p.id].next_inject_date
      corrected.next_visit_date  = dateMap[p.id].next_visit_date
    }
    // ยึดวันนัดฉีดยาจากตาราง patients เป็นหลักสำหรับ days_until
    if (corrected.next_inject_date) {
      corrected.next_date = corrected.next_inject_date
      corrected.days_until = Math.round(
        (new Date(corrected.next_inject_date+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000
      )
    } else if (corrected.last_date && corrected.last_date > today) {
      corrected.next_date = corrected.last_date
      corrected.days_until = Math.round(
        (new Date(corrected.last_date+'T00:00:00') - new Date(today+'T00:00:00')) / 86400000
      )
    }
    return corrected
  }).sort((a,b)=>{
    const da=a.days_until!=null?parseInt(a.days_until):9999
    const db=b.days_until!=null?parseInt(b.days_until):9999
    return da-db
  }).filter((p,i,arr)=>arr.findIndex(x=>x.id===p.id)===i)
}
// ค่าที่แสดงได้ก่อน login (ไม่มี token) — ตาราง app_settings อ่านได้เฉพาะผู้ที่ login แล้ว
async function getPublicSettings() {
  let { data, error } = await sb.rpc('get_public_settings')
  if (error?.code === 'PGRST202') return getSettings() // ยังไม่ได้รัน 01_prepare.sql
  const s = {}; for (const r of (data||[])) s[r.setting_key] = r.setting_value
  return s
}
async function getSettings() {
  const { data } = await sb.from('app_settings').select('setting_key,setting_value')
  const s = {}; for (const r of (data||[])) s[r.setting_key] = r.setting_value
  return s
}
async function getHistory(pid) {
  const { data } = await sb.from('injection_records').select('*').eq('patient_id', pid).order('injection_date', { ascending:false })
  return (data||[]).map(h => ({ ...h, date_th: thDate(h.injection_date) }))
}
async function getVisits(type='all') {
  let q = sb.from('home_visits').select('*').order('visit_date', { ascending:false })
  if (type !== 'all') q = q.eq('visit_type', type)
  if (currentRole==='aosomo' && currentVillage) q = q.eq('village', currentVillage)
  const { data } = await q
  return (data||[]).map(v => ({ ...v, visit_date_th: thDate(v.visit_date) }))
}
async function getTrend() {
  const { data } = await sb.from('monthly_trend').select('*').order('month_key').limit(9)
  return data||[]
}

// ─── Router ──────────────────────────────────────────────────────
async function navigate(page) {
  if (!PAGES.includes(page)) page = 'dashboard'
  if(currentRole==='viewer' && !_previewOrigRole && !VIEWER_PAGES.includes(page)) page='overview'
  document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === page))
  const titles = {
    dashboard:['JitHome', appSubtitle],
    patients: ['ผู้ป่วยทั้งหมด','รายชื่อและสถานะ'],
    timeline: ['ตารางนัดหมาย','เรียงตามวันที่'],
    overview: ['ภาพรวม','สถิติและกราฟ'],
    visit:    ['เยี่ยมบ้าน','บันทึกการเยี่ยม'],
    admin:    ['แอดมิน','จัดการและตั้งค่า'],
    members:  ['จัดการสมาชิก','กำหนดสิทธิ์การเข้าถึง'],
    guide:    ['คู่มือการใช้งาน','ตัวอย่างสิทธิ์แต่ละประเภท'],
    audit:    ['Audit Log','บันทึกการใช้งานระบบ'],
  }
  const [t,s] = titles[page]||['JitHome','']
  document.getElementById('header-title').textContent = t
  setSubtitle(document.getElementById('header-sub'), s)
  const el = document.getElementById('page-content')
  el.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text3)">⏳ กำลังโหลด...</div>'
  try{
    allPatients = await getPatientsCached()
    if (page==='dashboard') renderDashboard(el)
    else if (page==='patients')  renderPatients(el)
    else if (page==='timeline')  renderTimeline(el)
    else if (page==='overview')  renderOverview(el)
    else if (page==='visit')     renderVisit(el)
    else if (page==='admin')     renderAdmin(el)
    else if (page==='members')   renderMembers(el)
    else if (page==='guide')     renderGuide(el)
    else if (page==='audit')     renderAuditPage(el)
  }catch(e){
    el.innerHTML=`<div style="text-align:center;padding:60px 20px;color:#ef4444">❌ โหลดไม่สำเร็จ: ${esc(e.message)}</div>`
    console.error('navigate error:',e)
  }
  history.replaceState(null,'','#'+page)
  updatePreviewHeader()
  updateUserUI()
}

// ─── Dashboard ───────────────────────────────────────────────────
function renderDashboard(el) {
  const pts = allPatients
  const overdue  = pts.filter(p=>parseInt(p.days_until)<0)
  const todayPts = pts.filter(p=>parseInt(p.days_until)===0)
  const soon7    = pts.filter(p=>{ const d=parseInt(p.days_until); return d>0&&d<=7 })
  const rc=pts.filter(p=>p.group_color==='red').length
  const yc=pts.filter(p=>p.group_color==='yellow').length
  const gc=pts.filter(p=>p.group_color==='green').length
  const now=new Date()
  const days=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์']
  const dayStr=`วัน${days[now.getDay()]}ที่ ${thDateFull(todayISO())}`
  el.innerHTML=`<div class="page">
  <div class="today-strip">
    <h2>${dayStr}</h2>
    <p>${esc(hospitalName)}</p>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button class="pill-btn pill-all" onclick="navigate('patients')">ผู้ป่วยทั้งหมด <span class="pill-count">${pts.length}</span></button>
      <button class="pill-btn pill-overdue" onclick="navigate('patients')">เกินนัด <span class="pill-count">${overdue.length}</span></button>
      <button class="pill-btn pill-today">วันนี้ <span class="pill-count">${todayPts.length}</span></button>
      <button class="pill-btn pill-week" onclick="navigate('patients')">7 วัน <span class="pill-count-g">${soon7.length}</span></button>
    </div>
  </div>
  <div class="stats-grid">
    <div class="stat-card" style="background:var(--red-lt);border:1px solid var(--red-bd)">
      <div class="stat-icon" style="background:var(--red);color:#fff;font-size:16px">⚠️</div>
      <div class="stat-num" style="color:var(--red)">${overdue.length}</div>
      <div class="stat-label" style="color:var(--red)">เกินวันนัด</div>
    </div>
    <div class="stat-card" style="background:var(--yellow-lt);border:1px solid var(--yellow-bd)">
      <div class="stat-icon" style="background:var(--yellow);color:#fff;font-size:16px">🔔</div>
      <div class="stat-num" style="color:var(--yellow)">${soon7.filter(p=>parseInt(p.days_until)<=3).length}</div>
      <div class="stat-label" style="color:var(--yellow)">ภายใน 3 วัน</div>
    </div>
    <div class="stat-card" style="background:var(--red-lt);border:1px solid var(--red-bd)">
      <div class="stat-num" style="color:var(--red)">🔴 ${rc}</div>
      <div class="stat-label">กลุ่มสีแดง</div>
    </div>
    <div class="stat-card" style="background:var(--yellow-lt);border:1px solid var(--yellow-bd)">
      <div class="stat-num" style="color:var(--yellow)">🟡 ${yc}</div>
      <div class="stat-label">กลุ่มสีเหลือง</div>
    </div>
  </div>
  ${overdue.length?`<div class="section-hd"><h3>⚠️ เกินวันนัด (${overdue.length} ราย)</h3></div>${overdue.slice(0,5).map(patientCard).join('')}${overdue.length>5?`<div style="text-align:center;padding:8px"><button onclick="navigate('patients')" class="btn btn-outline" style="font-size:12px;padding:6px 16px">ดูทั้งหมด ${overdue.length} ราย</button></div>`:''}`:``}
  ${todayPts.length?`<div class="section-hd" style="margin-top:8px"><h3>📅 วันนี้ (${todayPts.length} ราย)</h3></div>${todayPts.map(patientCard).join('')}`:``}
  ${soon7.length?`<div class="section-hd" style="margin-top:8px"><h3>🔔 ภายใน 7 วัน (${soon7.length} ราย)</h3></div>${soon7.map(patientCard).join('')}`:``}
  ${!overdue.length&&!todayPts.length&&!soon7.length?`<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><p>ไม่มีการนัดหมายที่ต้องติดตามวันนี้ 🎉</p></div>`:''}
  </div>`
}

// ─── Patients ────────────────────────────────────────────────────
const PT_PAGE_SIZE = 50
let _ptFiltered = []
let _ptShown = 0

function renderPatients(el) {
  const pts = allPatients
  const villages=[...new Set(pts.map(p=>p.village).filter(Boolean))].sort()
  window._gf='all'; window._vf='all'
  el.innerHTML=`<div class="page">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
    <div><div class="page-title" style="margin-bottom:2px">ผู้ป่วยทั้งหมด</div><div class="page-sub">${pts.length} ราย · ${esc(hospitalName)}</div></div>
    <button onclick="openAddPatient()" style="display:flex;align-items:center;gap:6px;background:var(--primary);color:#fff;border:none;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;white-space:nowrap"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>เพิ่มผู้ป่วย</button>
  </div>
  <div class="search-wrap">
    <div class="search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
    <input id="pt-search" placeholder="ค้นหาชื่อ..." oninput="filterPts()" autocomplete="off">
  </div>
  <div class="filter-row">
    <button class="filter-chip active" data-gf="all" onclick="setGF('all')">ทั้งหมด (${pts.length})</button>
    <button class="filter-chip red" data-gf="red" onclick="setGF('red')">🔴 แดง (${pts.filter(p=>p.group_color==='red').length})</button>
    <button class="filter-chip yellow" data-gf="yellow" onclick="setGF('yellow')">🟡 เหลือง (${pts.filter(p=>p.group_color==='yellow').length})</button>
    <button class="filter-chip green" data-gf="green" onclick="setGF('green')">🟢 เขียว (${pts.filter(p=>p.group_color==='green').length})</button>
  </div>
  <div class="filter-row">
    <button class="filter-chip active" data-vf="all" onclick="setVF('all')">ทุกหมู่บ้าน</button>
    ${villages.map(v=>`<button class="filter-chip" data-vf="${esc(v)}" onclick="setVF('${jsStr(v)}')">${esc(v)}</button>`).join('')}
  </div>
  <div id="pt-list"></div>
  </div>`
  filterPts()
}
function filterPts() {
  const q=(document.getElementById('pt-search')?.value||'').toLowerCase()
  const gf=window._gf||'all', vf=window._vf||'all'
  _ptFiltered=allPatients.filter(p=>{
    if(gf!=='all'&&p.group_color!==gf)return false
    if(vf!=='all'&&p.village!==vf)return false
    if(q&&!(p.name||'').toLowerCase().includes(q))return false
    return true
  })
  _ptShown=0
  renderPtPage()
}
function renderPtPage(){
  const list=document.getElementById('pt-list')
  if(!list)return
  if(!_ptFiltered.length){list.innerHTML='<div class="empty"><p>ไม่พบผู้ป่วย</p></div>';return}
  const chunk=_ptFiltered.slice(0,_ptShown+PT_PAGE_SIZE)
  _ptShown=chunk.length
  const hasMore=_ptShown<_ptFiltered.length
  list.innerHTML=chunk.map(patientCard).join('')+
    (hasMore?`<div style="text-align:center;padding:16px"><button onclick="renderPtPage()" style="padding:10px 28px;border-radius:10px;border:1.5px solid var(--primary);background:#fff;color:var(--primary);font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">โหลดเพิ่ม (${_ptFiltered.length-_ptShown} รายการ)</button></div>`:'')
}
function setGF(gf){window._gf=gf;document.querySelectorAll('[data-gf]').forEach(e=>e.classList.toggle('active',e.dataset.gf===gf));filterPts()}
function setVF(vf){window._vf=vf;document.querySelectorAll('[data-vf]').forEach(e=>e.classList.toggle('active',e.dataset.vf===vf));filterPts()}

// ─── Timeline ────────────────────────────────────────────────────
function renderTimeline(el) {
  if(!window._tlType) window._tlType='inject'
  if(!window._tlf) window._tlf='all'
  const today=todayISO()
  const t=window._tlType, f=window._tlf
  const injectPts=allPatients.filter(p=>p.next_inject_date)
  const visitPts=allPatients.filter(p=>p.next_visit_date)
  const doctorAppts=window._doctorAppts||[]
  const daysDiff=d=>Math.round((new Date(d+'T00:00:00')-new Date(today+'T00:00:00'))/86400000)
  let cnt={all:0,overdue:0,today:0,week:0,month:0}
  if(t==='doctor'){
    cnt.all=doctorAppts.filter(a=>a.status!=='done').length
    cnt.overdue=doctorAppts.filter(a=>a.appoint_date<today&&a.status!=='done').length
    cnt.today=doctorAppts.filter(a=>a.appoint_date===today).length
    cnt.week=doctorAppts.filter(a=>{const d=daysDiff(a.appoint_date);return d>=0&&d<=7}).length
    cnt.month=doctorAppts.filter(a=>{const d=daysDiff(a.appoint_date);return d>=0&&d<=30}).length
  } else {
    const df=t==='inject'?'next_inject_date':'next_visit_date'
    const bp=t==='inject'?injectPts:visitPts
    cnt={all:bp.length,overdue:bp.filter(p=>p[df]<today).length,today:bp.filter(p=>p[df]===today).length,week:bp.filter(p=>{const d=daysDiff(p[df]);return d>=0&&d<=7}).length,month:bp.filter(p=>{const d=daysDiff(p[df]);return d>=0&&d<=30}).length}
  }
  el.innerHTML=`<div class="page">
    <div class="page-title">ตารางนัดหมาย</div>
    <div class="page-sub">เฉพาะผู้ป่วยที่มีนัดหมาย</div>
    <div class="filter-row">
      <button class="filter-chip${t==='inject'?' active':''}" onclick="setTLType('inject')">💉 นัดฉีดยา (${injectPts.length})</button>
      <button class="filter-chip${t==='visit'?' active':''}" onclick="setTLType('visit')">🏡 นัดเยี่ยมบ้าน (${visitPts.length})</button>
      <button class="filter-chip${t==='doctor'?' active':''}" onclick="setTLType('doctor')">🏥 นัดพบแพทย์ (${doctorAppts.length})</button>
    </div>
    <div class="filter-row">
      <button class="filter-chip${f==='all'?' active':''}" data-tlf="all" onclick="setTLF('all')">ทั้งหมด (${cnt.all})</button>
      <button class="filter-chip${f==='overdue'?' active':''}" data-tlf="overdue" onclick="setTLF('overdue')" style="${f!=='overdue'?'color:#ef4444':''}">⚠️ เกินนัด (${cnt.overdue})</button>
      <button class="filter-chip${f==='today'?' active':''}" data-tlf="today" onclick="setTLF('today')">📅 วันนี้ (${cnt.today})</button>
      <button class="filter-chip${f==='week'?' active':''}" data-tlf="week" onclick="setTLF('week')">7 วัน (${cnt.week})</button>
      <button class="filter-chip${f==='month'?' active':''}" data-tlf="month" onclick="setTLF('month')">30 วัน (${cnt.month})</button>
    </div>
    ${t==='doctor'&&canDo('record')?`<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button onclick="openDoctorApptForm()" style="padding:6px 16px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">+ เพิ่มนัดพบแพทย์</button></div>`:''}
    <div id="tl-list"></div>
  </div>`
  if(t==='doctor'&&!window._doctorAppts){
    document.getElementById('tl-list').innerHTML='<div class="empty"><p>⏳ กำลังโหลด...</p></div>'
    loadDoctorAppts().then(()=>renderTimeline(el)).catch(e=>{document.getElementById('tl-list').innerHTML=`<div class="empty"><p>❌ โหลดไม่สำเร็จ: ${esc(e.message)}</p></div>`})
  } else {
    renderTLList()
  }
}
async function setTLType(t){
  window._tlType=t; window._tlf='all'
  if(t==='doctor'&&!window._doctorAppts) await loadDoctorAppts()
  renderTimeline(document.getElementById('page-content'))
}
function setTLF(f){
  window._tlf=f
  document.querySelectorAll('[data-tlf]').forEach(e=>e.classList.toggle('active',e.dataset.tlf===f))
  renderTLList()
}
async function loadDoctorAppts(){
  let q=sb.from('doctor_appointments').select('*').order('appoint_date')
  // อสม. เห็นเฉพาะนัดหมายของผู้ป่วยในหมู่บ้านที่รับผิดชอบ
  if(currentRole==='aosomo'&&currentVillage){
    const ids=allPatients.filter(p=>p.village===currentVillage).map(p=>p.id)
    if(ids.length>0)q=q.in('patient_id',ids);else{window._doctorAppts=[];return}
  }
  const{data,error}=await q
  if(error){console.error('loadDoctorAppts error:',error);window._doctorAppts=[];return}
  window._doctorAppts=(data||[]).map(a=>{
    const p=allPatients.find(x=>x.id===a.patient_id)||{}
    return{...a,patients:{name:p.name,village:p.village,group_color:p.group_color}}
  })
}
function doctorApptCard(a){
  const p=a.patients||{}
  const typeLabel={'medicine':'💊 รับยา','check':'🩺 ตรวจ','other':'📋 อื่นๆ'}[a.appoint_type]||a.appoint_type||'รับยา'
  const gc=p.group_color||'green'
  const gcLabel={red:'กลุ่มสีแดง',yellow:'กลุ่มสีเหลือง',green:'กลุ่มสีเขียว'}[gc]||'กลุ่มสีเขียว'
  const gcShape={red:'▲',yellow:'◆',green:'●'}[gc]||'●'
  const gcColor={red:'#ef4444',yellow:'#f59e0b',green:'#22c55e'}[gc]||'#22c55e'
  const dot=`<span role="img" aria-label="${gcLabel}" style="color:${gcColor};font-size:10px;font-weight:900;margin-right:4px;vertical-align:middle">${gcShape}</span>`
  const daysUntil=Math.round((new Date(a.appoint_date+'T00:00:00')-new Date(todayISO()+'T00:00:00'))/86400000)
  const isOverdue=daysUntil<0&&a.status!=='done'&&a.status!=='missed'
  const chip=daysChip(a.status==='done'||a.status==='missed'?NaN:daysUntil)
  const statusLabel=a.status==='done'?'✅ ไปแล้ว':a.status==='missed'?'❌ ขาดนัด':null
  const statusColor=a.status==='done'?'#16a34a':'#b91c1c'
  return`<div class="patient-card${isOverdue?' overdue':''}" style="margin-bottom:8px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:700">${esc(p.name||'?')}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${dot}${esc(p.village||'')} · 🏥 ${esc(a.hospital||'รพ.โพธิ์ไทร')}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">${typeLabel} · 📅 ${thDate(a.appoint_date)}${a.doctor_name?` · 👨‍⚕️ ${esc(a.doctor_name)}`:''}</div>
        ${a.note?`<div style="font-size:11px;color:var(--text3);margin-top:3px;white-space:pre-line">${esc(a.note)}</div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
        <span class="days-chip ${chip.cls}">${chip.label}</span>
        ${statusLabel?`<span style="font-size:11px;font-weight:700;color:${statusColor}">${statusLabel}</span>`:''}
        ${canDo('record')?`<div style="display:flex;gap:4px">
          <button onclick="editDoctorAppt(${a.id})" aria-label="แก้ไขนัดพบแพทย์" style="background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--text2);padding:3px 8px;font-size:11px;font-family:'Sarabun',sans-serif">✏️</button>
          <button onclick="deleteDoctorAppt(${a.id})" aria-label="ลบนัดพบแพทย์" style="background:none;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;color:#b91c1c;padding:3px 8px;font-size:11px;font-family:'Sarabun',sans-serif">🗑️</button>
        </div>`:''}
      </div>
    </div>
  </div>`
}
function renderTLList(){
  const el=document.getElementById('tl-list')
  if(!el)return
  const today=todayISO()
  const t=window._tlType||'inject', f=window._tlf||'all'
  const daysDiff=d=>Math.round((new Date(d+'T00:00:00')-new Date(today+'T00:00:00'))/86400000)
  if(t==='doctor'){
    let appts=[...(window._doctorAppts||[])]
    if(f==='overdue') appts=appts.filter(a=>a.appoint_date<today&&a.status!=='done')
    else if(f==='today') appts=appts.filter(a=>a.appoint_date===today)
    else if(f==='week') appts=appts.filter(a=>{const d=daysDiff(a.appoint_date);return d>=0&&d<=7})
    else if(f==='month') appts=appts.filter(a=>{const d=daysDiff(a.appoint_date);return d>=0&&d<=30})
    else appts=appts.filter(a=>a.status!=='done')
    appts.sort((a,b)=>(a.appoint_date||'').localeCompare(b.appoint_date||''))
    if(!appts.length){el.innerHTML='<div class="empty"><p>ไม่มีข้อมูลในช่วงนี้</p></div>';return}
    const groups={}
    for(const a of appts){const k=a.appoint_date;if(!groups[k])groups[k]=[];groups[k].push(a)}
    let html=''
    for(const[date,group]of Object.entries(groups)){
      const past=date<today,isToday=date===today
      const hd=past?`⚠️ ${thDate(date)}`:isToday?`📅 วันนี้ — ${thDate(date)}`:thDate(date)
      html+=`<div class="tl-date-hd${isToday?' today-hd':''}">${hd} · ${group.length} ราย</div>${group.map(doctorApptCard).join('')}`
    }
    el.innerHTML=html
    return
  }
  const df=t==='inject'?'next_inject_date':'next_visit_date'
  let pts=[...allPatients].filter(p=>p[df])
  if(f==='overdue') pts=pts.filter(p=>p[df]<today)
  else if(f==='today') pts=pts.filter(p=>p[df]===today)
  else if(f==='week') pts=pts.filter(p=>{const d=daysDiff(p[df]);return d>=0&&d<=7})
  else if(f==='month') pts=pts.filter(p=>{const d=daysDiff(p[df]);return d>=0&&d<=30})
  pts.sort((a,b)=>a[df].localeCompare(b[df]))
  if(!pts.length){el.innerHTML='<div class="empty"><p>ไม่มีข้อมูลในช่วงนี้</p></div>';return}
  const groups={}
  for(const p of pts){const k=p[df];if(!groups[k])groups[k]=[];groups[k].push(p)}
  let html=''
  for(const[date,group]of Object.entries(groups)){
    const past=date<today,isToday=date===today
    const hd=past?`⚠️ ${thDate(date)}`:isToday?`📅 วันนี้ — ${thDate(date)}`:thDate(date)
    html+=`<div class="tl-date-hd${isToday?' today-hd':''}">${hd} · ${group.length} ราย</div>${group.map(patientCard).join('')}`
  }
  el.innerHTML=html
}
function filterDaPatients(){
  const village=document.getElementById('da-vf')?.value||''
  const search=(document.getElementById('da-search')?.value||'').toLowerCase()
  const sel=document.getElementById('da-patient')
  if(!sel)return
  const cur=sel.value
  const filtered=allPatients.filter(p=>(!village||p.village===village)&&(!search||(p.name||'').toLowerCase().includes(search)))
  sel.innerHTML=`<option value="">-- เลือกผู้ป่วย --</option>`+filtered.map(p=>`<option value="${p.id}"${String(p.id)===String(cur)?' selected':''}>${esc(p.name)} — ${esc(p.village||'')}</option>`).join('')
}
function openDoctorApptForm(id=null){
  const appt=id?(window._doctorAppts||[]).find(a=>a.id===id):null
  const villages=[...new Set(allPatients.map(p=>p.village).filter(Boolean))].sort()
  const villageOpts=villages.map(v=>`<option value="${v}">${v}</option>`).join('')
  const selPid=appt?.patient_id
  const patOpts=allPatients.map(p=>`<option value="${p.id}"${p.id===selPid?' selected':''}>${esc(p.name)} — ${esc(p.village||'')}</option>`).join('')
  const selStyle='width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:\'Sarabun\',sans-serif;background:var(--bg);color:var(--text)'
  document.body.insertAdjacentHTML('beforeend',`<div id="da-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center" onclick="if(event.target===this)closeDoctorApptModal()">
    <div style="background:var(--surface);border-radius:16px 16px 0 0;padding:20px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:16px;font-weight:700">🏥 ${id?'แก้ไข':'เพิ่ม'}นัดพบแพทย์</div>
        <button onclick="closeDoctorApptModal()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text2);line-height:1">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div><label style="font-size:11px;color:var(--text3);font-weight:600">กรองหมู่บ้าน</label><select id="da-vf" onchange="filterDaPatients()" style="${selStyle}"><option value="">-- ทุกหมู่บ้าน --</option>${villageOpts}</select></div>
        <div><label style="font-size:11px;color:var(--text3);font-weight:600">ค้นหาชื่อ</label><input type="text" id="da-search" placeholder="พิมพ์ชื่อ..." oninput="filterDaPatients()" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:'Sarabun',sans-serif;background:var(--bg);color:var(--text)"></div>
      </div>
      <div class="form-group"><label>ผู้ป่วย *</label><select id="da-patient" style="${selStyle}"><option value="">-- เลือกผู้ป่วย --</option>${patOpts}</select></div>
      <div class="form-group"><label>วันนัด *</label><input type="date" id="da-date" value="${appt?.appoint_date||''}" style="width:100%;box-sizing:border-box"></div>
      <div class="form-group"><label>ประเภท</label><select id="da-type" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:'Sarabun',sans-serif;background:var(--bg);color:var(--text)">
        <option value="medicine"${!appt||appt.appoint_type==='medicine'?' selected':''}>💊 รับยา</option>
        <option value="check"${appt?.appoint_type==='check'?' selected':''}>🩺 ตรวจ</option>
        <option value="other"${appt?.appoint_type==='other'?' selected':''}>📋 อื่นๆ</option>
      </select></div>
      <div class="form-group"><label>สถานพยาบาล</label><input type="text" id="da-hospital" value="${esc(appt?.hospital||'รพ.โพธิ์ไทร')}" placeholder="รพ.โพธิ์ไทร" style="width:100%;box-sizing:border-box"></div>
      <div class="form-group"><label>ชื่อแพทย์ (ถ้ามี)</label><input type="text" id="da-doctor" value="${esc(appt?.doctor_name||'')}" placeholder="ชื่อแพทย์" style="width:100%;box-sizing:border-box"></div>
      <div class="form-group"><label>หมายเหตุ</label><textarea id="da-note" rows="2" placeholder="หมายเหตุ..." style="width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:'Sarabun',sans-serif;background:var(--bg);color:var(--text);resize:vertical">${esc(appt?.note||'')}</textarea></div>
      ${id?`<div class="form-group"><label>สถานะ</label><select id="da-status" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:13px;font-family:'Sarabun',sans-serif;background:var(--bg);color:var(--text)">
        <option value="scheduled"${appt?.status==='scheduled'||!appt?.status?' selected':''}>⏳ นัดไว้</option>
        <option value="done"${appt?.status==='done'?' selected':''}>✅ ไปแล้ว</option>
        <option value="missed"${appt?.status==='missed'?' selected':''}>❌ ขาดนัด</option>
      </select></div>`:''}
      <button onclick="saveDoctorAppt(${id||'null'})" style="width:100%;padding:12px;background:var(--primary);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;margin-top:4px">💾 บันทึก</button>
    </div>
  </div>`)
}
function closeDoctorApptModal(){document.getElementById('da-modal')?.remove()}
async function saveDoctorAppt(id){
  const pid=parseInt(document.getElementById('da-patient')?.value)
  const date=document.getElementById('da-date')?.value
  if(!pid){alert('กรุณาเลือกผู้ป่วย');return}
  if(!date){alert('กรุณาเลือกวันนัด');return}
  const payload={patient_id:pid,appoint_date:date,appoint_type:document.getElementById('da-type')?.value||'medicine',hospital:document.getElementById('da-hospital')?.value||'รพ.โพธิ์ไทร',doctor_name:document.getElementById('da-doctor')?.value||null,note:document.getElementById('da-note')?.value||null,status:document.getElementById('da-status')?.value||'scheduled',created_by:currentDisplayName||currentRole}
  const{data:savedAppt,error}=id?await sb.from('doctor_appointments').update(payload).eq('id',id).select('id').single():await sb.from('doctor_appointments').insert(payload).select('id').single()
  if(error){alert('❌ บันทึกไม่สำเร็จ: '+error.message);return}
  auditLog(id?'edit_appointment':'create_appointment','doctor_appointment',savedAppt?.id||id,{appoint_date:payload.appoint_date,hospital:payload.hospital})
  _markOwnWrite(id||savedAppt?.id)
  closeDoctorApptModal()
  showToast('✅ บันทึกนัดพบแพทย์สำเร็จ')
  await loadDoctorAppts()
  renderTimeline(document.getElementById('page-content'))
}
async function editDoctorAppt(id){
  if(!window._doctorAppts)await loadDoctorAppts()
  openDoctorApptForm(id)
}
async function deleteDoctorAppt(id){
  const a=(window._doctorAppts||[]).find(x=>x.id===id)
  if(!confirm(`ลบนัดพบแพทย์?\nวันที่: ${thDate(a?.appoint_date||'')}\nผู้ป่วย: ${a?.patients?.name||''}`))return
  const{error}=await sb.from('doctor_appointments').delete().eq('id',id)
  if(error){alert('❌ '+error.message);return}
  auditLog('delete_appointment','doctor_appointment',id,{patient:a?.patients?.name||''})
  window._doctorAppts=(window._doctorAppts||[]).filter(x=>x.id!==id)
  renderTimeline(document.getElementById('page-content'))
}

// ─── Overview ────────────────────────────────────────────────────
async function renderOverview(el) {
  el.innerHTML=`<div class="page"><div style="text-align:center;padding:40px;color:var(--text3)">⏳ กำลังโหลด...</div></div>`
  const pts=allPatients,total=pts.length
  const rc=pts.filter(p=>p.group_color==='red').length
  const yc=pts.filter(p=>p.group_color==='yellow').length
  const gc=pts.filter(p=>p.group_color==='green').length
  const overdue=pts.filter(p=>parseInt(p.days_until)<0).length
  const todayC=pts.filter(p=>parseInt(p.days_until)===0).length
  const soon=pts.filter(p=>{const d=parseInt(p.days_until);return d>0&&d<=7}).length
  const ok=pts.filter(p=>parseInt(p.days_until)>7).length

  const now=new Date(),yy=now.getFullYear(),mm=String(now.getMonth()+1).padStart(2,'0')
  const monthStart=`${yy}-${mm}-01`
  const monthEnd=new Date(yy,now.getMonth()+1,1).toISOString().slice(0,10)
  const sixAgo=new Date(yy,now.getMonth()-5,1).toISOString().slice(0,10)
  const thMonthName=TH_MONTHS_F[now.getMonth()+1]
  const dayOfMonth=now.getDate()
  const todayStr=todayISO()
  const visitOverdueCnt=pts.filter(p=>p.next_visit_date&&p.next_visit_date<todayStr).length
  const visitTodayCnt=pts.filter(p=>p.next_visit_date&&p.next_visit_date===todayStr).length
  const visitSoonCnt=pts.filter(p=>{if(!p.next_visit_date)return false;const d=Math.round((new Date(p.next_visit_date+'T00:00:00')-new Date(todayStr+'T00:00:00'))/86400000);return d>0&&d<=7}).length
  const visitOkCnt=pts.filter(p=>{if(!p.next_visit_date)return false;return Math.round((new Date(p.next_visit_date+'T00:00:00')-new Date(todayStr+'T00:00:00'))/86400000)>7}).length

  // จำกัดข้อมูล overview ให้ตรงหมู่บ้านของ อสม.
  const _ovVf=(q)=>currentRole==='aosomo'&&currentVillage?q.eq('village',currentVillage):q
  const [trendsData,allVisitsData,{data:tmvRaw},{data:arvRaw}]=await Promise.all([
    getTrend(),getVisits(),
    _ovVf(sb.from('home_visits').select('patient_name,visit_type,refer,assessment_json,visitor,village').gte('visit_date',monthStart).lt('visit_date',monthEnd)),
    _ovVf(sb.from('home_visits').select('visit_date,visit_type,refer,assessment_json').gte('visit_date',sixAgo).order('visit_date',{ascending:true}))
  ])
  const tmv=tmvRaw||[],arv=arvRaw||[],trends=trendsData,visits=allVisitsData

  // ── KPI 1: ความครอบคลุมการเยี่ยมเดือนนี้
  const visitedNames=new Set(tmv.map(v=>v.patient_name))
  const visitedCount=pts.filter(p=>visitedNames.has(p.name)).length
  const visitPct=total>0?Math.round(visitedCount/total*100):0

  // ── KPI 2: กลุ่มแดงได้รับการเยี่ยม
  const redPts=pts.filter(p=>p.group_color==='red')
  const redVisited=redPts.filter(p=>visitedNames.has(p.name)).length
  const redPct=redPts.length>0?Math.round(redVisited/redPts.length*100):100

  // ── KPI 3: อัตราการกินยาครบ
  const medVis=tmv.filter(v=>v.assessment_json?.medAdhere!=null)
  const medTaken=medVis.filter(v=>v.assessment_json.medAdhere.taken===true).length
  const medPct=medVis.length>0?Math.round(medTaken/medVis.length*100):null

  // ── KPI 4: อัตราส่งต่อ/กำเริบ
  const referCount=tmv.filter(v=>v.refer).length
  const referPct=tmv.length>0?Math.round(referCount/tmv.length*100):0

  // ── Action list
  const urgent=[
    ...redPts.filter(p=>parseInt(p.days_until)<0&&!visitedNames.has(p.name)),
    ...pts.filter(p=>p.group_color==='yellow'&&parseInt(p.days_until)<-3&&!visitedNames.has(p.name))
  ].sort((a,b)=>parseInt(a.days_until)-parseInt(b.days_until)).slice(0,8)

  // ── GAF average (6 months)
  const gafData=arv.filter(v=>v.assessment_json?.gaf!=null)
  const gafAvg=gafData.length>0?Math.round(gafData.reduce((a,v)=>a+v.assessment_json.gaf,0)/gafData.length):null

  // ── 2Q+ screening (6 months)
  const twoqData=arv.filter(v=>v.assessment_json?.twoq?.q1!=null)
  const twoqPos=twoqData.filter(v=>(v.assessment_json.twoq.score||0)>=1).length
  const twoqSuicide=twoqData.filter(v=>v.assessment_json.twoq.suicide===true).length

  // ── Village breakdown
  const villageMap={}
  pts.forEach(p=>{
    const v=p.village||'ไม่ระบุ'
    if(!villageMap[v])villageMap[v]={total:0,visited:0,red:0,overdue:0}
    villageMap[v].total++
    if(visitedNames.has(p.name))villageMap[v].visited++
    if(p.group_color==='red')villageMap[v].red++
    if(parseInt(p.days_until)<0)villageMap[v].overdue++
  })
  const villages=Object.entries(villageMap).sort((a,b)=>b[1].total-a[1].total)

  // ── Helpers
  function kpiCard(icon,label,val,tot,pct,target,lowerBetter=false){
    const pass=lowerBetter?pct<=target:pct>=target
    const warn=lowerBetter?pct<=target*2:pct>=target*0.6
    const col=pass?'#16a34a':warn?'#d97706':'#dc2626'
    const bg=pass?'#f0fdf4':warn?'#fefce8':'#fef2f2'
    const bd=pass?'#bbf7d0':warn?'#fde68a':'#fecaca'
    const bw=Math.min(pct,100)
    const badge=pass?`<span style="font-size:10px;color:${col};font-weight:700">✅ ผ่านเกณฑ์</span>`:`<span style="font-size:10px;color:${col};font-weight:700">${lowerBetter?'⚠️ เกินเกณฑ์':'⚠️ ต่ำกว่าเกณฑ์'}</span>`
    const smallNote=tot<5?`<div style="font-size:9px;color:#9ca3af;margin-top:3px">⚠️ ข้อมูลน้อย (${tot} รายการ)</div>`:''
    return`<div style="background:${bg};border:1px solid ${bd};border-radius:12px;padding:14px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div style="font-size:11px;color:var(--text2);font-weight:600">${icon} ${label}</div>
        <div style="font-size:10px;color:var(--text3)">เป้า ${lowerBetter?'<':'≥'}${target}%</div>
      </div>
      <div style="font-size:28px;font-weight:800;color:${col};line-height:1.1">${pct}<span style="font-size:13px;font-weight:600">%</span></div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:6px">${val} / ${tot} ราย</div>
      <div style="background:#e5e7eb;border-radius:99px;height:5px;overflow:hidden;margin-bottom:4px">
        <div style="background:${col};height:100%;width:${bw}%"></div>
      </div>${badge}${smallNote}</div>`
  }

  function donut(r,y,g){
    const tot=Math.max(r+y+g,1),R=40,cx=60,cy=60,circ=2*Math.PI*R
    const rd=r/tot*circ,yd=y/tot*circ,gd=g/tot*circ
    let p=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--border)" stroke-width="16"/>`
    if(r)p+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#dc2626" stroke-width="16" stroke-dasharray="${rd} ${circ}" stroke-dashoffset="0"/>`
    if(y)p+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#d97706" stroke-width="16" stroke-dasharray="${yd} ${circ}" stroke-dashoffset="${-rd}"/>`
    if(g)p+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#059669" stroke-width="16" stroke-dasharray="${gd} ${circ}" stroke-dashoffset="${-(rd+yd)}"/>`
    return`<svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg)">${p}</svg>`
  }

  // ── Line chart
  let lineHtml=''
  if(trends.length>=2){
    const W=320,H=130,pL=28,pR=12,pT=12,pB=28,cW=W-pL-pR,cH=H-pT-pB
    const n=trends.length,tots=trends.map(t=>+t.total),maxV=Math.max(...tots,1)
    function pts2(arr){return arr.map((v,i)=>[pL+(n>1?i*(cW/(n-1)):0),pT+cH-(v/maxV)*cH])}
    function svgL(pts,col,bY){
      const d='M'+pts.map(p=>p[0]+','+p[1]).join(' L')
      return`<path d="${d} L${pts[n-1][0]},${bY} L${pts[0][0]},${bY} Z" fill="${col}" fill-opacity="0.08"/>
             <path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>
             ${pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${col}" stroke="#fff" stroke-width="1.5"/>`).join('')}`
    }
    const bY=pT+cH
    const yT=[0,Math.round(maxV/2),maxV]
    lineHtml=`<div style="background:var(--card);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow);margin-bottom:12px">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px">แนวโน้มการนัดหมายรายเดือน</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px">
        ${[['#0a7ea4','ทั้งหมด'],['#dc2626','สีแดง'],['#d97706','สีเหลือง'],['#059669','สีเขียว']].map(([c,l])=>`<div style="display:flex;align-items:center;gap:4px"><div style="width:12px;height:3px;border-radius:2px;background:${c}"></div><span style="font-size:10px;color:var(--text3)">${l}</span></div>`).join('')}
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;overflow:visible">
        ${yT.map(v=>{const ty=pT+cH-(v/maxV)*cH;return`<line x1="${pL}" y1="${ty}" x2="${W-pR}" y2="${ty}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/><text x="${pL-4}" y="${ty+4}" text-anchor="end" font-size="8" fill="var(--text3)">${v}</text>`}).join('')}
        ${trends.map((t,i)=>{const[,m]=t.month_key.split('-');const x=pL+(n>1?i*(cW/(n-1)):0);return`<text x="${x}" y="${H-4}" text-anchor="middle" font-size="9" fill="var(--text3)">${TH_MONTHS_S[+m]}</text>`}).join('')}
        ${svgL(pts2(tots),'#0a7ea4',bY)}
        ${svgL(pts2(trends.map(t=>+t.red_count)),'#dc2626',bY)}
        ${svgL(pts2(trends.map(t=>+t.yellow_count)),'#d97706',bY)}
        ${svgL(pts2(trends.map(t=>+t.green_count)),'#059669',bY)}
      </svg>
    </div>`
  }

  // ── Visit bar chart
  const totalStaff=visits.filter(v=>v.visit_type==='staff').length
  const totalAosomo=visits.filter(v=>v.visit_type==='aosomo').length
  let visitChartHtml=''
  if(visits.length){
    // สร้าง map เดือน → {staff, aosomo}
    const monthMap={}
    visits.forEach(v=>{
      const mk=(v.visit_date||'').slice(0,7)
      if(!mk)return
      if(!monthMap[mk])monthMap[mk]={staff:0,aosomo:0}
      monthMap[mk][v.visit_type==='staff'?'staff':'aosomo']++
    })
    const keys=Object.keys(monthMap).sort().slice(-6)
    const maxBar=Math.max(...keys.map(k=>monthMap[k].staff+monthMap[k].aosomo),1)
    const W=320,H=140,pL=28,pR=8,pT=12,pB=28,cW=W-pL-pR,cH=H-pT-pB
    const bw=Math.min(18,cW/(keys.length*2+keys.length+1))
    const gap=bw*0.6
    const groupW=bw*2+gap
    const totalW=keys.length*groupW+(keys.length-1)*gap
    const startX=pL+(cW-totalW)/2
    const yT=[0,Math.round(maxBar/2),maxBar]
    const bars=keys.map((mk,i)=>{
      const{staff:s,aosomo:a}=monthMap[mk]
      const [,m]=mk.split('-')
      const gx=startX+i*(groupW+gap)
      const sh=s?Math.max((s/maxBar)*cH,3):0
      const ah=a?Math.max((a/maxBar)*cH,3):0
      const bY=pT+cH
      return`
        <rect x="${gx}" y="${bY-sh}" width="${bw}" height="${sh}" rx="3" fill="#0d9488"/>
        ${s?`<text x="${gx+bw/2}" y="${bY-sh-3}" text-anchor="middle" font-size="8" fill="#0d9488" font-weight="700">${s}</text>`:''}
        <rect x="${gx+bw+gap}" y="${bY-ah}" width="${bw}" height="${ah}" rx="3" fill="#7c3aed"/>
        ${a?`<text x="${gx+bw+gap+bw/2}" y="${bY-ah-3}" text-anchor="middle" font-size="8" fill="#7c3aed" font-weight="700">${a}</text>`:''}
        <text x="${gx+bw+gap/2}" y="${H-4}" text-anchor="middle" font-size="9" fill="var(--text3)">${TH_MONTHS_S[+m]||m}</text>`
    }).join('')
    const yLines=yT.map(v=>{const ty=pT+cH-(v/maxBar)*cH;return`<line x1="${pL}" y1="${ty}" x2="${W-pR}" y2="${ty}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/><text x="${pL-4}" y="${ty+4}" text-anchor="end" font-size="8" fill="var(--text3)">${v}</text>`}).join('')
    visitChartHtml=`<div style="background:var(--card);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow);margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div style="font-weight:700;font-size:14px">การเยี่ยมบ้านรายเดือน</div>
        <div style="display:flex;gap:12px">
          <div style="display:flex;align-items:center;gap:5px">
            <div style="width:10px;height:10px;border-radius:2px;background:#0d9488"></div>
            <span style="font-size:11px;color:var(--text3)">เจ้าหน้าที่ <strong style="color:#0d9488">${totalStaff}</strong></span>
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            <div style="width:10px;height:10px;border-radius:2px;background:#7c3aed"></div>
            <span style="font-size:11px;color:var(--text3)">อสม. <strong style="color:#7c3aed">${totalAosomo}</strong></span>
          </div>
        </div>
      </div>
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;overflow:visible">
        ${yLines}${bars}
      </svg>
    </div>`
  } else {
    visitChartHtml=`<div style="background:var(--card);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow);margin-bottom:12px">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px">การเยี่ยมบ้านรายเดือน</div>
      <div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">ยังไม่มีบันทึกการเยี่ยมบ้าน</div>
    </div>`
  }

  el.innerHTML=`<div class="page" id="overview-page">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px;flex-wrap:wrap;gap:8px">
    <div>
      <div class="page-title" style="margin-bottom:2px">ภาพรวมผู้ป่วย</div>
      <div class="page-sub">${esc(hospitalName)} · ผู้ป่วยทั้งหมด ${total} ราย · ${thMonthName} ${yy+543}</div>
    </div>
    <button onclick="window.print()" style="padding:8px 14px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;display:flex;align-items:center;gap:6px;flex-shrink:0">🖨️ พิมพ์/Export</button>
  </div>

  ${urgent.length>0?`
  <div style="background:var(--card);border-radius:var(--radius);padding:14px 16px;box-shadow:var(--shadow);margin-bottom:12px;border-left:4px solid #dc2626">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
      <div style="font-weight:700;font-size:14px;color:#b91c1c">⚠️ ต้องติดตามด่วน — เกินนัด ยังไม่ได้เยี่ยมเดือนนี้ (${urgent.length} ราย)</div>
      <button onclick="window._tlType='inject';window._tlf='overdue';navigate('timeline')" style="padding:5px 12px;background:#b91c1c;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">ดูตารางนัด →</button>
    </div>
    ${(()=>{
      const vm={}
      urgent.forEach(p=>{
        const v=p.village||'ไม่ระบุ'
        if(!vm[v])vm[v]={red:0,yellow:0,maxOver:0}
        if(p.group_color==='red')vm[v].red++; else vm[v].yellow++
        const d=Math.abs(parseInt(p.days_until))
        if(d>vm[v].maxOver)vm[v].maxOver=d
      })
      return Object.entries(vm).sort((a,b)=>b[1].red-a[1].red).map(([vname,d])=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#fef2f2;border-radius:8px;margin-bottom:6px">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text1)">🏘️ ${esc(vname)}</div>
          <div style="display:flex;gap:8px;margin-top:3px">
            ${d.red>0?`<span style="font-size:11px;color:#dc2626;font-weight:700">🔴 ${d.red} ราย</span>`:''}
            ${d.yellow>0?`<span style="font-size:11px;color:#d97706;font-weight:700">🟡 ${d.yellow} ราย</span>`:''}
          </div>
        </div>
        <span style="font-size:11px;color:#b91c1c;font-weight:600;white-space:nowrap">เกินสูงสุด ${d.maxOver} วัน</span>
      </div>`).join('')
    })()}
  </div>`:''}

  <div style="background:var(--card);border-radius:var(--radius);padding:14px 16px;box-shadow:var(--shadow);margin-bottom:12px">
    <div style="font-weight:700;font-size:14px;margin-bottom:2px">📊 KPI ประจำเดือน${thMonthName}</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:12px">วันที่ ${dayOfMonth} ของเดือน · ข้อมูลสะสมตั้งแต่ต้นเดือน</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${kpiCard('🏠','ความครอบคลุมการเยี่ยม',visitedCount,total,visitPct,80)}
      ${kpiCard('🔴','กลุ่มแดงได้รับการเยี่ยม',redVisited,redPts.length,redPct,100)}
      ${medPct!==null
        ? kpiCard('💊','อัตราการกินยาครบ',medTaken,medVis.length,medPct,80)
        : `<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px 16px"><div style="font-size:11px;color:var(--text3);font-weight:600">💊 อัตราการกินยาครบ</div><div style="font-size:13px;color:var(--text3);margin-top:10px">ยังไม่มีข้อมูล</div><div style="font-size:11px;color:var(--text3);margin-top:2px">บันทึกผ่านแบบเยี่ยมบ้าน</div></div>`}
      ${kpiCard('🚨','อัตราส่งต่อ/กำเริบ',referCount,Math.max(tmv.length,1),referPct,10,true)}
    </div>
  </div>

  <div style="background:var(--card);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow);margin-bottom:12px">
    <div style="font-weight:700;font-size:14px;margin-bottom:14px">จำแนกตามกลุ่มสี</div>
    <div style="display:flex;align-items:center;gap:16px">
      <div style="position:relative;flex-shrink:0">
        ${donut(rc,yc,gc)}
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-size:22px;font-weight:800">${total}</div>
          <div style="font-size:10px;color:var(--text3)">ราย</div>
        </div>
      </div>
      <div style="flex:1">
        ${[['red','สีแดง','var(--red)',rc],['yellow','สีเหลือง','var(--yellow)',yc],['green','สีเขียว','var(--green)',gc]].map(([g,lbl,clr,cnt])=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px"><div style="width:10px;height:10px;border-radius:50%;background:${clr}"></div><span style="font-size:13px;font-weight:500">${lbl}</span></div>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="background:#e5e7eb;border-radius:99px;height:4px;width:56px;overflow:hidden"><div style="background:${clr};height:100%;width:${total>0?Math.round(cnt/total*100):0}%"></div></div>
            <span style="font-size:13px;font-weight:700;color:${clr};min-width:24px;text-align:right">${cnt}</span>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <div style="background:var(--card);border-radius:var(--radius);padding:16px;box-shadow:var(--shadow);margin-bottom:12px">
    <div style="font-weight:700;font-size:14px;margin-bottom:10px">สถานะการนัดหมาย</div>
    <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">💉 นัดฉีดยา</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      ${[['เกินวันนัด',overdue,'var(--red)','var(--red-lt)','⚠️'],['วันนี้',todayC,'var(--primary)','var(--primary-lt)','📅'],['ภายใน 7 วัน',soon,'var(--yellow)','var(--yellow-lt)','🔔'],['ปกติ',ok,'var(--green)','var(--green-lt)','✅']].map(([lbl,cnt,clr,bg,ico])=>`
      <div style="background:${bg};border-radius:10px;padding:12px 14px">
        <div style="font-size:20px">${ico}</div>
        <div style="font-size:22px;font-weight:800;color:${clr};margin-top:4px">${cnt}</div>
        <div style="font-size:11px;color:${clr};font-weight:600;opacity:.8">${lbl}</div>
      </div>`).join('')}
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">🏡 นัดเยี่ยมบ้าน</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${[['เกินวันนัด',visitOverdueCnt,'var(--red)','var(--red-lt)','⚠️'],['วันนี้',visitTodayCnt,'var(--primary)','var(--primary-lt)','📅'],['ภายใน 7 วัน',visitSoonCnt,'var(--yellow)','var(--yellow-lt)','🔔'],['ปกติ',visitOkCnt,'var(--green)','var(--green-lt)','✅']].map(([lbl,cnt,clr,bg,ico])=>`
      <div style="background:${bg};border-radius:10px;padding:12px 14px">
        <div style="font-size:20px">${ico}</div>
        <div style="font-size:22px;font-weight:800;color:${clr};margin-top:4px">${cnt}</div>
        <div style="font-size:11px;color:${clr};font-weight:600;opacity:.8">${lbl}</div>
      </div>`).join('')}
    </div>
  </div>

  ${(gafAvg!==null||twoqData.length>0)?`
  <div style="background:var(--card);border-radius:var(--radius);padding:14px 16px;box-shadow:var(--shadow);margin-bottom:12px">
    <div style="font-weight:700;font-size:14px;margin-bottom:12px">🧠 ผลลัพธ์ด้านสุขภาพจิต (6 เดือนล่าสุด)</div>
    <div style="display:grid;grid-template-columns:${gafAvg!==null&&twoqData.length>0?'1fr 1fr':'1fr'};gap:10px">
      ${gafAvg!==null?`
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px;text-align:center">
        <div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:4px">GAF เฉลี่ย</div>
        <div style="font-size:32px;font-weight:800;color:${gafAvg>=71?'#16a34a':gafAvg>=51?'#d97706':'#dc2626'}">${gafAvg}</div>
        <div style="font-size:11px;color:var(--text3)">${gafAvg>=71?'ระดับดี':gafAvg>=51?'ระดับปานกลาง':'ระดับต่ำ'}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">จาก ${gafData.length} การประเมิน</div>
      </div>`:''}
      ${twoqData.length>0?`
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
        <div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:8px">2Q+ คัดกรองซึมเศร้า</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:12px;color:var(--text2)">คัดกรองแล้ว</span>
          <span style="font-size:13px;font-weight:700">${twoqData.length} ครั้ง</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:12px;color:#d97706">⚠️ พบเสี่ยง</span>
          <span style="font-size:13px;font-weight:700;color:#d97706">${twoqPos} ราย</span>
        </div>
        ${twoqSuicide>0?`<div style="display:flex;justify-content:space-between;padding:5px 8px;background:#fef2f2;border-radius:6px;margin-top:4px">
          <span style="font-size:11px;color:#b91c1c;font-weight:600">🚨 เสี่ยงฆ่าตัวตาย</span>
          <span style="font-size:12px;font-weight:800;color:#b91c1c">${twoqSuicide} ราย</span>
        </div>`:''}
      </div>`:''}
    </div>
  </div>`:''}

  ${villages.length>0?`
  <div style="background:var(--card);border-radius:var(--radius);padding:14px 16px;box-shadow:var(--shadow);margin-bottom:12px">
    <div style="font-weight:700;font-size:14px;margin-bottom:10px">🏘️ ความครอบคลุมต่อหมู่บ้าน (เดือนนี้)</div>
    ${villages.map(([vname,d])=>{
      const pct=d.total>0?Math.round(d.visited/d.total*100):0
      const col=pct>=80?'#16a34a':pct>=50?'#d97706':'#dc2626'
      return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:var(--text1)">${esc(vname)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:1px">${d.total} ราย · 🔴 ${d.red} · เกินนัด ${d.overdue}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;min-width:90px">
          <div style="font-size:12px;font-weight:700;color:${col}">${d.visited}/${d.total} (${pct}%)</div>
          <div style="background:#e5e7eb;border-radius:99px;height:4px;margin-top:3px;overflow:hidden">
            <div style="background:${col};height:100%;width:${pct}%"></div>
          </div>
        </div>
      </div>`
    }).join('')}
  </div>`:''}

  ${lineHtml}
  ${visitChartHtml}
  </div>`
}

// ─── Visit ───────────────────────────────────────────────────────
async function renderVisit(el) {
  const visits=await getVisits()
  const _vPhotoMap=await batchSignedUrls(visits.filter(v=>v.photo_url).map(v=>v.photo_url))
  visits.forEach(v=>{if(v.photo_url&&_vPhotoMap[v.photo_url])v.photo_url=_vPhotoMap[v.photo_url]})
  window._allVisits=visits
  // โหลด referrals สำหรับ staff/admin
  let referralHtml=''
  let clinicQueueHtml=''
  if(canDo('record')){
    // queue 1: อสม. → เจ้าหน้าที่
    const[{data:refs},{data:aosomoDir},{data:aosomoProfiles}]=await Promise.all([
      sb.from('home_visits')
        .select('patient_name,village,visit_date,visitor,note')
        .eq('refer',true).eq('visit_type','aosomo')
        .order('visit_date',{ascending:false}).limit(20),
      sb.from('aosomo_directory').select('name,phone,line_id'),
      sb.from('user_profiles').select('display_name,email').eq('role','aosomo')
    ])
    const aosomoPhoneMap={},aosomoLineMap={}
    ;(aosomoDir||[]).forEach(a=>{if(a.phone)aosomoPhoneMap[a.name]=a.phone;if(a.line_id)aosomoLineMap[a.name]=a.line_id})
    ;(aosomoProfiles||[]).forEach(p=>{
      const name=p.display_name||'';const phone=(p.email||'').split('@')[0]
      if(name&&phone&&!aosomoPhoneMap[name])aosomoPhoneMap[name]=phone
    })
    const staffVisitedNames=new Set(visits.filter(v=>v.visit_type==='staff').map(v=>v.patient_name))
    const pending=(refs||[]).filter(r=>!staffVisitedNames.has(r.patient_name))
    if(pending.length){
      referralHtml=`<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:12px;padding:14px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:#b91c1c;margin-bottom:10px">⚠️ รายการส่งต่อจาก อสม. รอเจ้าหน้าที่ลงเยี่ยม (${pending.length} ราย)</div>
        ${pending.map(r=>{
          const phone=aosomoPhoneMap[r.visitor||'']||''
          const lineId=aosomoLineMap[r.visitor||'']||''
          const contactBtn=phone?`<a href="tel:${esc(phone)}" aria-label="โทรหา อสม.${esc(r.visitor||'')}" style="flex-shrink:0;padding:7px 10px;background:#fff;color:#0369a1;border:1.5px solid #7dd3fc;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;text-decoration:none;display:flex;align-items:center;gap:4px">📞 โทร</a>`:''
          const lineBtn=lineId?`<a href="https://line.me/ti/p/~${esc(lineId)}" target="_blank" rel="noopener" aria-label="ส่ง LINE หา อสม.${esc(r.visitor||'')}" style="flex-shrink:0;padding:7px 10px;background:#06C755;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;text-decoration:none;display:flex;align-items:center;gap:4px">💬 LINE</a>`:''
          return`<div style="background:#fff;border-radius:8px;padding:10px 12px;margin-bottom:8px;border:1px solid #fecaca;display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="min-width:0;flex:1">
            <div style="font-size:13px;font-weight:700;color:var(--text1)">${esc(r.patient_name)}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${esc(r.village||'')} · อสม.${esc(r.visitor||'')}${phone?` · <span style="color:#0369a1">${esc(phone)}</span>`:''}${lineId?` · LINE: ${esc(lineId)}`:''} · ${r.visit_date||''}</div>
            ${r.note?`<div style="font-size:11px;color:#b91c1c;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.note.split('\n')[0])}</div>`:''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            ${contactBtn}${lineBtn}
            <button onclick="openVisitFormFor('${jsStr(r.patient_name)}','${jsStr(r.village||'')}')"
              style="padding:7px 12px;background:#b91c1c;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">
              🏥 ลงเยี่ยม
            </button>
          </div>
        </div>`}).join('')}
      </div>`
    }
    // queue 2: เจ้าหน้าที่ → รพ./คลินิก
    const{data:clinicRefs}=await sb.from('home_visits')
      .select('id,patient_name,village,visit_date,visitor,note')
      .eq('refer',true).eq('visit_type','staff').eq('refer_resolved',false)
      .order('visit_date',{ascending:false}).limit(20)
    if((clinicRefs||[]).length){
      clinicQueueHtml=`<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:14px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:10px">🏥 รายการส่งต่อ รพ./คลินิก รอดำเนินการ (${clinicRefs.length} ราย)</div>
        ${clinicRefs.map(r=>`<div style="background:#fff;border-radius:8px;padding:10px 12px;margin-bottom:8px;border:1px solid #fde68a;display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div style="min-width:0;flex:1">
            <div style="font-size:13px;font-weight:700;color:var(--text1)">${esc(r.patient_name)}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">📍 ${esc(r.village||'')} &nbsp;·&nbsp; 🏥 ${esc(r.visitor||'')} &nbsp;·&nbsp; 📅 ${r.visit_date||''}</div>
            ${r.note?`<div style="font-size:11px;color:#92400e;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.note.split('\n')[0])}</div>`:''}
          </div>
          <span style="flex-shrink:0;padding:5px 10px;background:#fef3c7;color:#92400e;border-radius:6px;font-size:11px;font-weight:700">⏳ รอแอดมิน</span>
        </div>`).join('')}
      </div>`
    }
  }
  // รายการมอบหมายสำหรับ อสม
  let assignedHtml=''
  if(currentRole==='aosomo'){
    const today=todayISO()
    const assigned=allPatients.filter(p=>p.next_visit_date
    ).sort((a,b)=>a.next_visit_date.localeCompare(b.next_visit_date))
    if(assigned.length){
      assignedHtml=`<div style="background:#f0f9ff;border:1.5px solid #7dd3fc;border-radius:12px;padding:14px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:#0369a1;margin-bottom:10px">📋 รายการเยี่ยมในหมู่บ้าน (${assigned.length} ราย)</div>
        ${assigned.map(p=>{
          const days=Math.round((new Date(p.next_visit_date+'T00:00:00')-new Date(today+'T00:00:00'))/86400000)
          const[bg,clr,lbl]=days<0?['#fef2f2','#b91c1c',`⚠️ เกิน ${Math.abs(days)} วัน`]:days===0?['#fff7ed','#c2410c','🔔 วันนี้']:days<=7?['#fffbeb','#92400e',`📅 อีก ${days} วัน`]:['#f0fdf4','#15803d',`📅 ${thDate(p.next_visit_date)}`]
          return`<div style="background:#fff;border-radius:8px;padding:10px 12px;margin-bottom:8px;border:1px solid #bae6fd;display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div style="min-width:0;flex:1">
              <div style="font-size:13px;font-weight:700;color:var(--text1)">${esc(p.name)}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">📍 ${esc(p.village||'')}${p.house_no?` · 🏠 ${esc(p.house_no)}`:''} · ${esc(p.group_label||'')}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
              <span style="background:${bg};color:${clr};padding:3px 8px;border-radius:8px;font-size:11px;font-weight:700">${lbl}</span>
              <button onclick="openVisitFormFor('${jsStr(p.name)}','${jsStr(p.village||'')}')" style="padding:5px 12px;background:var(--primary);color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">🏡 เยี่ยม</button>
            </div>
          </div>`
        }).join('')}
      </div>`
    }
  }
  el.innerHTML=`<div class="page">
  <div class="page-title">เยี่ยมบ้าน</div>
  <div class="page-sub">บันทึกการเยี่ยมผู้ป่วยจิตเวช</div>
  <div style="display:flex;gap:10px;margin-bottom:16px">
    ${currentRole!=='aosomo'?`<button onclick="openVisitForm('staff')" class="btn btn-primary" style="flex:1">🏥 เยี่ยม (เจ้าหน้าที่)</button>`:''}
    ${currentRole!=='staff'?`<button onclick="openVisitForm('aosomo')" class="btn ${currentRole==='aosomo'?'btn-primary':'btn-outline'}" style="flex:1;${currentRole!=='aosomo'?'border-color:var(--primary);color:var(--primary)':''}">🏡 เยี่ยม (อสม.)</button>`:''}
  </div>
  ${referralHtml}
  ${clinicQueueHtml}
  ${assignedHtml}
  ${currentRole==='aosomo'&&currentVillage?`<div style="font-size:12px;color:var(--text3);margin-bottom:8px;padding:6px 10px;background:var(--bg);border-radius:8px">📍 แสดงเฉพาะ${currentVillage}</div>`:''}
  <div class="tab-bar">
    <button class="tab-btn active" onclick="setVTab('all',this)">ทั้งหมด (${visits.length})</button>
    <button class="tab-btn" onclick="setVTab('staff',this)">เจ้าหน้าที่ (${visits.filter(v=>v.visit_type==='staff').length})</button>
    <button class="tab-btn" onclick="setVTab('aosomo',this)">อสม. (${visits.filter(v=>v.visit_type==='aosomo').length})</button>
  </div>
  <div id="visit-list">${renderVisitList(visits)}</div>
  </div>`
}
function openVisitFormFor(name,village){
  openVisitForm('staff') // สร้างฟอร์มแบบ synchronous — เติมค่าได้ทันที ไม่ต้องรอ setTimeout
  const n=document.getElementById('v-name');if(n)n.value=name
  const sel=document.getElementById('v-village')
  if(sel)for(const o of sel.options)if(o.value===village){o.selected=true;break}
}
function renderMHAssessResult(a,detail=false){
  if(!a)return''
  const chips=[],detailSecs=[]
  const ST5_Q=['มีปัญหาการนอน นอนไม่หลับ/นอนมากเกินไป','มีสมาธิน้อยลง','หุดหงิด/กระวนกระวาย/วิตกกังวล','รู้สึกเบื่อเซ็ง','ไม่อยากพบปะผู้คน']
  const ST5_OPT=['แทบไม่มี','เป็นบางครั้ง','บ่อยครั้ง','เป็นประจำ']
  const RQ_Q=['ความยากลำบากทำให้ฉันแกร่งขึ้น','มีกำลังใจและได้รับการสนับสนุนจากคนรอบข้าง','การแก้ไขปัญหาทำให้มีประสบการณ์มากขึ้น']
  if(a.twoq?.q1!==null||a.twoq?.q2!==null){
    const s=(a.twoq.q1||0)+(a.twoq.q2||0),suicide=a.twoq.suicide
    const[bg,color,lbl]=suicide?['#fef2f2','#b91c1c','2Q+: ⚠️ ความเสี่ยงสูง']:s===0?['#f0fdf4','#15803d','2Q+: ไม่พบ']:['#fefce8','#854d0e',`2Q+: ${s}/2 ควรประเมินเพิ่ม`]
    chips.push(`<span style="background:${bg};color:${color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">${lbl}</span>`)
    if(detail){
      const rows=[
        `รู้สึกหดหู่ เศร้า หรือท้อแท้สิ้นหวัง → <b>${a.twoq.q1===1?'<span style="color:#b91c1c">ใช่</span>':'ไม่ใช่'}</b>`,
        `รู้สึกเบื่อ ทำอะไรก็ไม่เพลิดเพลิน → <b>${a.twoq.q2===1?'<span style="color:#b91c1c">ใช่</span>':'ไม่ใช่'}</b>`,
        ...(a.twoq.suicide!==undefined?[`มีความคิดอยากทำร้ายตัวเอง → <b>${a.twoq.suicide?'<span style="color:#b91c1c">⚠️ ใช่</span>':'ไม่ใช่'}</b>`]:[])
      ]
      detailSecs.push({title:'📋 2Q+ คัดกรองภาวะซึมเศร้า',rows})
    }
  }
  if(a.st5?.total!==undefined&&a.st5.scores?.some(v=>v!==null)){
    const s=a.st5.total
    const[bg,color,lbl]=s<=4?['#f0fdf4','#15803d',`ST-5: ${s} ไม่เครียด`]:s<=7?['#fefce8','#854d0e',`ST-5: ${s} เครียดน้อย`]:s<=9?['#fff7ed','#c2410c',`ST-5: ${s} เครียดปานกลาง`]:['#fef2f2','#b91c1c',`ST-5: ${s} เครียดมาก`]
    chips.push(`<span style="background:${bg};color:${color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">${lbl}</span>`)
    if(detail&&a.st5.scores){
      const rows=a.st5.scores.map((sc,i)=>sc!=null?`${ST5_Q[i]} → <b>${ST5_OPT[sc]??sc} <span style="color:var(--text3)">(${sc})</span></b>`:null).filter(Boolean)
      detailSecs.push({title:`😣 ST-5 ความเครียด (รวม ${s} คะแนน)`,rows})
    }
  }
  if(a.rq?.total){
    const s=a.rq.total
    const[bg,color,lbl]=s<=17?['#fef2f2','#b91c1c',`RQ: ${s} พลังใจต่ำ`]:s<=23?['#fefce8','#854d0e',`RQ: ${s} ปานกลาง`]:['#f0fdf4','#15803d',`RQ: ${s} พลังใจดี`]
    chips.push(`<span style="background:${bg};color:${color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">${lbl}</span>`)
    if(detail&&a.rq.scores){
      const rows=a.rq.scores.map((sc,i)=>`${RQ_Q[i]} → <b>${sc}/10</b>`)
      detailSecs.push({title:`🧡 RQ พลังใจ (รวม ${s} คะแนน)`,rows})
    }
  }
  if(a.gaf!==null&&a.gaf!==undefined){
    const s=a.gaf
    const[bg,color]=s>=71?['#f0fdf4','#15803d']:s>=51?['#fefce8','#854d0e']:s>=31?['#fff7ed','#c2410c']:['#fef2f2','#b91c1c']
    chips.push(`<span style="background:${bg};color:${color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">GAF: ${s}</span>`)
  }
  if(a.aims?.total!==undefined){
    const s=a.aims.total
    const[bg,color]=s===0?['#f0fdf4','#15803d']:s<=4?['#fefce8','#854d0e']:s<=8?['#fff7ed','#c2410c']:['#fef2f2','#b91c1c']
    chips.push(`<span style="background:${bg};color:${color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">AIMS: ${s}</span>`)
    if(detail&&a.aims.scores){
      const rows=a.aims.scores.map((sc,i)=>`ข้อ${i+1} → <b>${sc}</b>`)
      detailSecs.push({title:`AIMS การเคลื่อนไหวผิดปกติ (รวม ${s} คะแนน)`,rows})
    }
  }
  if(a.medAdhere!==null&&a.medAdhere!==undefined){
    const[bg,color,lbl]=a.medAdhere.taken?['#f0fdf4','#15803d','💊 กินยาครบ']:['#fef2f2','#b91c1c',`💊 ขาดยา ${a.medAdhere.missedDays||0} วัน`]
    chips.push(`<span style="background:${bg};color:${color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">${lbl}</span>`)
  }
  if(a.cgb?.total!==undefined){
    const s=a.cgb.total
    const[bg,color]=s<=20?['#f0fdf4','#15803d']:s<=40?['#fff7ed','#c2410c']:['#fef2f2','#b91c1c']
    chips.push(`<span style="background:${bg};color:${color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">ภาระดูแล: ${s}</span>`)
    if(detail&&a.cgb.scores){
      const rows=a.cgb.scores.map((sc,i)=>`ข้อ${i+1} → <b>${sc}</b>`)
      detailSecs.push({title:`ภาระดูแลผู้ป่วย CGB (รวม ${s} คะแนน)`,rows})
    }
  }
  if(!chips.length)return''
  const detailHtml=detail&&detailSecs.length?`<div style="margin-top:6px;border:1px solid var(--border);border-radius:8px;overflow:hidden">${detailSecs.map((sec,si)=>`<div style="padding:6px 10px;${si<detailSecs.length-1?'border-bottom:1px solid var(--border)':''}"><div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">${sec.title}</div>${sec.rows.map(r=>`<div style="font-size:11px;color:var(--text1);line-height:1.8;padding-left:6px">• ${r}</div>`).join('')}</div>`).join('')}</div>`:''
  return`<div style="display:flex;flex-direction:column;gap:4px;margin-top:2px"><div style="display:flex;flex-wrap:wrap;gap:4px"><span style="font-size:11px;color:var(--text3);margin-right:2px">🧠</span>${chips.join('')}</div>${detailHtml}</div>`
}
function renderVisitList(visits){
  if(!visits.length)return'<div class="empty"><p>ไม่มีบันทึกการเยี่ยมบ้าน</p></div>'
  return visits.map(v=>{
    const cl=v.visit_type==='staff'?STAFF_CHECKLIST:AOSOMO_CHECKLIST
    const pct=cl.length?v.score/cl.length:0
    const[bg,clr,lbl]=pct>=0.8?['var(--green-lt)','var(--green)','ปกติดี']:pct>=0.5?['var(--yellow-lt)','var(--yellow)','พอใช้']:['var(--red-lt)','var(--red)','ต้องติดตาม']
    const canEdit=canDo('admin')||(v.visit_type==='aosomo'&&currentRole==='aosomo')||(v.visit_type==='staff'&&canDo('record'))
    return`<div class="visit-card ${v.visit_type}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700">${esc(v.patient_name)}</div><div style="font-size:12px;color:var(--text3)">${esc(v.village||'')} · ${v.visit_date_th||v.visit_date}</div></div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          <span style="background:${bg};color:${clr};padding:3px 8px;border-radius:20px;font-size:11px;font-weight:700">${lbl}</span>
          ${canEdit?`<button onclick="openEditVisit(${v.id})" aria-label="แก้ไขบันทึกเยี่ยมบ้าน" style="background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--text2);padding:3px 8px;font-size:11px;font-family:'Sarabun',sans-serif">✏️</button>`:''}
          ${canDo('admin')?`<button onclick="deleteVisit(${v.id},'${jsStr(v.patient_name)}')" aria-label="ลบบันทึกเยี่ยมบ้าน" style="background:none;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;color:#b91c1c;padding:3px 8px;font-size:11px;font-family:'Sarabun',sans-serif">🗑️</button>`:''}
        </div>
      </div>
      <div style="font-size:12px;color:var(--text2)">${v.visit_type==='staff'?'🏥 เจ้าหน้าที่':'🏡 อสม.'} ${esc(v.visitor||'')}${v.refer?` <span style="color:#b91c1c;font-weight:700">⚠️ ส่งต่อ</span>`:''}</div>
      ${v.note?`<div style="font-size:12px;color:var(--text3);margin-top:6px;padding-top:6px;border-top:1px solid var(--border);white-space:pre-line">${esc(v.note)}</div>`:''}
      ${v.assessment_json&&canDo('record')?`<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">${renderMHAssessResult(v.assessment_json,true)}</div>`:''}
      ${v.photo_url&&canDo('record')?`<div style="margin-top:8px"><a href="${safeUrl(v.photo_url)}" target="_blank"><img src="${safeUrl(v.photo_url)}" alt="รูปถ่ายการเยี่ยมบ้าน" style="max-width:100%;max-height:200px;border-radius:8px;object-fit:cover;cursor:pointer"></a></div>`:''}
      ${canDo('record')&&v.visit_type==='aosomo'?`<div style="margin-top:8px;padding:8px 10px;border-top:1px solid var(--border)">${v.verified_by?`<div style="display:flex;flex-direction:column;gap:3px"><span style="font-size:11px;font-weight:700;color:${v.verify_result==='improve'?'#b45309':'#16a34a'}">${v.verify_result==='improve'?'⚠️ ต้องปรับปรุง':'✅ ถูกต้อง'} · ${esc(v.verified_by)} · ${v.verified_at||''}</span>${v.verify_note?`<span style="font-size:11px;color:var(--text2)">💬 ${esc(v.verify_note)}</span>`:''}</div>`:`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span style="font-size:11px;color:var(--text3)">⏳ รอเจ้าหน้าที่ตรวจสอบ</span><button onclick="verifyVisit(${v.id})" style="padding:4px 12px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;font-size:11px;font-weight:700;color:#15803d;cursor:pointer;font-family:'Sarabun',sans-serif">✅ ตรวจสอบแล้ว</button></div><div id="vf-${v.id}" style="display:none;margin-top:8px;padding:8px;background:var(--bg2,#f8fafc);border-radius:8px;border:1px solid var(--border)"><div style="display:flex;gap:12px;margin-bottom:6px"><label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;font-family:'Sarabun',sans-serif"><input type="radio" name="vr-${v.id}" value="pass" checked> ✅ ถูกต้อง</label><label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;font-family:'Sarabun',sans-serif"><input type="radio" name="vr-${v.id}" value="improve"> ⚠️ ต้องปรับปรุง</label></div><input id="vn-${v.id}" type="text" placeholder="หมายเหตุ (ถ้ามี)" style="width:100%;box-sizing:border-box;padding:5px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:'Sarabun',sans-serif;background:var(--bg);color:var(--text);margin-bottom:6px"><div style="display:flex;gap:6px;justify-content:flex-end"><button onclick="verifyVisit(${v.id})" style="padding:4px 10px;background:none;border:1px solid var(--border);border-radius:6px;font-size:11px;cursor:pointer;font-family:'Sarabun',sans-serif;color:var(--text2)">ยกเลิก</button><button onclick="submitVerify(${v.id})" style="padding:4px 12px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:6px;font-size:11px;font-weight:700;color:#15803d;cursor:pointer;font-family:'Sarabun',sans-serif">บันทึก</button></div></div>`}</div>`:''}
    </div>`
  }).join('')
}
async function deleteVisit(id,patientName){
  if(!confirm(`ลบบันทึกการเยี่ยมบ้านของ "${patientName}"?\n\nไม่สามารถกู้คืนได้`))return
  try{
    await auditLog('delete_visit','visit',id,{patient_name:patientName})
    const{error}=await sb.from('home_visits').delete().eq('id',id)
    if(error)throw error
    window._allVisits=(window._allVisits||[]).filter(v=>v.id!==id)
    const activeBtn=document.querySelector('.tab-btn.active')
    const match=activeBtn?.getAttribute('onclick')?.match(/setVTab\('(\w+)'/)
    const tab=match?match[1]:'all'
    const el=document.getElementById('visit-list')
    if(el)el.innerHTML=renderVisitList(tab==='all'?window._allVisits:(window._allVisits||[]).filter(v=>v.visit_type===tab))
  }catch(e){alert('❌ ลบไม่สำเร็จ: '+e.message)}
}

function verifyVisit(id){
  const form=document.getElementById('vf-'+id)
  if(form)form.style.display=form.style.display==='none'?'block':'none'
}
async function submitVerify(id){
  if(!canDo('record')){alert('🔒 เฉพาะเจ้าหน้าที่เท่านั้น');return}
  const result=document.querySelector(`input[name="vr-${id}"]:checked`)?.value||'pass'
  const note=(document.getElementById('vn-'+id)?.value||'').trim()
  const verifier=currentDisplayName||currentRole
  const today=todayISO()
  const{error}=await sb.from('home_visits').update({verified_by:verifier,verified_at:today,verify_result:result,verify_note:note||null}).eq('id',id)
  if(error){alert('❌ '+error.message);return}
  auditLog('verify_visit','visit',id,{result,verifier})
  const v=(window._allVisits||[]).find(x=>x.id===id)
  if(v){v.verified_by=verifier;v.verified_at=today;v.verify_result=result;v.verify_note=note}
  const el=document.getElementById('visit-list')
  if(!el)return
  const activeBtn=document.querySelector('.tab-btn.active')
  const match=activeBtn?.getAttribute('onclick')?.match(/setVTab\('(\w+)'/)
  const tab=match?match[1]:'all'
  el.innerHTML=renderVisitList(tab==='all'?window._allVisits:(window._allVisits||[]).filter(v=>v.visit_type===tab))
}
async function openEditVisit(id){
  const{data:v}=await sb.from('home_visits').select('*').eq('id',id).single()
  if(!v)return
  // restore state
  _visitType=v.visit_type||'aosomo'
  _visitChecks=[]
  _visitProblems=[]
  _redFlags=[]
  _ytAssess={ya:null,yati:null,sara:null}
  _assess10={}
  _oasScores={s1:0,s2:0,s3:0}
  let savedChecks=[]
  try{const saved=JSON.parse(v.checks_json||'[]');savedChecks=Array.isArray(saved)?saved:[]}catch(e){}
  // เปิดฟอร์มเต็มเหมือนตอนเยี่ยม (จะ reset _visitChecks ภายใน)
  openVisitForm(_visitType)
  // หลัง render เสร็จ restore ค่า
  setTimeout(()=>{
    // restore ชื่อ หมู่บ้าน วันที่ ผู้เยี่ยม
    const nEl=document.getElementById('v-name');if(nEl)nEl.value=v.patient_name||''
    const vEl=document.getElementById('v-village');if(vEl)for(const o of vEl.options)if(o.value===v.village){o.selected=true;break}
    const dEl=document.getElementById('v-date');if(dEl)dEl.value=v.visit_date||''
    const visEl=document.getElementById('v-visitor');if(visEl)visEl.value=v.visitor||''
    // restore รายการตรวจสอบ
    savedChecks.forEach(cid=>{
      _visitChecks.push(cid)
      const cb=document.getElementById('cb-'+cid);if(cb)cb.classList.add('checked')
    })
    updateScore()
    // restore refer
    const rEl=document.getElementById('v-refer');if(rEl)rEl.checked=!!v.refer
    // restore note (เฉพาะบรรทัดแรก ไม่รวม auto-text)
    const noteLines=(v.note||'').split('\n')
    const cleanNote=noteLines.filter(l=>!l.startsWith('[')&&!l.startsWith('●')&&l.trim()).join('\n')
    const ntEl=document.getElementById('v-note');if(ntEl)ntEl.value=cleanNote
    // แสดงรูปเดิม (ถ้ามี)
    const prevEl=document.getElementById('v-photo-preview')
    if(prevEl&&v.photo_url)prevEl.innerHTML=`<a href="${safeUrl(v.photo_url)}" target="_blank"><img src="${safeUrl(v.photo_url)}" style="max-width:100%;max-height:120px;border-radius:8px;object-fit:cover"></a><div style="font-size:11px;color:var(--text3);margin-top:2px">📷 รูปเดิม — อัปโหลดใหม่เพื่อแทนที่</div>`
    // เปลี่ยนปุ่มบันทึกเป็น saveEditVisit
    const saveBtn=document.getElementById('v-save-btn')
    if(saveBtn){saveBtn.textContent='💾 บันทึกการแก้ไข';saveBtn.onclick=()=>saveEditVisit(id)}
  },80)
}
async function saveEditVisit(id){
  const name=document.getElementById('v-name')?.value?.trim()||''
  const village=document.getElementById('v-village')?.value||''
  const date=document.getElementById('v-date')?.value||''
  const visitor=document.getElementById('v-visitor')?.value?.trim()||''
  const refer=document.getElementById('v-refer')?.checked||false
  const noteRaw=document.getElementById('v-note')?.value?.trim()||''
  const RF_LABELS={rf1:'ไม่หลับไม่นอน',rf2:'เดินไปเดินมา',rf3:'พูดจาคนเดียว',rf4:'หงุดหงิดฉุนเฉียว',rf5:'หวาดระแวง'}
  const rfText=_redFlags.length>0?`\n[5 Red Flags] พบ: ${_redFlags.map(i=>RF_LABELS[i]).join(', ')}`:''
  const ytText=_visitType==='aosomo'?getYTText():''
  const a10Text=_visitType==='staff'?getAssess10Text():''
  const probText=_visitProblems.length>0?`\n[ปัญหาที่พบ] ${_visitProblems.map(i=>AOSOMO_PROBLEMS.find(([pid])=>pid===i)?.[1]||i).join(' | ')}`:''
  const note=(noteRaw+rfText+ytText+a10Text+probText).trim()
  const btn=document.getElementById('v-save-btn')
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  const photoFile=document.getElementById('v-photo')?.files?.[0]||null
  const assessment_json=getMHAssessJSON()
  const updates={patient_name:name,village,visit_date:date,visitor,checks_json:JSON.stringify(_visitChecks),score:_visitChecks.length,note,refer,assessment_json}
  if(photoFile){
    btn.textContent='กำลังอัพโหลดรูป...'
    const ext=photoFile.name.split('.').pop()
    const filename=`visits/${Date.now()}.${ext}`
    const{error:ue}=await sb.storage.from('patient-files').upload(filename,photoFile)
    if(!ue){const{data:{publicUrl}}=sb.storage.from('patient-files').getPublicUrl(filename);updates.photo_url=publicUrl}
    btn.textContent='กำลังบันทึก...'
  }
  const{error}=await sb.from('home_visits').update(updates).eq('id',id)
  if(error){btn.textContent='❌ '+error.message;btn.disabled=false;return}
  auditLog('edit_visit','visit',id,{patient_name:name,visitor})
  _markOwnWrite(id)
  closeVisitModal()
  if(location.hash==='#visit')navigate('visit')
}
function setVTab(tab,btn){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active')
  const list=document.getElementById('visit-list')
  if(list){const filtered=tab==='all'?window._allVisits:(window._allVisits||[]).filter(v=>v.visit_type===tab);list.innerHTML=renderVisitList(filtered)}
}

// ─── Admin ───────────────────────────────────────────────────────
function renderMembers(el){
  if(!canDo('admin')){el.innerHTML='<div style="text-align:center;padding:60px 20px;color:var(--text3)">🔒 เฉพาะผู้ดูแลระบบเท่านั้น</div>';return}
  el.innerHTML=`<div class="page">
  <div class="section-hd"><h3>👥 จัดการสมาชิก</h3></div>
  <p style="font-size:13px;color:var(--text3);margin-bottom:20px">กำหนดสิทธิ์การเข้าถึงข้อมูลของสมาชิกแต่ละคน</p>

  <!-- รอการอนุมัติ -->
  <div id="pending-section" style="display:none;background:#fff;border:2px solid #ddd6fe;border-radius:14px;padding:16px;margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <div style="width:32px;height:32px;background:#7c3aed;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px">⏳</div>
      <div><div style="font-size:14px;font-weight:700;color:#7c3aed">คำขอสมัคร อสม. รอการอนุมัติ</div><div style="font-size:11px;color:var(--text3)">กดอนุมัติหรือปฏิเสธแต่ละคำขอ</div></div>
    </div>
    <div id="group-pending"></div>
  </div>

  <!-- เจ้าหน้าที่ -->
  <div style="background:#fff;border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:32px;height:32px;background:#0d9488;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px">🏥</div>
        <div><div style="font-size:14px;font-weight:700">เจ้าหน้าที่</div><div style="font-size:11px;color:var(--text3)">บันทึกข้อมูล เยี่ยมบ้าน ดูภาพรวม</div></div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="downloadTemplate('staff_dir')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;background:#fff;color:#0d9488;border:1px solid #0d9488;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">
          ⬇️ ดาวน์โหลดตัวอย่าง
        </button>
        <button onclick="document.getElementById('staff-dir-file-input').click()" style="display:flex;align-items:center;gap:4px;padding:6px 12px;background:#0d9488;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">
          📎 นำเข้ารายชื่อ
        </button>
      </div>
      <input type="file" id="staff-dir-file-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="importStaffDirFile(this)">
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px;padding:6px 10px;background:#f0fdfa;border-radius:6px">
      📋 นำเข้าจาก Excel/CSV — คอลัมน์: <strong>ชื่อ, ตำแหน่ง, เบอร์โทร</strong> (แถวแรกเป็น header)
    </div>
    <div id="group-staff"><div style="color:var(--text3);font-size:12px;padding:8px">⏳ กำลังโหลด...</div></div>
  </div>

  <!-- อสม -->
  <div style="background:#fff;border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:32px;height:32px;background:#7c3aed;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px">🏡</div>
        <div><div style="font-size:14px;font-weight:700">อสม.</div><div style="font-size:11px;color:var(--text3)">เยี่ยมบ้าน ดูผู้ป่วยในหมู่บ้านตนเอง</div></div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="downloadTemplate('aosomo')" style="display:flex;align-items:center;gap:4px;padding:6px 10px;background:#fff;color:#7c3aed;border:1px solid #7c3aed;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">
          ⬇️ ดาวน์โหลดตัวอย่าง
        </button>
        <button onclick="document.getElementById('aosomo-file-input').click()" style="display:flex;align-items:center;gap:4px;padding:6px 12px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">
          📎 นำเข้ารายชื่อ
        </button>
      </div>
      <input type="file" id="aosomo-file-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="importAosomoFile(this)">
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px;padding:6px 10px;background:#f5f3ff;border-radius:6px">
      📋 นำเข้าจาก Excel/CSV — คอลัมน์: <strong>ชื่อ, หมู่บ้าน, เบอร์โทร, LINE ID</strong> (แถวแรกเป็น header — LINE ID เป็นคอลัมน์ที่ 4 ไม่บังคับ)
    </div>
    <div id="group-aosomo"><div style="color:var(--text3);font-size:12px;padding:8px">⏳ กำลังโหลด...</div></div>
  </div>

  <!-- ผู้สังเกตการณ์ -->
  <div style="background:#fff;border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <div style="width:32px;height:32px;background:var(--text3);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px">👁️</div>
      <div><div style="font-size:14px;font-weight:700">ผู้สังเกตการณ์</div><div style="font-size:11px;color:var(--text3)">ดูข้อมูลได้อย่างเดียว ไม่สามารถแก้ไข</div></div>
    </div>
    <div id="group-viewer"><div style="color:var(--text3);font-size:12px;padding:8px">⏳ กำลังโหลด...</div></div>
  </div>
  </div>`
  loadMembersList()
}

function renderGuide(el) {
  const villages=VILLAGES
  const previewSection = canDo('admin') ? `
  <div style="background:#fff7ed;border:2px solid #fed7aa;border-radius:14px;padding:16px;margin-bottom:20px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <div style="font-size:20px">🔍</div>
      <div>
        <div style="font-size:14px;font-weight:800;color:#c2410c">ทดลองดูหน้าเว็บในฐานะสมาชิกแต่ละประเภท</div>
        <div style="font-size:11px;color:#9a3412;margin-top:2px">กดปุ่มเพื่อดูว่าสมาชิกแต่ละประเภทเห็นอะไร — กด <strong>"ออกจากโหมดนี้"</strong> เพื่อกลับ</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
      <button onclick="previewAs('staff')" style="background:#f0f9ff;border:2px solid #0a7ea4;border-radius:10px;padding:12px;cursor:pointer;text-align:left;font-family:'Sarabun',sans-serif">
        <div style="font-size:20px;margin-bottom:4px">👨‍⚕️</div>
        <div style="font-size:13px;font-weight:800;color:#0a7ea4">เจ้าหน้าที่</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">บันทึกฉีดยา + เยี่ยมบ้าน</div>
      </button>
      <button onclick="previewAs('aosomo',villages[0])" style="background:#f5f3ff;border:2px solid #7c3aed;border-radius:10px;padding:12px;cursor:pointer;text-align:left;font-family:'Sarabun',sans-serif">
        <div style="font-size:20px;margin-bottom:4px">🏡</div>
        <div style="font-size:13px;font-weight:800;color:#7c3aed">อสม.</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">เยี่ยมบ้าน + หมู่บ้าน</div>
      </button>
      <button onclick="previewAs('viewer')" style="background:#f9fafb;border:2px solid #6b7280;border-radius:10px;padding:12px;cursor:pointer;text-align:left;font-family:'Sarabun',sans-serif">
        <div style="font-size:20px;margin-bottom:4px">👁️</div>
        <div style="font-size:13px;font-weight:800;color:#6b7280">ผู้สังเกตการณ์</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">ภาพรวมอย่างเดียว</div>
      </button>
    </div>
    <div style="background:#f5f3ff;border-radius:10px;padding:10px">
      <div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:8px">🏡 อสม. — เลือกหมู่บ้านที่ต้องการดู:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${villages.map(v=>`<button onclick="previewAs('aosomo','${v}')" style="background:#fff;border:1.5px solid #c4b5fd;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:700;color:#7c3aed;cursor:pointer;font-family:'Sarabun',sans-serif">${v}</button>`).join('')}
      </div>
    </div>
  </div>` : ''

  const roles = [
    {
      key:'admin', label:'ผู้ดูแลระบบ', color:'#dc2626', bg:'#fef2f2', border:'#fca5a5', icon:'👑',
      desc:'ควบคุมและจัดการทุกอย่างในระบบ',
      menus:[
        {icon:'🏠',name:'หน้าหลัก',desc:'ดูภาพรวมผู้ป่วยทั้งหมด สถิติ และการแจ้งเตือน'},
        {icon:'👥',name:'ผู้ป่วย',desc:'เพิ่ม แก้ไข ลบผู้ป่วย บันทึกการฉีดยา แก้ไขประวัติ'},
        {icon:'📅',name:'ตารางนัด',desc:'ดูนัดหมายทุกรายการ กรองตามวัน'},
        {icon:'📊',name:'ภาพรวม',desc:'กราฟแนวโน้ม สถิติกลุ่มสี'},
        {icon:'🏡',name:'เยี่ยมบ้าน',desc:'บันทึกและดูประวัติเยี่ยมบ้านทุกหมู่บ้าน'},
        {icon:'⚙️',name:'แอดมิน',desc:'ตั้งค่า LINE, ดูแลระบบ, export ข้อมูล'},
        {icon:'👤',name:'จัดการสมาชิก',desc:'เพิ่ม/ลบ กำหนดสิทธิ์และหมู่บ้านของสมาชิก'},
        {icon:'📖',name:'คู่มือ',desc:'ดูตัวอย่างสิทธิ์การใช้งาน'},
      ]
    },
    {
      key:'staff', label:'เจ้าหน้าที่', color:'#0a7ea4', bg:'#f0f9ff', border:'#bae6fd', icon:'👨‍⚕️',
      desc:'บันทึกข้อมูลและดูแลผู้ป่วยทุกรายการ',
      menus:[
        {icon:'🏠',name:'หน้าหลัก',desc:'ดูภาพรวมผู้ป่วยทั้งหมด สถิติ'},
        {icon:'👥',name:'ผู้ป่วย',desc:'เพิ่ม แก้ไขข้อมูลผู้ป่วย บันทึกการฉีดยา'},
        {icon:'📅',name:'ตารางนัด',desc:'ดูนัดหมายทุกรายการ'},
        {icon:'📊',name:'ภาพรวม',desc:'ดูกราฟสถิติ'},
        {icon:'🏡',name:'เยี่ยมบ้าน',desc:'บันทึกและดูประวัติเยี่ยมบ้าน'},
      ],
      locked:[
        {icon:'⚙️',name:'แอดมิน',desc:'ไม่มีสิทธิ์ตั้งค่าระบบ'},
        {icon:'👤',name:'จัดการสมาชิก',desc:'ไม่มีสิทธิ์จัดการสมาชิก'},
      ]
    },
    {
      key:'aosomo', label:'อสม.', color:'#7c3aed', bg:'#f5f3ff', border:'#c4b5fd', icon:'🏡',
      desc:'ดูและบันทึกเฉพาะผู้ป่วยในหมู่บ้านที่รับผิดชอบ',
      menus:[
        {icon:'🏠',name:'หน้าหลัก',desc:'เห็นเฉพาะผู้ป่วยในหมู่บ้านตัวเอง ไม่เห็นหมู่บ้านอื่น'},
        {icon:'👥',name:'ผู้ป่วย',desc:'ดูรายชื่อและประวัติฉีดยา — กรองเฉพาะหมู่บ้านที่กำหนด'},
        {icon:'📅',name:'ตารางนัด',desc:'ดูนัดหมายของหมู่บ้านตัวเอง'},
        {icon:'🏡',name:'เยี่ยมบ้าน',desc:'บันทึกการเยี่ยมบ้าน ประเมิน 5 ธงแดง รายงาน LINE'},
      ],
      locked:[
        {icon:'📊',name:'ภาพรวม',desc:'ไม่เห็นสถิติรวมทุกหมู่บ้าน'},
        {icon:'⚙️',name:'แอดมิน',desc:'ไม่มีสิทธิ์ตั้งค่าระบบ'},
        {icon:'👤',name:'จัดการสมาชิก',desc:'ไม่มีสิทธิ์จัดการสมาชิก'},
        {icon:'💉',name:'บันทึกฉีดยา',desc:'ดูประวัติได้ แต่ไม่สามารถบันทึกหรือแก้ไขฉีดยา'},
        {icon:'➕',name:'เพิ่มผู้ป่วย',desc:'ไม่มีสิทธิ์เพิ่มหรือลบผู้ป่วย'},
      ]
    },
    {
      key:'viewer', label:'ผู้สังเกตการณ์', color:'#6b7280', bg:'#f9fafb', border:'#e5e7eb', icon:'👁️',
      desc:'ดูข้อมูลได้อย่างเดียว ไม่สามารถแก้ไขหรือบันทึก',
      menus:[
        {icon:'🏠',name:'หน้าหลัก',desc:'ดูภาพรวมผู้ป่วย'},
        {icon:'👥',name:'ผู้ป่วย',desc:'ดูรายชื่อและประวัติ — ดูอย่างเดียว'},
        {icon:'📅',name:'ตารางนัด',desc:'ดูตารางนัดหมาย'},
        {icon:'📊',name:'ภาพรวม',desc:'ดูกราฟสถิติ'},
      ],
      locked:[
        {icon:'✏️',name:'บันทึกฉีดยา',desc:'ไม่มีสิทธิ์บันทึกหรือแก้ไข'},
        {icon:'🏡',name:'เยี่ยมบ้าน',desc:'ไม่มีสิทธิ์บันทึกการเยี่ยม'},
        {icon:'⚙️',name:'แอดมิน',desc:'ไม่มีสิทธิ์ตั้งค่าระบบ'},
        {icon:'👤',name:'จัดการสมาชิก',desc:'ไม่มีสิทธิ์จัดการสมาชิก'},
      ]
    }
  ]

  const roleColors = {admin:'#dc2626',staff:'#0a7ea4',aosomo:'#7c3aed',viewer:'#6b7280'}

  el.innerHTML = `
  <div style="max-width:700px;margin:0 auto;padding:8px 0">
    ${previewSection}
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:28px;margin-bottom:6px">📖</div>
      <div style="font-size:15px;font-weight:700;color:var(--text1)">สิทธิ์การใช้งานแต่ละประเภทสมาชิก</div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px">ตัวอย่างเมนูและฟังก์ชันที่สมาชิกแต่ละประเภทเข้าถึงได้</div>
    </div>
    ${roles.map(r=>`
    <div style="background:${r.bg};border:1.5px solid ${r.border};border-radius:14px;padding:16px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="width:40px;height:40px;background:${r.color};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${r.icon}</div>
        <div>
          <div style="font-size:15px;font-weight:800;color:${r.color}">${r.label}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:1px">${r.desc}</div>
        </div>
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px;letter-spacing:.5px">✅ เข้าถึงได้</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:${r.locked?'10px':'0'}">
        ${r.menus.map(m=>`
        <div style="background:#fff;border-radius:8px;padding:7px 10px;display:flex;align-items:flex-start;gap:7px">
          <div style="font-size:15px;line-height:1.2;flex-shrink:0">${m.icon}</div>
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--text1)">${m.name}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:1px;line-height:1.3">${m.desc}</div>
          </div>
        </div>`).join('')}
      </div>
      ${r.locked?`
      <div style="font-size:11px;font-weight:700;color:#9ca3af;margin-bottom:6px;letter-spacing:.5px">🔒 ไม่มีสิทธิ์</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px">
        ${r.locked.map(m=>`
        <div style="background:rgba(0,0,0,.04);border-radius:8px;padding:7px 10px;display:flex;align-items:flex-start;gap:7px;opacity:.7">
          <div style="font-size:15px;line-height:1.2;flex-shrink:0">${m.icon}</div>
          <div>
            <div style="font-size:12px;font-weight:700;color:#9ca3af;text-decoration:line-through">${m.name}</div>
            <div style="font-size:10px;color:#9ca3af;margin-top:1px;line-height:1.3">${m.desc}</div>
          </div>
        </div>`).join('')}
      </div>`:''
      }
    </div>`).join('')}
    <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-top:4px;font-size:11px;color:var(--text3);line-height:1.7">
      <strong style="color:var(--text2)">หมายเหตุ:</strong> แอดมินสามารถเปลี่ยนประเภทสมาชิกและกำหนดหมู่บ้านได้ที่เมนู <strong>จัดการสมาชิก</strong>
    </div>
  </div>`
}

// ─── Preview Mode ─────────────────────────────────────────────────
function previewAs(role, village){
  if(!canDo('admin')){alert('เฉพาะแอดมินเท่านั้น');return}
  _previewOrigRole    = currentRole
  _previewOrigVillage = currentVillage
  currentRole    = role
  currentVillage = village || ''
  navigate('dashboard')
}

function exitPreview(){
  currentRole    = _previewOrigRole
  currentVillage = _previewOrigVillage
  _previewOrigRole    = null
  _previewOrigVillage = null
  updatePreviewHeader()
  navigate('admin')
}

function updatePreviewHeader(){
  const header = document.querySelector('.app-header')
  if(!header) return
  const roleColor = {admin:'#dc2626',staff:'#0a7ea4',aosomo:'#7c3aed',viewer:'#6b7280'}
  const roleIcon  = {admin:'👑',staff:'👨‍⚕️',aosomo:'🏡',viewer:'👁️'}
  const roleLabel = {admin:'ผู้ดูแลระบบ',staff:'เจ้าหน้าที่',aosomo:'อสม.',viewer:'ผู้สังเกตการณ์'}
  if(_previewOrigRole){
    header.style.background = roleColor[currentRole]
    header.style.color = '#fff'
    const sub = document.getElementById('header-sub')
    const rightEl = document.querySelector('.header-right')
    if(sub){
      sub.style.color='rgba(255,255,255,.8)'
      // เปลี่ยนแค่หน้าจอ — ฐานข้อมูลยังใช้สิทธิ์ admin จริง (RLS ตรวจจากบัญชีที่ login)
      sub.textContent=`👁️ โหมดดูตัวอย่าง: ${roleIcon[currentRole]} ${roleLabel[currentRole]}${currentVillage?' ('+currentVillage+')':''} · ⚠️ ดูอย่างเดียว — ถ้ากดบันทึก/ลบ จะทำจริงด้วยสิทธิ์ admin`
    }
    if(rightEl){
      rightEl.innerHTML=`<button onclick="exitPreview()" style="background:rgba(255,255,255,.25);border:1px solid rgba(255,255,255,.5);color:#fff;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">✕ ออกจากโหมดนี้</button>`
    }
    const titleEl = document.getElementById('header-title')
    if(titleEl) titleEl.style.color='#fff'
  } else {
    header.style.background = ''
    header.style.color = ''
    const titleEl = document.getElementById('header-title')
    if(titleEl) titleEl.style.color=''
    const sub = document.getElementById('header-sub')
    if(sub){ sub.style.color=''; sub.textContent='' }
    const rightEl = document.querySelector('.header-right')
    if(rightEl) rightEl.innerHTML=`
      <div class="notif-btn" onclick="navigate('dashboard')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <div class="notif-badge" id="notif-badge" style="display:none">0</div>
      </div>
      <div class="avatar">อส</div>
      <button onclick="logoutUser()" class="header-logout-btn" title="ออกจากระบบ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        <span>ออก</span>
      </button>`
  }
}

// token ไม่แสดงบนหน้าจอ — ช่องว่างไว้ กรอกเฉพาะเมื่อต้องการเปลี่ยน (ฟังก์ชันบันทึกข้ามช่องว่าง)
function tokenPlaceholder(v,empty){
  return v?`•••••••• บันทึกไว้แล้ว (ลงท้าย ${esc(String(v).slice(-4))}) — กรอกเฉพาะเมื่อต้องการเปลี่ยน`:esc(empty)
}
async function renderAdmin(el) {
  if(!canDo('admin')){el.innerHTML='<div style="text-align:center;padding:60px 20px;color:var(--text3)">🔒 เฉพาะผู้ดูแลระบบเท่านั้น</div>';return}
  const settings=await getSettings()
  hospitalName=settings.hospital_name||hospitalName
  const pts=allPatients
  const rc=pts.filter(p=>p.group_color==='red').length
  const yc=pts.filter(p=>p.group_color==='yellow').length
  const gc=pts.filter(p=>p.group_color==='green').length
  const over=pts.filter(p=>parseInt(p.days_until)<0).length
  const todayC=pts.filter(p=>parseInt(p.days_until)===0).length
  const nameOpts=pts.map(p=>`<option value="${esc(p.name)}">`).join('')
  const villages=VILLAGES
  const{data:staffRefs}=await sb.from('home_visits')
    .select('id,patient_name,village,visit_date,visitor,note')
    .eq('refer',true).eq('visit_type','staff').eq('refer_resolved',false)
    .order('visit_date',{ascending:false}).limit(30)
  const pendingRefs=staffRefs||[]
  const refQueueHtml=pendingRefs.length?`
  <div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:12px;padding:14px;margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:14px;font-weight:700;color:#b91c1c">🏥 รายการส่งต่อจากเจ้าหน้าที่ รอดำเนินการ (${pendingRefs.length} ราย)</div>
    </div>
    ${pendingRefs.map(r=>`
    <div style="background:#fff;border-radius:10px;padding:12px 14px;margin-bottom:8px;border:1px solid #fecaca">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div style="min-width:0;flex:1">
          <div style="font-size:14px;font-weight:700;color:var(--text1)">${esc(r.patient_name)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">📍 ${esc(r.village||'')} &nbsp;·&nbsp; 🏥 ${esc(r.visitor||'')} &nbsp;·&nbsp; 📅 ${r.visit_date||''}</div>
          ${r.note?`<div style="font-size:11px;color:#b91c1c;margin-top:4px;padding:6px 8px;background:#fef2f2;border-radius:6px;white-space:pre-wrap;line-height:1.5">${esc(r.note.split('\n').slice(0,2).join('\n'))}</div>`:''}
        </div>
        <button onclick="resolveReferral(${r.id})"
          style="flex-shrink:0;padding:8px 14px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;white-space:nowrap">
          ✅ รับเรื่องแล้ว
        </button>
      </div>
    </div>`).join('')}
  </div>`
  :`<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
    <span style="font-size:22px">✅</span>
    <div><div style="font-size:13px;font-weight:700;color:#15803d">ไม่มีรายการส่งต่อค้างอยู่</div><div style="font-size:11px;color:var(--text3);margin-top:2px">เจ้าหน้าที่ยังไม่มีการส่งต่อเพิ่มเติม</div></div>
  </div>`
  el.innerHTML=`<div class="page">
  <div class="page-title">แอดมิน</div>
  <div class="page-sub">จัดการข้อมูลและตั้งค่าระบบ</div>
  ${refQueueHtml}
  <div class="form-section">
    <h3>👁️ ดูตัวอย่างการแสดงผลตามสิทธิ์</h3>
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px">เลือกประเภทสมาชิกเพื่อดูว่าเขาจะเห็นหน้าเว็บแบบไหน — กดปุ่ม <strong>ออกจากโหมดนี้</strong> เพื่อกลับสิทธิ์แอดมิน</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      <button onclick="previewAs('staff')" style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;padding:12px;cursor:pointer;text-align:left;font-family:'Sarabun',sans-serif">
        <div style="font-size:18px;margin-bottom:4px">👨‍⚕️</div>
        <div style="font-size:13px;font-weight:700;color:#0a7ea4">เจ้าหน้าที่</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">บันทึกฉีดยา เยี่ยมบ้าน</div>
      </button>
      <button onclick="previewAs('aosomo',villages[0])" style="background:#f5f3ff;border:1.5px solid #c4b5fd;border-radius:10px;padding:12px;cursor:pointer;text-align:left;font-family:'Sarabun',sans-serif">
        <div style="font-size:18px;margin-bottom:4px">🏡</div>
        <div style="font-size:13px;font-weight:700;color:#7c3aed">อสม.</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">เยี่ยมบ้าน + หมู่บ้าน</div>
      </button>
      <button onclick="previewAs('viewer')" style="background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:10px;padding:12px;cursor:pointer;text-align:left;font-family:'Sarabun',sans-serif">
        <div style="font-size:18px;margin-bottom:4px">👁️</div>
        <div style="font-size:13px;font-weight:700;color:#6b7280">ผู้สังเกตการณ์</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">ภาพรวมอย่างเดียว</div>
      </button>
    </div>
    <div style="margin-top:8px">
      <div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:6px">🏡 อสม. — เลือกหมู่บ้าน:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${villages.map(v=>`<button onclick="previewAs('aosomo','${v}')" style="background:#f5f3ff;border:1.5px solid #c4b5fd;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;color:#7c3aed;cursor:pointer;font-family:'Sarabun',sans-serif">${v}</button>`).join('')}
      </div>
    </div>
  </div>
  <div class="form-section">
    <h3>📊 สรุปภาพรวม</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      ${[['ทั้งหมด',pts.length,'var(--primary)'],['เกินนัด',over,'var(--red)'],['วันนี้',todayC,'#0d9488']].map(([l,n,c])=>`<div style="text-align:center;padding:10px;background:var(--bg);border-radius:8px"><div style="font-size:22px;font-weight:700;color:${c}">${n}</div><div style="font-size:11px;color:var(--text3);margin-top:2px">${l}</div></div>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      ${[['สีแดง',rc,'var(--red)'],['สีเหลือง',yc,'var(--yellow)'],['สีเขียว',gc,'var(--green)']].map(([l,n,c])=>`<div style="flex:1;background:var(--bg);border-radius:8px;padding:8px;text-align:center"><div style="width:10px;height:10px;border-radius:50%;background:${c};margin:0 auto 4px"></div><div style="font-size:16px;font-weight:700;color:${c}">${n}</div><div style="font-size:10px;color:var(--text3)">${l}</div></div>`).join('')}
    </div>
    <button onclick="generateMonthlyReport()" style="width:100%;margin-top:12px;padding:10px;background:linear-gradient(135deg,#0a7ea4,#0369a1);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px">
      <span>📄</span><span>พิมพ์รายงานสรุปรายเดือน</span>
    </button>
  </div>
  <div class="form-section">
    <h3>📋 บันทึกนัดหมาย</h3>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <label onclick="toggleAdmType('injection')" id="adm-type-inj-label" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:8px;border:2px solid var(--primary);background:var(--primary-lt);cursor:pointer;font-size:13px;font-weight:700;color:var(--primary);font-family:'Sarabun',sans-serif">
        <input type="radio" name="adm-type" id="adm-type-inj" value="injection" checked style="display:none"> 💉 ฉีดยา
      </label>
      <label onclick="toggleAdmType('visit')" id="adm-type-vis-label" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--bg);cursor:pointer;font-size:13px;font-weight:700;color:var(--text3);font-family:'Sarabun',sans-serif">
        <input type="radio" name="adm-type" id="adm-type-vis" value="visit" style="display:none"> 🏡 เยี่ยมบ้าน
      </label>
    </div>
    <div class="form-group"><label>ชื่อ-นามสกุล</label><input list="adm-names" id="adm-name" placeholder="พิมพ์หรือเลือกชื่อ" autocomplete="off"><datalist id="adm-names">${nameOpts}</datalist></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="form-group"><label>หมู่บ้าน</label><select id="adm-village">${VILLAGES.map(v=>`<option>${v}</option>`).join('')}</select></div>
      <div class="form-group"><label>กลุ่มสี</label><select id="adm-group"><option value="สีแดง">สีแดง</option><option value="สีเหลือง" selected>สีเหลือง</option><option value="สีเขียว">สีเขียว</option></select></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="form-group"><label id="adm-date-label">วันที่ฉีดยา</label><input type="date" id="adm-date" value="${todayISO()}" oninput="syncNextDateFromInterval('adm-date','adm-interval','adm-next-date')"></div>
      <div class="form-group"><label>รอบนัดต่อไป</label><select id="adm-interval" onchange="syncNextDateFromInterval('adm-date','adm-interval','adm-next-date')"><option>2 สัปดาห์</option><option>3 สัปดาห์</option><option>4 สัปดาห์</option><option selected>1 เดือน</option><option>3 เดือน</option></select></div>
    </div>
    <div class="form-group"><label>📅 วันนัดครั้งต่อไป <span style="font-size:11px;color:var(--text3);font-weight:400">(เลือกจากปฏิทิน หรือปล่อยให้คำนวณอัตโนมัติ)</span></label><input type="date" id="adm-next-date" oninput="syncIntervalFromNextDate('adm-date','adm-next-date','adm-interval')"></div>
    <div class="form-group">
      <label>หมายเหตุ</label>
      <textarea id="adm-note" rows="2" style="resize:vertical;min-height:60px;font-family:'Sarabun',sans-serif"></textarea>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
        ${['ฉีดยา Invega 100 mg','DEPO-A ฉีดทุก 3 เดือน','FLUPENTIXOL 40MG/2ML','อาการคงที่','ไม่มา'].map(p=>`<button type="button" onclick="appendNote('${esc(p)}')" style="font-size:11px;padding:3px 9px;border-radius:20px;border:1px solid var(--border);background:var(--bg);color:var(--text2);cursor:pointer;font-family:'Sarabun',sans-serif;font-weight:600">+ ${p}</button>`).join('')}
      </div>
    </div>
    <button class="btn btn-primary btn-block" id="adm-btn" onclick="saveAdminRecord()">บันทึกนัดหมาย</button>
  </div>
  <div class="form-section">
    <h3>⚙️ ตั้งค่า</h3>
    <div class="form-group"><label>ชื่อโรงพยาบาล / หน่วยงาน</label><input id="s-hospital" value="${esc(settings.hospital_name||hospitalName)}"></div>
    <div class="form-group"><label>ผู้รับแจ้งเหตุข้อมูลรั่วไหล (แสดงในข้อตกลงรักษาความลับ)</label><input id="s-privacy-contact" placeholder="เช่น ผอ.รพ.สต. โทร 08x-xxx-xxxx" value="${esc(settings.privacy_contact||'')}"></div>
    <div class="form-group"><label>ข้อความใต้ชื่อแอป — บรรทัด 1</label><input id="s-subtitle-1" value="${esc((settings.app_subtitle||appSubtitle).split('\n')[0]||'')}"></div>
    <div class="form-group"><label>ข้อความใต้ชื่อแอป — บรรทัด 2 (ไม่บังคับ)</label><input id="s-subtitle-2" value="${esc((settings.app_subtitle||appSubtitle).split('\n')[1]||'')}"></div>
    <button class="btn btn-primary" style="width:auto;padding:9px 20px" id="settings-btn" onclick="saveSettings()">บันทึกการตั้งค่า</button>
  </div>
  <div class="form-section">
    <h3>🔗 เชื่อมต่อข้อมูล</h3>
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px;margin-top:-4px">นำเข้า/ส่งออก และเชื่อมข้อมูลกับระบบภายนอก</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <button onclick="exportCSV()" style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:12px 14px;background:#ecfdf5;border:1.5px solid #a7f3d0;border-radius:10px;cursor:pointer;text-align:left;font-family:'Sarabun',sans-serif">
        <div style="display:flex;align-items:center;gap:6px"><span style="font-size:18px">📥</span><span style="font-size:13px;font-weight:700;color:#059669">ส่งออกข้อมูล</span></div>
        <div style="font-size:10px;color:var(--text3)">CSV / JSON</div>
      </button>
      <button onclick="exportJSON()" style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:12px 14px;background:var(--primary-lt);border:1.5px solid rgba(10,126,164,.25);border-radius:10px;cursor:pointer;text-align:left;font-family:'Sarabun',sans-serif">
        <div style="display:flex;align-items:center;gap:6px"><span style="font-size:18px">📦</span><span style="font-size:13px;font-weight:700;color:var(--primary)">JSON Export</span></div>
        <div style="font-size:10px;color:var(--text3)">ข้อมูลแบบ JSON</div>
      </button>
    </div>
    <button onclick="exportVisitExcel()" style="display:flex;align-items:center;gap:8px;width:100%;padding:12px 14px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;cursor:pointer;text-align:left;font-family:'Sarabun',sans-serif;margin-bottom:14px">
      <span style="font-size:18px">📋</span>
      <div>
        <div style="font-size:13px;font-weight:700;color:#b45309">Export รายงานเยี่ยมบ้าน (Excel)</div>
        <div style="font-size:10px;color:var(--text3)">สำหรับกรอกข้อมูลใน JHCIS / HOSxP</div>
      </div>
    </button>
    <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:10px;border:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;background:#0a7ea4;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px">🧑‍⚕️</div>
          <div><div style="font-size:13px;font-weight:700">นำเข้าผู้ป่วย</div><div style="font-size:11px;color:var(--text3)">ชื่อ, หมู่บ้าน, หมายเหตุ, เลขบัตร, รหัสโรค, ชื่อโรค</div></div>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="downloadTemplate('patient')" style="padding:5px 10px;background:#fff;color:#0a7ea4;border:1px solid #0a7ea4;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">⬇️ ตัวอย่าง</button>
          <button onclick="document.getElementById('patient-import-input').click()" style="padding:5px 10px;background:#0a7ea4;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">📎 นำเข้า</button>
        </div>
      </div>
      <input type="file" id="patient-import-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="importPatientFile(this)">
    </div>
    <div style="background:#fefce8;border-radius:10px;padding:12px 14px;margin-bottom:10px;border:1px solid #fde68a">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;background:#d97706;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px">H</div>
          <div><div style="font-size:13px;font-weight:700">นำเข้าจาก HOSxP / JHCIS</div><div style="font-size:11px;color:var(--text3)">ชื่อ, สกุล, เลขบัตร, ที่อยู่, รหัสโรค, สีกลุ่ม</div></div>
        </div>
        <button onclick="document.getElementById('hospital-import-input').click()" style="padding:5px 12px;background:#d97706;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">📎 นำเข้า</button>
      </div>
      <div style="font-size:11px;color:#92400e;background:#fff;border-radius:6px;padding:6px 10px">คอลัมน์: <strong>C=ชื่อ, D=สกุล, E=เลขบัตร, G=เลขที่(หมู่), H=namemooban, I=ตำบล, J=อำเภอ, K=จังหวัด, L=รหัสโรค, M=ชื่อโรค</strong></div>
      <input type="file" id="hospital-import-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="importHospitalFile(this)">
    </div>
    <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:10px;border:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;background:#0a7ea4;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:11px">H</div>
          <div><div style="font-size:13px;font-weight:700">HOSxP / JHCIS</div><div style="font-size:11px;color:var(--text3)">ระบบฐานข้อมูล รพ.สต.</div></div>
        </div>
        <label class="toggle"><input type="checkbox" ${settings.hosxp_enabled==='1'?'checked':''} onchange="toggleSetting('hosxp_enabled',this.checked)"><span class="toggle-slider"></span></label>
      </div>
    </div>
    <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:10px;border:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;background:#06c755;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px">L</div>
          <div><div style="font-size:13px;font-weight:700">LINE Notify / OA</div><div style="font-size:11px;color:var(--text3)">แจ้งเตือนผ่าน LINE กลุ่ม อสม.</div></div>
        </div>
        <label class="toggle"><input type="checkbox" ${settings.line_enabled==='1'?'checked':''} onchange="toggleSetting('line_enabled',this.checked)"><span class="toggle-slider"></span></label>
      </div>
      <input id="line-token-input" type="password" autocomplete="new-password" value="" placeholder="${tokenPlaceholder(settings.line_token,'LINE Channel Access Token')}" style="width:100%;padding:7px 10px;font-size:11px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);font-family:monospace;margin-bottom:6px">
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px">LINE Group ID</div>
      <input id="line-groupid-input" type="text" value="${esc(settings.line_group_id||'')}" placeholder="Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style="width:100%;padding:7px 10px;font-size:11px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);font-family:monospace;margin-bottom:8px">
      <div style="display:flex;gap:8px">
        <button onclick="saveLineSettings()" id="line-save-btn" style="flex:1;padding:7px;background:#06c755;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">💾 บันทึก</button>
        <button onclick="testLine()" id="line-test-btn" style="flex:1;padding:7px;background:#fff;color:#06c755;border:1.5px solid #06c755;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">📨 ทดสอบส่ง</button>
      </div>
      <div id="line-status" style="font-size:11px;margin-top:6px;min-height:16px"></div>
    </div>
    <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:10px;border:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;background:#0088cc;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px">T</div>
          <div><div style="font-size:13px;font-weight:700">Telegram Bot</div><div style="font-size:11px;color:var(--text3)">${esc(settings.telegram_bot||'@JitHomeBot')} · กลุ่มแจ้งเตือน</div></div>
        </div>
        <label class="toggle"><input type="checkbox" ${settings.telegram_enabled==='1'?'checked':''} onchange="toggleSetting('telegram_enabled',this.checked)"><span class="toggle-slider"></span></label>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Chat ID</div>
      <input id="telegram-chatid-input" type="text" value="${esc(settings.telegram_chatid||'')}" placeholder="-1001234567890" style="width:100%;padding:7px 10px;font-size:11px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);font-family:monospace;margin-bottom:6px">
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Bot Token <span style="color:var(--red)">*</span> <a href="https://t.me/BotFather" target="_blank" style="color:var(--primary);font-size:10px">สร้าง Bot ที่ @BotFather</a></div>
      <input id="telegram-token-input" type="password" autocomplete="new-password" value="" placeholder="${tokenPlaceholder(settings.telegram_token,'123456789:AABBCCDDaabbccddeeff')}" style="width:100%;padding:7px 10px;font-size:11px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);font-family:monospace;margin-bottom:8px">
      <div style="display:flex;gap:8px">
        <button onclick="saveTelegramSettings()" id="tg-save-btn" style="flex:1;padding:7px;background:#0088cc;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">💾 บันทึก</button>
        <button onclick="testTelegram()" id="tg-test-btn" style="flex:1;padding:7px;background:#fff;color:#0088cc;border:1.5px solid #0088cc;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">📨 ทดสอบส่ง</button>
      </div>
      <div id="tg-status" style="font-size:11px;margin-top:6px;min-height:16px"></div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <div style="font-size:12px;color:var(--text3);margin-bottom:6px">📣 ส่งรายงานผู้เกินนัดและนัดพรุ่งนี้ไปยัง Telegram ทันที (ไม่ต้องรอ 07:00 น.)</div>
        <button onclick="sendTelegramReport()" id="tg-report-btn" style="width:100%;padding:9px;background:linear-gradient(135deg,#0088cc,#0066aa);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;letter-spacing:.3px">📣 ส่งรายงาน Telegram ตอนนี้</button>
        <div id="tg-report-status" style="font-size:11px;margin-top:6px;min-height:16px"></div>
      </div>
    </div>
    <div style="background:var(--bg);border-radius:10px;padding:12px 14px;border:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;background:#0ea5e9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px">☁️</div>
          <div><div style="font-size:13px;font-weight:700">Cloud Backup</div><div style="font-size:11px;color:var(--text3)">สำรองข้อมูลอัตโนมัติทุก 24 ชม.</div></div>
        </div>
        <label class="toggle"><input type="checkbox" ${settings.cloud_backup==='1'?'checked':''} onchange="toggleSetting('cloud_backup',this.checked)"><span class="toggle-slider"></span></label>
      </div>
    </div>
    <div style="background:#fff7ed;border-radius:10px;padding:12px 14px;margin-top:10px;border:1.5px solid #fed7aa">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <div style="width:32px;height:32px;background:#ea580c;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px">🏥</div>
        <div><div style="font-size:13px;font-weight:700;color:#9a3412">กลุ่ม รพ. แม่ข่าย (รับเคสส่งต่อเท่านั้น)</div><div style="font-size:11px;color:var(--text3)">แจ้งเตือนเมื่อเจ้าหน้าที่กดส่งต่อ รพ. — LINE และ/หรือ Telegram</div></div>
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">LINE Group ID (กลุ่ม รพ. แม่ข่าย) <span style="color:var(--red)">*</span></div>
      <input id="refer-line-groupid-input" type="text" value="${esc(settings.refer_line_group_id||'')}" placeholder="C... หรือ G... (Group ID ของกลุ่ม LINE รพ.)" style="width:100%;padding:7px 10px;font-size:11px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);font-family:monospace;margin-bottom:6px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">LINE Token <span style="font-weight:400;color:var(--text3)">(ถ้าใช้ LINE OA คนละอัน — ไม่จำเป็นหากใช้ OA เดิม)</span></div>
      <input id="refer-line-token-input" type="password" autocomplete="new-password" value="" placeholder="${tokenPlaceholder(settings.refer_line_token,'เว้นว่างหากใช้ LINE OA เดิม')}" style="width:100%;padding:7px 10px;font-size:11px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);font-family:monospace;margin-bottom:8px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">Telegram Chat ID (กลุ่ม รพ. แม่ข่าย)</div>
      <input id="refer-tg-chatid-input" type="text" value="${esc(settings.refer_telegram_chatid||'')}" placeholder="-1001234567890" style="width:100%;padding:7px 10px;font-size:11px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);font-family:monospace;margin-bottom:6px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px">Telegram Bot Token</div>
      <input id="refer-tg-token-input" type="password" autocomplete="new-password" value="" placeholder="${tokenPlaceholder(settings.refer_telegram_token,'123456789:AABBCCDDaabbccddeeff')}" style="width:100%;padding:7px 10px;font-size:11px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);font-family:monospace;margin-bottom:8px">
      <div style="display:flex;gap:8px">
        <button onclick="saveReferSettings()" id="refer-save-btn" style="flex:1;padding:7px;background:#ea580c;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">💾 บันทึก</button>
        <button onclick="testReferNotify()" id="refer-test-btn" style="flex:1;padding:7px;background:#fff;color:#ea580c;border:1.5px solid #ea580c;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">📨 ทดสอบส่ง</button>
      </div>
      <div id="refer-status" style="font-size:11px;margin-top:6px;min-height:16px"></div>
    </div>
  </div>
  ${canDo('manage_users')?`
  <div class="form-section">
    <h3>🏡 สร้างบัญชีสำหรับ อสม.</h3>
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px;margin-top:-4px">สร้างบัญชีให้ อสม. ที่ไม่มีอีเมล — ใช้เบอร์โทรแทน</div>
    <div class="form-group"><label>ชื่อ-นามสกุล อสม. *</label><input type="text" id="ca-name" placeholder="เช่น นางสมศรี ใจดี" style="width:100%;box-sizing:border-box"></div>
    <div class="form-group"><label>เบอร์โทรศัพท์ * (ใช้เป็นชื่อผู้ใช้)</label><input type="tel" id="ca-phone" placeholder="0812345678" maxlength="10" inputmode="numeric" style="width:100%;box-sizing:border-box"></div>
    <div class="form-group"><label>เลขบัตรประชาชน 🪪 (ไม่บังคับ)</label><input type="text" id="ca-nid" placeholder="เช่น 1234567890123" maxlength="13" inputmode="numeric" style="width:100%;box-sizing:border-box"></div>
    <div class="form-group"><label>หมู่บ้าน</label>
      <select id="ca-village" style="width:100%">
        ${villages.map(v=>`<option>${v}</option>`).join('')}
      </select>
    </div>
    <div id="ca-result" style="font-size:12px;min-height:16px;margin-bottom:8px"></div>
    <button class="btn btn-primary" id="ca-btn" onclick="createAosomoAccount()" style="background:#7c3aed;border-color:#7c3aed">🏡 สร้างบัญชี อสม.</button>
  </div>
  <div class="form-section">
    <h3>👥 จัดการสมาชิก</h3>
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px;margin-top:-4px">กำหนดสิทธิ์การเข้าถึงของสมาชิกแต่ละคน</div>
    <div id="members-list"><div style="text-align:center;padding:20px;color:var(--text3)">⏳ กำลังโหลด...</div></div>
  </div>`:''}
  <div class="form-section">
    <h3>🔒 ความปลอดภัย — ยืนยันตัวตน 2 ชั้น (2FA)</h3>
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px;margin-top:-4px">บังคับสำหรับ Admin และเจ้าหน้าที่ทุกคน — ต้องใช้ Authenticator App</div>
    <div id="admin-mfa-section"><div style="text-align:center;padding:16px;color:var(--text3)">⏳ กำลังโหลด...</div></div>
  </div>
  <div class="form-section" style="border-color:#fca5a5">
    <div style="display:flex;align-items:flex-start;gap:10px;background:#fef2f2;border-radius:10px;padding:12px 14px;margin-bottom:14px">
      <span style="font-size:18px;flex-shrink:0">⚠️</span>
      <div><div style="font-size:13px;font-weight:700;color:#b91c1c">โซนอันตราย — จัดการข้อมูล</div>
      <div style="font-size:11px;color:#b91c1c;margin-top:2px">การลบข้อมูลเป็นการดำเนินการถาวร ไม่สามารถกู้คืนได้ กรุณาตรวจสอบก่อนดำเนินการ</div></div>
    </div>
    <div id="dz-visit"></div><div id="dz-care"></div><div id="dz-patient"></div><div id="dz-appt"></div>
  </div>
  </div>`

  if(canDo('manage_users'))loadMembersList()
  loadAdminMFAStatus()
  initDangerZone()
}

async function createAosomoAccount(){
  if(!canDo('admin')){alert('🔒 ไม่มีสิทธิ์สร้างบัญชี');return}
  const name=(document.getElementById('ca-name')?.value||'').trim()
  const phone=(document.getElementById('ca-phone')?.value||'').replace(/\D/g,'')
  const nid=(document.getElementById('ca-nid')?.value||'').replace(/\D/g,'')
  const village=document.getElementById('ca-village')?.value||''
  const result=document.getElementById('ca-result')
  const btn=document.getElementById('ca-btn')
  if(!name){result.style.color='var(--red)';result.textContent='❌ กรุณากรอกชื่อ';return}
  if(phone.length<9){result.style.color='var(--red)';result.textContent='❌ เบอร์โทรไม่ถูกต้อง';return}
  if(nid&&nid.length!==13){result.style.color='var(--red)';result.textContent='❌ เลขบัตรประชาชนต้องมี 13 หลัก';return}
  const email=phone+'@jithome.local'
  const password=genPassword()
  btn.disabled=true;btn.textContent='กำลังสร้างบัญชี...'
  result.style.color='var(--text3)';result.textContent=''
  try{
    const tmp=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const{data,error}=await tmp.auth.signUp({email,password})
    if(error){
      if(error.message?.includes('already registered')){result.style.color='var(--red)';result.textContent='❌ เบอร์โทรนี้มีบัญชีอยู่แล้ว'}
      else{result.style.color='var(--red)';result.textContent='❌ '+error.message}
      btn.disabled=false;btn.textContent='🏡 สร้างบัญชี อสม.';return
    }
    const uid=data?.user?.id
    if(uid){
      const prof={id:uid,email,display_name:name,role:'aosomo',village,last_login:new Date().toISOString()}
      if(nid)prof.national_id=nid
      await sb.from('user_profiles').upsert(prof,{onConflict:'id'})
      auditLog('create_aosomo_account','user_profiles',uid,{name,village,by:currentDisplayName})
    }
    result.innerHTML=`<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px;margin-top:4px">
      <div style="font-weight:700;color:#166534;margin-bottom:6px">✅ สร้างบัญชีสำเร็จ! แจ้ง อสม. ดังนี้:</div>
      <div style="font-size:12px;line-height:1.8">
        👤 ชื่อผู้ใช้: <strong>${esc(email)}</strong><br>
        🔑 รหัสผ่าน: <strong id="ca-pw-display" style="font-family:monospace;letter-spacing:1px">${esc(password)}</strong>
        <button onclick="navigator.clipboard.writeText('${esc(password)}').then(()=>{this.textContent='✅ คัดลอกแล้ว';setTimeout(()=>this.textContent='📋 คัดลอก',2000)})" style="margin-left:8px;font-size:10px;padding:2px 8px;border:1px solid #16a34a;border-radius:4px;background:#fff;color:#16a34a;cursor:pointer;font-family:'Sarabun',sans-serif">📋 คัดลอก</button><br>
        🏡 หมู่บ้าน: <strong>${esc(village)}</strong>${nid?`<br>🪪 บัตรประชาชน: <strong>${maskNationalId(nid)}</strong>`:''}
      </div>
      <div style="font-size:11px;color:#b45309;margin-top:6px;background:#fefce8;padding:6px 8px;border-radius:6px">⚠️ บันทึกรหัสผ่านนี้ไว้ก่อน — จะไม่แสดงอีก แนะนำให้ อสม. เปลี่ยนรหัสผ่านหลังเข้าสู่ระบบ</div>
    </div>`
    document.getElementById('ca-name').value=''
    document.getElementById('ca-phone').value=''
    document.getElementById('ca-nid').value=''
    loadMembersList()
  }catch(e){result.style.color='var(--red)';result.textContent='❌ '+e.message}
  btn.disabled=false;btn.textContent='🏡 สร้างบัญชี อสม.'
}

// ─── 2FA Management ──────────────────────────────────────────────
async function loadAdminMFAStatus(){
  const el=document.getElementById('admin-mfa-section')
  if(!el)return
  const{data}=await sb.auth.mfa.listFactors()
  const verified=(data?.totp||[]).find(f=>f.status==='verified')
  if(verified){
    el.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:#dcfce7;border:1.5px solid #86efac;border-radius:10px;padding:12px 14px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:32px;height:32px;background:#16a34a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px">✓</div>
        <div><div style="font-size:13px;font-weight:700;color:var(--text1)">เปิดใช้งานแล้ว</div>
        <div style="font-size:11px;color:var(--text3)">ต้องกรอก OTP จาก Authenticator App ทุกครั้งที่เข้าสู่ระบบ</div></div>
      </div>
      <button onclick="adminDisableMFA('${verified.id}')" style="padding:7px 12px;background:transparent;color:#b91c1c;border:1.5px solid #fca5a5;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;white-space:nowrap;flex-shrink:0">🔓 ปิดใช้งาน</button>
    </div>`
  }else{
    el.innerHTML=`<div style="display:flex;align-items:center;gap:10px;background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;padding:12px 14px">
      <span style="font-size:20px">ℹ️</span>
      <div><div style="font-size:13px;font-weight:700;color:var(--text1)">ยังไม่ได้ตั้งค่า 2FA</div>
      <div style="font-size:11px;color:var(--text3)">จะถูกบังคับตั้งค่าโดยอัตโนมัติเมื่อเข้าสู่ระบบครั้งถัดไป</div></div>
    </div>`
  }
}
async function adminDisableMFA(factorId){
  if(!confirm('ปิดใช้งาน 2FA?\n\nจะถูกบังคับตั้งค่าใหม่เมื่อเข้าสู่ระบบครั้งถัดไป'))return
  const{error}=await sb.auth.mfa.unenroll({factorId})
  if(error){alert('❌ ไม่สำเร็จ: '+error.message);return}
  auditLog('disable_mfa','user',currentUser?.id,{by:currentDisplayName})
  loadAdminMFAStatus()
}

// ─── Danger Zone ──────────────────────────────────────────────────
const DZ_CFG={
  visit:  {label:'บันทึกการเยี่ยม (Check-in)',   icon:'📍',table:'home_visits',        cols:'id,patient_name,village,visit_date,visit_type',nameKey:'patient_name',dateKey:'visit_date',   hasVillage:true},
  care:   {label:'บันทึกบริการดูแล (Care Log)', icon:'📋',table:'injection_records',   cols:'id,patient_id,injection_date,record_type',     nameKey:null,          dateKey:'injection_date',hasVillage:false},
  patient:{label:'ผู้ป่วย',                       icon:'👤',table:'patients',            cols:'id,name,village,group_color',                  nameKey:'name',        dateKey:null,           hasVillage:true},
  appt:   {label:'นัดพบแพทย์',                    icon:'🗓️',table:'doctor_appointments',cols:'id,patient_id,appoint_date,appoint_type,status',nameKey:null,         dateKey:'appoint_date', hasVillage:false},
}
function initDangerZone(){
  Object.entries(DZ_CFG).forEach(([type,cfg])=>{
    const el=document.getElementById('dz-'+type)
    if(!el)return
    el.innerHTML=`<div style="border:1.5px solid #fca5a5;border-radius:10px;overflow:hidden;margin-bottom:10px">
      <button onclick="dzToggle('${type}')" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#fef2f2;border:none;cursor:pointer;font-family:'Sarabun',sans-serif;text-align:left;gap:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:18px">${cfg.icon}</span>
          <div><div style="font-size:13px;font-weight:700;color:var(--text1)">${cfg.label}</div>
          <div style="font-size:11px;color:var(--text3)">เลือกและลบรายการ</div></div>
        </div>
        <span id="dz-arrow-${type}" style="color:var(--text3);font-size:12px;flex-shrink:0;transition:transform .2s">▼</span>
      </button>
      <div id="dz-panel-${type}" style="display:none;padding:12px 14px;border-top:1px solid #fecaca">
        <div id="dz-body-${type}"></div>
      </div>
    </div>`
  })
}
function dzToggle(type){
  const panel=document.getElementById('dz-panel-'+type)
  const arrow=document.getElementById('dz-arrow-'+type)
  const open=panel.style.display==='none'
  panel.style.display=open?'block':'none'
  arrow.style.transform=open?'rotate(180deg)':''
  if(open)dzRenderControls(type)
}
function dzRenderControls(type){
  const cfg=DZ_CFG[type]
  const body=document.getElementById('dz-body-'+type)
  if(!body||body.dataset.init)return
  body.dataset.init='1'
  const vOpts=VILLAGES.map(v=>`<option>${v}</option>`).join('')
  const villSel=cfg.hasVillage?`<select id="dz-village-${type}" style="flex:1;min-width:100px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text1);font-family:'Sarabun',sans-serif"><option value="">ทุกหมู่บ้าน</option>${vOpts}</select>`:''
  const dateSel=cfg.dateKey?`<select id="dz-period-${type}" style="flex:1;min-width:110px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text1);font-family:'Sarabun',sans-serif"><option value="30">30 วันล่าสุด</option><option value="90">90 วัน</option><option value="180">180 วัน</option><option value="365">1 ปี</option><option value="0">ทั้งหมด</option></select>`:''
  body.innerHTML=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${villSel}${dateSel}<button onclick="dzLoad('${type}')" style="padding:6px 14px;background:var(--primary);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;white-space:nowrap">🔍 โหลด</button></div><div id="dz-list-${type}"></div><div id="dz-confirm-${type}" style="display:none"></div>`
}
async function dzLoad(type){
  const cfg=DZ_CFG[type]
  const list=document.getElementById('dz-list-'+type)
  const confirmEl=document.getElementById('dz-confirm-'+type)
  if(!list)return
  confirmEl.style.display='none'
  list.innerHTML='<div style="text-align:center;padding:12px;color:var(--text3)">⏳ กำลังโหลด...</div>'
  let q=sb.from(cfg.table).select(cfg.cols).limit(200)
  if(cfg.dateKey)q=q.order(cfg.dateKey,{ascending:false})
  const village=document.getElementById('dz-village-'+type)?.value
  if(village)q=q.eq('village',village)
  const period=document.getElementById('dz-period-'+type)?.value
  if(period&&period!=='0'&&cfg.dateKey){
    const cut=new Date();cut.setDate(cut.getDate()-parseInt(period))
    q=q.gte(cfg.dateKey,cut.toISOString().slice(0,10))
  }
  const{data,error}=await q
  if(error){list.innerHTML=`<div style="color:var(--red);font-size:12px;padding:8px">❌ ${esc(error.message)}</div>`;return}
  if(!data?.length){list.innerHTML='<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px">ไม่พบรายการ</div>';return}
  let patMap={}
  if(!cfg.nameKey){
    const pids=[...new Set(data.map(r=>r.patient_id).filter(Boolean))]
    if(pids.length){const{data:pts}=await sb.from('patients').select('id,name').in('id',pids);(pts||[]).forEach(p=>{patMap[p.id]=p.name})}
  }
  list.innerHTML=`<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;max-height:280px;overflow-y:auto;margin-bottom:8px">
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-bottom:1px solid var(--border)">
      <input type="checkbox" id="dz-all-${type}" onchange="dzSelectAll('${type}',this.checked)" style="width:15px;height:15px;cursor:pointer">
      <span style="font-size:11px;font-weight:700;color:var(--text3)">เลือกทั้งหมด (${data.length} รายการ)</span>
    </div>
    ${data.map(r=>{
      const nm=cfg.nameKey?esc(r[cfg.nameKey]||'—'):esc(patMap[r.patient_id]||'#'+r.id)
      const sub=type==='visit'?esc(r.village||''):type==='care'?esc(r.record_type||''):type==='appt'?esc(r.appoint_type||r.status||''):esc(r.village||'')
      const dt=cfg.dateKey?(r[cfg.dateKey]||''):''
      return`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px"><input type="checkbox" class="dz-chk-${type}" value="${r.id}" style="width:15px;height:15px;cursor:pointer;accent-color:#dc2626" onchange="dzUpdateCount('${type}')"><span style="flex:1;font-weight:600;color:var(--text1)">${nm}</span>${sub?`<span style="color:var(--text3)">${sub}</span>`:''}<span style="color:var(--text3);white-space:nowrap">${dt}</span></div>`
    }).join('')}
  </div>
  <button onclick="dzShowConfirm('${type}')" id="dz-del-btn-${type}" disabled style="padding:7px 14px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:not-allowed;font-family:'Sarabun',sans-serif;opacity:.4">🗑️ ลบที่เลือก (<span id="dz-count-${type}">0</span> รายการ)</button>`
}
function dzSelectAll(type,checked){
  document.querySelectorAll('.dz-chk-'+type).forEach(cb=>cb.checked=checked)
  dzUpdateCount(type)
}
function dzUpdateCount(type){
  const n=document.querySelectorAll('.dz-chk-'+type+':checked').length
  const cnt=document.getElementById('dz-count-'+type)
  const btn=document.getElementById('dz-del-btn-'+type)
  if(cnt)cnt.textContent=n
  if(btn){btn.disabled=n===0;btn.style.opacity=n===0?'.4':'1';btn.style.cursor=n===0?'not-allowed':'pointer'}
}
function dzShowConfirm(type){
  const n=document.querySelectorAll('.dz-chk-'+type+':checked').length
  if(!n)return
  const el=document.getElementById('dz-confirm-'+type)
  el.style.display='block'
  el.innerHTML=`<div style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:14px;margin-top:8px">
    <div style="font-size:13px;font-weight:700;color:#b91c1c;margin-bottom:4px">⚠️ ยืนยันลบ ${n} รายการ?</div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:12px">การดำเนินการนี้ไม่สามารถย้อนกลับได้</div>
    <div style="display:flex;gap:8px">
      <button onclick="dzDelete('${type}')" id="dz-confirm-btn-${type}" style="padding:7px 16px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">🗑️ ยืนยันลบ</button>
      <button onclick="document.getElementById('dz-confirm-${type}').style.display='none'" style="padding:7px 16px;background:var(--border);color:var(--text2);border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">ยกเลิก</button>
    </div>
  </div>`
}
async function dzDelete(type){
  const cfg=DZ_CFG[type]
  const ids=[...document.querySelectorAll('.dz-chk-'+type+':checked')].map(cb=>cb.value)
  if(!ids.length)return
  const btn=document.getElementById('dz-confirm-btn-'+type)
  if(btn){btn.disabled=true;btn.textContent='⏳ กำลังลบ...'}
  const{error}=await sb.from(cfg.table).delete().in('id',ids)
  if(error){alert('❌ ลบไม่สำเร็จ: '+error.message);if(btn){btn.disabled=false;btn.textContent='🗑️ ยืนยันลบ'};return}
  auditLog('bulk_delete',cfg.table,null,{count:ids.length,type,by:currentDisplayName})
  const body=document.getElementById('dz-body-'+type)
  if(body)body.dataset.init=''
  await dzLoad(type)
}

function memberCard(p,showVillage=false){
  const isSelf=p.id===currentUser?.id
  const canEdit=canDo('admin')||isSelf
  const lockInfo=window._activeLockouts&&window._activeLockouts[p.email]
  const isLocked=!!lockInfo
  const lockMins=isLocked?Math.ceil((new Date(lockInfo.locked_until)-new Date())/60000):0
  const isSuspended=p.status==='suspended'
  return `
  <div data-member-id="${p.id}" style="background:${isSuspended?'#f3f4f6':'var(--bg)'};border-radius:10px;padding:12px 14px;margin-bottom:8px;border:1px ${isSuspended?'dashed #9ca3af':`solid ${isLocked?'#fca5a5':'var(--border)'}`}">
    ${isLocked?`<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:6px 10px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div style="font-size:12px;color:#dc2626;font-weight:700">🔒 บัญชีถูกล็อก — เหลือ ${lockMins} นาที (ผิด ${lockInfo.attempt_count} ครั้ง)</div>
      ${canDo('admin')?`<button onclick="adminUnlockAccount('${jsStr(p.email)}')" style="padding:4px 10px;background:#dc2626;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;white-space:nowrap">🔓 ปลดล็อก</button>`:''}
    </div>`:''}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
        <div style="width:34px;height:34px;border-radius:50%;background:${isLocked?'#ef4444':ROLE_COLOR[p.role]||'var(--primary)'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0">${isLocked?'🔒':(p.email||'?').slice(0,2).toUpperCase()}</div>
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <div style="font-size:13px;font-weight:700${isSuspended?';color:var(--text3);text-decoration:line-through':''}">${esc(p.display_name||p.email)}</div>
            ${isSuspended?`<span style="font-size:10px;font-weight:700;color:#4b5563;background:#e5e7eb;border-radius:20px;padding:2px 8px">⏸️ ระงับการใช้งาน</span>`:''}
            ${canEdit?`<button onclick="editMemberName('${p.id}','${jsStr(p.display_name||'')}')" aria-label="แก้ไขชื่อ" style="background:none;border:none;cursor:pointer;color:var(--text3);padding:1px 4px;font-size:12px" title="แก้ไขชื่อ">✏️</button>`:''}
          </div>
          <div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.email)}${p.last_login?` · เข้าล่าสุด ${thDate(p.last_login?.slice(0,10))}`:''}</div>
          ${p.national_id?`<div style="font-size:11px;color:#78350f;font-family:monospace;margin-top:1px">🪪 ${maskNationalId(p.national_id)}</div>`:''}
          ${canDo('admin')?(p.confidentiality_accepted_at
            ?`<div style="font-size:11px;color:#166534;margin-top:1px">✍️ ยอมรับข้อตกลงล่าสุด ${thDate(String(p.confidentiality_accepted_at).slice(0,10))} ${new Date(p.confidentiality_accepted_at).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} น.</div>`
            :`<div style="font-size:11px;color:#b45309;margin-top:1px">⚠️ ยังไม่เคยยอมรับข้อตกลงรักษาความลับ</div>`):''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
      ${isSelf?`<span style="font-size:10px;color:var(--text3);padding:2px 8px;border-radius:20px;border:1px solid var(--border)">(คุณ)</span>`:canDo('admin')?`
      <select onchange="changeMemberRole('${p.id}',this.value)" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;font-family:'Sarabun',sans-serif">
        ${['admin','staff','aosomo','viewer'].map(r=>`<option value="${r}"${p.role===r?' selected':''}>${ROLE_LABEL[r]}</option>`).join('')}
      </select>
      ${p.role==='aosomo'&&p.email?.endsWith('@jithome.local')?`<button onclick="adminResetAosomoPassword('${p.id}','${jsStr(p.display_name||p.email)}')" aria-label="รีเซ็ตรหัสผ่าน" style="background:none;border:none;cursor:pointer;color:#d97706;padding:4px;font-size:16px;line-height:1" title="รีเซ็ตรหัสผ่าน">🔑</button>`:''}
      ${isSuspended
        ?`<button onclick="setMemberSuspended('${p.id}','${jsStr(p.display_name||p.email)}','${p.role}',false)" aria-label="เปิดใช้งานอีกครั้ง" title="เปิดใช้งานอีกครั้ง" style="padding:4px 10px;background:#166534;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;white-space:nowrap">▶️ เปิดใช้งาน</button>`
        :`<button onclick="setMemberSuspended('${p.id}','${jsStr(p.display_name||p.email)}','${p.role}',true)" aria-label="ระงับการใช้งาน" title="ระงับการใช้งานชั่วคราว" style="padding:4px 10px;background:#fff;color:#b45309;border:1px solid #f59e0b;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;white-space:nowrap">⏸️ ระงับ</button>`}
      <button onclick="deleteMember('${p.id}','${jsStr(p.display_name||p.email)}')" aria-label="ลบสมาชิก" style="background:none;border:none;cursor:pointer;color:#fca5a5;padding:4px;font-size:16px;line-height:1" title="ลบสมาชิก">🗑️</button>`:`
      <span style="font-size:11px;color:var(--text3);padding:2px 8px;border-radius:20px;border:1px solid var(--border)">${ROLE_LABEL[p.role]||p.role}</span>`}
      </div>
    </div>
    ${showVillage&&!isSelf?`
    <div style="margin-top:8px;display:flex;align-items:center;gap:6px;padding-top:8px;border-top:1px solid var(--border)">
      <span style="font-size:11px;color:var(--text3);white-space:nowrap">🏡 หมู่บ้าน:</span>
      <select onchange="changeMemberVillage('${p.id}',this.value)" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;font-family:'Sarabun',sans-serif;flex:1">
        <option value="">— ยังไม่กำหนด —</option>
        ${VILLAGES.map(v=>`<option value="${v}"${p.village===v?' selected':''}>${v}</option>`).join('')}
      </select>
    </div>`:''}
  </div>`
}
async function editMemberName(userId, currentName){
  const newName=prompt('แก้ไขชื่อ-นามสกุล (แสดงในระบบ):',currentName)
  if(newName===null)return
  const trimmed=newName.trim()
  if(!trimmed){alert('กรุณากรอกชื่อ');return}
  const{error}=await sb.from('user_profiles').update({display_name:trimmed}).eq('id',userId)
  if(error){alert('❌ บันทึกไม่สำเร็จ: '+error.message);return}
  if(userId===currentUser?.id){
    currentDisplayName=trimmed
    updateUserUI()
  }
  loadMembersList()
}

function staffDirectoryCard(s){
  return `
  <div style="background:var(--bg);border-radius:10px;padding:10px 14px;margin-bottom:6px;border:1px solid #ccfbf1;display:flex;align-items:center;justify-content:space-between;gap:8px">
    <div style="display:flex;align-items:center;gap:10px;min-width:0">
      <div style="width:32px;height:32px;border-radius:50%;background:#ccfbf1;color:#0d9488;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">${esc((s.name||'?').slice(0,2))}</div>
      <div>
        <div style="font-size:13px;font-weight:700">${esc(s.name)}</div>
        <div style="font-size:11px;color:var(--text3)">${esc(s.position||'—')}${s.phone?` · ${esc(s.phone)}`:''}</div>
      </div>
    </div>
    <button onclick="deleteStaffDirectory(${s.id})" aria-label="ลบรายชื่อเจ้าหน้าที่" style="background:none;border:none;cursor:pointer;color:#fca5a5;padding:4px;font-size:15px" title="ลบ">🗑️</button>
  </div>`
}

function aosomoDirectoryCard(a){
  return `
  <div style="background:var(--bg);border-radius:10px;padding:10px 14px;margin-bottom:6px;border:1px solid #ede9fe;display:flex;align-items:center;justify-content:space-between;gap:8px">
    <div style="display:flex;align-items:center;gap:10px;min-width:0">
      <div style="width:32px;height:32px;border-radius:50%;background:#ede9fe;color:#7c3aed;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">${esc((a.name||'?').slice(0,2))}</div>
      <div>
        <div style="font-size:13px;font-weight:700">${esc(a.name)}</div>
        <div style="font-size:11px;color:var(--text3)">${esc(a.village||'—')}${a.phone?` · ${esc(a.phone)}`:''}${a.line_id?` · <span style="color:#06C755">LINE: ${esc(a.line_id)}</span>`:''}</div>
      </div>
    </div>
    <button onclick="deleteAosomoDirectory(${a.id})" aria-label="ลบรายชื่อ อสม." style="background:none;border:none;cursor:pointer;color:#fca5a5;padding:4px;font-size:15px" title="ลบ">🗑️</button>
  </div>`
}

async function loadMembersList(){
  const[{data:profiles},{data:aosomoDir},{data:staffDir},{data:lockouts}]=await Promise.all([
    sb.from('user_profiles').select('*').order('created_at'),
    sb.from('aosomo_directory').select('*').order('village'),
    sb.from('staff_directory').select('*').order('name'),
    sb.from('login_lockouts').select('*').not('locked_until','is',null)
  ])
  // Build map of currently-locked emails
  window._activeLockouts={}
  ;(lockouts||[]).forEach(l=>{if(l.locked_until&&new Date(l.locked_until)>new Date())window._activeLockouts[l.email]=l})
  const all=profiles||[]
  const staffEl=document.getElementById('group-staff')
  const aosomoEl=document.getElementById('group-aosomo')
  const viewerEl=document.getElementById('group-viewer')
  const pendingEl=document.getElementById('group-pending')
  const pendingSection=document.getElementById('pending-section')
  if(!staffEl)return

  const pending=all.filter(p=>p.status==='pending')
  const active=p=>p.status!=='pending'&&p.status!=='rejected'&&p.status!=='deleted'
  const staff=all.filter(p=>(p.role==='staff'||p.role==='admin')&&active(p))
  const aosomo=all.filter(p=>p.role==='aosomo'&&active(p))
  const viewer=all.filter(p=>p.role==='viewer'&&active(p))

  if(pendingEl&&pendingSection){
    if(pending.length){
      pendingSection.style.display=''
      const _pfMap=await batchSignedUrls(pending.filter(p=>p.profile_file_url).map(p=>p.profile_file_url))
      pending.forEach(p=>{if(p.profile_file_url&&_pfMap[p.profile_file_url])p.profile_file_url=_pfMap[p.profile_file_url]})
      pendingEl.innerHTML=pending.map(p=>`
        <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:12px 14px;margin-bottom:8px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <div style="min-width:0;flex:1">
              <div style="font-size:13px;font-weight:700">${esc(p.display_name||p.email)}</div>
              <div style="font-size:11px;color:var(--text3)">📱 ${esc(p.email.replace('@jithome.local',''))} · 🏡 ${esc(p.village||'—')}</div>
              ${p.national_id?`<div style="font-size:11px;color:#78350f;font-family:monospace">🪪 ${maskNationalId(p.national_id)}</div>`:''}
              ${p.profile_file_url?`<a href="${safeUrl(p.profile_file_url)}" target="_blank" style="font-size:11px;color:#7c3aed;text-decoration:none">📎 ดูไฟล์แนบ</a>`:''}
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button onclick="approvePendingMember('${p.id}')" style="padding:6px 12px;background:#166534;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">✅ อนุมัติ</button>
              <button onclick="rejectPendingMember('${p.id}')" style="padding:6px 12px;background:#fff;color:#dc2626;border:1px solid #dc2626;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">❌ ปฏิเสธ</button>
            </div>
          </div>
        </div>`).join('')
    } else {
      pendingSection.style.display='none'
    }
  }

  const staffDirHtml=(staffDir||[]).length?`
    <div style="font-size:11px;font-weight:700;color:#0d9488;margin:12px 0 6px;padding-top:10px;border-top:2px dashed #ccfbf1">📋 รายชื่อเจ้าหน้าที่ที่นำเข้า (${staffDir.length} คน)</div>
    ${(staffDir||[]).map(staffDirectoryCard).join('')}`:''
  staffEl.innerHTML=(staff.length?staff.map(p=>memberCard(p,false)).join(''):'')+staffDirHtml||`<div style="color:var(--text3);font-size:12px;padding:8px 0">ยังไม่มีเจ้าหน้าที่</div>`

  const dirHtml=(aosomoDir||[]).length?`
    <div style="font-size:11px;font-weight:700;color:#7c3aed;margin:12px 0 6px;padding-top:10px;border-top:2px dashed #ede9fe">📋 รายชื่อ อสม. ที่นำเข้า (${aosomoDir.length} คน)</div>
    ${aosomoDir.map(aosomoDirectoryCard).join('')}`:''
  aosomoEl.innerHTML=(aosomo.length?aosomo.map(p=>memberCard(p,true)).join(''):'')+dirHtml||`<div style="color:var(--text3);font-size:12px;padding:8px 0">ยังไม่มีรายชื่อ</div>`

  viewerEl.innerHTML=viewer.length?viewer.map(p=>memberCard(p,false)).join(''):`<div style="color:var(--text3);font-size:12px;padding:8px 0">ยังไม่มีผู้สังเกตการณ์</div>`
}

async function approvePendingMember(userId){
  if(!confirm('อนุมัติสมาชิกคนนี้?'))return
  const{error}=await sb.from('user_profiles').update({status:'active'}).eq('id',userId)
  if(error){alert('❌ '+error.message);return}
  auditLog('member_approved','user_profile',userId,{by:currentDisplayName||currentRole})
  loadMembersList()
}

async function rejectPendingMember(userId){
  if(!confirm('ปฏิเสธและลบคำขอนี้?'))return
  const{error}=await sb.from('user_profiles').update({status:'rejected'}).eq('id',userId)
  if(error){alert('❌ '+error.message);return}
  auditLog('member_rejected','user_profile',userId,{by:currentDisplayName||currentRole})
  loadMembersList()
}

// ระงับ = เข้าระบบและเห็นข้อมูลไม่ได้ทันที (RLS ใช้ jh_role() ซึ่งนับเฉพาะ status active) แต่เก็บบัญชีไว้ เปิดคืนได้
async function setMemberSuspended(userId, displayName, role, suspend){
  if(!canDo('admin')){alert('ไม่มีสิทธิ์');return}
  if(userId===currentUser?.id){alert('ระงับบัญชีของตัวเองไม่ได้');return}
  if(suspend&&role==='admin'){
    const{count}=await sb.from('user_profiles').select('id',{count:'exact',head:true}).eq('role','admin').or('status.is.null,status.eq.active')
    if((count||0)<=1){alert('ระงับไม่ได้ — ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน');return}
  }
  const msg=suspend
    ?`ระงับการใช้งาน "${displayName}"?\n\n• เข้าระบบและดูข้อมูลไม่ได้ทันที (รวมถึงเครื่องที่เปิดค้างไว้)\n• ข้อมูลที่เคยบันทึกยังอยู่ครบ\n• เปิดใช้งานคืนได้ทุกเมื่อ`
    :`เปิดใช้งาน "${displayName}" อีกครั้ง?`
  if(!confirm(msg))return
  const{error}=await sb.from('user_profiles').update({status:suspend?'suspended':'active'}).eq('id',userId)
  if(error){alert('❌ ไม่สำเร็จ: '+error.message);return}
  auditLog(suspend?'member_suspended':'member_unsuspended','user_profile',userId,{name:displayName,by:currentDisplayName||currentRole})
  showToast(suspend?`⏸️ ระงับ "${displayName}" แล้ว`:`▶️ เปิดใช้งาน "${displayName}" แล้ว`)
  loadMembersList()
}

async function deleteMember(userId, displayName){
  if(!canDo('admin')){alert('ไม่มีสิทธิ์');return}
  if(!confirm(`ลบสมาชิก "${displayName}" ออกจากระบบ?\n\nสมาชิกจะไม่สามารถเข้าระบบได้อีก`))return
  const{error}=await sb.from('user_profiles').update({status:'deleted'}).eq('id',userId)
  if(error){alert('❌ ลบไม่สำเร็จ: '+error.message);return}
  // ลบออกจาก DOM ทันที
  document.querySelectorAll(`[data-member-id="${userId}"]`).forEach(el=>el.remove())
  sb.from('audit_logs').insert({
    user_id:currentUser?.id,user_email:currentUser?.email,user_name:currentDisplayName,
    action:'delete_member',entity_type:'user_profiles',entity_id:userId,
    details:{deleted_name:displayName}
  }).catch(()=>{})
  loadMembersList()
}

async function adminResetAosomoPassword(userId, displayName){
  if(!canDo('admin')){alert('ไม่มีสิทธิ์');return}
  if(!confirm(`รีเซ็ตรหัสผ่านสำหรับ "${displayName}"?\n\nระบบจะสร้างรหัสผ่านใหม่แบบสุ่ม\nคุณต้องแจ้ง อสม. คนนี้ด้วยตนเองหลังจากนี้`))return
  try{
    const{data:{session}}=await sb.auth.getSession()
    const res=await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/reset-aosomo-password`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${session?.access_token}`},
      body:JSON.stringify({targetUserId:userId})
    })
    const data=await res.json()
    if(!res.ok||data.error)throw new Error(data.error||'รีเซ็ตไม่สำเร็จ')
    auditLog('reset_password','user_profiles',userId,{target_name:displayName})
    const overlay=document.createElement('div')
    overlay.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px'
    overlay.innerHTML=`
      <div style="background:var(--card);border-radius:16px;padding:24px;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
        <div style="font-size:18px;font-weight:700;margin-bottom:4px">🔑 รหัสผ่านใหม่</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:14px">${esc(displayName)}</div>
        <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:14px 10px;text-align:center;margin-bottom:14px">
          <div id="_reset-pw" style="font-size:24px;font-weight:900;font-family:monospace;letter-spacing:3px;color:#166534">${esc(data.password)}</div>
        </div>
        <button id="_reset-copy" style="width:100%;padding:10px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;margin-bottom:8px">📋 คัดลอกรหัสผ่าน</button>
        <div style="font-size:11px;color:#dc2626;text-align:center;margin-bottom:14px">⚠️ แจ้ง อสม. ให้เรียบร้อยก่อนปิด — จะไม่แสดงอีก</div>
        <button id="_reset-close" style="width:100%;padding:10px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:14px;cursor:pointer;font-family:'Sarabun',sans-serif">ปิด</button>
      </div>`
    document.body.appendChild(overlay)
    overlay.querySelector('#_reset-copy').onclick=()=>{
      navigator.clipboard.writeText(data.password)
      overlay.querySelector('#_reset-copy').textContent='✅ คัดลอกแล้ว'
    }
    overlay.querySelector('#_reset-close').onclick=()=>overlay.remove()
  }catch(e){alert('❌ รีเซ็ตรหัสผ่านไม่สำเร็จ: '+e.message)}
}

async function importAosomoFile(input){
  const file=input.files[0];if(!file)return;input.value=''
  try{
    await loadXLSX()
    const data=await file.arrayBuffer()
    const wb=XLSX.read(data)
    const ws=wb.Sheets[wb.SheetNames[0]]
    const rows=XLSX.utils.sheet_to_json(ws,{header:1}).filter(r=>r.length>0)
    if(rows.length<2){alert('ไม่พบข้อมูล (ต้องมีแถว header และข้อมูลอย่างน้อย 1 แถว)');return}
    const records=rows.slice(1).filter(r=>r[0]).map(r=>({
      name:String(r[0]||'').trim(),
      village:String(r[1]||'').trim(),
      phone:String(r[2]||'').trim()||null,
      line_id:String(r[3]||'').trim()||null,
    })).filter(r=>r.name)
    if(!records.length){alert('ไม่พบรายชื่อในไฟล์');return}
    if(!confirm(`นำเข้า ${records.length} รายชื่อ อสม. ใช่หรือไม่?`))return
    const{error}=await sb.from('aosomo_directory').insert(records)
    if(error)throw error
    auditLog('import_aosomo_directory','aosomo_directory',null,{count:records.length})
    alert(`✅ นำเข้าสำเร็จ ${records.length} รายชื่อ`)
    loadMembersList()
  }catch(e){alert('❌ เกิดข้อผิดพลาด: '+e.message)}
}

async function deleteAosomoDirectory(id){
  if(!confirm('ลบรายชื่อนี้?'))return
  const{error}=await sb.from('aosomo_directory').delete().eq('id',id)
  if(error){alert('❌ '+error.message);return}
  loadMembersList()
}

async function importStaffDirFile(input){
  const file=input.files[0];if(!file)return;input.value=''
  try{
    await loadXLSX()
    const data=await file.arrayBuffer()
    const wb=XLSX.read(data)
    const ws=wb.Sheets[wb.SheetNames[0]]
    const rows=XLSX.utils.sheet_to_json(ws,{header:1}).filter(r=>r.length>0)
    if(rows.length<2){alert('ไม่พบข้อมูล (ต้องมีแถว header และข้อมูลอย่างน้อย 1 แถว)');return}
    const records=rows.slice(1).filter(r=>r[0]).map(r=>({
      name:String(r[0]||'').trim(),
      position:String(r[1]||'').trim(),
      phone:String(r[2]||'').trim(),
    })).filter(r=>r.name)
    if(!records.length){alert('ไม่พบรายชื่อในไฟล์');return}
    if(!confirm(`นำเข้า ${records.length} รายชื่อเจ้าหน้าที่ ใช่หรือไม่?`))return
    const{error}=await sb.from('staff_directory').insert(records)
    if(error)throw error
    auditLog('import_staff_directory','staff_directory',null,{count:records.length})
    alert(`✅ นำเข้าสำเร็จ ${records.length} รายชื่อ`)
    loadMembersList()
  }catch(e){alert('❌ เกิดข้อผิดพลาด: '+e.message)}
}

async function mergeAndSavePatients(records, confirmMsg){
  if(!records.length){alert('ไม่พบรายชื่อในไฟล์');return false}
  if(!confirm(confirmMsg))return false
  // fetch existing patients to merge
  const{data:existing}=await sb.from('patients').select('id,name,house_no,village,note,national_id,disease_code,disease_name,visit_interval,inject_interval,medication_name')
  const exMap={}
  existing?.forEach(p=>{exMap[p.name]=p})
  // deduplicate records by name (last row wins within file)
  const recMap={}
  for(const rec of records)recMap[rec.name]=rec
  const deduped=Object.values(recMap)
  const toInsert=[]
  const toUpdate=[]
  for(const rec of deduped){
    const ex=exMap[rec.name]
    if(!ex){toInsert.push(rec)}
    else{
      // fill only empty fields, keep existing data
      const upd={
        house_no:ex.house_no||rec.house_no||'',
        village:ex.village||rec.village||'',
        note:ex.note||rec.note||'',
        national_id:ex.national_id||rec.national_id||null,
        disease_code:ex.disease_code||rec.disease_code||null,
        disease_name:ex.disease_name||rec.disease_name||null,
        visit_interval:ex.visit_interval??rec.visit_interval??null,
        inject_interval:ex.inject_interval??rec.inject_interval??null,
        medication_name:ex.medication_name||rec.medication_name||null,
      }
      toUpdate.push({id:ex.id,...upd})
    }
  }
  const batchSize=50
  for(let i=0;i<toInsert.length;i+=batchSize){
    const{error}=await sb.from('patients').insert(toInsert.slice(i,i+batchSize))
    if(error)throw error
  }
  // อัปเดตพร้อมกันครั้งละ 10 แถว (เดิมทีละแถว — 200 แถว = 200 รอบ)
  const concurrency=10
  for(let i=0;i<toUpdate.length;i+=concurrency){
    const results=await Promise.all(toUpdate.slice(i,i+concurrency).map(({id,...fields})=>
      sb.from('patients').update(fields).eq('id',id)))
    const failed=results.find(r=>r.error)
    if(failed)throw failed.error
  }
  alert(`✅ นำเข้าสำเร็จ\nใหม่: ${toInsert.length} ราย | อัปเดต: ${toUpdate.length} ราย`)
  await loadPatients()
  return true
}

async function importPatientFile(input){
  const file=input.files[0];if(!file)return;input.value=''
  try{
    await loadXLSX()
    const data=await file.arrayBuffer()
    const wb=XLSX.read(data)
    const ws=wb.Sheets[wb.SheetNames[0]]
    const rows=XLSX.utils.sheet_to_json(ws,{header:1}).filter(r=>r.length>0)
    if(rows.length<2){alert('ไม่พบข้อมูล (ต้องมีแถว header และข้อมูลอย่างน้อย 1 แถว)');return}
    const records=rows.slice(1).filter(r=>r[0]).map(r=>({
      name:String(r[0]||'').trim(),
      house_no:String(r[1]||'').trim(),
      village:String(r[2]||'').trim()||'หมู่ 1',
      note:String(r[3]||'').trim(),
      national_id:String(r[4]||'').replace(/\D/g,'').slice(0,13)||null,
      disease_code:String(r[5]||'').trim()||null,
      disease_name:String(r[6]||'').trim()||null,
      visit_interval:parseInt(r[7])||null,
      inject_interval:parseInt(r[8])||null,
      medication_name:String(r[9]||'').trim()||null,
    })).filter(r=>r.name)
    await mergeAndSavePatients(records,`นำเข้า ${records.length} รายชื่อผู้ป่วย ใช่หรือไม่?`)
  }catch(e){alert('❌ เกิดข้อผิดพลาด: '+e.message)}
}

async function importHospitalFile(input){
  const file=input.files[0];if(!file)return;input.value=''
  try{
    await loadXLSX()
    const data=await file.arrayBuffer()
    const wb=XLSX.read(data)
    const ws=wb.Sheets[wb.SheetNames[0]]
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''}).filter(r=>r.length>1)
    if(rows.length<2){alert('ไม่พบข้อมูล');return}
    // C=ชื่อ D=สกุล E=เลขบัตร G=เลขที่ H=namemooban I=subdistrict J=district K=province L=รหัสโรค M=ชื่อโรค N=สี
    const colorMap={'เขียว':'green','เหลือง':'yellow','แดง':'red','ส้ม':'yellow'}
    const records=rows.slice(1).filter(r=>String(r[2]||'').trim()).map(r=>{
      const firstName=String(r[2]||'').trim()
      const lastName=String(r[3]||'').trim()
      const name=firstName+(lastName?' '+lastName:'')
      const house_no=String(r[6]||'').trim()
      const nid=String(r[4]||'').replace(/\D/g,'').slice(0,13)||null
      const namemooban=String(r[7]||'').trim()
      const mMatch=namemooban.match(/หมู่(?:ที่)?\s*(\d+)/)
      const village=mMatch?`หมู่ ${mMatch[1]}`:''
      const subdistrict=String(r[8]||'').trim()
      const district=String(r[9]||'').trim()
      const province=String(r[10]||'').trim()
      const disease_code=String(r[11]||'').trim()
      const disease_name=String(r[12]||'').trim()
      const addressParts=[namemooban,subdistrict&&`ต.${subdistrict}`,district&&`อ.${district}`,province&&`จ.${province}`].filter(Boolean)
      const note=[...new Set(addressParts)].join(' ')
      const colorTh=String(r[13]||'').trim()
      const group_color=colorMap[colorTh]||'yellow'
      const rec={name,house_no,village,note,group_color,disease_code,disease_name}
      if(nid)rec.national_id=nid
      return rec
    }).filter(r=>r.name)
    await mergeAndSavePatients(records,`นำเข้า ${records.length} รายชื่อผู้ป่วย (รูปแบบ HOSxP/JHCIS) ใช่หรือไม่?`)
  }catch(e){alert('❌ เกิดข้อผิดพลาด: '+e.message)}
}

async function deleteStaffDirectory(id){
  if(!confirm('ลบรายชื่อนี้?'))return
  const{error}=await sb.from('staff_directory').delete().eq('id',id)
  if(error){alert('❌ '+error.message);return}
  loadMembersList()
}

async function changeMemberRole(userId,role){
  if(!canDo('admin')){alert('🔒 ไม่มีสิทธิ์เปลี่ยน role');return}
  const{error}=await sb.from('user_profiles').update({role}).eq('id',userId)
  if(error){alert('เกิดข้อผิดพลาด: '+error.message);return}
  auditLog('member_role_changed','user_profile',userId,{new_role:role,by:currentDisplayName||currentRole})
  await loadMembersList()
}

async function changeMemberVillage(userId,village){
  const{error}=await sb.from('user_profiles').update({village}).eq('id',userId)
  if(error){alert('เกิดข้อผิดพลาด: '+error.message);return}
  auditLog('change_village','user_profiles',userId,{village,by:currentDisplayName||currentRole})
  await loadMembersList()
}

async function toggleSetting(key,val){
  await sb.from('app_settings').upsert({setting_key:key,setting_value:val?'1':'0'},{onConflict:'setting_key'})
}

// แจ้งเตือน LINE / Telegram ผ่าน Edge Function "notify" — token อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น
const NOTIFY_FUNC_URL = `${SUPABASE_URL}/functions/v1/notify`
async function callNotify(kind,message){
  const{data:{session}}=await sb.auth.getSession()
  if(!session)throw new Error('กรุณาเข้าสู่ระบบ')
  const res=await fetchWithTimeout(NOTIFY_FUNC_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${session.access_token}`},
    body:JSON.stringify({kind,message})
  })
  const data=await res.json().catch(()=>({}))
  if(!res.ok||data.error)throw new Error(data.error||'ส่งไม่สำเร็จ')
  return data
}

async function saveLineSettings(){
  const token=(document.getElementById('line-token-input')?.value||'').trim()
  const groupId=(document.getElementById('line-groupid-input')?.value||'').trim()
  const btn=document.getElementById('line-save-btn')
  const status=document.getElementById('line-status')
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  const errs=[]
  if(token){const{error}=await sb.from('app_settings').upsert({setting_key:'line_token',setting_value:token},{onConflict:'setting_key'});if(error)errs.push(error.message)}
  if(groupId){const{error}=await sb.from('app_settings').upsert({setting_key:'line_group_id',setting_value:groupId},{onConflict:'setting_key'});if(error)errs.push(error.message)}
  btn.disabled=false;btn.textContent='💾 บันทึก'
  if(errs.length){status.style.color='var(--red)';status.textContent='❌ '+errs.join(', ')}
  else{status.style.color='var(--green)';status.textContent='✅ บันทึกสำเร็จ'}
}

async function testLine(){
  const btn=document.getElementById('line-test-btn')
  const status=document.getElementById('line-status')
  btn.disabled=true;btn.textContent='กำลังส่ง...'
  try{
    await callNotify('test_line',`🏥 JitHome ทดสอบแจ้งเตือน LINE\nระบบติดตามผู้ป่วยจิตเวช ${hospitalName}\nเวลา: ${new Date().toLocaleString('th-TH')}`)
    status.style.color='var(--green)';status.textContent='✅ ส่งสำเร็จ! ตรวจสอบกลุ่ม LINE ได้เลย'
  }catch(e){status.style.color='var(--red)';status.textContent='❌ '+e.message}
  btn.disabled=false;btn.textContent='📨 ทดสอบส่ง'
}

async function sendLineVisitReport(visitData){
  try{
    const msg=`🏡 รายงานเยี่ยมบ้าน — ${visitData.visit_type==='staff'?'เจ้าหน้าที่':'อสม.'}\n👤 ${visitData.patient_name} (${visitData.village})\n📅 ${visitData.visit_date}\n👩‍⚕️ ผู้เยี่ยม: ${visitData.visitor||'-'}\n✅ ผ่าน: ${visitData.score} รายการ${visitData.refer?'\n⚠️ ส่งต่อ/รายงานเร่งด่วน':''}`
    await callNotify('visit_report',msg) // เซิร์ฟเวอร์ข้ามให้เองถ้าปิด line_enabled
  }catch(e){console.warn('LINE notify error:',e)}
}

async function sendReferralToHospital(visitData){
  try{
    const d=visitData
    const colorIcon={'red':'🔴','yellow':'🟡','green':'🟢'}[d.group_color]||'⚪'
    const oasMax=Math.max(d.oasScores?.s1||0,d.oasScores?.s2||0,d.oasScores?.s3||0)
    const oasSection=oasMax>0?`\n━━━━━━━━━━━━━━━\n📊 OAS พฤติกรรมก้าวร้าว (ระดับสูงสุด: ${oasMax})\n• ต่อตนเอง: ${d.oasScores.s1} — ${(d.oasLabels?.s1||[])[d.oasScores.s1]||''}\n• ต่อผู้อื่น: ${d.oasScores.s2} — ${(d.oasLabels?.s2||[])[d.oasScores.s2]||''}\n• ต่อทรัพย์สิน: ${d.oasScores.s3} — ${(d.oasLabels?.s3||[])[d.oasScores.s3]||''}`:''
    const checkSection=d.checkFull?.length?`\n━━━━━━━━━━━━━━━\n📝 รายการตรวจสอบ (${d.score}/${d.checkFull.length})\n${d.checkFull.join('\n')}`:''
    const a10Section=d.assess10Full?.length?`\n━━━━━━━━━━━━━━━\n📋 แบบติดตาม 10 ด้าน (${d.assess10Total}/30 — ${d.assess10Level})\n${d.assess10Full.map((l,i)=>`${i+1}. ${l}`).join('\n')}`:''
    const rfSection=d.redFlags?.length?`\n━━━━━━━━━━━━━━━\n🚩 Red Flags (${d.redFlags.length} รายการ)\n${d.redFlags.map(r=>`• ${r}`).join('\n')}`:''
    const noteSection=d.note?`\n━━━━━━━━━━━━━━━\n📄 บันทึกเพิ่มเติม\n${d.note.split('\n').slice(0,3).join('\n')}`:''
    const msg=[
      `🏥 ใบส่งต่อ รพ. แม่ข่าย`,
      `━━━━━━━━━━━━━━━`,
      `👤 ${d.patient_name}`,
      `🏠 ${d.house_no?d.house_no+' ':''} ${d.village}`,
      d.national_id?(()=>{const n=(d.national_id||'').replace(/\D/g,'').padEnd(13,'?');const fmt=s=>`${s.slice(0,1)}-${s.slice(1,5)}-${s.slice(5,10)}-${s.slice(10,12)}-${s.slice(12,13)}`;return`🪪 บัตรประชาชน: ${fmt('X'.repeat(4)+n.slice(4,8)+'X'.repeat(5))}`})():'',
      d.disease_code||d.disease_name?`🦠 โรค: ${[d.disease_code,d.disease_name].filter(Boolean).join(' — ')}`:'',
      d.group_label?`${colorIcon} กลุ่ม: ${d.group_label}`:'',
      d.medication_name?`💊 ยา: ${d.medication_name}`:'',
      d.next_date?`📅 นัดครั้งถัดไป: ${thDate(d.next_date)}`:'',
      `━━━━━━━━━━━━━━━`,
      `📅 วันที่เยี่ยม: ${d.visit_date}`,
      `👩‍⚕️ เจ้าหน้าที่: ${d.visitor||'-'}`,
      checkSection, oasSection, a10Section, rfSection, noteSection,
      `━━━━━━━━━━━━━━━`,
      `⚠️ ต้องการส่งต่อ/รายงานเร่งด่วน`,
      `🏥 ${hospitalName}`,
    ].filter(Boolean).join('\n')
    await callNotify('referral',msg) // เซิร์ฟเวอร์ส่งตามช่องทางที่ตั้งค่าไว้
  }catch(e){console.warn('Referral notify error:',e)}
}

async function saveReferSettings(){
  const lineGroupId=(document.getElementById('refer-line-groupid-input')?.value||'').trim()
  const lineToken=(document.getElementById('refer-line-token-input')?.value||'').trim()
  const tgChatId=(document.getElementById('refer-tg-chatid-input')?.value||'').trim()
  const tgToken=(document.getElementById('refer-tg-token-input')?.value||'').trim()
  const btn=document.getElementById('refer-save-btn')
  const status=document.getElementById('refer-status')
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  const errs=[]
  const saves=[['refer_line_group_id',lineGroupId],['refer_line_token',lineToken],['refer_telegram_chatid',tgChatId],['refer_telegram_token',tgToken]]
  for(const[k,v] of saves){
    if(v){const{error}=await sb.from('app_settings').upsert({setting_key:k,setting_value:v},{onConflict:'setting_key'});if(error)errs.push(error.message)}
  }
  btn.disabled=false;btn.textContent='💾 บันทึก'
  if(errs.length){status.style.color='var(--red)';status.textContent='❌ '+errs.join(', ')}
  else{status.style.color='var(--green)';status.textContent='✅ บันทึกสำเร็จ'}
}

async function testReferNotify(){
  // ทดสอบด้วยค่าที่ "บันทึกแล้ว" — กดบันทึกก่อนทดสอบ
  const btn=document.getElementById('refer-test-btn')
  const status=document.getElementById('refer-status')
  btn.disabled=true;btn.textContent='กำลังส่ง...'
  const testMsg=`🏥 ทดสอบ — ใบส่งต่อ รพ. แม่ข่าย\n👤 ผู้ป่วยทดสอบ (หมู่ 1)\n📅 ${todayISO()}  🏥 เจ้าหน้าที่: admin\n✅ รายการผ่าน: 6 ข้อ\n📊 OAS ระดับ 2\n📋 แบบ10ด้าน: 22/30 — ต้องติดตาม\n⚠️ ต้องการส่งต่อ/รายงานเร่งด่วน — ${hospitalName}`
  const errs=[]
  try{await callNotify('test_referral',testMsg)}catch(e){errs.push(e.message)}
  btn.disabled=false;btn.textContent='📨 ทดสอบส่ง'
  if(errs.length){status.style.color='var(--red)';status.textContent='❌ '+errs.join(' | ')}
  else{status.style.color='var(--green)';status.textContent='✅ ส่งสำเร็จ! ตรวจสอบกลุ่ม รพ. แม่ข่าย'}
}

async function saveTelegramSettings(){
  const chatid=(document.getElementById('telegram-chatid-input')?.value||'').trim()
  const token=(document.getElementById('telegram-token-input')?.value||'').trim()
  const btn=document.getElementById('tg-save-btn')
  const status=document.getElementById('tg-status')
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  const errs=[]
  if(chatid){const{error}=await sb.from('app_settings').upsert({setting_key:'telegram_chatid',setting_value:chatid},{onConflict:'setting_key'});if(error)errs.push(error.message)}
  if(token){const{error}=await sb.from('app_settings').upsert({setting_key:'telegram_token',setting_value:token},{onConflict:'setting_key'});if(error)errs.push(error.message)}
  if(chatid||token){
    const nsUpdate={enabled:true,...(chatid&&{telegram_chat_id:chatid}),...(token&&{telegram_bot_token:token})}
    const{error}=await sb.from('notification_settings').update(nsUpdate).gte('id',1)
    if(error)errs.push(error.message)
  }
  if(errs.length){status.style.color='var(--red)';status.textContent='❌ '+errs.join(', ');btn.textContent='💾 บันทึก';btn.disabled=false;return}
  status.style.color='var(--green)';status.textContent='✅ บันทึกสำเร็จ'
  btn.textContent='✅ บันทึกแล้ว'
  setTimeout(()=>{btn.textContent='💾 บันทึก';btn.disabled=false;status.textContent=''},2500)
}

async function testTelegram(){
  // ทดสอบด้วยค่าที่ "บันทึกแล้ว" — กดบันทึกก่อนทดสอบ
  const btn=document.getElementById('tg-test-btn')
  const status=document.getElementById('tg-status')
  btn.disabled=true;btn.textContent='กำลังส่ง...'
  status.style.color='var(--text3)';status.textContent='กำลังทดสอบ...'
  try{
    const msg=`🏥 JitHome ทดสอบการแจ้งเตือน\n\nระบบติดตามผู้ป่วยจิตเวช\nโรงพยาบาล: ${hospitalName}\n\n✅ เชื่อมต่อสำเร็จ!`
    const data=await callNotify('test_telegram',msg).then(()=>({ok:true}),e=>({ok:false,description:e.message}))
    if(data.ok){
      status.style.color='var(--green)';status.textContent='✅ ส่งสำเร็จ! ตรวจสอบกลุ่ม Telegram ได้เลย'
      btn.textContent='✅ สำเร็จ'
    } else {
      status.style.color='var(--red)';status.textContent='❌ '+( data.description||'ส่งไม่สำเร็จ')
      btn.textContent='📨 ทดสอบส่ง'
    }
  }catch(e){
    status.style.color='var(--red)';status.textContent='❌ '+e.message
    btn.textContent='📨 ทดสอบส่ง'
  }
  btn.disabled=false
}

async function generateMonthlyReport(){
  const now=new Date()
  const y=now.getFullYear(),m=now.getMonth()
  const monthStart=new Date(y,m,1).toISOString().split('T')[0]
  const monthEnd=new Date(y,m+1,1).toISOString().split('T')[0]
  const thMonth=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
  const monthLabel=`${thMonth[m]} ${y+543}`
  const[{data:visits},{data:docAppts}]=await Promise.all([
    sb.from('home_visits').select('visit_type,village,refer,refer_resolved,visitor').gte('visit_date',monthStart).lt('visit_date',monthEnd),
    sb.from('doctor_appointments').select('patient_id,appoint_date,status').gte('appoint_date',monthStart).lt('appoint_date',monthEnd)
  ])
  const pts=allPatients
  const overdue=pts.filter(p=>parseInt(p.days_until)<0)
  const byVillage={}
  pts.forEach(p=>{byVillage[p.village]=(byVillage[p.village]||0)+1})
  const staffVisits=(visits||[]).filter(v=>v.visit_type==='staff')
  const aosomoVisits=(visits||[]).filter(v=>v.visit_type==='aosomo')
  const refers=(visits||[]).filter(v=>v.refer)
  const villageRows=Object.entries(byVillage).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true}))
    .map(([v,n])=>`<tr><td>${esc(v)}</td><td style="text-align:center">${n}</td></tr>`).join('')
  const overdueRows=overdue.slice(0,20).map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.village||'')}</td><td style="text-align:center;color:#b91c1c">${Math.abs(parseInt(p.days_until||0))} วัน</td></tr>`).join('')
  const html=`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
  <title>รายงานสรุป ${monthLabel}</title>
  <style>
    body{font-family:'Sarabun',sans-serif;margin:0;padding:24px;color:#111;font-size:13px}
    h1{font-size:20px;font-weight:800;color:#0a7ea4;margin:0 0 4px}
    h2{font-size:14px;font-weight:700;color:#374151;margin:20px 0 8px;border-bottom:1.5px solid #e5e7eb;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-bottom:8px}
    th{background:#f3f4f6;font-weight:700;padding:6px 10px;text-align:left;font-size:12px}
    td{padding:5px 10px;border-bottom:1px solid #f3f4f6;font-size:12px}
    .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:8px}
    .stat{background:#f9fafb;border-radius:8px;padding:10px;text-align:center;border:1px solid #e5e7eb}
    .stat-n{font-size:24px;font-weight:800;color:#0a7ea4}
    .stat-l{font-size:11px;color:#6b7280;margin-top:2px}
    .red{color:#b91c1c}.green{color:#15803d}
    @media print{body{padding:12px}button{display:none}}
  </style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
    <div><h1>รายงานสรุปรายเดือน</h1><div style="color:#6b7280;font-size:12px">${esc(hospitalName)} · ประจำเดือน ${monthLabel}</div></div>
    <button onclick="window.print()" style="padding:8px 18px;background:#0a7ea4;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">🖨️ พิมพ์ / บันทึก PDF</button>
  </div>
  <h2>📊 ภาพรวมผู้ป่วย</h2>
  <div class="stat-grid">
    <div class="stat"><div class="stat-n">${pts.length}</div><div class="stat-l">ผู้ป่วยทั้งหมด</div></div>
    <div class="stat"><div class="stat-n red">${overdue.length}</div><div class="stat-l">เกินนัด</div></div>
    <div class="stat"><div class="stat-n">${staffVisits.length}</div><div class="stat-l">เยี่ยมบ้าน (เจ้าหน้าที่)</div></div>
    <div class="stat"><div class="stat-n">${aosomoVisits.length}</div><div class="stat-l">เยี่ยมบ้าน (อสม.)</div></div>
  </div>
  <div class="stat-grid">
    <div class="stat"><div class="stat-n">${(docAppts||[]).length}</div><div class="stat-l">นัดพบแพทย์</div></div>
    <div class="stat"><div class="stat-n red">${refers.length}</div><div class="stat-l">ส่งต่อ รพ.</div></div>
    <div class="stat"><div class="stat-n green">${pts.filter(p=>parseInt(p.days_until||0)>=0&&parseInt(p.days_until||0)<=7).length}</div><div class="stat-l">นัดใน 7 วัน</div></div>
    <div class="stat"><div class="stat-n">${Object.keys(byVillage).length}</div><div class="stat-l">หมู่บ้าน</div></div>
  </div>
  ${overdue.length?`<h2>⚠️ ผู้ป่วยเกินนัด (${overdue.length} ราย)</h2>
  <table><tr><th>ชื่อ-นามสกุล</th><th>หมู่บ้าน</th><th style="text-align:center">เกินนัด</th></tr>${overdueRows}${overdue.length>20?`<tr><td colspan="3" style="color:#6b7280;text-align:center">...และอีก ${overdue.length-20} ราย</td></tr>`:''}</table>`:''}
  <h2>🏘️ ผู้ป่วยแยกตามหมู่บ้าน</h2>
  <table><tr><th>หมู่บ้าน</th><th style="text-align:center">จำนวน</th></tr>${villageRows}</table>
  <div style="margin-top:20px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px">พิมพ์โดย: ${esc(currentDisplayName)} · ${new Date().toLocaleString('th-TH')} · JitHome</div>
  </body></html>`
  const w=window.open('','_blank','width=800,height=700')
  if(!w){showToast('❌ กรุณาอนุญาต Popup สำหรับไซต์นี้ แล้วลองใหม่',4000);return}
  auditLog('print_monthly_report','report',null)
  w.document.write(html)
  w.document.close()
}

async function showPatientTimeline(id,name){
  const[{data:visits},{data:injRecs},{data:docAppts}]=await Promise.all([
    sb.from('home_visits').select('visit_date,visit_type,visitor,note,refer,score,assessment_json').eq('patient_id',id).order('visit_date',{ascending:false}),
    sb.from('injection_records').select('injection_date,interval_str,note,record_type').eq('patient_id',id).order('injection_date',{ascending:false}),
    sb.from('doctor_appointments').select('appoint_date,appoint_type,hospital,doctor_name,note,status').eq('patient_id',id).order('appoint_date',{ascending:false})
  ])
  const today=todayISO()
  const all=[
    ...(visits||[]).map(v=>({date:v.visit_date,type:'visit',sub:v.visit_type,label:v.visit_type==='aosomo'?'🏡 เยี่ยมบ้าน อสม.':'🏠 เยี่ยมบ้าน เจ้าหน้าที่',note:v.note,extra:v.visitor?`โดย ${v.visitor}`:'',refer:v.refer,score:v.score,future:v.visit_date>today})),
    ...(injRecs||[]).map(r=>({date:r.injection_date,type:r.record_type||'inject',label:r.record_type==='visit'?'🏡 เยี่ยมบ้าน':'💉 ฉีดยา',note:r.note,extra:r.interval_str?`นัดถัดไป: ${r.interval_str}`:'',future:r.injection_date>today})),
    ...(docAppts||[]).map(a=>({date:a.appoint_date,type:'doctor',label:'🏥 พบแพทย์',note:a.note,extra:[a.hospital,a.doctor_name].filter(Boolean).join(' · '),future:a.appoint_date>today}))
  ].sort((a,b)=>b.date.localeCompare(a.date))
  const typeColor={visit:'#0d9488',aosomo:'#7c3aed',inject:'#0a7ea4',doctor:'#ea580c'}
  const rows=all.map(r=>{
    const c=r.type==='visit'?(r.sub==='aosomo'?typeColor.aosomo:typeColor.visit):r.type==='doctor'?typeColor.doctor:typeColor.inject
    const dParts=r.date.split('-')
    const dTh=dParts.length===3?`${parseInt(dParts[2])} ${['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][parseInt(dParts[1])]} ${parseInt(dParts[0])+543}`:r.date
    return`<div style="display:flex;gap:12px;margin-bottom:12px;${r.future?'opacity:.7':''}">
      <div style="display:flex;flex-direction:column;align-items:center">
        <div style="width:32px;height:32px;border-radius:50%;background:${c}20;border:2px solid ${c};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${r.label.split(' ')[0]}</div>
        <div style="width:2px;flex:1;background:#e5e7eb;margin-top:4px"></div>
      </div>
      <div style="flex:1;padding-bottom:8px">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:700;color:${c}">${r.label.split(' ').slice(1).join(' ')}</span>
          ${r.future?'<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:4px;font-weight:700">📅 นัดหมาย</span>':''}
          ${r.refer?'<span style="font-size:10px;background:#fef2f2;color:#b91c1c;padding:1px 6px;border-radius:4px;font-weight:700">🏥 ส่งต่อ</span>':''}
        </div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">${dTh}${r.extra?` · ${esc(r.extra)}`:''}</div>
        ${r.note?`<div style="font-size:11px;color:#374151;background:#f9fafb;border-radius:6px;padding:5px 8px;margin-top:4px;line-height:1.5">${esc(r.note.slice(0,120))}${r.note.length>120?'...':''}</div>`:''}
      </div>
    </div>`}).join('')
  const w=window.open('','_blank','width=480,height=700')
  if(!w){showToast('❌ กรุณาอนุญาต Popup สำหรับไซต์นี้ แล้วลองใหม่',4000);return}
  auditLog('print_patient_timeline','patient',id,{name})
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>Timeline — ${esc(name)}</title>
  <style>body{font-family:'Sarabun',sans-serif;margin:0;padding:20px;background:#f9fafb;color:#111}
  h2{font-size:16px;font-weight:800;margin:0 0 4px;color:#0a7ea4}
  @media print{.no-print{display:none}}</style>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
  </head><body>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div><h2>📅 Timeline การรักษา</h2><div style="font-size:12px;color:#6b7280">${esc(name)} · ${all.length} รายการ</div></div>
    <button class="no-print" onclick="window.print()" style="padding:6px 14px;background:#0a7ea4;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">🖨️ พิมพ์</button>
  </div>
  ${all.length?rows:'<div style="text-align:center;padding:40px;color:#9ca3af">ยังไม่มีประวัติการรักษา</div>'}
  </body></html>`)
  w.document.close()
}

async function sendTelegramReport(){
  const btn=document.getElementById('tg-report-btn')
  const status=document.getElementById('tg-report-status')
  if(!btn||!status)return
  btn.disabled=true;btn.textContent='กำลังส่ง...'
  status.style.color='var(--text3)';status.textContent='กำลังส่งรายงาน...'
  try{
    const{data,error}=await sb.rpc('send_overdue_notification')
    if(error)throw new Error(error.message)
    status.style.color='var(--green)'
    status.textContent='✅ ส่งรายงานสำเร็จ! ตรวจสอบกลุ่ม Telegram ได้เลย'
    btn.textContent='✅ ส่งสำเร็จ'
    setTimeout(()=>{btn.textContent='📣 ส่งรายงาน Telegram ตอนนี้';btn.disabled=false},3000)
    return
  }catch(e){
    status.style.color='var(--red)';status.textContent='❌ '+e.message
    btn.textContent='📣 ส่งรายงาน Telegram ตอนนี้'
  }
  btn.disabled=false
}

async function saveTokenSetting(key,inputId,btnId){
  const val=(document.getElementById(inputId)?.value||'').trim()
  const btn=document.getElementById(btnId)
  const origText=btn.textContent
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  const{error}=await sb.from('app_settings').upsert({setting_key:key,setting_value:val},{onConflict:'setting_key'})
  if(error){
    console.error('saveTokenSetting error:',error)
    alert('❌ บันทึกไม่สำเร็จ:\n'+error.message)
    btn.textContent=origText;btn.disabled=false;return
  }
  btn.textContent='✅ บันทึกแล้ว'
  setTimeout(()=>{btn.textContent=origText;btn.disabled=false},2000)
}

function appendNote(text){const ta=document.getElementById('adm-note');if(ta)ta.value=ta.value?ta.value+' · '+text:text}

async function saveAdminRecord(){
  const name=document.getElementById('adm-name')?.value?.trim()
  const village=document.getElementById('adm-village')?.value
  const groupStr=document.getElementById('adm-group')?.value
  const date=document.getElementById('adm-date')?.value
  const note=document.getElementById('adm-note')?.value?.trim()||''
  const btn=document.getElementById('adm-btn')
  if(!name||!date){alert('กรุณากรอกชื่อและวันที่');return}
  const gc2=parseGroupColor(groupStr)
  const gl2={red:'สุขภาพจิต กลุ่ม สีแดง',yellow:'สุขภาพจิต กลุ่ม สีเหลือง',green:'สุขภาพจิต กลุ่ม สีเขียว'}[gc2]
  const {interval_str,interval_days}=getIntervalAndDays('adm-date','adm-interval','adm-next-date')
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  try{
    await sb.from('patients').upsert({name,village},{onConflict:'name'})
    const{data:found}=await sb.from('patients').select('id').eq('name',name).single()
    if(!found)throw new Error('ไม่พบผู้ป่วย')
    await sb.from('patients').update({village}).eq('id',found.id)
    const record_type=document.querySelector('input[name="adm-type"]:checked')?.value||'injection'
    const{data:newRec,error}=await sb.from('injection_records').insert({patient_id:found.id,injection_date:date,group_color:gc2,group_label:gl2,interval_str,interval_days,note,record_type,recorded_by:currentDisplayName||null}).select('id').single()
    if(error)throw error
    auditLog('create_record','injection_records',newRec?.id,{patient_name:name,record_type,injection_date:date})
    _markOwnWrite(found.id)
    if(newRec)_markOwnWrite(newRec.id)
    btn.textContent='✅ บันทึกสำเร็จ'
    document.getElementById('adm-name').value=''
    document.getElementById('adm-note').value=''
    allPatients=await getPatients()
    setTimeout(()=>{btn.textContent='บันทึกนัดหมาย';btn.disabled=false},2500)
  }catch(e){btn.textContent='❌ '+(e.message||'ผิดพลาด');btn.disabled=false}
}

async function saveSettings(){
  const val=document.getElementById('s-hospital')?.value?.trim()
  const sub1=document.getElementById('s-subtitle-1')?.value?.trim()||''
  const sub2=document.getElementById('s-subtitle-2')?.value?.trim()||''
  const sub=sub2?sub1+'\n'+sub2:sub1
  const btn=document.getElementById('settings-btn')
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  try{
    const upserts=[
      {setting_key:'hospital_name',setting_value:val},
      {setting_key:'app_subtitle',setting_value:sub||appSubtitle},
      {setting_key:'privacy_contact',setting_value:(document.getElementById('s-privacy-contact')?.value||'').trim()}
    ]
    const{error}=await sb.from('app_settings').upsert(upserts,{onConflict:'setting_key'})
    if(error)throw error
    hospitalName=val
    if(sub){
      appSubtitle=sub
      localStorage.setItem('jh_app_subtitle',sub)
      setSubtitle(document.getElementById('sidebar-sub'),sub)
      setSubtitle(document.getElementById('header-sub'),sub)
    }
    btn.textContent='✅ บันทึกแล้ว'
    setTimeout(()=>{btn.textContent='บันทึกการตั้งค่า';btn.disabled=false},2000)
  }catch(e){btn.textContent='❌ ผิดพลาด';btn.disabled=false}
}

function exportCSV(){
  if(!canDo('record')){alert('🔒 ไม่มีสิทธิ์ Export ข้อมูล');return}
  auditLog('export_csv','patients',null,{count:allPatients.length})
  const rows=allPatients.map(p=>[p.name,p.village,p.group_label,p.interval_str,thDate(p.last_date),thDate(p.next_date),p.days_until,p.note||''])
  const hdr=['ชื่อ','หมู่บ้าน','กลุ่มสี','รอบนัด','วันฉีดล่าสุด','วันนัดต่อไป','วันคงเหลือ','หมายเหตุ']
  const csv=[hdr,...rows].map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n')
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}));a.download='jithome.csv';a.click()
}
function toggleAdmType(type){
  const injLabel=document.getElementById('adm-type-inj-label')
  const visLabel=document.getElementById('adm-type-vis-label')
  const dateLabel=document.getElementById('adm-date-label')
  document.getElementById('adm-type-inj').checked=type==='injection'
  document.getElementById('adm-type-vis').checked=type==='visit'
  if(type==='injection'){
    injLabel.style.cssText='flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:8px;border:2px solid var(--primary);background:var(--primary-lt);cursor:pointer;font-size:13px;font-weight:700;color:var(--primary);font-family:\'Sarabun\',sans-serif'
    visLabel.style.cssText='flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--bg);cursor:pointer;font-size:13px;font-weight:700;color:var(--text3);font-family:\'Sarabun\',sans-serif'
    if(dateLabel)dateLabel.textContent='วันที่ฉีดยา'
  }else{
    visLabel.style.cssText='flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:8px;border:2px solid #ea580c;background:#fff7ed;cursor:pointer;font-size:13px;font-weight:700;color:#ea580c;font-family:\'Sarabun\',sans-serif'
    injLabel.style.cssText='flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:8px;border:2px solid var(--border);background:var(--bg);cursor:pointer;font-size:13px;font-weight:700;color:var(--text3);font-family:\'Sarabun\',sans-serif'
    if(dateLabel)dateLabel.textContent='วันที่เยี่ยมบ้าน'
  }
}

function exportJSON(){
  if(!canDo('record')){alert('🔒 ไม่มีสิทธิ์ Export ข้อมูล');return}
  auditLog('export_json','patients',null,{count:allPatients.length})
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(allPatients,null,2)],{type:'application/json'}));a.download='jithome.json';a.click()
}

async function exportVisitExcel(){
  if(!canDo('record')){alert('🔒 ไม่มีสิทธิ์ Export ข้อมูล');return}
  await loadXLSX()
  const now=new Date()
  const defFrom=new Date(now.getFullYear(),now.getMonth()-5,1).toISOString().split('T')[0]
  const defTo=now.toISOString().split('T')[0]
  const fromDate=prompt('ตั้งแต่วันที่ (YYYY-MM-DD):',defFrom)
  if(fromDate===null)return
  const toDate=prompt('ถึงวันที่ (YYYY-MM-DD):',defTo)
  if(toDate===null)return
  try{
    let q=sb.from('home_visits').select('*').order('visit_date',{ascending:false}).limit(1000)
    if(fromDate)q=q.gte('visit_date',fromDate)
    if(toDate)q=q.lte('visit_date',toDate)
    const{data:visits}=await q
    if(!visits||!visits.length){alert('ไม่พบข้อมูลการเยี่ยมบ้านในช่วงวันที่เลือก');return}
    const patMap=Object.fromEntries(allPatients.map(p=>[p.id,p]))
    const typeLabel={staff:'เจ้าหน้าที่',aosomo:'อสม.'}
    const hdr=['วันที่เยี่ยม','ประเภท','ชื่อ-สกุล','หมู่บ้าน','บ้านเลขที่','เลขบัตรประชาชน','รหัสโรค','ชื่อโรค','ผู้เยี่ยม','คะแนน','ส่งต่อ','หมายเหตุ']
    const rows=visits.map(v=>{
      const p=patMap[v.patient_id]||{}
      return[
        v.visit_date||'',
        typeLabel[v.visit_type]||v.visit_type||'',
        v.patient_name||'',
        v.village||'',
        p.house_no||'',
        maskNationalId(p.national_id)||'',
        p.disease_code||'',
        p.disease_name||'',
        v.visitor||'',
        v.score||0,
        v.refer?'ส่งต่อ':'ปกติ',
        (v.note||'').split('\n')[0]
      ]
    })
    const ws=XLSX.utils.aoa_to_sheet([hdr,...rows])
    ws['!cols']=[{wch:12},{wch:10},{wch:20},{wch:10},{wch:10},{wch:16},{wch:8},{wch:20},{wch:16},{wch:6},{wch:8},{wch:30}]
    const wb=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb,ws,'รายงานเยี่ยมบ้าน')
    XLSX.writeFile(wb,`visit_report_${todayISO()}.xlsx`)
    auditLog('export_visits_excel','visit',null)
  }catch(e){alert('❌ '+e.message)}
}

function downloadTemplate(type){
  let csv,filename
  if(type==='staff_dir'){
    csv='ชื่อ-นามสกุล,ตำแหน่ง,เบอร์โทร\n'+
      'นายสมชาย ใจดี,พยาบาลวิชาชีพ,0812345678\n'+
      'นางสาวอรุณี สว่างจิต,เจ้าพนักงานสาธารณสุข,0823456789\n'+
      'นายวิชัย มั่นคง,นักวิชาการสาธารณสุข,0834567890'
    filename='ตัวอย่าง_รายชื่อเจ้าหน้าที่.csv'
  } else if(type==='aosomo'){
    csv='ชื่อ-นามสกุล,หมู่บ้าน,เบอร์โทร,LINE ID\n'+
      'นางสาวมาลี ใจดี,หมู่ 1,0812345678,mali.jaidee\n'+
      'นายสมชาย รักษ์ดี,หมู่ 1,0823456789,\n'+
      'นางวิไล สุขสันต์,หมู่ 2,0834567890,wilai_suksan\n'+
      'นางสาวอารีย์ แก้วใส,หมู่ 2,0845678901,\n'+
      'นายประสิทธิ์ ทองดี,หมู่ 3,0856789012,'
    filename='ตัวอย่าง_รายชื่ออสม.csv'
  } else {
    csv='ชื่อ-นามสกุล,บ้านเลขที่,หมู่บ้าน,หมายเหตุ,เลขบัตรประชาชน,รหัสโรค,ชื่อโรค,เยี่ยมบ้านทุก(เดือน),ฉีดยาทุก(เดือน),รายการยาที่ฉีด\n'+
      'นายสมศักดิ์ ใจเย็น,123/4,หมู่ 1,โรคจิตเภท ติดตามทุกเดือน,1100100123456,F20,Schizophrenia,1,1,Invega 100mg\n'+
      'นางสาวอรุณี สว่างจิต,45/2,หมู่ 2,,1100200234567,F102,Alcohol Dependence,1,3,DEPO-A\n'+
      'นายวิชัย มั่นคง,78,หมู่ 3,ผู้ดูแลคือนางสมศรี โทร 089-xxx,,F150,,1,,\n'+
      'นางประภา รุ่งเรือง,,หมู่ 1,,,,,,,\n'+
      'นายธนพล ใจกว้าง,90/1,หมู่ 4,แพ้ยา Haloperidol,,F152,,1,1,Flupentixol 40mg'
    filename='ตัวอย่าง_รายชื่อผู้ป่วย.csv'
  }
  const a=document.createElement('a')
  a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'}))
  a.download=filename
  a.click()
}

// ─── Patient Modal ───────────────────────────────────────────────
async function openModal(id){
  const ov=document.getElementById('modal-overlay'),ct=document.getElementById('modal-content')
  ov.style.display='flex'
  ct.innerHTML='<div style="text-align:center;padding:40px;color:var(--text3)">⏳ กำลังโหลด...</div>'
  try{
    const{data:p}=await sb.from('patient_status').select('*').eq('id',id).single()
    if(!p)throw new Error('ไม่พบผู้ป่วย')
    // ตรวจสิทธิ์: อสม. เข้าถึงได้เฉพาะหมู่บ้านที่รับผิดชอบ
    if(currentRole==='aosomo'&&currentVillage&&p.village!==currentVillage)throw new Error('ไม่มีสิทธิ์เข้าถึงข้อมูลผู้ป่วยหมู่อื่น')
    auditLog('view_patient','patient',id,{name:p.name,village:p.village})
    const{data:pExtra}=await sb.from('patients').select('photo_urls,oral_medication,next_inject_date,next_visit_date,consent_signature,consent_given,consent_date').eq('id',id).single()
    p.photo_urls=pExtra?.photo_urls||[]
    p.oral_medication=pExtra?.oral_medication||null
    p.consent_signature=pExtra?.consent_signature||null
    const _sMap=await batchSignedUrls([...p.photo_urls,...(p.consent_signature?[p.consent_signature]:[])])
    p.photo_urls=p.photo_urls.map(u=>_sMap[u]||u)
    if(p.consent_signature)p.consent_signature=_sMap[p.consent_signature]||p.consent_signature
    if(pExtra?.consent_given!=null){p.consent_given=pExtra.consent_given;p.consent_date=pExtra.consent_date||p.consent_date}
    if(pExtra?.next_inject_date) p.next_inject_date=pExtra.next_inject_date
    if(pExtra?.next_visit_date) p.next_visit_date=pExtra.next_visit_date
    p.group_label=groupLabel(p.group_color)
    const hist=await getHistory(id)
    const todayStr=todayISO()
    const futureRecs=hist.filter(h=>h.injection_date>todayStr&&h.record_type!=='visit')
    const pastRecs=hist.filter(h=>h.injection_date<=todayStr)
    // วันนัดครั้งต่อไป: ถ้ามี record อนาคต ใช้วันที่เร็วที่สุดของ record นั้นโดยตรง
    const correctedNextDate=futureRecs.length>0
      ?[...futureRecs].sort((a,b)=>a.injection_date.localeCompare(b.injection_date))[0].injection_date
      :p.next_inject_date||p.next_date
    const correctedDays=Math.round((new Date(correctedNextDate+'T00:00:00')-new Date(todayStr+'T00:00:00'))/86400000)
    const chip=daysChip(correctedDays)
    const histHtml=hist.slice(0,8).map((h)=>{
      const isFuture=h.injection_date>todayStr
      const isFirstPast=!isFuture&&pastRecs[0]?.id===h.id
      const dotColor=isFuture?'#f59e0b':isFirstPast?'var(--primary)':'var(--border)'
      const typeLabel=h.record_type==='visit'?'🏡 เยี่ยมบ้าน':'💉 ฉีดยา'
      const typeBadge=`<span style="font-size:10px;background:${h.record_type==='visit'?'#fff7ed':'#f0fdf4'};color:${h.record_type==='visit'?'#c2410c':'#15803d'};padding:1px 6px;border-radius:4px;font-weight:700">${typeLabel}</span>`
      const badge=isFuture
        ?`<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:4px;font-weight:700">📅 นัดหมาย</span> ${typeBadge}`
        :isFirstPast?`<span style="font-size:10px;background:var(--primary-lt);color:var(--primary);padding:1px 6px;border-radius:4px;font-weight:700">ล่าสุด</span> ${typeBadge}`:typeBadge
      const rowBg=isFuture?'background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px;margin-bottom:4px':''
      return`
    <div class="history-item" id="hist-${h.id}" style="${rowBg}">
      <div class="history-dot" style="background:${dotColor};margin-top:5px"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <div class="history-date">${esc(h.date_th)} ${badge}</div>
          ${canDo('record')?`<div style="display:flex;gap:2px">
            <button onclick="toggleEditRecord(${h.id},'${h.injection_date}','${jsStr(h.interval_str||'')}','${jsStr(h.note||'')}')" aria-label="แก้ไขบันทึกยา" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:11px;padding:2px 4px;font-family:'Sarabun',sans-serif" title="แก้ไข">✏️</button>
            <button onclick="deleteRecord(${h.id},${p.id})" aria-label="ลบบันทึกยา" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:11px;padding:2px 4px;font-family:'Sarabun',sans-serif" title="ลบรายการนี้">🗑️</button>
          </div>`:''}
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:1px">${esc(h.group_label||'')}${h.interval_str?` · ${h.record_type==='visit'?'🏡 นัดเยี่ยม':'💉 นัด'}${esc(h.interval_str)}`:''}</div>
        ${h.note?`<div class="history-note">${esc(h.note)}</div>`:''}
        ${h.recorded_by?`<div style="font-size:10px;color:var(--text3);margin-top:2px">👤 ${esc(h.recorded_by)}</div>`:''}
        <div id="edit-rec-${h.id}" style="display:none;background:#f0f9ff;border:1px solid rgba(10,126,164,.2);border-radius:8px;padding:10px;margin-top:8px">
          <div style="font-size:12px;font-weight:700;color:var(--primary);margin-bottom:8px">แก้ไขรายการ</div>
          <div class="form-group" style="margin-bottom:8px"><label style="font-size:11px">${isFuture?'วันนัดหมาย':'วันที่ฉีดยา'}</label><input type="date" id="er-date-${h.id}" value="${h.injection_date}"></div>
          <div class="form-group" style="margin-bottom:8px"><label style="font-size:11px">รอบนัดต่อไป</label>
            <select id="er-interval-${h.id}" onchange="syncNextDateFromInterval('er-date-${h.id}','er-interval-${h.id}','er-next-date-${h.id}')" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:'Sarabun',sans-serif;font-size:13px">
              ${['2 สัปดาห์','3 สัปดาห์','4 สัปดาห์','1 เดือน','3 เดือน'].map(v=>`<option${v===h.interval_str?' selected':''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:8px"><label style="font-size:11px">📅 วันนัดครั้งต่อไป <span style="color:var(--text3);font-weight:400">(เลือกเองได้)</span></label><input type="date" id="er-next-date-${h.id}" oninput="syncIntervalFromNextDate('er-date-${h.id}','er-next-date-${h.id}','er-interval-${h.id}')"></div>
          <div class="form-group" style="margin-bottom:8px"><label style="font-size:11px">ยาที่ฉีด</label><input type="text" id="er-medication-${h.id}" value="${esc(h.medication_name||'')}" placeholder="เช่น Invega 100 mg"></div>
          <div class="form-group" style="margin-bottom:8px"><label style="font-size:11px">หมายเหตุ</label><input type="text" id="er-note-${h.id}" value="${esc(h.note||'')}"></div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-primary" style="flex:1;font-size:12px;padding:6px" id="er-save-${h.id}" onclick="saveEditRecord(${h.id},${p.id})">บันทึก</button>
            <button class="btn btn-outline" style="font-size:12px;padding:6px" onclick="toggleEditRecord(${h.id})">ยกเลิก</button>
          </div>
        </div>
      </div>
    </div>`}).join('')
    const consented=p.consent_given||!!p.consent_signature
    ct.innerHTML=`
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
      <div><div style="font-size:20px;font-weight:700;margin-bottom:4px">${esc(p.name)}</div><div style="font-size:14px;color:var(--text3)">${esc(p.village||'')}${p.house_no?` · 🏠 ${esc(p.house_no)}`:''} · ${esc(hospitalName)}</div></div>
      <div style="display:flex;gap:6px;align-items:center">
        <button onclick="showPatientTimeline(${p.id},'${jsStr(p.name)}')" style="background:none;border:1px solid #bae6fd;border-radius:6px;cursor:pointer;color:#0369a1;padding:4px 8px;font-size:11px;font-family:'Sarabun',sans-serif">📅 Timeline</button>
        ${canDo('record')?`<button onclick="openEditPatient(${p.id},'${jsStr(p.name)}','${jsStr(p.village||'')}','${jsStr(p.house_no||'')}','${jsStr(p.note||'')}','${jsStr(p.staff_responsible||'')}','${jsStr(p.aosomo_responsible||'')}','${jsStr(p.national_id||'')}')" style="background:none;border:1px solid var(--border);border-radius:6px;cursor:pointer;color:var(--text2);padding:4px 8px;font-size:11px;font-family:'Sarabun',sans-serif">✏️ แก้ไข</button>`:''}
        <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--text3);padding:4px"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
    </div>
    <div id="edit-patient-wrap" style="display:none;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#166534">✏️ แก้ไขข้อมูลผู้ป่วย</div>
      <div class="form-group"><label>ชื่อ-นามสกุล</label><input type="text" id="edit-pt-name" style="width:100%;box-sizing:border-box"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group"><label>หมู่บ้าน</label><select id="edit-pt-village" onchange="refreshAosomoByVillage(this.value)">${VILLAGES.map(v=>`<option>${v}</option>`).join('')}</select></div>
        <div class="form-group"><label>🏠 บ้านเลขที่</label><input type="text" id="edit-pt-house-no" placeholder="เช่น 123/4" style="width:100%;box-sizing:border-box"></div>
      </div>
      <div class="form-group"><label>👨‍⚕️ เจ้าหน้าที่รับผิดชอบ</label><select id="edit-pt-staff" style="width:100%"><option value="">— ไม่ระบุ —</option></select></div>
      <div class="form-group"><label>🏡 อสม. รับผิดชอบ <span id="edit-pt-aosomo-village" style="font-size:11px;color:#7c3aed;font-weight:400"></span></label><select id="edit-pt-aosomo" style="width:100%"><option value="">— ไม่ระบุ —</option></select></div>
      <div class="form-group"><label>หมายเหตุ</label><input type="text" id="edit-pt-note"></div>
      ${canDo('admin')?`<div class="form-group">
        <label>🪪 เลขบัตรประชาชน <span style="font-size:11px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:4px;font-weight:700">admin เท่านั้น</span></label>
        <input type="text" id="edit-pt-nid" placeholder="X-XXXX-XXXXX-XX-X" maxlength="17" inputmode="numeric"
          oninput="this.value=formatNationalIdInput(this.value)" style="letter-spacing:1px">
      </div>`:''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group"><label>🏡 เยี่ยมบ้านทุก (เดือน)</label><select id="edit-pt-visit-interval">
          <option value="">— ไม่ระบุ —</option>
          ${[1,2,3,6].map(n=>`<option value="${n}">${n} เดือน</option>`).join('')}
        </select></div>
        <div class="form-group"><label>💉 ฉีดยาทุก (เดือน)</label><select id="edit-pt-inject-interval">
          <option value="">— ไม่ระบุ —</option>
          ${[1,2,3,6].map(n=>`<option value="${n}">${n} เดือน</option>`).join('')}
        </select></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="form-group"><label>💉 วันนัดฉีดยาครั้งต่อไป</label><input type="date" id="edit-pt-next-inject-date" style="width:100%;box-sizing:border-box"></div>
        <div class="form-group"><label>🏡 วันนัดเยี่ยมบ้านครั้งต่อไป</label><input type="date" id="edit-pt-next-visit-date" style="width:100%;box-sizing:border-box"></div>
      </div>
      <div class="form-group"><label>💊 ยาทานปัจจุบัน</label><input type="text" id="edit-pt-oral-medication" placeholder="เช่น Risperidone 2mg, Haloperidol 5mg" style="width:100%;box-sizing:border-box"></div>
      <div class="form-group"><label>💉 ยาฉีด</label><input type="text" id="edit-pt-medication" placeholder="เช่น Invega 100mg, DEPO-A, Flupentixol 40mg"></div>
      <div class="form-group">
        <label>📷 ภาพถ่ายบริบท <span style="font-size:11px;font-weight:400;color:var(--text3)">เช่น บ้าน สภาพแวดล้อม สถานที่อยู่อาศัย</span></label>
        ${(p.photo_urls&&p.photo_urls.length>0)?`<div style="margin-bottom:8px;display:flex;flex-direction:column;gap:6px">${p.photo_urls.map((url,i)=>`<div style="border-radius:8px;overflow:hidden;border:1px solid var(--border);position:relative"><img src="${esc(url)}" style="max-width:100%;max-height:120px;object-fit:cover;display:block"><button onclick="removePatientPhoto(${p.id},${i})" style="position:absolute;top:4px;right:4px;background:rgba(220,38,38,0.85);color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:14px;line-height:1;font-family:'Sarabun',sans-serif">×</button></div>`).join('')}</div>`:''}
        <input type="file" id="edit-pt-photo" accept="image/*" capture="environment" style="width:100%;box-sizing:border-box">
      </div>
      <div class="form-group">
        <label>📎 แนบไฟล์เอกสาร (ภาพ / PDF / Excel ไม่เกิน 10 MB)</label>
        ${p.file_url?`<a href="${safeUrl(p.file_url)}" target="_blank" style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--primary);margin-bottom:6px;text-decoration:none">📄 ไฟล์ปัจจุบัน (คลิกดู) — อัปโหลดใหม่เพื่อแทนที่</a>`:''}
        <div id="edit-pt-file-wrap" onclick="document.getElementById('edit-pt-file').click()"
          style="border:2px dashed var(--border);border-radius:8px;padding:10px;text-align:center;cursor:pointer;background:#fff">
          <div id="edit-pt-file-label" style="font-size:12px;color:var(--text3)">📁 กดเพื่อเลือกไฟล์</div>
          <input type="file" id="edit-pt-file" accept="image/*,.pdf,.xls,.xlsx,.csv" style="display:none"
            onchange="const f=this.files[0];if(f){if(f.size>10*1024*1024){alert('ไฟล์ใหญ่เกิน 10 MB');this.value='';return}document.getElementById('edit-pt-file-label').textContent='✅ '+f.name+' ('+(f.size/1024).toFixed(0)+' KB)';document.getElementById('edit-pt-file-wrap').style.borderColor='var(--primary)'}">
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" id="edit-pt-save-btn" onclick="saveEditPatient(${p.id})">บันทึกการแก้ไข</button>
        <button class="btn btn-outline" onclick="closeEditPatient()">ยกเลิก</button>
      </div>
      ${canDo('admin')?`<button onclick="deletePatient(${p.id},'${jsStr(p.name)}')" style="width:100%;margin-top:8px;padding:8px;border-radius:8px;border:1px solid #fca5a5;background:#fef2f2;color:#b91c1c;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">🗑️ ลบผู้ป่วยรายนี้ออกจากระบบ</button>`:''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <span class="badge ${p.group_color}"><span class="badge-dot"></span>${esc(p.group_label)}</span>
      <span class="days-chip ${chip.cls}">${chip.label}</span>
    </div>
    <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:16px">
      <div style="font-size:12px;color:var(--text3);margin-bottom:2px">วันนัดครั้งต่อไป</div>
      <div style="font-size:16px;font-weight:700;color:var(--primary)">${thDateFull(correctedNextDate)}</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px">รอบการฉีดยา: ${esc(futureRecs.length>0?futureRecs[0].interval_str:p.interval_str||'')}</div>
    </div>
    <div style="background:#fff;border:1px solid var(--border);border-radius:12px;margin-bottom:14px;overflow:hidden">
      <div style="padding:10px 14px;background:#f8fafc;border-bottom:1px solid var(--border);font-size:12px;font-weight:700;color:var(--text2)">📋 ข้อมูลพื้นฐาน</div>
      <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:18px;flex-shrink:0">🪪</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:10px;color:var(--text3);font-weight:600;margin-bottom:1px">เลขบัตรประชาชน${canDo('admin')?'':' <span style="background:#e5e7eb;color:#6b7280;padding:0 4px;border-radius:3px;font-size:9px">PDPA</span>'}</div>
            ${p.national_id
              ? `<div style="font-size:13px;font-weight:700;letter-spacing:1.5px;color:${canDo('admin')?'#92400e':'var(--text2)'};font-family:monospace">${maskNationalId(p.national_id)}</div>`
              : `<div style="font-size:12px;color:var(--text3);font-style:italic">ยังไม่ได้ระบุ</div>`}
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:18px;flex-shrink:0">💊</span>
          <div>
            <div style="font-size:10px;color:var(--text3);font-weight:600;margin-bottom:1px">ยาที่ใช้ปัจจุบัน</div>
            ${p.oral_medication
              ? `<div style="font-size:13px;font-weight:600;color:var(--text1)">${esc(p.oral_medication)}</div>`
              : `<div style="font-size:12px;color:var(--text3);font-style:italic">ยังไม่ได้ระบุ</div>`}
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:18px;flex-shrink:0">💉</span>
          <div>
            <div style="font-size:10px;color:var(--text3);font-weight:600;margin-bottom:1px">ยาฉีด${p.inject_interval?` · ทุก ${p.inject_interval} เดือน`:''}</div>
            ${p.medication_name
              ? `<div style="font-size:13px;font-weight:600;color:#15803d">${esc(p.medication_name)}</div>`
              : `<div style="font-size:12px;color:var(--text3);font-style:italic">ยังไม่ได้ระบุ</div>`}
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span style="font-size:18px;flex-shrink:0">📷</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:10px;color:var(--text3);font-weight:600;margin-bottom:4px">ภาพถ่ายบริบท / สภาพแวดล้อม</div>
            ${(p.photo_urls&&p.photo_urls.length>0)
              ? p.photo_urls.map((url,i)=>`<div style="position:relative;display:inline-block;margin-bottom:6px;max-width:100%">
                  <a href="${safeUrl(url)}" target="_blank"><img src="${safeUrl(url)}" style="max-width:100%;max-height:160px;border-radius:8px;object-fit:cover;display:block;cursor:pointer"></a>
                  ${canDo('record')?`<button onclick="removePatientPhoto(${p.id},${i})" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.55);color:#fff;border:none;border-radius:50%;width:24px;height:24px;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center" title="ลบรูป">×</button>`:''}
                </div>`).join('')
              : `<div style="font-size:12px;color:var(--text3);font-style:italic">ยังไม่ได้อัปโหลด</div>`}
          </div>
        </div>
        <div style="padding-top:6px;border-top:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:16px">${consented?'✅':'⚠️'}</span>
            <div style="flex:1">
              <span style="font-size:12px;font-weight:700;color:${consented?'#15803d':'#b91c1c'}">${consented?'ความยินยอม PDPA: ยินยอมแล้ว'+(p.consent_date?' · '+thDate(p.consent_date):''):'ยังไม่ได้รับความยินยอม PDPA'}</span>
            </div>
            ${canDo('record')&&!consented?`<button onclick="giveConsent(${p.id})" style="padding:4px 10px;background:#16a34a;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">รับยินยอม</button>`:''}
          </div>
          ${p.consent_signature?`<div style="margin-top:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px">
            <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:6px">📄 เอกสารความยินยอม PDPA</div>
            <div style="font-size:11px;color:#6b7280;line-height:1.7;margin-bottom:8px">
              ผู้ป่วยได้อ่านและยินยอมให้ รพ.สต. เก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคล ได้แก่ ชื่อ-นามสกุล เลขบัตรประชาชน เบอร์โทรศัพท์ ที่อยู่ และข้อมูลสุขภาพจิต เพื่อการดูแลสุขภาพในชุมชน ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
            </div>
            <div style="text-align:center;border-top:1px dashed #d1d5db;padding-top:8px">
              <div style="font-size:10px;color:#6b7280;margin-bottom:4px">✍️ ลายเซ็นผู้ยินยอม${p.consent_date?' · '+thDate(p.consent_date):''}</div>
              <img src="${p.consent_signature}" style="max-width:100%;max-height:90px;border-radius:4px;background:#fff;border:1px solid #e5e7eb">
            </div>
          </div>`:''}
        </div>
      </div>
    </div>
    ${canDo('record')&&(p.disease_code||p.disease_name)?`<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:8px 12px;margin-bottom:10px;display:flex;align-items:center;gap:10px">
      <div style="font-size:20px">🏥</div>
      <div>
        ${p.disease_code?`<div style="font-size:12px;font-weight:700;color:#0369a1;letter-spacing:.5px">${esc(p.disease_code)}</div>`:''}
        ${p.disease_name?`<div style="font-size:12px;color:#0c4a6e">${esc(p.disease_name)}</div>`:''}
      </div>
    </div>`:''}
    ${p.note?`<div style="background:var(--yellow-lt);border:1px solid var(--yellow-bd);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#92400e">📋 ${esc(p.note)}</div>`:''}
    ${p.file_url?`<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <a href="${safeUrl(p.file_url)}" target="_blank" style="flex:1;display:flex;align-items:center;gap:8px;background:var(--primary-lt);border:1px solid rgba(10,126,164,.2);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--primary);text-decoration:none;font-weight:600">📎 ดูไฟล์แนบ</a>
      ${canDo('record')?`<button onclick="removePatientFile(${p.id})" style="padding:7px 10px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;font-size:12px;cursor:pointer;font-family:'Sarabun',sans-serif;white-space:nowrap">🗑 ลบ</button>`:''}
    </div>`:''}
    ${(p.staff_responsible||p.aosomo_responsible)?`
    <div style="background:var(--bg);border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap">
      ${p.staff_responsible?`<div style="font-size:12px"><span style="color:var(--text3)">👨‍⚕️ เจ้าหน้าที่:</span> <strong>${esc(p.staff_responsible)}</strong></div>`:''}
      ${p.aosomo_responsible?`<div style="font-size:12px"><span style="color:var(--text3)">🏡 อสม.:</span> <strong>${esc(p.aosomo_responsible)}</strong></div>`:''}
    </div>`:''}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700">ประวัติการนัดหมาย (${pastRecs.length} ครั้ง)${futureRecs.length>0?`<span style="font-size:11px;font-weight:400;color:#92400e;margin-left:6px">📅 นัดหมาย ${futureRecs.length} รายการ</span>`:''}</div>
      ${canDo('record')?`<button onclick="toggleRecordForm()" style="background:var(--primary);color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">+ บันทึก</button>`:''}
    </div>
    <div id="record-form-wrap" style="display:none;background:var(--primary-lt);border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid rgba(10,126,164,.2)">
      <div style="display:flex;gap:6px;margin-bottom:10px">
        <button type="button" id="rec-type-inj" onclick="toggleRecType('injection')" style="flex:1;padding:6px;border-radius:8px;border:2px solid var(--primary);background:var(--primary-lt);color:var(--primary);font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">💉 ฉีดยา</button>
        <button type="button" id="rec-type-vis" onclick="toggleRecType('visit')" style="flex:1;padding:6px;border-radius:8px;border:2px solid var(--border);background:#fff;color:var(--text3);font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">🏡 เยี่ยมบ้าน</button>
      </div>
      <div class="form-group"><label id="rec-date-label">วันที่ฉีดยา</label><input type="date" id="rec-date" value="${todayISO()}" oninput="syncNextDateFromInterval('rec-date','rec-interval','rec-next-date')"></div>
      <div class="form-group"><label>รอบนัดต่อไป</label><select id="rec-interval" onchange="syncNextDateFromInterval('rec-date','rec-interval','rec-next-date')"><option>2 สัปดาห์</option><option>3 สัปดาห์</option><option>4 สัปดาห์</option><option selected>1 เดือน</option><option>3 เดือน</option></select></div>
      <div class="form-group"><label>📅 วันนัดครั้งต่อไป <span style="font-size:11px;color:var(--text3);font-weight:400">(เลือกเองหรือปล่อยให้คำนวณ)</span></label><input type="date" id="rec-next-date" oninput="syncIntervalFromNextDate('rec-date','rec-next-date','rec-interval')"></div>
      <div class="form-group" id="rec-medication-wrap"><label>ยาที่ฉีด</label><input type="text" id="rec-medication" placeholder="เช่น Invega 100 mg, FLUPENTIXOL 40MG/2ML" style="width:100%;box-sizing:border-box"></div>
      <div class="form-group"><label>หมายเหตุ</label><input type="text" id="rec-note" placeholder="ผลการฉีดยา, อาการ..."></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" id="rec-save-btn" onclick="saveModalRecord(${p.id},'${p.group_color}')">บันทึก</button>
        <button class="btn btn-outline" onclick="toggleRecordForm()">ยกเลิก</button>
      </div>
    </div>
    <div>${histHtml}</div>
    ${hist.length>8?`<div style="font-size:12px;color:var(--text3);text-align:center;padding-top:8px">+ ${hist.length-8} รายการก่อนหน้า</div>`:''}`
  }catch(e){ct.innerHTML=`<div style="padding:20px;color:var(--red)">เกิดข้อผิดพลาด: ${esc(e.message)}</div>`}
}
function closeModal(){document.getElementById('modal-overlay').style.display='none'}

async function removePatientPhoto(patientId,index){
  if(!confirm('ลบรูปนี้ออก?'))return
  const{data}=await sb.from('patients').select('photo_urls').eq('id',patientId).single()
  const urls=[...(data?.photo_urls||[])]
  urls.splice(index,1)
  await sb.from('patients').update({photo_urls:urls}).eq('id',patientId)
  await openModal(patientId)
}
async function removePatientFile(patientId){
  if(!confirm('ลบไฟล์แนบนี้ออก?'))return
  const{error}=await sb.from('patients').update({file_url:null}).eq('id',patientId)
  if(error){alert('❌ ลบไม่สำเร็จ: '+error.message);return}
  await openModal(patientId)
}

function toggleEditRecord(id,date,interval,note){
  const wrap=document.getElementById('edit-rec-'+id)
  if(!wrap)return
  if(date===undefined){wrap.style.display='none';return}
  wrap.style.display=wrap.style.display==='none'?'block':'none'
  if(wrap.style.display==='block') syncNextDateFromInterval('er-date-'+id,'er-interval-'+id,'er-next-date-'+id)
}

async function saveEditRecord(id,patientId){
  const dateEl=document.getElementById('er-date-'+id)
  const noteEl=document.getElementById('er-note-'+id)
  const nextDateEl=document.getElementById('er-next-date-'+id)
  const btn=document.getElementById('er-save-'+id)
  const date=dateEl?.value
  const note=noteEl?.value||''
  const medication_name=document.getElementById('er-medication-'+id)?.value||null
  const nextDate=nextDateEl?.value||''
  if(!date){alert('กรุณาเลือกวันที่');return}
  const {interval_str,interval_days}=getIntervalAndDays('er-date-'+id,'er-interval-'+id,'er-next-date-'+id)
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  try{
    const{data:rec}=await sb.from('injection_records').select('group_color,group_label,record_type').eq('id',id).single()
    const{error}=await sb.from('injection_records').update({injection_date:date,interval_str,interval_days,note,medication_name:medication_name||null}).eq('id',id)
    if(error)throw error
    auditLog('edit_record','injection_records',id,{injection_date:date})
    _markOwnWrite(id)
    if(nextDate&&nextDate>date){
      if(rec?.record_type==='visit'){
        await sb.from('patients').update({next_visit_date:nextDate}).eq('id',patientId)
      } else {
        const{data:exist}=await sb.from('injection_records').select('id').eq('patient_id',patientId).eq('injection_date',nextDate).maybeSingle()
        if(!exist){
          await sb.from('injection_records').insert({patient_id:patientId,injection_date:nextDate,group_color:rec?.group_color,group_label:rec?.group_label,interval_str,interval_days,note:'',record_type:rec?.record_type||'injection',recorded_by:currentDisplayName||null})
        }
        await sb.from('patients').update({next_inject_date:nextDate}).eq('id',patientId)
      }
    }
    await openModal(patientId)
  }catch(e){btn.textContent='❌ '+e.message;btn.disabled=false}
}

async function deleteRecord(id,patientId){
  const{data:rec}=await sb.from('injection_records').select('record_type').eq('id',id).single()
  const recLabel=rec?.record_type==='visit'?'เยี่ยมบ้าน':'ฉีดยา'
  if(!confirm(`ลบรายการ${recLabel}นี้ออกจากประวัติ?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`))return
  const{error}=await sb.from('injection_records').delete().eq('id',id)
  if(error){alert('เกิดข้อผิดพลาด: '+error.message);return}
  auditLog('delete_record','injection_records',id,{patient_id:patientId,record_type:rec?.record_type})
  // หาวันนัดที่เหลืออยู่ แล้วอัปเดต patients
  const today=todayISO()
  const{data:remaining}=await sb.from('injection_records')
    .select('injection_date,record_type').eq('patient_id',patientId)
    .gt('injection_date',today).order('injection_date',{ascending:true})
  const nextVisit=(remaining||[]).find(r=>r.record_type==='visit')?.injection_date||null
  const nextInject=(remaining||[]).find(r=>r.record_type!=='visit')?.injection_date||null
  if(rec?.record_type==='visit'){
    await sb.from('patients').update({next_visit_date:nextVisit}).eq('id',patientId)
  } else {
    await sb.from('patients').update({next_inject_date:nextInject}).eq('id',patientId)
  }
  await openModal(patientId)
}

function toggleEditPatient(){}
function closeEditPatient(){
  const w=document.getElementById('edit-patient-wrap')
  if(w)w.style.display='none'
}
async function openEditPatient(id,name,village,houseNo,note,staffResp,aosomoResp,nationalId){
  const w=document.getElementById('edit-patient-wrap')
  if(!w)return
  if(w.style.display!=='none'){w.style.display='none';return}
  w.style.display='block'
  const nEl=document.getElementById('edit-pt-name')
  const vEl=document.getElementById('edit-pt-village')
  const ntEl=document.getElementById('edit-pt-note')
  const nidEl=document.getElementById('edit-pt-nid')
  if(nEl)nEl.value=name||''
  if(ntEl)ntEl.value=note||''
  if(nidEl)nidEl.value=formatNationalIdInput(nationalId||'')
  const hnEl=document.getElementById('edit-pt-house-no')
  if(hnEl)hnEl.value=houseNo||''
  // ตั้งค่า dropdown หมู่บ้าน
  if(vEl){
    let matched=false
    for(const o of vEl.options)if(o.value===village||o.text===village){o.selected=true;matched=true;break}
    if(!matched) vEl.selectedIndex=0
  }
  // โหลด dropdown เจ้าหน้าที่ (user_profiles + staff_directory)
  const staffSel=document.getElementById('edit-pt-staff')
  if(staffSel){
    const[{data:staffList},{data:staffDir}]=await Promise.all([
      sb.from('user_profiles').select('display_name').in('role',['admin','staff']).order('display_name'),
      sb.from('staff_directory').select('name,position').order('name')
    ])
    const userNames=(staffList||[]).map(s=>s.display_name||'').filter(Boolean)
    const dirNames=(staffDir||[]).map(s=>s.name).filter(n=>!userNames.includes(n))
    staffSel.innerHTML='<option value="">— ไม่ระบุ —</option>'+
      userNames.map(n=>`<option value="${esc(n)}"${n===staffResp?' selected':''}>${esc(n)}</option>`).join('')
    if(dirNames.length)
      staffSel.innerHTML+=`<optgroup label="📋 รายชื่อที่นำเข้า">` +
        dirNames.map(n=>`<option value="${esc(n)}"${n===staffResp?' selected':''}>${esc(n)}</option>`).join('') +
        `</optgroup>`
    if(staffResp&&!userNames.includes(staffResp)&&!dirNames.includes(staffResp))
      staffSel.innerHTML+=`<option value="${esc(staffResp)}" selected>${esc(staffResp)}</option>`
  }
  // โหลดข้อมูลเพิ่มเติม
  const {data:extra}=await sb.from('patients').select('visit_interval,inject_interval,medication_name,oral_medication,next_visit_date,next_inject_date').eq('id',id).single()
  if(extra){
    const vi=document.getElementById('edit-pt-visit-interval')
    const ii=document.getElementById('edit-pt-inject-interval')
    const med=document.getElementById('edit-pt-medication')
    const oral=document.getElementById('edit-pt-oral-medication')
    const nvd=document.getElementById('edit-pt-next-visit-date')
    const nid=document.getElementById('edit-pt-next-inject-date')
    if(vi)vi.value=extra.visit_interval||''
    if(ii)ii.value=extra.inject_interval||''
    if(med)med.value=extra.medication_name||''
    if(oral)oral.value=extra.oral_medication||''
    if(nvd)nvd.value=extra.next_visit_date||''
    if(nid)nid.value=extra.next_inject_date||''
  }
  // โหลด dropdown อสม. — ส่ง village ตรงจากข้อมูลผู้ป่วย (ไม่ผ่าน select element)
  await refreshAosomoByVillage(village, aosomoResp)
}

async function refreshAosomoByVillage(village, currentVal){
  const aosomoSel=document.getElementById('edit-pt-aosomo')
  if(!aosomoSel)return
  if(currentVal===undefined) currentVal=aosomoSel.value
  // ถ้าไม่มี village ให้อ่านจาก dropdown หมู่บ้านโดยตรง
  if(!village){
    const vEl=document.getElementById('edit-pt-village')
    if(vEl) village=vEl.options[vEl.selectedIndex]?.value||''
  }
  // แสดง village ที่กำลังกรองใน label
  const lbl=document.getElementById('edit-pt-aosomo-village')
  if(lbl) lbl.textContent=village?`(กรอง: ${village})`:'(เลือกหมู่บ้านก่อน)'
  aosomoSel.innerHTML='<option value="">⏳ กำลังโหลด...</option>'
  // ดึงข้อมูลโดยกรอง village จาก Supabase โดยตรง
  let q=sb.from('aosomo_directory').select('name,village').order('name')
  if(village) q=q.eq('village',village)
  else{ aosomoSel.innerHTML='<option value="">— ไม่ระบุ —</option>'; return }
  const{data:list,error}=await q
  if(error){ aosomoSel.innerHTML='<option value="">❌ โหลดไม่สำเร็จ</option>'; return }
  if(!list||list.length===0){
    aosomoSel.innerHTML='<option value="">— ไม่พบ อสม. ใน'+village+' —</option>'
    // เพิ่มตัวเลือกปัจจุบันไว้ถ้ามี
    if(currentVal) aosomoSel.innerHTML+=`<option value="${esc(currentVal)}" selected>${esc(currentVal)}</option>`
    return
  }
  aosomoSel.innerHTML='<option value="">— ไม่ระบุ —</option>'+
    list.map(a=>`<option value="${esc(a.name)}"${a.name===currentVal?' selected':''}>${esc(a.name)}</option>`).join('')
  // ถ้าค่าปัจจุบันไม่อยู่ในรายชื่อ ให้แสดงไว้พร้อมเตือน
  if(currentVal&&!list.find(a=>a.name===currentVal)){
    const{data:found}=await sb.from('aosomo_directory').select('name,village').eq('name',currentVal).maybeSingle()
    if(found)
      aosomoSel.innerHTML+=`<option value="${esc(found.name)}" selected>${esc(found.name)} ⚠️ (${esc(found.village||'ต่างหมู่')})</option>`
    else if(currentVal)
      aosomoSel.innerHTML+=`<option value="${esc(currentVal)}" selected>${esc(currentVal)}</option>`
  }
}
async function deletePatient(id,name){
  if(!confirm(`ลบผู้ป่วย "${name}" ออกจากระบบ?\n\nประวัติการฉีดยาทั้งหมดจะถูกลบด้วย\nไม่สามารถกู้คืนได้!\n\n(สิทธิ์ตาม PDPA มาตรา 33 — สิทธิ์ขอลบข้อมูล)`))return
  try{
    await auditLog('delete_patient','patient',id,{name})
    const{error}=await sb.from('patients').delete().eq('id',id)
    if(error)throw error
    closeModal()
    allPatients=await getPatients()
    if(location.hash==='#patients')navigate('patients')
  }catch(e){alert('❌ ลบไม่สำเร็จ: '+e.message)}
}
function giveConsent(id){
  const p=allPatients.find(x=>x.id===id)||{}
  const el=document.getElementById('consent-modal')
  if(el)el.remove()
  const m=document.createElement('div')
  m.id='consent-modal'
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center'
  m.innerHTML=`
  <div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:540px;max-height:92vh;display:flex;flex-direction:column">
    <div style="padding:16px 18px 10px;border-bottom:1px solid #e5e7eb;flex-shrink:0">
      <div style="font-size:15px;font-weight:800;color:#15803d">🔒 ใบยินยอมคุ้มครองข้อมูลส่วนบุคคล (PDPA)</div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px">ผู้ป่วย: ${esc(p.name||'')}</div>
    </div>
    <div style="overflow-y:auto;flex:1;padding:14px 18px;font-size:12.5px;color:#374151;line-height:1.8">
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:11.5px;color:#166534">
        โรงพยาบาลส่งเสริมสุขภาพตำบล ขอแจ้งให้ทราบว่าจะมีการเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลของท่านตาม พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
      </div>
      <p><strong>1. ข้อมูลที่เก็บรวบรวม</strong><br>ชื่อ-นามสกุล, เลขบัตรประชาชน, เบอร์โทรศัพท์, ที่อยู่, ข้อมูลสุขภาพจิต, ประวัติการรับยา, วันนัดหมาย</p>
      <p><strong>2. วัตถุประสงค์การใช้ข้อมูล</strong><br>เพื่อการดูแลสุขภาพจิตในชุมชน การติดตามการรับยา การนัดหมายแพทย์ และการรายงานทางสาธารณสุข</p>
      <p><strong>3. ผู้ที่เข้าถึงข้อมูล</strong><br>บุคลากรสาธารณสุขที่ได้รับอนุญาต ได้แก่ เจ้าหน้าที่ รพ.สต. พยาบาล แพทย์ และ อสม. ประจำหมู่บ้าน</p>
      <p><strong>4. ระยะเวลาการเก็บข้อมูล</strong><br>ตลอดระยะเวลาการรักษาและตามที่กฎหมายกำหนด</p>
      <p><strong>5. สิทธิ์ของท่าน</strong><br>ท่านมีสิทธิ์ขอดู แก้ไข หรือลบข้อมูลส่วนบุคคลของท่าน โดยติดต่อเจ้าหน้าที่ รพ.สต.</p>
      <p><strong>6. การถอนความยินยอม</strong><br>ท่านสามารถถอนความยินยอมได้ตลอดเวลา โดยไม่มีผลต่อการประมวลผลข้อมูลที่ดำเนินการไปแล้ว</p>
      <div style="margin-top:10px;padding:10px 12px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;font-size:11.5px;color:#92400e">
        ข้าพเจ้าได้อ่านและเข้าใจรายละเอียดข้างต้นแล้ว และยินยอมให้เก็บและประมวลผลข้อมูลส่วนบุคคลของข้าพเจ้าตามวัตถุประสงค์ดังกล่าว
      </div>
      <div style="margin-top:16px;font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">✍️ ลายเซ็นผู้ยินยอม</div>
      <div style="position:relative;border:2px dashed #d1d5db;border-radius:10px;background:#f9fafb;touch-action:none">
        <canvas id="consent-sig-canvas" style="display:block;width:100%;height:160px;border-radius:8px;cursor:crosshair"></canvas>
        <div id="consent-sig-hint" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;color:#9ca3af;font-size:12px">เซ็นชื่อในกรอบนี้</div>
      </div>
      <button onclick="clearConsentSig()" style="margin-top:6px;padding:4px 12px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;font-size:11px;cursor:pointer;font-family:'Sarabun',sans-serif">🗑 ล้างลายเซ็น</button>
      <div style="margin-top:10px;font-size:11px;color:#6b7280">วันที่: ${thDate(todayISO())}</div>
    </div>
    <div style="padding:12px 18px 20px;border-top:1px solid #e5e7eb;flex-shrink:0;display:flex;gap:10px">
      <button onclick="document.getElementById('consent-modal').remove()" style="flex:1;padding:10px;background:#f3f4f6;color:#374151;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">ยกเลิก</button>
      <button onclick="saveConsent(${id})" style="flex:2;padding:10px;background:#16a34a;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">✅ ยืนยันยินยอม</button>
    </div>
  </div>`
  document.body.appendChild(m)
  m.addEventListener('click',e=>{if(e.target===m)m.remove()})
  const canvas=document.getElementById('consent-sig-canvas')
  const rect=canvas.getBoundingClientRect()
  canvas.width=Math.round(rect.width*devicePixelRatio)||600
  canvas.height=Math.round(rect.height*devicePixelRatio)||320
  const ctx=canvas.getContext('2d')
  ctx.scale(devicePixelRatio,devicePixelRatio)
  ctx.strokeStyle='#111'
  ctx.lineWidth=2.5
  ctx.lineCap='round'
  ctx.lineJoin='round'
  let drawing=false
  const getPos=e=>{const r=canvas.getBoundingClientRect();const src=e.touches?e.touches[0]:e;return{x:(src.clientX-r.left),y:(src.clientY-r.top)}}
  canvas.addEventListener('pointerdown',e=>{drawing=true;const{x,y}=getPos(e);ctx.beginPath();ctx.moveTo(x,y);document.getElementById('consent-sig-hint').style.display='none'})
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();const{x,y}=getPos(e);ctx.lineTo(x,y);ctx.stroke()},{passive:false})
  canvas.addEventListener('pointerup',()=>{drawing=false})
  canvas.addEventListener('pointerleave',()=>{drawing=false})
}
function clearConsentSig(){
  const canvas=document.getElementById('consent-sig-canvas')
  if(!canvas)return
  const ctx=canvas.getContext('2d')
  ctx.clearRect(0,0,canvas.width,canvas.height)
  const hint=document.getElementById('consent-sig-hint')
  if(hint)hint.style.display='flex'
}
async function saveConsent(id){
  const canvas=document.getElementById('consent-sig-canvas')
  if(!canvas){alert('❌ ไม่พบกรอบลายเซ็น');return}
  const blank=!canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some(v=>v!==0)
  if(blank){alert('กรุณาลงลายเซ็นก่อนยืนยัน');return}
  const btn=document.querySelector('#consent-modal button[onclick^="saveConsent"]')
  if(btn){btn.disabled=true;btn.textContent='กำลังบันทึก...'}
  const blob=await new Promise(res=>canvas.toBlob(res,'image/png'))
  const filename=`signatures/${id}_${Date.now()}.png`
  const{error:ue}=await sb.storage.from('patient-files').upload(filename,blob,{contentType:'image/png'})
  if(ue){alert('❌ อัพโหลดลายเซ็นไม่สำเร็จ: '+ue.message);if(btn){btn.disabled=false;btn.textContent='✅ ยืนยันยินยอม'}return}
  const{data:{publicUrl}}=sb.storage.from('patient-files').getPublicUrl(filename)
  const today=todayISO()
  const{error}=await sb.from('patients').update({consent_given:true,consent_date:today,consent_signature:publicUrl}).eq('id',id)
  if(error){alert('❌ '+error.message);if(btn){btn.disabled=false;btn.textContent='✅ ยืนยันยินยอม'}return}
  const pt=allPatients.find(x=>x.id===id)
  if(pt){pt.consent_given=true;pt.consent_date=today;pt.consent_signature=publicUrl}
  document.getElementById('consent-modal')?.remove()
  openModal(id)
}
async function saveEditPatient(id){
  const name=(document.getElementById('edit-pt-name')?.value||'').trim()
  const village=document.getElementById('edit-pt-village')?.value||''
  const note=(document.getElementById('edit-pt-note')?.value||'').trim()
  const staff_responsible=document.getElementById('edit-pt-staff')?.value||''
  const aosomo_responsible=document.getElementById('edit-pt-aosomo')?.value||''
  const nidRaw=(document.getElementById('edit-pt-nid')?.value||'').replace(/\D/g,'')
  const btn=document.getElementById('edit-pt-save-btn')
  if(!name){alert('กรุณากรอกชื่อผู้ป่วย');return}
  const fileInput=document.getElementById('edit-pt-file')
  const file=fileInput?.files?.[0]||null
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  try{
    const visit_interval=parseInt(document.getElementById('edit-pt-visit-interval')?.value)||null
    const inject_interval=parseInt(document.getElementById('edit-pt-inject-interval')?.value)||null
    const medication_name=(document.getElementById('edit-pt-medication')?.value||'').trim()||null
    const oral_medication=(document.getElementById('edit-pt-oral-medication')?.value||'').trim()||null
    const house_no=(document.getElementById('edit-pt-house-no')?.value||'').trim()
    const next_visit_date=document.getElementById('edit-pt-next-visit-date')?.value||null
    const next_inject_date=document.getElementById('edit-pt-next-inject-date')?.value||null
    const updates={name,village,house_no,note,staff_responsible,aosomo_responsible,visit_interval,inject_interval,medication_name,oral_medication,next_visit_date,next_inject_date}
    if(canDo('admin'))updates.national_id=nidRaw
    const photoInput=document.getElementById('edit-pt-photo')
    const photoFile=photoInput?.files?.[0]||null
    if(photoFile){
      btn.textContent='กำลังอัพโหลดรูป...'
      const ext=photoFile.name.split('.').pop()
      const filename=`photos/${Date.now()}.${ext}`
      const{error:pe}=await sb.storage.from('patient-files').upload(filename,photoFile)
      if(pe)throw new Error('อัพโหลดรูปไม่สำเร็จ: '+pe.message)
      const{data:{publicUrl}}=sb.storage.from('patient-files').getPublicUrl(filename)
      const{data:cur}=await sb.from('patients').select('photo_urls').eq('id',id).single()
      updates.photo_urls=[publicUrl,...(cur?.photo_urls||[])]
      btn.textContent='กำลังบันทึก...'
    }
    if(file){
      btn.textContent='กำลังอัพโหลดไฟล์...'
      const ext=file.name.split('.').pop()
      const filename=`docs/${Date.now()}.${ext}`
      const{error:ue}=await sb.storage.from('patient-files').upload(filename,file)
      if(ue)throw new Error('อัพโหลดไฟล์ไม่สำเร็จ: '+ue.message)
      const{data:{publicUrl}}=sb.storage.from('patient-files').getPublicUrl(filename)
      updates.file_url=publicUrl
      btn.textContent='กำลังบันทึก...'
    }
    const{error}=await sb.from('patients').update(updates).eq('id',id)
    if(error)throw error
    _markOwnWrite(id)
    auditLog('edit_patient','patient',id,{name:updates.name})
    allPatients=await getPatients()
    await openModal(id)
  }catch(e){btn.textContent='❌ '+e.message;btn.disabled=false}
}
function toggleRecordForm(){
  const w=document.getElementById('record-form-wrap')
  if(!w)return
  const opening=w.style.display==='none'
  w.style.display=opening?'':'none'
  if(opening){
    window._modalRecType='injection'
    toggleRecType('injection')
  }
}
function toggleRecType(type){
  window._modalRecType=type
  const inj=document.getElementById('rec-type-inj')
  const vis=document.getElementById('rec-type-vis')
  const lbl=document.getElementById('rec-date-label')
  if(type==='injection'){
    inj.style.cssText='flex:1;padding:6px;border-radius:8px;border:2px solid var(--primary);background:var(--primary-lt);color:var(--primary);font-size:12px;font-weight:700;cursor:pointer;font-family:\'Sarabun\',sans-serif'
    vis.style.cssText='flex:1;padding:6px;border-radius:8px;border:2px solid var(--border);background:#fff;color:var(--text3);font-size:12px;font-weight:700;cursor:pointer;font-family:\'Sarabun\',sans-serif'
    if(lbl)lbl.textContent='วันที่ฉีดยา'
  }else{
    vis.style.cssText='flex:1;padding:6px;border-radius:8px;border:2px solid #ea580c;background:#fff7ed;color:#ea580c;font-size:12px;font-weight:700;cursor:pointer;font-family:\'Sarabun\',sans-serif'
    inj.style.cssText='flex:1;padding:6px;border-radius:8px;border:2px solid var(--border);background:#fff;color:var(--text3);font-size:12px;font-weight:700;cursor:pointer;font-family:\'Sarabun\',sans-serif'
    if(lbl)lbl.textContent='วันที่เยี่ยมบ้าน'
  }
  const intLbl=document.querySelector('label[for="rec-interval"]')||document.getElementById('rec-interval')?.previousElementSibling
  if(intLbl)intLbl.textContent=type==='visit'?'รอบเยี่ยมถัดไป':'รอบนัดต่อไป'
}

async function saveModalRecord(pid,gc){
  const date=document.getElementById('rec-date')?.value
  const note=document.getElementById('rec-note')?.value||''
  const medication_name=document.getElementById('rec-medication')?.value||null
  const btn=document.getElementById('rec-save-btn')
  if(!date){alert('กรุณาเลือกวันที่');return}
  const gl={red:'สุขภาพจิต กลุ่ม สีแดง',yellow:'สุขภาพจิต กลุ่ม สีเหลือง',green:'สุขภาพจิต กลุ่ม สีเขียว'}[gc]
  const {interval_str,interval_days}=getIntervalAndDays('rec-date','rec-interval','rec-next-date')
  // คำนวณวันนัดถัดไปจาก interval ถ้าไม่ได้เลือกปฏิทิน
  const _pickedNext=document.getElementById('rec-next-date')?.value||''
  const nextDate=_pickedNext||( date&&interval_days>0?(()=>{const d=new Date(date+'T00:00:00');d.setDate(d.getDate()+interval_days);return d.toISOString().split('T')[0]})():'' )
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  try{
    const record_type=window._modalRecType||'injection'
    const{data:newRec2,error}=await sb.from('injection_records').insert({patient_id:pid,injection_date:date,group_color:gc,group_label:gl,interval_str,interval_days,note,medication_name:medication_name||null,record_type,recorded_by:currentDisplayName||null}).select('id').single()
    if(error)throw error
    auditLog('create_record','injection_records',newRec2?.id,{patient_id:pid,record_type,injection_date:date})
    _markOwnWrite(pid)
    if(newRec2)_markOwnWrite(newRec2.id)
    // ถ้ามีวันนัดถัดไป
    if(nextDate&&nextDate>date){
      if(record_type==='visit'){
        // เยี่ยมบ้าน: อัปเดตเฉพาะ next_visit_date ไม่แตะ injection_records
        await sb.from('patients').update({next_visit_date:nextDate}).eq('id',pid)
      } else {
        // ฉีดยา: สร้าง record นัดหมายล่วงหน้า + อัปเดต next_inject_date
        await sb.from('injection_records').insert({patient_id:pid,injection_date:nextDate,group_color:gc,group_label:gl,interval_str,interval_days,note:'',record_type,recorded_by:currentDisplayName||null})
        await sb.from('patients').update({next_inject_date:nextDate}).eq('id',pid)
      }
    }
    closeModal()
    allPatients=await getPatients()
    const el=document.getElementById('page-content')
    if(el&&location.hash==='#patients')renderPatients(el)
  }catch(e){btn.textContent='❌ '+e.message;btn.disabled=false}
}

// ─── Visit Modal ─────────────────────────────────────────────────
function openVisitForm(type){
  if(type==='staff' && currentRole==='aosomo'){alert('อสม. ไม่มีสิทธิ์บันทึกแบบเจ้าหน้าที่');return}
  if(type==='aosomo' && currentRole==='staff'){alert('เจ้าหน้าที่ ไม่มีสิทธิ์บันทึกแบบ อสม.');return}
  const ov=document.getElementById('visit-overlay'),ct=document.getElementById('visit-content')
  if(!ov||!ct)return
  _visitType=type;_visitChecks=[];_visitProblems=[];_oasScores={s1:0,s2:0,s3:0};_redFlags=[];_ytAssess={ya:null,yati:null,sara:null};_assess10={};_mhAssess={twoq:{q1:null,q2:null,q3:null},rq:[5,5,5],st5:new Array(5).fill(null)};_gaf=null;_aims=new Array(12).fill(0);_cgb=new Array(12).fill(0);_medAdhere=null;_medReasons=[]
  const cl=type==='staff'?STAFF_CHECKLIST:AOSOMO_CHECKLIST
  const nameOpts=allPatients.map(p=>`<option value="${esc(p.name)}" data-village="${esc(p.village||'')}">`).join('')
  ct.innerHTML=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <div><div style="font-size:17px;font-weight:700">${type==='staff'?'🏥 บันทึกเยี่ยมบ้าน (เจ้าหน้าที่)':'🏡 บันทึกเยี่ยมบ้าน (อสม.)'}</div>
    <div style="font-size:12px;color:var(--text3);margin-top:2px">${type==='staff'?'แบบประเมินสำหรับเจ้าหน้าที่':'แบบประเมินสำหรับ อสม.'}</div></div>
    <button onclick="closeVisitModal()" style="background:none;border:none;cursor:pointer;color:var(--text3)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>
  <div class="form-group"><label>ชื่อผู้ป่วย</label><input list="vn-list" id="v-name" placeholder="เลือกหรือพิมพ์ชื่อ" oninput="autoFillVillage(this.value)"><datalist id="vn-list">${nameOpts}</datalist></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
    <div class="form-group" style="margin-bottom:0"><label>หมู่บ้าน</label><select id="v-village">${VILLAGES.map(v=>`<option>${v}</option>`).join('')}</select></div>
    <div class="form-group" style="margin-bottom:0"><label>วันที่เยี่ยม</label><input type="date" id="v-date" value="${todayISO()}"></div>
  </div>
  <div class="form-group"><label>${type==='staff'?'ผู้ออกเยี่ยม (เจ้าหน้าที่)':'อสม. ผู้ออกเยี่ยม'}</label><input type="text" id="v-visitor" value="${esc(currentDisplayName)}" placeholder="${type==='staff'?'ชื่อเจ้าหน้าที่...':'ชื่อ อสม....'}"></div>
  <div style="background:var(--bg);border-radius:10px;padding:10px 14px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700">รายการตรวจสอบ</div>
      <span id="score-badge" style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:var(--red-lt);color:var(--red)">0/${cl.length} · ต้องติดตาม</span>
    </div>
    ${cl.map(([id,lbl])=>`<div class="check-item" onclick="toggleCheck('${id}')"><div class="check-box" id="cb-${id}"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><span class="check-label">${esc(lbl)}</span></div>`).join('')}
  </div>
  ${type==='staff'?`
  <div style="background:#fff5f5;border-radius:10px;padding:10px 14px;margin-bottom:14px;border:1.5px solid #fecaca">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-size:13px;font-weight:700;color:#b91c1c">⚠️ ปัญหาที่พบ (ถ้ามี)</div>
      <span id="prob-badge" style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#fef2f2;color:#b91c1c;display:none">พบ <span id="prob-count">0</span> รายการ</span>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">กดเลือกปัญหาที่พบในการเยี่ยม — จะส่งต่อโดยอัตโนมัติถ้าพบปัญหา</div>
    ${AOSOMO_PROBLEMS.map(([id,lbl])=>`<div class="check-item" onclick="toggleProblem('${id}')" style="border-color:#fecaca"><div class="check-box" id="pb-${id}" style="border-color:#fca5a5;background:#fff"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><span class="check-label" style="color:#9f1239">${esc(lbl)}</span></div>`).join('')}
  </div>
  <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:14px;border:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700">📊 แบบประเมิน OAS</div>
      <span id="oas-badge" style="padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#f3f4f6;color:var(--text3)">ไม่พบพฤติกรรม</span>
    </div>
    ${[
      ['s1','พฤติกรรมก้าวร้าวต่อตนเอง',
        'ไม่พบ',
        'ขีดข่วน ตีตนเอง ดึงผม รอยขนาดเล็ก',
        'ทำร้ายตนเองรุนแรง มีรอยซ้ำ เลือดออก หมดสติ',
        'ทำร้ายตนเองรุนแรงมาก อวัยวะภายในได้รับอันตราย'],
      ['s2','พฤติกรรมก้าวร้าวต่อผู้อื่น (คำพูด/การกระทำ)',
        'ไม่พบ',
        'ตะโกน ด่าด้วยถ้อยคำไม่รุนแรง',
        'ด่าหยาบ คุกคาม ผลัก ตี แต่ไม่บาดเจ็บ',
        'ทำร้ายผู้อื่นจนบาดเจ็บ กระดูกหัก หมดสติ'],
      ['s3','พฤติกรรมก้าวร้าวต่อทรัพย์สิน',
        'ไม่พบ',
        'ปิดประตูเสียงดัง รื้อข้าวของกระจัดกระจาย',
        'ขว้าง เตะ ทุบวัตถุหรือสิ่งของ',
        'ทุบกระจก ขว้างมีด จุดไฟเผา สิ่งของแตกหัก'],
    ].map(([sid,label,l0,l1,l2,l3])=>`
    <div style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;color:var(--text1);margin-bottom:6px">${label}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px">
        ${[[0,l0,'#f3f4f6','var(--text3)'],[1,l1,'#fef3c7','#92400e'],[2,l2,'#fee2e2','var(--red)'],[3,l3,'#fecaca','#991b1b']].map(([score,desc,bg,clr])=>`
        <button type="button" id="oas-${sid}-${score}" onclick="setOAS('${sid}',${score})"
          style="padding:6px 4px;border-radius:8px;border:2px solid transparent;background:${bg};color:${clr};font-size:10px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;line-height:1.3;text-align:center">
          <div style="font-size:13px;font-weight:800">${score}</div>
          <div style="font-size:9px;margin-top:2px;opacity:.85">${desc.length>20?desc.slice(0,18)+'…':desc}</div>
        </button>`).join('')}
      </div>
    </div>`).join('')}
    <div id="oas-detail" style="font-size:11px;color:var(--text3);padding:8px 10px;background:#fff;border-radius:6px;border:1px solid var(--border);display:none"></div>
  </div>
  <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:14px;border:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div>
        <div style="font-size:13px;font-weight:700">📋 แบบติดตาม 10 ด้าน</div>
        <div style="font-size:11px;color:var(--text3)">แบบติดตามผู้ป่วยจิตเวชเรื้อรังในชุมชน (คะแนน 10–30)</div>
      </div>
      <span id="a10-badge" style="padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#f3f4f6;color:var(--text3)">ยังไม่ประเมิน</span>
    </div>
    ${ASSESS10_DOMAINS.map(({id,title,opts})=>`
    <div style="background:#fff;border-radius:8px;padding:10px 12px;margin-bottom:8px;border:1px solid var(--border)">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px;color:var(--text1)">${title}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px">
        ${opts.map(([score,label,desc])=>`
        <button type="button" id="a10-${id}-${score}" onclick="setAssess10('${id}',${score})"
          style="padding:6px 4px;border-radius:8px;border:2px solid #e5e7eb;background:#f9fafb;color:var(--text2);font-size:11px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;line-height:1.3;text-align:center">
          <div style="font-size:13px;font-weight:800;margin-bottom:2px">${score}</div>
          <div style="font-size:10px;font-weight:700">${label}</div>
          <div style="font-size:9px;opacity:.7;margin-top:1px">${desc.length>18?desc.slice(0,16)+'…':desc}</div>
        </button>`).join('')}
      </div>
    </div>`).join('')}
    <div id="a10-result" style="display:none;margin-top:4px;padding:12px 14px;border-radius:10px;font-size:13px;font-weight:700;text-align:center"></div>
  </div>
  <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:14px;border:1px solid var(--border)">
    <div style="font-size:13px;font-weight:700;margin-bottom:8px">🎯 GAF — ระดับการทำหน้าที่ในชีวิตประจำวัน</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <span style="font-size:12px;color:var(--text3)">1</span>
      <input type="range" min="1" max="100" value="50" id="gaf-range" oninput="updateGAF(this.value)" style="flex:1;accent-color:#0a7ea4">
      <span style="font-size:12px;color:var(--text3)">100</span>
      <span id="gaf-val" style="font-size:16px;font-weight:800;color:#0a7ea4;min-width:32px;text-align:right">50</span>
    </div>
    <div id="gaf-desc" style="font-size:12px;padding:6px 10px;background:#fff;border-radius:6px;border:1px solid var(--border);color:var(--text2)">ปานกลาง — มีอาการหรือความบกพร่องในการทำงานระดับปานกลาง</div>
  </div>

  <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:14px;border:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div>
        <div style="font-size:13px;font-weight:700">🔄 AIMS — ผลข้างเคียงยา</div>
        <div style="font-size:11px;color:var(--text3)">Abnormal Involuntary Movement Scale</div>
      </div>
      <span id="aims-badge" style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#f3f4f6;color:var(--text3)">0 คะแนน</span>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">0=ไม่มี · 1=น้อยมาก · 2=น้อย · 3=ปานกลาง · 4=มาก</div>
    ${AIMS_ITEMS.map((item,i)=>`
    <div style="margin-bottom:8px">
      <div style="font-size:12px;color:var(--text1);margin-bottom:4px">${i+1}. ${item}</div>
      <div style="display:flex;gap:4px">
        ${[0,1,2,3,4].map(j=>`<button type="button" id="aims-${i}-${j}" onclick="setAIMS(${i},${j})" style="flex:1;padding:6px 0;border-radius:6px;border:2px solid ${j===0?'#0a7ea4':'#d1d5db'};background:${j===0?'#0a7ea4':'#f3f4f6'};color:${j===0?'#fff':'#374151'};font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">${j}</button>`).join('')}
      </div>
    </div>`).join('')}
    <div id="aims-result" style="margin-top:4px;padding:8px 12px;border-radius:8px;background:#f0fdf4;color:#15803d;font-size:12px;font-weight:700">รวม: 0 — ไม่พบผลข้างเคียง</div>
  </div>`:''}

  ${type==='aosomo'?`
  <div style="background:#fff5f5;border-radius:10px;padding:10px 14px;margin-bottom:14px;border:1.5px solid #fecaca">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div style="font-size:13px;font-weight:700;color:#b91c1c">⚠️ ปัญหาที่พบ (ถ้ามี)</div>
      <span id="prob-badge" style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#fef2f2;color:#b91c1c;display:none">พบ <span id="prob-count">0</span> รายการ</span>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">กดเลือกปัญหาที่พบในการเยี่ยม — จะส่งต่อโดยอัตโนมัติถ้าพบปัญหา</div>
    ${AOSOMO_PROBLEMS.map(([id,lbl])=>`<div class="check-item" onclick="toggleProblem('${id}')" style="border-color:#fecaca"><div class="check-box" id="pb-${id}" style="border-color:#fca5a5;background:#fff"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><span class="check-label" style="color:#9f1239">${esc(lbl)}</span></div>`).join('')}
  </div>
  <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:14px;border:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700">🚩 แบบประเมิน 5 Red Flags</div>
      <span id="rf-badge" style="padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#f3f4f6;color:var(--text3)">ไม่พบความเสี่ยง</span>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">ปัจจัยเสี่ยงอาการทางจิตกำเริบ — กดเลือก "มี" หากพบอาการ</div>
    ${[
      ['rf1','ไม่หลับไม่นอน','มีปัญหาการนอน นอนไม่หลับ ไม่ยอมนอน หลับๆตื่นๆ'],
      ['rf2','เดินไปเดินมา','ผุดลุกผุดนั่ง นั่งไม่ติด เดินไปเดินมา มีพฤติกรรมแปลกๆ'],
      ['rf3','พูดจาคนเดียว','พูด ยิ้ม หัวเราะคนเดียว'],
      ['rf4','หงุดหงิดฉุนเฉียว','อารมณ์แปรปรวน เดี๋ยวดีเดี๋ยวร้าย หงุดหงิดง่าย ฉุนเฉียว'],
      ['rf5','เที่ยวหวาดระแวง','มีอาการหวาดระแวง คิดว่าคนไม่หวังดี นินทาว่าร้าย มีคนคอยติดตามจะทำร้าย'],
    ].map(([id,title,desc])=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#fff;border-radius:8px;margin-bottom:6px;border:1px solid var(--border)" id="rf-row-${id}">
      <div style="flex:1;min-width:0;margin-right:10px">
        <div style="font-size:13px;font-weight:700;color:var(--text1)">${title}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:1px">${desc}</div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button type="button" id="rf-yes-${id}" onclick="toggleRedFlag('${id}',true)"
          style="padding:6px 12px;border-radius:6px;border:2px solid #d1d5db;background:#f3f4f6;color:var(--text2);font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">มี</button>
        <button type="button" id="rf-no-${id}" onclick="toggleRedFlag('${id}',false)"
          style="padding:6px 12px;border-radius:6px;border:2px solid var(--primary);background:var(--primary-lt);color:var(--primary);font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">ไม่มี</button>
      </div>
    </div>`).join('')}
    <div id="rf-alert" style="display:none;margin-top:8px;padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12px;color:#b91c1c;font-weight:600">
      ⚠️ พบปัจจัยเสี่ยง! แจ้งญาติ/ผู้ดูแลและเจ้าหน้าที่ รพ.สต. ทันที
    </div>
  </div>
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px 14px;margin-bottom:14px">
    <div style="font-size:13px;font-weight:700;color:#0369a1;margin-bottom:12px">🧠 แบบประเมินสุขภาพใจ <span style="font-size:11px;font-weight:400;color:var(--text3)">(ไม่บังคับ)</span></div>
    <div id="mh-assess-wrap">
      <!-- 2Q+ -->
      <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px">
        <div style="font-size:12px;font-weight:700;color:#0c4a6e;margin-bottom:8px">📋 แบบคัดกรองภาวะซึมเศร้า (2Q+)</div>
        ${[['q1','ใน 2 สัปดาห์ที่ผ่านมา รู้สึก หดหู่ เศร้า หรือท้อแท้สิ้นหวัง'],['q2','ใน 2 สัปดาห์ที่ผ่านมา รู้สึก เบื่อ ทำอะไรก็ไม่เพลิดเพลิน']].map(([q,label])=>`
        <div style="margin-bottom:8px">
          <div style="font-size:12px;color:var(--text1);margin-bottom:4px">${label}</div>
          <div style="display:flex;gap:6px">
            <button type="button" id="2q-no-${q}" onclick="set2Q('${q}',0)" style="flex:1;padding:7px;border-radius:6px;border:2px solid #d1d5db;background:#f3f4f6;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;color:#374151">ไม่ใช่</button>
            <button type="button" id="2q-yes-${q}" onclick="set2Q('${q}',1)" style="flex:1;padding:7px;border-radius:6px;border:2px solid #d1d5db;background:#f3f4f6;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;color:#374151">ใช่</button>
          </div>
        </div>`).join('')}
        <div id="2q-q3-row" style="margin-bottom:8px;padding:8px;background:#fef9c3;border-radius:6px;border:1px solid #fde047">
          <div style="font-size:11px;font-weight:700;color:#854d0e;margin-bottom:6px">⚠️ คำถามคัดกรองการฆ่าตัวตาย</div>
          <div style="font-size:12px;color:var(--text1);margin-bottom:4px">ใน 1 เดือนที่ผ่านมา มีความรู้สึกทุกข์ใจไม่อยากมีชีวิตอยู่ หรือไม่</div>
          <div style="display:flex;gap:6px">
            <button type="button" id="2q-no-q3" onclick="set2Q('q3',0)" style="flex:1;padding:7px;border-radius:6px;border:2px solid #d1d5db;background:#f3f4f6;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;color:#374151">ไม่ใช่</button>
            <button type="button" id="2q-yes-q3" onclick="set2Q('q3',1)" style="flex:1;padding:7px;border-radius:6px;border:2px solid #d1d5db;background:#f3f4f6;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;color:#374151">ใช่</button>
          </div>
        </div>
        <div id="2q-score" style="display:none"></div>
      </div>
      <!-- CGB -->
      <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px">
        <div onclick="toggleAssess('cgb-body')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none">
          <div style="font-size:12px;font-weight:700;color:#0c4a6e">👨‍👩‍👧 ภาระผู้ดูแล (Caregiver Burden)</div>
          <div style="display:flex;align-items:center;gap:8px">
            <span id="cgb-badge" style="padding:3px 8px;border-radius:20px;font-size:11px;font-weight:700;background:#f3f4f6;color:var(--text3)">ยังไม่ประเมิน</span>
            <span id="cgb-body-chevron" style="font-size:11px;color:var(--text3)">▶</span>
          </div>
        </div>
        <div id="cgb-body" style="display:none;margin-top:8px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px">0=ไม่เลย · 1=นานๆครั้ง · 2=บางครั้ง · 3=บ่อยครั้ง · 4=เสมอ</div>
          ${CGB_ITEMS.map((item,i)=>`
          <div style="margin-bottom:8px">
            <div style="font-size:12px;color:var(--text1);margin-bottom:4px">${i+1}. ${item}</div>
            <div style="display:flex;gap:3px">
              ${[0,1,2,3,4].map(j=>`<button type="button" id="cgb-${i}-${j}" onclick="setCGB(${i},${j})" style="flex:1;padding:6px 0;border-radius:6px;border:2px solid ${j===0?'#0a7ea4':'#d1d5db'};background:${j===0?'#0a7ea4':'#f3f4f6'};color:${j===0?'#fff':'#374151'};font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">${j}</button>`).join('')}
            </div>
          </div>`).join('')}
          <div id="cgb-result" style="margin-top:4px;padding:8px 12px;border-radius:8px;background:#f0fdf4;color:#15803d;font-size:12px;font-weight:700;display:none"></div>
        </div>
      </div>
      <!-- ST-5 -->
      <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px">
        <div onclick="toggleAssess('st5-body')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none">
          <div style="font-size:12px;font-weight:700;color:#0c4a6e">😣 แบบประเมินความเครียด (ST-5)</div>
          <span id="st5-body-chevron" style="font-size:11px;color:var(--text3)">▶</span>
        </div>
        <div id="st5-body" style="display:none;margin-top:8px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px">ใน 2 สัปดาห์ที่ผ่านมา รวมวันนี้</div>
          ${['มีปัญหาการนอน นอนไม่หลับ / นอนมากเกินไป','มีสมาธิน้อยลง','หุดหยิด / กระวนกระวาย / วิตกกังวล','รู้สึกเบื่อเซ็ง','ไม่อยากพบปะผู้คน'].map((q,i)=>`
          <div style="margin-bottom:8px">
            <div style="font-size:12px;color:var(--text1);margin-bottom:4px">${i+1}. ${q}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
              ${['แทบไม่มี','เป็นบางครั้ง','บ่อยครั้ง','เป็นประจำ'].map((opt,j)=>`<button type="button" id="st5-${i}-${j}" onclick="setMHOption('st5',${i},${j})" style="padding:6px 4px;border-radius:6px;border:2px solid #d1d5db;background:#f3f4f6;font-size:11px;font-weight:600;cursor:pointer;font-family:'Sarabun',sans-serif;color:#374151">${opt}</button>`).join('')}
            </div>
          </div>`).join('')}
          <div id="st5-score" style="display:none"></div>
        </div>
      </div>
      <!-- RQ -->
      <div style="background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px">
        <div onclick="toggleAssess('rq-body')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none">
          <div style="font-size:12px;font-weight:700;color:#0c4a6e">🧡 แบบประเมินพลังใจ (RQ)</div>
          <span id="rq-body-chevron" style="font-size:11px;color:var(--text3)">▶</span>
        </div>
        <div id="rq-body" style="display:none;margin-top:8px">
          <div style="font-size:11px;color:var(--text3);margin-bottom:8px">ใน 2 สัปดาห์ที่ผ่านมา ระดับความเชื่อมั่น 1=น้อยที่สุด 10=มากที่สุด</div>
          ${['ความยากลำบากทำให้ฉันแกร่งขึ้น','ฉันมีกำลังใจและได้รับการสนับสนุนจากคนรอบข้าง','การแก้ไขปัญหาทำให้ฉันมีประสบการณ์มากขึ้น'].map((q,i)=>`
          <div style="margin-bottom:10px">
            <div style="font-size:12px;color:var(--text1);margin-bottom:4px">${i+1}. ${q}</div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:16px">😔</span>
              <input type="range" min="1" max="10" value="5" id="rq-${i}" oninput="updateRQSlider(${i},this.value)" style="flex:1;accent-color:#0a7ea4">
              <span style="font-size:16px">😊</span>
              <span id="rq-val-${i}" style="font-size:13px;font-weight:700;color:#0a7ea4;min-width:20px;text-align:right">5</span>
            </div>
          </div>`).join('')}
          <div id="rq-score" style="display:none"></div>
        </div>
      </div>
    </div>
  </div>
  <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:14px;border:1px solid var(--border)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;font-weight:700">💊 ยาดี · ญาติดี · ไม่ใช้สารเสพติด</div>
      <span id="yt-badge" style="padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#f3f4f6;color:var(--text3)">ยังไม่ประเมิน</span>
    </div>
    ${[
      ['ya','💊 ยา','ผู้ป่วยรับประทานยาตามแพทย์สั่งต่อเนื่อง','ดี','ไม่ดี'],
      ['yati','👨‍👩‍👧 ญาติ','ครอบครัวดูแล ไม่ทอดทิ้ง อยู่ใกล้ชิด','ดี','ไม่ดี'],
      ['sara','🚫 สารเสพติด','ไม่มีการใช้สารเสพติด สุรา บุหรี่เกินขนาด','ไม่ใช้','ใช้'],
    ].map(([key,label,desc,good,bad])=>`
    <div style="background:#fff;border-radius:8px;padding:10px 12px;margin-bottom:8px;border:1px solid var(--border)">
      <div style="font-size:13px;font-weight:700;margin-bottom:2px">${label}</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px">${desc}</div>
      <div style="display:flex;gap:6px">
        <button type="button" id="yt-good-${key}" onclick="setYT('${key}',true)"
          style="flex:1;padding:8px;border-radius:8px;border:2px solid #d1d5db;background:#f3f4f6;color:var(--text2);font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">✅ ${good}</button>
        <button type="button" id="yt-bad-${key}" onclick="setYT('${key}',false)"
          style="flex:1;padding:8px;border-radius:8px;border:2px solid #d1d5db;background:#f3f4f6;color:var(--text2);font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">❌ ${bad}</button>
      </div>
    </div>`).join('')}
    <div id="yt-result" style="display:none;margin-top:4px;padding:12px 14px;border-radius:10px;font-size:13px;font-weight:700;text-align:center"></div>
  </div>
  <div style="background:var(--bg);border-radius:10px;padding:12px 14px;margin-bottom:14px;border:1px solid var(--border)">
    <div style="font-size:13px;font-weight:700;margin-bottom:8px">💊 แบบติดตามการรับประทานยา</div>
    <div style="background:#fff;border-radius:8px;padding:10px 12px;border:1px solid var(--border);margin-bottom:8px">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px">กินยาครบทุกวันในสัปดาห์ที่ผ่านมาหรือไม่</div>
      <div style="display:flex;gap:6px">
        <button type="button" id="med-yes" onclick="setMedAdhere(true)" style="flex:1;padding:8px;border-radius:8px;border:2px solid #22c55e;background:#f0fdf4;color:#15803d;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">✅ กินครบ</button>
        <button type="button" id="med-no" onclick="setMedAdhere(false)" style="flex:1;padding:8px;border-radius:8px;border:2px solid #d1d5db;background:#f3f4f6;color:var(--text2);font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">❌ ขาดยา</button>
      </div>
    </div>
    <div id="med-missed-wrap" style="display:none;background:#fff;border-radius:8px;padding:10px 12px;border:1px solid var(--border);margin-bottom:8px">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px">จำนวนวันที่ขาดยา (ในสัปดาห์ที่ผ่านมา)</div>
      <input type="number" id="med-missed-days" min="0" max="7" value="0" style="width:80px;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:'Sarabun',sans-serif;font-size:14px;text-align:center">
      <div style="font-size:12px;font-weight:700;margin:8px 0 4px">สาเหตุที่ขาดยา</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${['ลืมกิน','ไม่อยากกิน','ยาหมด','ผลข้างเคียง','อื่นๆ'].map(r=>`<button type="button" id="med-reason-${r}" onclick="toggleMedReason('${r}')" style="padding:4px 10px;border-radius:20px;border:2px solid #d1d5db;background:#f3f4f6;color:var(--text2);font-size:11px;font-weight:600;cursor:pointer;font-family:'Sarabun',sans-serif">${r}</button>`).join('')}
      </div>
    </div>
    <div style="background:#fff;border-radius:8px;padding:10px 12px;border:1px solid var(--border)">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px">อาการข้างเคียงที่สังเกตได้ (ถ้ามี)</div>
      <input type="text" id="med-side-effects" placeholder="เช่น ง่วงมาก มือสั่น แข็งเกร็ง..." style="width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-family:'Sarabun',sans-serif;font-size:12px">
    </div>
`:''}
  <div class="form-group"><label>บันทึกเพิ่มเติม</label><textarea id="v-note" rows="3" style="resize:none;font-family:'Sarabun',sans-serif" placeholder="อาการ สิ่งที่พบ ข้อสังเกต..."></textarea></div>
  <div class="form-group"><label>📷 รูปถ่าย (ไม่บังคับ)</label><input type="file" id="v-photo" accept="image/*" capture="environment" style="width:100%;box-sizing:border-box"><div id="v-photo-preview" style="margin-top:6px"></div></div>
  <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--red-lt);border:1px solid var(--red-bd);border-radius:8px;margin-bottom:14px">
    <div><div style="font-size:13px;font-weight:700;color:var(--red)">ต้องการส่งต่อ / รายงานเร่งด่วน</div><div style="font-size:11px;color:var(--text3)">กรณีพบความเสี่ยงสูง</div></div>
    <label class="toggle"><input type="checkbox" id="v-refer"><span class="toggle-slider"></span></label>
  </div>
  <div style="display:flex;gap:10px">
    <button class="btn btn-primary" style="flex:1" id="v-save-btn" onclick="saveVisitRecord()">บันทึกการเยี่ยม</button>
    <button class="btn btn-outline" onclick="closeVisitModal()">ยกเลิก</button>
  </div>`
  ov.style.display='flex'
}
function closeVisitModal(){document.getElementById('visit-overlay').style.display='none'}
async function resolveReferral(id){
  const btn=event?.target
  if(btn){btn.textContent='⏳ กำลังบันทึก...';btn.disabled=true}
  const{error}=await sb.from('home_visits').update({refer_resolved:true}).eq('id',id)
  if(error){alert('เกิดข้อผิดพลาด: '+error.message);if(btn){btn.textContent='✅ รับเรื่องแล้ว';btn.disabled=false}return}
  auditLog('resolve_referral','visit',id)
  renderPage('admin')
}
// ── GAF / BPRS / AIMS ─────────────────────────────────────────
function updateGAF(val){
  _gaf=parseInt(val)
  const el=document.getElementById('gaf-val')
  const desc=document.getElementById('gaf-desc')
  if(el)el.textContent=val
  if(!desc)return
  let txt
  if(val>=91)txt='ดีเยี่ยม — ไม่มีอาการ ทำหน้าที่ได้ดีเยี่ยม'
  else if(val>=81)txt='ดีมาก — อาการน้อยมาก หรือไม่มีอาการ'
  else if(val>=71)txt='ดี — อาการเล็กน้อย บกพร่องเล็กน้อย'
  else if(val>=61)txt='ค่อนข้างดี — มีปัญหาเล็กน้อย'
  else if(val>=51)txt='ปานกลาง — มีอาการหรือความบกพร่องปานกลาง'
  else if(val>=41)txt='ค่อนข้างน้อย — มีอาการรุนแรง บกพร่องในการทำงาน'
  else if(val>=31)txt='น้อย — มีความบกพร่องมาก ต้องการการดูแล'
  else if(val>=21)txt='น้อยมาก — ต้องการการดูแลอย่างใกล้ชิด'
  else if(val>=11)txt='ต้องดูแลใกล้ชิดมาก'
  else txt='อันตราย — ต้องการการดูแลแบบ 24 ชั่วโมง'
  desc.textContent=txt
}
function setAIMS(idx,val){
  _aims[idx]=val
  for(let j=0;j<5;j++){
    const b=document.getElementById(`aims-${idx}-${j}`)
    if(!b)continue
    if(j===val){b.style.background='#0a7ea4';b.style.color='#fff';b.style.borderColor='#0a7ea4'}
    else{b.style.background='#f3f4f6';b.style.color='#374151';b.style.borderColor='#d1d5db'}
  }
  const total=_aims.reduce((a,b)=>a+b,0)
  const badge=document.getElementById('aims-badge')
  const result=document.getElementById('aims-result')
  if(badge)badge.textContent=`${total} คะแนน`
  if(!result)return
  let txt,bg,color
  if(total===0){txt='รวม: 0 — ไม่พบผลข้างเคียง';bg='#f0fdf4';color='#15803d'}
  else if(total<=4){txt=`รวม: ${total} — ผลข้างเคียงน้อย`;bg='#fefce8';color='#854d0e'}
  else if(total<=8){txt=`รวม: ${total} — ผลข้างเคียงปานกลาง`;bg='#fff7ed';color='#c2410c'}
  else{txt=`รวม: ${total} — ผลข้างเคียงมาก ควรปรึกษาแพทย์`;bg='#fef2f2';color='#b91c1c'}
  result.style.cssText=`margin-top:4px;padding:8px 12px;border-radius:8px;background:${bg};color:${color};font-size:12px;font-weight:700`
  result.textContent=txt
}
// ── อสม. Medication / Caregiver ──────────────────────────────
let _medAdhere=null
let _medReasons=[]
function setMedAdhere(taken){
  _medAdhere=taken
  const yes=document.getElementById('med-yes'),no=document.getElementById('med-no')
  const wrap=document.getElementById('med-missed-wrap')
  if(taken){
    if(yes){yes.style.background='#f0fdf4';yes.style.borderColor='#22c55e'}
    if(no){no.style.background='#f3f4f6';no.style.borderColor='#d1d5db'}
    if(wrap)wrap.style.display='none'
  }else{
    if(yes){yes.style.background='#f3f4f6';yes.style.borderColor='#d1d5db'}
    if(no){no.style.background='#fef2f2';no.style.borderColor='#ef4444'}
    if(wrap)wrap.style.display='block'
  }
}
function toggleMedReason(r){
  const idx=_medReasons.indexOf(r)
  const btn=document.getElementById(`med-reason-${r}`)
  if(idx===-1){
    _medReasons.push(r)
    if(btn){btn.style.background='#0a7ea4';btn.style.color='#fff';btn.style.borderColor='#0a7ea4'}
  }else{
    _medReasons.splice(idx,1)
    if(btn){btn.style.background='#f3f4f6';btn.style.color='var(--text2)';btn.style.borderColor='#d1d5db'}
  }
}
function toggleAssess(id){
  const el=document.getElementById(id)
  const ch=document.getElementById(id+'-chevron')
  if(!el)return
  const open=el.style.display==='none'||el.style.display===''&&el.hidden
  el.style.display=open?'block':'none'
  if(ch)ch.textContent=open?'▼':'▶'
}
function setCGB(idx,val){
  _cgb[idx]=val
  for(let j=0;j<5;j++){
    const b=document.getElementById(`cgb-${idx}-${j}`)
    if(!b)continue
    if(j===val){b.style.background='#0a7ea4';b.style.color='#fff';b.style.borderColor='#0a7ea4'}
    else{b.style.background='#f3f4f6';b.style.color='#374151';b.style.borderColor='#d1d5db'}
  }
  const filled=_cgb.filter(v=>v>0)
  if(!filled.length){const r=document.getElementById('cgb-result');if(r)r.style.display='none';return}
  const total=_cgb.reduce((a,b)=>a+b,0)
  const badge=document.getElementById('cgb-badge')
  const result=document.getElementById('cgb-result')
  if(badge)badge.textContent=`${total} คะแนน`
  if(!result)return
  let txt,bg,color
  if(total<=20){txt=`ภาระ: ${total} — น้อย`;bg='#f0fdf4';color='#15803d'}
  else if(total<=40){txt=`ภาระ: ${total} — ปานกลาง`;bg='#fff7ed';color='#c2410c'}
  else{txt=`ภาระ: ${total} — มาก ควรให้การสนับสนุน`;bg='#fef2f2';color='#b91c1c'}
  result.style.cssText=`display:block;margin-top:4px;padding:8px 12px;border-radius:8px;background:${bg};color:${color};font-size:12px;font-weight:700`
  result.textContent=txt
}
// ── แบบประเมินสุขภาพใจ ──────────────────────────────────────
function set2Q(q,val){
  _mhAssess.twoq[q]=val
  const yes=document.getElementById(`2q-yes-${q}`),no=document.getElementById(`2q-no-${q}`)
  if(yes)yes.style.cssText=yes.style.cssText.replace(/background:[^;]+/,val===1?'background:#fef2f2':'background:#f3f4f6')
  if(yes)yes.style.borderColor=val===1?'#ef4444':'#d1d5db'
  if(no)no.style.cssText=no.style.cssText.replace(/background:[^;]+/,val===0?'background:#f0fdf4':'background:#f3f4f6')
  if(no)no.style.borderColor=val===0?'#22c55e':'#d1d5db'
  update2QScore()
}
function update2QScore(){
  const el=document.getElementById('2q-score')
  if(!el)return
  const {q1,q2,q3}=_mhAssess.twoq
  if(q1===null&&q2===null){el.style.display='none';return}
  const s=(q1||0)+(q2||0)
  const suicide=q3===1
  let txt,bg,color
  if(suicide){txt='⚠️ ความเสี่ยงสูง — ต้องส่งต่อด่วน';bg='#fef2f2';color='#b91c1c';const r=document.getElementById('v-refer');if(r)r.checked=true}
  else if(s===0){txt='ผลลัพธ์: ไม่พบภาวะซึมเศร้า';bg='#f0fdf4';color='#15803d'}
  else{txt=`ผลลัพธ์: คะแนน ${s}/2 — ควรประเมินเพิ่มเติม (PHQ-9)`;bg='#fefce8';color='#854d0e'}
  el.style.cssText=`display:block;margin-top:8px;padding:8px 12px;border-radius:8px;background:${bg};color:${color};font-size:12px;font-weight:700`
  el.textContent=txt
}
function setMHOption(type,idx,val){
  _mhAssess[type][idx]=val
  const opts=['แทบไม่มี','เป็นบางครั้ง','บ่อยครั้ง','เป็นประจำ']
  for(let i=0;i<4;i++){
    const b=document.getElementById(`${type}-${idx}-${i}`)
    if(!b)continue
    if(i===val){b.style.background='#0a7ea4';b.style.color='#fff';b.style.borderColor='#0a7ea4'}
    else{b.style.background='#f3f4f6';b.style.color='#374151';b.style.borderColor='#d1d5db'}
  }
  updateMHScores(type)
}
function updateRQSlider(idx,val){
  _mhAssess.rq[idx]=parseInt(val)
  const lbl=document.getElementById(`rq-val-${idx}`)
  if(lbl)lbl.textContent=val
  updateMHScores('rq')
}
function updateMHScores(type){
  const el=document.getElementById(`${type}-score`)
  if(!el)return
  if(type==='st5'){
    const ans=_mhAssess.st5,filled=ans.filter(v=>v!==null)
    if(!filled.length){el.style.display='none';return}
    const s=filled.reduce((a,b)=>a+b,0)
    const full=ans.length,partial=filled.length<full?` (${filled.length}/${full} ข้อ)`:''
    let txt,bg,color
    if(s<=4){txt=`ST-5: ${s} คะแนน${partial} — ไม่มีความเครียด`;bg='#f0fdf4';color='#15803d'}
    else if(s<=7){txt=`ST-5: ${s} คะแนน${partial} — เครียดเล็กน้อย`;bg='#fefce8';color='#854d0e'}
    else if(s<=9){txt=`ST-5: ${s} คะแนน${partial} — เครียดปานกลาง`;bg='#fff7ed';color='#c2410c'}
    else{txt=`ST-5: ${s} คะแนน${partial} — เครียดมาก`;bg='#fef2f2';color='#b91c1c'}
    el.style.cssText=`display:block;margin-top:8px;padding:8px 12px;border-radius:8px;background:${bg};color:${color};font-size:12px;font-weight:700`
    el.textContent=txt
  } else if(type==='rq'){
    const s=_mhAssess.rq.reduce((a,b)=>a+b,0)
    let txt,bg,color
    if(s<=17){txt=`RQ: ${s} คะแนน — พลังใจต่ำ`;bg='#fef2f2';color='#b91c1c'}
    else if(s<=23){txt=`RQ: ${s} คะแนน — พลังใจปานกลาง`;bg='#fefce8';color='#854d0e'}
    else{txt=`RQ: ${s} คะแนน — พลังใจดี`;bg='#f0fdf4';color='#15803d'}
    el.style.cssText=`display:block;margin-top:8px;padding:8px 12px;border-radius:8px;background:${bg};color:${color};font-size:12px;font-weight:700`
    el.textContent=txt
  }
}
function getMHAssessJSON(){
  const {twoq,rq,st5}=_mhAssess
  const anyMHFilled=[twoq.q1,twoq.q2,...st5].some(v=>v!==null)
  const anyNewFilled=_gaf!==null||_aims.some(v=>v>0)||_medAdhere!==null||_cgb.some(v=>v>0)
  if(!anyMHFilled&&rq.every(v=>v===5)&&!anyNewFilled)return null
  return{
    twoq:{q1:twoq.q1,q2:twoq.q2,q3:twoq.q3,score:(twoq.q1||0)+(twoq.q2||0),suicide:twoq.q3===1},
    rq:{scores:rq,total:rq.reduce((a,b)=>a+b,0)},
    st5:{scores:st5,total:st5.filter(v=>v!==null).reduce((a,b)=>a+b,0)},
    gaf:_gaf,
    aims:_aims.some(v=>v>0)?{scores:[..._aims],total:_aims.reduce((a,b)=>a+b,0)}:null,
    medAdhere:_medAdhere!==null?{taken:_medAdhere,missedDays:parseInt(document.getElementById('med-missed-days')?.value||0),reasons:[..._medReasons],sideEffects:document.getElementById('med-side-effects')?.value||''}:null,
    cgb:_cgb.some(v=>v>0)?{scores:[..._cgb],total:_cgb.reduce((a,b)=>a+b,0)}:null
  }
}
// ──────────────────────────────────────────────────────────────
function toggleCheck(id){
  const idx=_visitChecks.indexOf(id),cb=document.getElementById('cb-'+id)
  if(idx===-1){_visitChecks.push(id);cb?.classList.add('checked')}else{_visitChecks.splice(idx,1);cb?.classList.remove('checked')}
  updateScore()
}
function toggleProblem(id){
  const idx=_visitProblems.indexOf(id),cb=document.getElementById('pb-'+id)
  if(idx===-1){_visitProblems.push(id);cb?.classList.add('checked')}else{_visitProblems.splice(idx,1);cb?.classList.remove('checked')}
  const badge=document.getElementById('prob-badge'),cnt=document.getElementById('prob-count')
  if(badge){badge.style.display=_visitProblems.length?'':'none';if(cnt)cnt.textContent=_visitProblems.length}
  if(_visitProblems.length>0){const r=document.getElementById('v-refer');if(r)r.checked=true}
}
function updateScore(){
  const cl=_visitType==='staff'?STAFF_CHECKLIST:AOSOMO_CHECKLIST,n=_visitChecks.length,max=cl.length,pct=max>0?n/max:0
  let bg,clr,lbl
  if(pct>=0.8){bg='var(--green-lt)';clr='var(--green)';lbl='ปกติดี'}else if(pct>=0.5){bg='var(--yellow-lt)';clr='var(--yellow)';lbl='พอใช้'}else{bg='var(--red-lt)';clr='var(--red)';lbl='ต้องติดตาม'}
  const b=document.getElementById('score-badge');if(b){b.textContent=`${n}/${max} · ${lbl}`;b.style.background=bg;b.style.color=clr}
}
function setOAS(sid,score){
  _oasScores[sid]=score
  // อัพเดตสไตล์ปุ่มในแถวนั้น
  for(let i=0;i<=3;i++){
    const btn=document.getElementById(`oas-${sid}-${i}`)
    if(btn)btn.style.border=i===score?'2px solid #374151':'2px solid transparent'
  }
  updateOASBadge()
}
function updateOASBadge(){
  const max=Math.max(_oasScores.s1,_oasScores.s2,_oasScores.s3)
  const badge=document.getElementById('oas-badge')
  const detail=document.getElementById('oas-detail')
  const LEVELS=[
    {bg:'#f3f4f6',clr:'var(--text3)',label:'ไม่พบพฤติกรรม',desc:''},
    {bg:'#fef3c7',clr:'#92400e',label:'OAS=1 กึ่งเร่งด่วน',desc:'ต้องจัดการภายใน 24 ชั่วโมง'},
    {bg:'#fee2e2',clr:'var(--red)',label:'OAS=2 เร่งด่วน',desc:'ต้องจัดการภายใน 2 ชั่วโมง'},
    {bg:'#fecaca',clr:'#991b1b',label:'OAS=3 ฉุกเฉิน',desc:'ต้องจัดการทันทีทันใด'},
  ]
  const lv=LEVELS[max]||LEVELS[0]
  if(badge){badge.textContent=lv.label;badge.style.background=lv.bg;badge.style.color=lv.clr}
  if(detail){
    if(max>0){
      detail.style.display='block'
      detail.innerHTML=`⚠️ <strong>${lv.label}</strong> — ${lv.desc}<br>ต่อตนเอง: ${_oasScores.s1} · ต่อผู้อื่น: ${_oasScores.s2} · ต่อทรัพย์สิน: ${_oasScores.s3}`
      detail.style.color=lv.clr
    } else {
      detail.style.display='none'
    }
  }
  // เปิด toggle ส่งต่ออัตโนมัติถ้า OAS >= 2
  const refer=document.getElementById('v-refer')
  if(refer&&max>=2)refer.checked=true
}

function toggleRedFlag(id,found){
  if(found){
    if(!_redFlags.includes(id))_redFlags.push(id)
  }else{
    _redFlags=_redFlags.filter(x=>x!==id)
  }
  const yesBtn=document.getElementById('rf-yes-'+id)
  const noBtn=document.getElementById('rf-no-'+id)
  const row=document.getElementById('rf-row-'+id)
  if(found){
    if(yesBtn){yesBtn.style.background='#fef2f2';yesBtn.style.borderColor='#f87171';yesBtn.style.color='#b91c1c'}
    if(noBtn){noBtn.style.background='#f3f4f6';noBtn.style.borderColor='#d1d5db';noBtn.style.color='var(--text2)'}
    if(row)row.style.borderColor='#f87171'
  }else{
    if(yesBtn){yesBtn.style.background='#f3f4f6';yesBtn.style.borderColor='#d1d5db';yesBtn.style.color='var(--text2)'}
    if(noBtn){noBtn.style.background='var(--primary-lt)';noBtn.style.borderColor='var(--primary)';noBtn.style.color='var(--primary)'}
    if(row)row.style.borderColor='var(--border)'
  }
  const hasRisk=_redFlags.length>0
  const badge=document.getElementById('rf-badge')
  const alert=document.getElementById('rf-alert')
  const refer=document.getElementById('v-refer')
  if(badge){
    badge.textContent=hasRisk?`พบ ${_redFlags.length} ปัจจัยเสี่ยง`:'ไม่พบความเสี่ยง'
    badge.style.background=hasRisk?'#fef2f2':'#f3f4f6'
    badge.style.color=hasRisk?'#b91c1c':'var(--text3)'
  }
  if(alert)alert.style.display=hasRisk?'block':'none'
  if(refer&&hasRisk)refer.checked=true
}
function setYT(key, isGood){
  _ytAssess[key]=isGood
  const goodBtn=document.getElementById('yt-good-'+key)
  const badBtn=document.getElementById('yt-bad-'+key)
  const activeStyle='border:2px solid;font-weight:800'
  if(goodBtn){goodBtn.style.background=isGood?'#dcfce7':'#f3f4f6';goodBtn.style.borderColor=isGood?'#16a34a':'#d1d5db';goodBtn.style.color=isGood?'#15803d':'var(--text2)'}
  if(badBtn){badBtn.style.background=!isGood?'#fef2f2':'#f3f4f6';badBtn.style.borderColor=!isGood?'#f87171':'#d1d5db';badBtn.style.color=!isGood?'#b91c1c':'var(--text2)'}
  // คำนวณสีผลลัพธ์
  const {ya,yati,sara}=_ytAssess
  if(ya===null||yati===null||sara===null)return
  const badCount=[ya===false,yati===false,sara===false].filter(Boolean).length
  let color,bg,border,msg
  if(badCount===0){color='#15803d';bg='#dcfce7';border='#86efac';msg='🟢 สีเขียว — ยาดี ญาติดี ไม่ใช้สารเสพติด'}
  else if(badCount===1){color='#92400e';bg='#fef9c3';border='#fde047';msg='🟡 สีเหลือง — มีข้อใดข้อหนึ่งไม่ดี ต้องติดตามภายใน 15 วัน'}
  else{color='#b91c1c';bg='#fef2f2';border='#fca5a5';msg='🔴 สีแดง — เสี่ยงสูง/วิกฤต แจ้งเจ้าหน้าที่ รพ.สต. ทันที';const r=document.getElementById('v-refer');if(r)r.checked=true}
  const badge=document.getElementById('yt-badge')
  const result=document.getElementById('yt-result')
  if(badge){badge.textContent=msg.split(' — ')[0];badge.style.background=bg;badge.style.color=color;badge.style.borderColor=border}
  if(result){result.style.display='block';result.style.background=bg;result.style.border=`1px solid ${border}`;result.style.color=color;result.textContent=msg}
}
function getYTText(){
  const {ya,yati,sara}=_ytAssess
  if(ya===null&&yati===null&&sara===null)return''
  const labels=[ya===null?'ยา:?':ya?'ยา:ดี':'ยา:ไม่ดี',yati===null?'ญาติ:?':yati?'ญาติ:ดี':'ญาติ:ไม่ดี',sara===null?'สาร:?':sara?'สาร:ไม่ใช้':'สาร:ใช้']
  const badCount=[ya===false,yati===false,sara===false].filter(Boolean).length
  const colorLabel=badCount===0?'สีเขียว':badCount===1?'สีเหลือง':'สีแดง'
  return`\n[ยาดี-ญาติดี-สาร] ${labels.join(' ')} → ${colorLabel}`
}
function setAssess10(domainId, score){
  _assess10[domainId]=score
  // อัปเดตปุ่ม
  for(let s=1;s<=3;s++){
    const btn=document.getElementById(`a10-${domainId}-${s}`)
    if(!btn)continue
    const active=s===score
    const colors=s===1?['#dcfce7','#16a34a','#15803d']:s===2?['#fef9c3','#ca8a04','#92400e']:['#fef2f2','#f87171','#b91c1c']
    btn.style.background=active?colors[0]:'#f9fafb'
    btn.style.borderColor=active?colors[1]:'#e5e7eb'
    btn.style.color=active?colors[2]:'var(--text2)'
  }
  // คำนวณคะแนนรวม
  const filled=Object.keys(_assess10).length
  const total=Object.values(_assess10).reduce((a,b)=>a+b,0)
  const badge=document.getElementById('a10-badge')
  const result=document.getElementById('a10-result')
  if(filled<10){
    if(badge){badge.textContent=`${filled}/10 ด้าน`;badge.style.background='#f3f4f6';badge.style.color='var(--text3)'}
    return
  }
  let bg,border,color,level
  if(total<=14){bg='#dcfce7';border='#86efac';color='#15803d';level='🟢 ผ่านเกณฑ์ดี'}
  else if(total<=19){bg='#fef9c3';border='#fde047';color='#92400e';level='🟡 ต้องติดตามต่อเนื่อง'}
  else{bg='#fef2f2';border='#fca5a5';color='#b91c1c';level='🔴 ต้องการความช่วยเหลือเร่งด่วน';const r=document.getElementById('v-refer');if(r)r.checked=true}
  if(badge){badge.textContent=`รวม ${total} คะแนน · ${level}`;badge.style.background=bg;badge.style.color=color}
  if(result){result.style.display='block';result.style.background=bg;result.style.border=`1px solid ${border}`;result.style.color=color;result.textContent=`คะแนนรวม ${total}/30 — ${level}`}
}
function getAssess10Text(){
  if(!Object.keys(_assess10).length)return''
  const total=Object.values(_assess10).reduce((a,b)=>a+b,0)
  const level=total<=14?'ผ่านเกณฑ์ดี':total<=19?'ต้องติดตาม':'ต้องการความช่วยเหลือเร่งด่วน'
  const details=ASSESS10_DOMAINS.map(({id,title,opts})=>{
    const s=_assess10[id];if(!s)return null
    const opt=opts.find(o=>o[0]===s);return`${title.split('.')[0]}=${s}(${opt?opt[1]:'?'})`
  }).filter(Boolean).join(' ')
  return`\n[แบบ10ด้าน] รวม ${total}/30 → ${level} | ${details}`
}

function autoFillVillage(name){
  const found=allPatients.find(p=>p.name===name)
  if(found){const sel=document.getElementById('v-village');if(sel)for(const o of sel.options)if(o.value===found.village||o.text===found.village){o.selected=true;break}}
}
async function saveVisitRecord(){
  const name=document.getElementById('v-name')?.value?.trim()
  const village=document.getElementById('v-village')?.value
  const date=document.getElementById('v-date')?.value
  const visitor=document.getElementById('v-visitor')?.value?.trim()||''
  const note=document.getElementById('v-note')?.value?.trim()||''
  const refer=document.getElementById('v-refer')?.checked||false
  const btn=document.getElementById('v-save-btn')
  if(!name||!date){alert('กรุณากรอกชื่อและวันที่');return}
  // จับคู่ชื่อแบบไม่สนช่องว่างซ้ำ — ถ้าไม่พบ ต้องยืนยันก่อน (เดิมบันทึก patient_id เป็น null เงียบๆ)
  const normName=v=>String(v||'').replace(/\s+/g,' ').trim()
  const found=allPatients.find(p=>normName(p.name)===normName(name))
  if(!found&&!confirm(`⚠️ ไม่พบ "${name}" ในทะเบียนผู้ป่วย\n\nบันทึกนี้จะไม่ผูกกับประวัติผู้ป่วย (ไม่ขึ้นในหน้าประวัติของผู้ป่วยคนใด)\n\nกด "ตกลง" เพื่อบันทึกต่อ หรือ "ยกเลิก" เพื่อกลับไปเลือกชื่อจากรายการ`))return
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  // รวม OAS ลงใน note ถ้าเป็น staff
  const oasMax=Math.max(_oasScores.s1,_oasScores.s2,_oasScores.s3)
  const oasText=_visitType==='staff'&&oasMax>0
    ?`\n[OAS=${oasMax}] ต่อตนเอง:${_oasScores.s1} ต่อผู้อื่น:${_oasScores.s2} ต่อทรัพย์สิน:${_oasScores.s3}`
    :''
  // รวม Red Flags ลงใน note ถ้าเป็น aosomo
  const RF_LABELS={rf1:'ไม่หลับไม่นอน',rf2:'เดินไปเดินมา',rf3:'พูดจาคนเดียว',rf4:'หงุดหงิดฉุนเฉียว',rf5:'หวาดระแวง'}
  const rfText=_visitType==='aosomo'&&_redFlags.length>0
    ?`\n[5 Red Flags] พบ: ${_redFlags.map(id=>RF_LABELS[id]).join(', ')}`
    :''
  const ytText=_visitType==='aosomo'?getYTText():''
  const a10Text=_visitType==='staff'?getAssess10Text():''
  const probText=_visitProblems.length>0?`\n[ปัญหาที่พบ] ${_visitProblems.map(id=>AOSOMO_PROBLEMS.find(([pid])=>pid===id)?.[1]||id).join(' | ')}`:''
  const fullNote=(note+oasText+rfText+ytText+a10Text+probText).trim()
  const photoFile=document.getElementById('v-photo')?.files?.[0]||null
  let photoUrl=null
  if(photoFile){
    btn.textContent='กำลังอัพโหลดรูป...'
    const ext=photoFile.name.split('.').pop()
    const filename=`visits/${Date.now()}.${ext}`
    const{error:ue}=await sb.storage.from('patient-files').upload(filename,photoFile)
    if(!ue){const{data:{publicUrl}}=sb.storage.from('patient-files').getPublicUrl(filename);photoUrl=publicUrl}
    btn.textContent='กำลังบันทึก...'
  }
  try{
    const assessment_json=getMHAssessJSON()
    const{data:savedVisit,error}=await sb.from('home_visits').insert({patient_id:found?.id||null,patient_name:name,village,visit_type:_visitType,visit_date:date,visitor,checks_json:JSON.stringify(_visitChecks),score:_visitChecks.length,note:fullNote,refer,photo_url:photoUrl,assessment_json}).select('id').single()
    if(error)throw error
    if(savedVisit)_markOwnWrite(savedVisit.id)
    auditLog('save_visit','visit',found?.id||null,{patient_name:name,visit_type:_visitType,refer})
    sendLineVisitReport({patient_name:name,village,visit_type:_visitType,visit_date:date,visitor,score:_visitChecks.length,refer})
    if(refer&&_visitType==='staff'){
      const RF_LABELS2={rf1:'ไม่หลับไม่นอน',rf2:'เดินไปเดินมา',rf3:'พูดจาคนเดียว',rf4:'หงุดหงิดฉุนเฉียว',rf5:'หวาดระแวง'}
      const a10Total=Object.keys(_assess10).length?Object.values(_assess10).reduce((a,b)=>a+b,0):0
      const a10Level=a10Total?a10Total<=14?'ผ่านเกณฑ์ดี':a10Total<=19?'ต้องติดตาม':'ต้องการความช่วยเหลือเร่งด่วน':''
      const a10Full=ASSESS10_DOMAINS.map(({id,title,opts})=>{
        const s=_assess10[id];if(!s)return null
        const o=opts.find(x=>x[0]===s)
        return`${title.replace(/^\d+\. /,'')}: ${s} (${o?o[1]:'?'})`
      }).filter(Boolean)
      const oasLabels={
        s1:['ไม่พบ','ขีดข่วน/ตีตนเอง','ทำร้ายรุนแรง มีรอยซ้ำ','ทำร้ายรุนแรงมาก'],
        s2:['ไม่พบ','ตะโกน ด่าทอ','คุกคาม/ผลัก/ตี','ทำร้ายจนบาดเจ็บ'],
        s3:['ไม่พบ','ปิดประตูดัง รื้อของ','ขว้าง/เตะ/ทุบ','ทุบกระจก/จุดไฟ']
      }
      const checkFull=STAFF_CHECKLIST.map(([id,lbl])=>(_visitChecks.includes(id)?'✅':'❌')+' '+lbl)
      sendReferralToHospital({
        patient_name:name, village, visit_date:date, visitor,
        house_no:found?.house_no||'', national_id:found?.national_id||'',
        disease_code:found?.disease_code||'', disease_name:found?.disease_name||'',
        group_color:found?.group_color||'', group_label:found?.group_label||'',
        medication_name:found?.medication_name||'', next_date:found?.next_date||'',
        score:_visitChecks.length, checkFull,
        oasScores:{..._oasScores}, oasLabels,
        redFlags:_redFlags.map(id=>RF_LABELS2[id]),
        assess10Total:a10Total||null, assess10Level:a10Level, assess10Full:a10Full,
        note
      })
    }
    closeVisitModal()
    if(location.hash==='#visit')navigate('visit')
  }catch(e){btn.textContent='❌ '+e.message;btn.disabled=false}
}

// ─── Auth ────────────────────────────────────────────────────────
function showAuthWall(mode='login'){
  const wall=document.getElementById('auth-wall')
  const ct=document.getElementById('auth-content')
  wall.style.display='flex'
  if(mode==='login'){
    ct.innerHTML=`
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:40px;margin-bottom:6px">🏥</div>
      <div style="font-size:22px;font-weight:800;color:var(--primary)">JitHome</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px;white-space:pre-line;line-height:1.5">${esc(appSubtitle)}</div>
    </div>
    <div style="font-size:16px;font-weight:700;margin-bottom:16px;color:var(--text1)">เข้าสู่ระบบ</div>
    <div class="form-group"><label>Email</label><input type="email" id="auth-email" placeholder="example@email.com" autocomplete="email"></div>
    <div class="form-group"><label>รหัสผ่าน</label><input type="password" id="auth-password" placeholder="รหัสผ่าน" onkeydown="if(event.key==='Enter')loginUser()"></div>
    <div style="text-align:right;margin-top:-8px;margin-bottom:10px"><a href="#" onclick="showAuthWall('forgot');return false" style="font-size:12px;color:var(--text3)">ลืมรหัสผ่าน?</a></div>
    <div id="auth-error" style="color:var(--red);font-size:12px;margin-bottom:10px;min-height:16px"></div>
    <button class="btn btn-primary btn-block" id="auth-btn" onclick="loginUser()">เข้าสู่ระบบ</button>
    <div style="margin-top:14px;padding:10px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:11px;color:#0369a1;line-height:1.6">
      🔒 <strong>นโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)</strong><br>
      ระบบนี้ดำเนินการภายใต้กระทรวงสาธารณสุข เพื่อการดูแลผู้ป่วยจิตเวชในชุมชน ข้อมูลสุขภาพถูกเก็บรักษาอย่างปลอดภัย เข้าถึงได้เฉพาะบุคลากรที่ได้รับอนุญาต
    </div>
    <div style="text-align:center;margin-top:12px;font-size:13px;color:var(--text3)">ยังไม่มีบัญชี? <a href="#" onclick="showAuthWall('register');return false" style="color:var(--primary);font-weight:700">สมัครสมาชิก</a></div>
    <div style="text-align:center;margin-top:6px;font-size:12px"><a href="#" onclick="showAuthWall('register_aosomo');return false" style="color:#7c3aed;font-weight:700">🏡 อสม. — สมัครด้วยตนเองที่นี่</a></div>`
  } else if(mode==='forgot'){
    ct.innerHTML=`
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:40px;margin-bottom:6px">🔑</div>
      <div style="font-size:22px;font-weight:800;color:var(--primary)">JitHome</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px">รีเซ็ตรหัสผ่าน</div>
    </div>
    <div style="font-size:16px;font-weight:700;margin-bottom:8px;color:var(--text1)">ลืมรหัสผ่าน</div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:16px">กรอก Email ที่ใช้สมัคร ระบบจะส่งลิงค์รีเซ็ตรหัสผ่านให้</div>
    <div class="form-group"><label>Email</label><input type="email" id="auth-email" placeholder="example@email.com" autocomplete="email" onkeydown="if(event.key==='Enter')sendResetEmail()"></div>
    <div id="auth-error" style="font-size:12px;margin-bottom:10px;min-height:16px"></div>
    <button class="btn btn-primary btn-block" id="auth-btn" onclick="sendResetEmail()">ส่งลิงค์รีเซ็ตรหัสผ่าน</button>
    <div style="text-align:center;margin-top:16px;font-size:13px;color:var(--text3)"><a href="#" onclick="showAuthWall('login');return false" style="color:var(--primary);font-weight:700">← กลับหน้าเข้าสู่ระบบ</a></div>`
  } else if(mode==='reset'){
    ct.innerHTML=`
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:40px;margin-bottom:6px">🔒</div>
      <div style="font-size:22px;font-weight:800;color:var(--primary)">JitHome</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px">ตั้งรหัสผ่านใหม่</div>
    </div>
    <div style="font-size:16px;font-weight:700;margin-bottom:16px;color:var(--text1)">ตั้งรหัสผ่านใหม่</div>
    <div class="form-group"><label>รหัสผ่านใหม่</label><input type="password" id="auth-password" placeholder="อย่างน้อย 6 ตัวอักษร"></div>
    <div class="form-group"><label>ยืนยันรหัสผ่านใหม่</label><input type="password" id="auth-password2" placeholder="พิมพ์รหัสผ่านอีกครั้ง" onkeydown="if(event.key==='Enter')resetPassword()"></div>
    <div class="form-group" id="reset-mfa-group" style="display:none"><label>รหัส 6 หลักจากแอป Authenticator</label><input type="text" id="reset-mfa-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" onkeydown="if(event.key==='Enter')resetPassword()"></div>
    <div id="auth-error" style="color:var(--red);font-size:12px;margin-bottom:10px;min-height:16px"></div>
    <button class="btn btn-primary btn-block" id="auth-btn" onclick="resetPassword()">บันทึกรหัสผ่านใหม่</button>`
  } else if(mode==='register_aosomo'){
    const vOpts=VILLAGES.map(v=>`<option>${v}</option>`).join('')
    ct.innerHTML=`
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:36px;margin-bottom:6px">🏡</div>
      <div style="font-size:20px;font-weight:800;color:#7c3aed">สมัครเป็น อสม.</div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">กรอกข้อมูลเพื่อส่งคำขอสมัครสมาชิก</div>
    </div>
    <div class="form-group"><label>ชื่อ-นามสกุล *</label><input type="text" id="rg-name" placeholder="เช่น นางสมศรี ใจดี" style="width:100%;box-sizing:border-box"></div>
    <div class="form-group"><label>เบอร์โทรศัพท์ * (ใช้เป็นชื่อผู้ใช้)</label><input type="tel" id="rg-phone" placeholder="0812345678" maxlength="10" inputmode="numeric" style="width:100%;box-sizing:border-box"></div>
    <div class="form-group"><label>รหัสผ่าน * (อย่างน้อย 8 ตัวอักษร)</label><input type="password" id="rg-password" placeholder="ตั้งรหัสผ่านที่จำได้ง่าย" style="width:100%;box-sizing:border-box"></div>
    <div class="form-group"><label>เลขบัตรประชาชน (ไม่บังคับ)</label><input type="text" id="rg-nid" placeholder="1234567890123" maxlength="13" inputmode="numeric" style="width:100%;box-sizing:border-box"></div>
    <div class="form-group"><label>หมู่บ้าน</label><select id="rg-village" style="width:100%">${vOpts}</select></div>
    <div class="form-group"><label>ไฟล์แนบ เช่น สำเนาบัตร อสม. (ไม่บังคับ)</label><input type="file" id="rg-file" accept="image/*,.pdf" style="width:100%;box-sizing:border-box"></div>
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:12px;padding:10px 12px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px">
      <input type="checkbox" id="rg-consent" style="margin-top:2px;flex-shrink:0">
      <label for="rg-consent" style="font-size:11px;color:#5b21b6;line-height:1.6;cursor:pointer">ข้าพเจ้ายินยอมให้ระบบ JitHome เก็บข้อมูลส่วนบุคคล (ชื่อ เบอร์โทร เลขบัตรประชาชน) เพื่อการดูแลสุขภาพในชุมชน ตาม พ.ร.บ. PDPA พ.ศ.2562</label>
    </div>
    <div id="auth-error" style="color:var(--red);font-size:12px;margin-bottom:10px;min-height:16px"></div>
    <button class="btn btn-primary btn-block" id="auth-btn" onclick="registerAosomo()" style="background:#7c3aed;border-color:#7c3aed">🏡 ส่งคำขอสมัคร อสม.</button>
    <div style="text-align:center;margin-top:16px;font-size:13px;color:var(--text3)">มีบัญชีแล้ว? <a href="#" onclick="showAuthWall('login');return false" style="color:var(--primary);font-weight:700">เข้าสู่ระบบ</a></div>`
  } else if(mode==='mfa_verify'){
    ct.innerHTML=`
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:40px;margin-bottom:6px">🔐</div>
      <div style="font-size:20px;font-weight:800;color:var(--primary)">ยืนยันตัวตน 2FA</div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px">กรอกรหัส 6 หลักจากแอป Authenticator</div>
    </div>
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#0369a1;line-height:1.6">
      📱 เปิดแอป <strong>Google Authenticator</strong> หรือ <strong>Authy</strong><br>แล้วกรอกรหัส 6 หลักที่แสดงสำหรับ <strong>JitHome</strong>
    </div>
    <div class="form-group">
      <label>รหัส OTP</label>
      <input type="text" id="mfa-otp" inputmode="numeric" maxlength="6" placeholder="000000"
        autocomplete="one-time-code"
        onkeydown="if(event.key==='Enter')mfaVerify()"
        style="font-size:28px;letter-spacing:10px;text-align:center;font-family:monospace;font-weight:700">
    </div>
    <div id="mfa-error" style="color:var(--red);font-size:12px;margin-bottom:10px;min-height:16px"></div>
    <button class="btn btn-primary btn-block" id="mfa-btn" onclick="mfaVerify()">ยืนยัน</button>
    <div style="text-align:center;margin-top:12px;font-size:12px"><a href="#" onclick="logoutUser();return false" style="color:var(--text3)">← ยกเลิกและออกจากระบบ</a></div>`
    setTimeout(()=>document.getElementById('mfa-otp')?.focus(),100)
  } else if(mode==='mfa_enroll'){
    const qr=_mfaEnrollData?.totp?.qr_code||''
    const secret=_mfaEnrollData?.totp?.secret||''
    ct.innerHTML=`
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:36px;margin-bottom:6px">📱</div>
      <div style="font-size:18px;font-weight:800;color:var(--primary)">ตั้งค่า 2-Factor Authentication</div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px">บัญชี admin ต้องการการยืนยันตัวตน 2 ชั้น</div>
    </div>
    <div style="background:#fefce8;border:1.5px solid #fde68a;border-radius:10px;padding:12px;margin-bottom:14px;font-size:12px;color:#92400e;line-height:1.6">
      1️⃣ ติดตั้งแอป <strong>Google Authenticator</strong> หรือ <strong>Authy</strong><br>
      2️⃣ กด <strong>"+"</strong> → <strong>สแกน QR code</strong> ด้านล่าง<br>
      3️⃣ กรอกรหัส 6 หลักที่แสดงในแอปเพื่อยืนยัน
    </div>
    <div style="text-align:center;margin-bottom:12px">
      <img id="mfa-qr-img" style="width:180px;height:180px;border:3px solid var(--border);border-radius:10px" alt="QR Code">
    </div>
    ${secret?`<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:12px">
      <div style="font-size:10px;color:var(--text3);margin-bottom:4px">รหัส Manual Entry (กรณีสแกนไม่ได้)</div>
      <div style="font-family:monospace;font-size:13px;font-weight:700;letter-spacing:2px;color:var(--text1);word-break:break-all">${secret}</div>
    </div>`:''}
    <div class="form-group">
      <label>รหัส OTP จากแอป (6 หลัก)</label>
      <input type="text" id="mfa-otp" inputmode="numeric" maxlength="6" placeholder="000000"
        autocomplete="one-time-code"
        onkeydown="if(event.key==='Enter')mfaEnrollConfirm()"
        style="font-size:24px;letter-spacing:8px;text-align:center;font-family:monospace;font-weight:700">
    </div>
    <div id="mfa-error" style="color:var(--red);font-size:12px;margin-bottom:10px;min-height:16px"></div>
    <button class="btn btn-primary btn-block" id="mfa-enroll-btn" onclick="mfaEnrollConfirm()">ยืนยันและเปิดใช้ 2FA</button>
    <div style="text-align:center;margin-top:12px;font-size:12px"><a href="#" onclick="logoutUser();return false" style="color:var(--text3)">← ยกเลิกและออกจากระบบ</a></div>`
    const _qrImg=document.getElementById('mfa-qr-img')
    if(_qrImg&&_mfaEnrollData?.totp?.qr_code)_qrImg.src=_mfaEnrollData.totp.qr_code
    setTimeout(()=>document.getElementById('mfa-otp')?.focus(),100)
  } else if(mode==='submitted'){
    ct.innerHTML=`
    <div style="text-align:center;padding:16px 0">
      <div style="font-size:48px;margin-bottom:12px">✅</div>
      <div style="font-size:20px;font-weight:800;color:#166534;margin-bottom:8px">ส่งคำขอสมัครแล้ว!</div>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px;margin-bottom:16px;text-align:left">
        <div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:6px">ขั้นตอนถัดไป:</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.8">1. ผู้ดูแลระบบจะตรวจสอบข้อมูลของคุณ<br>2. เมื่ออนุมัติแล้ว คุณจะสามารถเข้าสู่ระบบได้<br>3. ใช้ <strong>เบอร์โทรศัพท์</strong> เป็นชื่อผู้ใช้และรหัสผ่าน</div>
      </div>
      <button class="btn btn-outline btn-block" onclick="showAuthWall('login')">← กลับหน้าเข้าสู่ระบบ</button>
    </div>`
  } else if(mode==='confidentiality'){
    const terms=confidentialityTerms()
    ct.innerHTML=`
    <div style="text-align:center;margin-bottom:14px">
      <div style="font-size:36px;margin-bottom:4px">🔐</div>
      <div style="font-size:17px;font-weight:800;color:var(--primary);line-height:1.4">ข้อตกลงรักษาความลับ<br>และคุ้มครองข้อมูลส่วนบุคคล</div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px">อ่านและยอมรับก่อนเข้าดูข้อมูลผู้ป่วย</div>
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px;max-height:46vh;overflow-y:auto;font-size:13px;line-height:1.7;color:var(--text1)">
      <p style="margin:0 0 8px">ข้าพเจ้า <b>${esc(currentDisplayName||'')}</b> ผู้ใช้งานระบบ JitHome ของ <b>${esc(hospitalName)}</b> ซึ่งเป็นผู้ควบคุมข้อมูลส่วนบุคคล รับทราบว่าข้อมูลในระบบเป็น<b>ข้อมูลสุขภาพซึ่งเป็นข้อมูลส่วนบุคคลที่อ่อนไหว</b> และการที่บุคคลใดเป็นผู้ป่วยจิตเวชถือเป็นความลับ จึงตกลงดังนี้</p>
      <ol style="margin:0;padding-left:20px">${terms.map(t=>`<li style="margin-bottom:6px">${esc(t)}</li>`).join('')}</ol>
      <p style="margin:8px 0 0;font-size:11.5px;color:var(--text3)">ระบบบันทึกการเข้าใช้งานและการแก้ไขข้อมูลของข้าพเจ้าไว้เพื่อความปลอดภัย รวมถึงชื่อ วัน และเวลาที่ยอมรับข้อตกลงนี้</p>
    </div>
    <label style="display:flex;align-items:flex-start;gap:8px;margin:14px 0 8px;font-size:13px;cursor:pointer;line-height:1.5">
      <input type="checkbox" id="conf-check" style="margin-top:3px;flex-shrink:0;width:18px;height:18px" onchange="document.getElementById('conf-accept-btn').disabled=!this.checked">
      <span>ข้าพเจ้าได้อ่านและเข้าใจข้อตกลงทั้งหมดแล้ว และ<b>ยินยอมปฏิบัติตาม</b></span>
    </label>
    <div id="conf-error" style="color:var(--red);font-size:12px;margin-bottom:8px;min-height:16px"></div>
    <button class="btn btn-primary btn-block" id="conf-accept-btn" disabled onclick="acceptConfidentiality()">ยอมรับและเข้าใช้งาน</button>
    <button class="btn btn-outline btn-block" style="margin-top:8px" onclick="declineConfidentiality()">ไม่ยอมรับ (ออกจากระบบ)</button>`
  } else if(mode==='suspended'||mode==='rejected'){
    const sus=mode==='suspended'
    ct.innerHTML=`
    <div style="text-align:center;padding:16px 0">
      <div style="font-size:48px;margin-bottom:12px">${sus?'⏸️':'⛔'}</div>
      <div style="font-size:20px;font-weight:800;color:#4b5563;margin-bottom:8px">${sus?'บัญชีถูกระงับการใช้งาน':'ไม่สามารถเข้าใช้งานได้'}</div>
      <div style="background:#f3f4f6;border:1px solid #d1d5db;border-radius:10px;padding:14px;margin-bottom:16px;font-size:12px;color:var(--text3);line-height:1.6">
        ${sus?'ผู้ดูแลระบบระงับบัญชีนี้ไว้ชั่วคราว':'บัญชีนี้ไม่ได้รับอนุมัติหรือถูกลบออกจากระบบ'}<br>หากเห็นว่าไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบของหน่วยงาน
      </div>
      <button class="btn btn-outline btn-block" onclick="showAuthWall('login')">← กลับหน้าเข้าสู่ระบบ</button>
    </div>`
  } else if(mode==='pending'){
    ct.innerHTML=`
    <div style="text-align:center;padding:16px 0">
      <div style="font-size:48px;margin-bottom:12px">⏳</div>
      <div style="font-size:20px;font-weight:800;color:#7c3aed;margin-bottom:8px">รอการอนุมัติ</div>
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:14px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:#5b21b6;margin-bottom:6px">บัญชีของคุณกำลังรอการตรวจสอบ</div>
        <div style="font-size:12px;color:var(--text3);line-height:1.6">กรุณารอให้ผู้ดูแลระบบอนุมัติ<br>เมื่ออนุมัติแล้ว ลองเข้าสู่ระบบอีกครั้ง</div>
      </div>
      <button class="btn btn-outline btn-block" onclick="logoutUser()">ออกจากระบบ</button>
    </div>`
  } else {
    ct.innerHTML=`
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:40px;margin-bottom:6px">🏥</div>
      <div style="font-size:22px;font-weight:800;color:var(--primary)">JitHome</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px;white-space:pre-line;line-height:1.5">${esc(appSubtitle)}</div>
    </div>
    <div style="font-size:16px;font-weight:700;margin-bottom:16px;color:var(--text1)">สมัครสมาชิก</div>
    <div class="form-group"><label>Email</label><input type="email" id="auth-email" placeholder="example@email.com" autocomplete="email"></div>
    <div class="form-group"><label>รหัสผ่าน</label><input type="password" id="auth-password" placeholder="อย่างน้อย 6 ตัวอักษร"></div>
    <div class="form-group"><label>ยืนยันรหัสผ่าน</label><input type="password" id="auth-password2" placeholder="พิมพ์รหัสผ่านอีกครั้ง" onkeydown="if(event.key==='Enter')registerUser()"></div>
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:12px;padding:10px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px">
      <input type="checkbox" id="auth-pdpa-consent" style="margin-top:2px;flex-shrink:0">
      <label for="auth-pdpa-consent" style="font-size:11px;color:#0369a1;line-height:1.6;cursor:pointer">
        ข้าพเจ้ารับทราบและยินยอมให้ระบบ JitHome เก็บและประมวลผลข้อมูลส่วนบุคคล เพื่อการดูแลผู้ป่วยจิตเวชภายใต้กระทรวงสาธารณสุข ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ.2562
      </label>
    </div>
    <div id="auth-error" style="color:var(--red);font-size:12px;margin-bottom:10px;min-height:16px"></div>
    <button class="btn btn-primary btn-block" id="auth-btn" onclick="registerUser()">สมัครสมาชิก</button>
    <div style="text-align:center;margin-top:16px;font-size:13px;color:var(--text3)">มีบัญชีแล้ว? <a href="#" onclick="showAuthWall('login');return false" style="color:var(--primary);font-weight:700">เข้าสู่ระบบ</a></div>`
  }
}

function hideAuthWall(){
  const wall=document.getElementById('auth-wall')
  if(wall)wall.style.display='none'
}

// Server-side login lockout (ISO 27001:2022 A.8.5) — stored in Supabase login_lockouts table
async function _checkLoginLock(email){
  let{data,error}=await sb.rpc('check_login_lock',{p_email:email.toLowerCase()})
  // ยังไม่ได้รัน sql/security/01_prepare.sql → ใช้วิธีเดิมไปก่อน
  if(error?.code==='PGRST202')({data,error}=await sb.from('login_lockouts').select('*').eq('email',email.toLowerCase()).maybeSingle())
  data=Array.isArray(data)?data[0]:data
  // fail-closed: ถ้า DB error ให้บล็อกการล็อกอินไว้ก่อน เพื่อป้องกัน bypass
  if(error)return'ระบบตรวจสอบชั่วคราวไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง'
  if(!data)return null
  if(data.locked_until&&new Date(data.locked_until)>new Date()){
    const mins=Math.ceil((new Date(data.locked_until)-new Date())/60000)
    return`ล็อกบัญชีชั่วคราว กรุณารอ ${mins} นาที (พยายามผิด ${data.attempt_count} ครั้ง) — ติดต่อผู้ดูแลระบบเพื่อปลดล็อก`
  }
  return null
}
async function _recordFailedLogin(email){
  // ใช้ atomic SQL function เพื่อป้องกัน TOCTOU race condition
  const{data,error}=await sb.rpc('record_failed_login',{p_email:email.toLowerCase()})
  if(error){console.error('_recordFailedLogin error:',error);return 1}
  return data||1
}
async function _clearLoginLock(email){
  try{await sb.from('login_lockouts').delete().eq('email',email.toLowerCase())}catch(e){}
}
async function adminUnlockAccount(email){
  if(!canDo('admin')){alert('ไม่มีสิทธิ์');return}
  if(!confirm(`ปลดล็อกบัญชี ${email}?`))return
  const{error}=await sb.from('login_lockouts').update({
    locked_until:null,
    attempt_count:0,
    unlocked_by:currentDisplayName||currentRole,
    unlocked_at:new Date().toISOString()
  }).eq('email',email.toLowerCase())
  if(error){alert('❌ '+error.message);return}
  auditLog('account_unlocked','login_lockouts',null,{email,by:currentDisplayName||currentRole})
  showToast('✅ ปลดล็อกบัญชีสำเร็จ')
  loadMembersList()
}
async function loginUser(){
  const email=(document.getElementById('auth-email')?.value||'').trim()
  const password=document.getElementById('auth-password')?.value||''
  const btn=document.getElementById('auth-btn')
  const err=document.getElementById('auth-error')
  if(!email||!password){err.textContent='กรุณากรอก Email และรหัสผ่าน';return}
  btn.disabled=true;btn.textContent='กำลังตรวจสอบ...'
  const lockMsg=await _checkLoginLock(email)
  if(lockMsg){err.textContent='🔒 '+lockMsg;btn.disabled=false;btn.textContent='เข้าสู่ระบบ';return}
  btn.textContent='กำลังเข้าสู่ระบบ...'
  const{data,error}=await sb.auth.signInWithPassword({email,password})
  if(error){
    const count=await _recordFailedLogin(email)
    const remaining=Math.max(0,5-count)
    const lockWarn=count>=5?' — บัญชีถูกล็อกชั่วคราว กรุณาติดต่อผู้ดูแลระบบ':remaining>0?` (เหลืออีก ${remaining} ครั้ง)`:''
    err.textContent='❌ '+(error.message==='Invalid login credentials'?'Email หรือรหัสผ่านไม่ถูกต้อง'+lockWarn:error.message)
    auditLog('login_failed','auth',null,{email,attempt:count})
    btn.disabled=false;btn.textContent='เข้าสู่ระบบ';return
  }
  await _clearLoginLock(email)
  currentUser=data.user
  const prof=await loadProfile(data.user)
  await updateLastLogin(data.user.id)
  auditLog('login','auth',data.user.id,{email:data.user.email})
  if(prof?.status==='pending'){hideAuthWall();showAuthWall('pending');return}
  if(prof?.status==='suspended'){await sb.auth.signOut();showAuthWall('suspended');return}
  if(prof?.status==='rejected'||prof?.status==='deleted'){await sb.auth.signOut();showAuthWall('rejected');return}
  if(currentRole==='admin'||currentRole==='staff'){
    _mfaEmail=email
    const blocked=await _handleAdminMFA()
    if(blocked)return
  }
  await _postLoginSuccess(email)
}

// ─── ข้อตกลงรักษาความลับข้อมูลผู้ป่วย ─────────────────────────────
// ต้องยอมรับทุกครั้งที่เข้าใช้งาน (เปิดแอป / login) ก่อนเห็นข้อมูลผู้ป่วย
// จำการยอมรับไว้ใน sessionStorage ของแท็บนั้น: รีเฟรชไม่ถามซ้ำ ปิดแอป/แท็บ หรือออกจากระบบ แล้วถามใหม่
// บันทึกเวลายอมรับล่าสุดใน user_profiles + audit_logs ทุกครั้ง (หลักฐาน)
const CONF_VERSION='v2-2569-10'
const _confKey=()=>'jh_conf_'+(currentUser?.id||'')
let _myProfile=null, _confNext=null, privacyContact=''
function confidentialityTerms(){
  const who=privacyContact||('เจ้าหน้าที่ '+hospitalName+' ที่รับผิดชอบระบบ')
  return [
    'ใช้ข้อมูลเฉพาะเพื่อดูแล ติดตาม และส่งต่อผู้ป่วยตามหน้าที่ที่ได้รับมอบหมาย และเข้าดูเฉพาะผู้ป่วยที่อยู่ในความรับผิดชอบของข้าพเจ้า',
    'รักษาข้อมูลเป็นความลับ ไม่เปิดเผย ไม่เล่าต่อ และไม่พูดคุยเรื่องผู้ป่วยกับผู้ที่ไม่เกี่ยวข้อง รวมถึงครอบครัว เพื่อนบ้าน หรือคนในชุมชน',
    'ไม่ถ่ายภาพหน้าจอ ไม่จดหรือคัดลอกข้อมูลออกนอกระบบ และไม่ส่งต่อทาง LINE, Facebook หรือช่องทางอื่น เว้นแต่เป็นการส่งต่อเพื่อการรักษาตามที่เจ้าหน้าที่ '+hospitalName+' กำหนด',
    'ดูแลบัญชีและโทรศัพท์ให้ปลอดภัย: ไม่บอกรหัสผ่าน ไม่ให้ผู้อื่นใช้บัญชี ตั้งรหัสล็อกหน้าจอโทรศัพท์ ไม่เข้าระบบจากเครื่องของผู้อื่น และออกจากระบบเมื่อใช้เสร็จ',
    'แจ้ง '+who+' ทันที เมื่อโทรศัพท์หาย รหัสผ่านรั่ว หรือสงสัยว่าข้อมูลรั่วไหล',
    'เมื่อพ้นจากหน้าที่ จะลบข้อมูลผู้ป่วยที่อาจอยู่ในเครื่อง คืนเอกสารที่เกี่ยวข้อง และไม่เข้าใช้ระบบอีก ทั้งนี้หน้าที่รักษาความลับยังมีผลต่อไปแม้พ้นจากหน้าที่แล้ว',
    'หากฝ่าฝืน ยินยอมให้ระงับการใช้งานทันที และอาจต้องรับผิดทางแพ่งและทางอาญาตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 พระราชบัญญัติสุขภาพแห่งชาติ พ.ศ. 2550 พระราชบัญญัติสุขภาพจิต พ.ศ. 2551 และกฎหมายที่เกี่ยวข้อง',
  ]
}
function _needsConfidentiality(){
  try{return sessionStorage.getItem(_confKey())!==CONF_VERSION}catch(e){return true}
}
async function _showConfidentiality(next){
  _confNext=next
  try{
    const{data}=await sb.from('app_settings').select('setting_key,setting_value').in('setting_key',['hospital_name','privacy_contact'])
    for(const r of (data||[])){if(r.setting_key==='hospital_name'&&r.setting_value)hospitalName=r.setting_value;if(r.setting_key==='privacy_contact')privacyContact=r.setting_value||''}
  }catch(e){}
  showAuthWall('confidentiality')
}
async function acceptConfidentiality(){
  const btn=document.getElementById('conf-accept-btn'),err=document.getElementById('conf-error')
  if(!document.getElementById('conf-check')?.checked){err.textContent='กรุณาติ๊กยืนยันว่าได้อ่านและยอมรับข้อตกลง';return}
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  const at=new Date().toISOString()
  const{error}=await sb.from('user_profiles').update({confidentiality_version:CONF_VERSION,confidentiality_accepted_at:at}).eq('id',currentUser.id)
  if(error){err.textContent='❌ บันทึกไม่สำเร็จ: '+error.message+' — กรุณาติดต่อผู้ดูแลระบบ';btn.disabled=false;btn.textContent='ยอมรับและเข้าใช้งาน';return}
  _myProfile={..._myProfile,confidentiality_version:CONF_VERSION,confidentiality_accepted_at:at}
  try{sessionStorage.setItem(_confKey(),CONF_VERSION)}catch(e){}
  await auditLog('confidentiality_accepted','user_profile',currentUser.id,{version:CONF_VERSION})
  const next=_confNext;_confNext=null
  if(next)await next()
}
async function declineConfidentiality(){
  if(!confirm('ไม่ยอมรับข้อตกลง?\n\nระบบจะออกจากระบบ และจะเข้าดูข้อมูลผู้ป่วยไม่ได้จนกว่าจะยอมรับ'))return
  await auditLog('confidentiality_declined','user_profile',currentUser?.id,{version:CONF_VERSION})
  await logoutUser()
}

async function _postLoginSuccess(email=''){
  if(_needsConfidentiality()){_showConfidentiality(()=>_postLoginSuccess(email));return}
  _mfaEmail=''
  startSessionTimer()
  hideAuthWall()
  updateUserUI()
  await loadAndNav()
  setupRealtime()
  if(email.endsWith('@jithome.local')){
    setTimeout(()=>{showToast('⚠️ กรุณาเปลี่ยนรหัสผ่านในเมนูบัญชีของคุณ เพื่อความปลอดภัย',5000)},1500)
  }
  checkPrivacyConsent()
}

function checkPrivacyConsent(){
  if(localStorage.getItem('jithome_privacy_v1'))return
  const el=document.getElementById('privacy-overlay')
  if(el)el.style.display='flex'
}

async function acceptPrivacyConsent(){
  localStorage.setItem('jithome_privacy_v1',Date.now().toString())
  const el=document.getElementById('privacy-overlay')
  if(el)el.style.display='none'
  auditLog('privacy_accepted','consent',currentUser?.id,{version:'v1',role:currentRole})
}

async function _handleAdminMFA(){
  const{data,error}=await sb.auth.mfa.listFactors()
  if(error){
    console.error('MFA listFactors:',error)
    await sb.auth.signOut()
    showAuthWall('login')
    setTimeout(()=>{const e=document.getElementById('auth-error');if(e){e.textContent='❌ ระบบตรวจสอบ 2FA ไม่พร้อม กรุณาลองใหม่'}},100)
    return true
  }
  const verified=(data?.totp||[]).filter(f=>f.status==='verified')
  if(verified.length>0){
    _mfaFactorId=verified[0].id
    showAuthWall('mfa_verify')
    return true
  }
  // data.totp มีเฉพาะ factor ที่ verified แล้ว — factor ค้าง (unverified) อยู่ใน data.all
  // ถ้าไม่ลบออก enroll ซ้ำจะชน friendly name เดิมแล้วล้มเหลว
  const unverified=(data?.all||[]).filter(f=>f.factor_type==='totp'&&f.status==='unverified')
  for(const f of unverified){await sb.auth.mfa.unenroll({factorId:f.id})}
  const{data:enroll,error:eErr}=await sb.auth.mfa.enroll({factorType:'totp',issuer:'JitHome',friendlyName:'JitHome-'+Date.now()})
  if(eErr){
    console.error('MFA enroll:',eErr)
    await sb.auth.signOut()
    showAuthWall('login')
    setTimeout(()=>{const e=document.getElementById('auth-error');if(e){e.textContent='❌ ไม่สามารถตั้งค่า 2FA กรุณาติดต่อผู้ดูแลระบบ'+(eErr.message?' ('+eErr.message+')':'')}},100)
    return true
  }
  _mfaEnrollId=enroll.id
  _mfaEnrollData=enroll
  showAuthWall('mfa_enroll')
  return true
}

async function mfaVerify(){
  const code=(document.getElementById('mfa-otp')?.value||'').replace(/\s/g,'')
  const err=document.getElementById('mfa-error')
  const btn=document.getElementById('mfa-btn')
  if(!code||code.length!==6){err.textContent='กรุณากรอกรหัส 6 หลัก';return}
  btn.disabled=true;btn.textContent='กำลังตรวจสอบ...'
  err.textContent=''
  const{error}=await sb.auth.mfa.challengeAndVerify({factorId:_mfaFactorId,code})
  if(error){
    err.textContent='❌ รหัสไม่ถูกต้อง หรือหมดอายุแล้ว — กรุณาลองใหม่'
    btn.disabled=false;btn.textContent='ยืนยัน'
    document.getElementById('mfa-otp').value='';document.getElementById('mfa-otp').focus()
    return
  }
  await _postLoginSuccess(_mfaEmail)
}

async function mfaEnrollConfirm(){
  const code=(document.getElementById('mfa-otp')?.value||'').replace(/\s/g,'')
  const err=document.getElementById('mfa-error')
  const btn=document.getElementById('mfa-enroll-btn')
  if(!code||code.length!==6){err.textContent='กรุณากรอกรหัส 6 หลักจากแอป';return}
  btn.disabled=true;btn.textContent='กำลังยืนยัน...'
  err.textContent=''
  const{error}=await sb.auth.mfa.challengeAndVerify({factorId:_mfaEnrollId,code})
  if(error){
    err.textContent='❌ รหัสไม่ถูกต้อง — สแกน QR ใหม่แล้วลองอีกครั้ง'
    btn.disabled=false;btn.textContent='ยืนยันและเปิดใช้ 2FA'
    document.getElementById('mfa-otp').value='';document.getElementById('mfa-otp').focus()
    return
  }
  await _postLoginSuccess(_mfaEmail)
}

async function registerUser(){
  const email=(document.getElementById('auth-email')?.value||'').trim()
  const password=document.getElementById('auth-password')?.value||''
  const password2=document.getElementById('auth-password2')?.value||''
  const btn=document.getElementById('auth-btn')
  const err=document.getElementById('auth-error')
  const pdpaConsent=document.getElementById('auth-pdpa-consent')?.checked
  if(!email||!password){err.textContent='กรุณากรอก Email และรหัสผ่าน';return}
  if(password.length<8){err.textContent='รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';return}
  if(!/\d/.test(password)){err.textContent='รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว';return}
  if(password!==password2){err.textContent='รหัสผ่านไม่ตรงกัน';return}
  if(!pdpaConsent){err.textContent='กรุณายืนยันความยินยอม PDPA ก่อนสมัครสมาชิก';return}
  btn.disabled=true;btn.textContent='กำลังสมัคร...'
  const{data,error}=await sb.auth.signUp({email,password})
  if(error){err.textContent='❌ '+error.message;btn.disabled=false;btn.textContent='สมัครสมาชิก';return}
  if(data.user&&!data.session){
    err.style.color='var(--green)';err.textContent='✅ สมัครสำเร็จ! กรุณายืนยัน Email ก่อนเข้าสู่ระบบ'
    btn.disabled=false;btn.textContent='สมัครสมาชิก';return
  }
  currentUser=data.user
  const prof=await loadProfile(data.user)
  if(prof?.status==='pending'){showAuthWall('pending');return}
  hideAuthWall()
  updateUserUI()
  await loadAndNav()
}

async function registerAosomo(){
  const name=(document.getElementById('rg-name')?.value||'').trim()
  const phone=(document.getElementById('rg-phone')?.value||'').replace(/\D/g,'')
  const password=(document.getElementById('rg-password')?.value||'')
  const nid=(document.getElementById('rg-nid')?.value||'').replace(/\D/g,'')
  const village=document.getElementById('rg-village')?.value||''
  const file=document.getElementById('rg-file')?.files?.[0]||null
  const consent=document.getElementById('rg-consent')?.checked
  const btn=document.getElementById('auth-btn')
  const err=document.getElementById('auth-error')
  if(!name){err.textContent='❌ กรุณากรอกชื่อ-นามสกุล';return}
  if(phone.length<9){err.textContent='❌ เบอร์โทรไม่ถูกต้อง (ต้องมีอย่างน้อย 9 หลัก)';return}
  if(password.length<8){err.textContent='❌ รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';return}
  if(nid&&nid.length!==13){err.textContent='❌ เลขบัตรประชาชนต้องมี 13 หลัก';return}
  if(!consent){err.textContent='❌ กรุณายืนยันความยินยอม PDPA';return}
  const email=phone+'@jithome.local'
  btn.disabled=true;btn.textContent='กำลังส่งคำขอ...'
  err.textContent=''
  try{
    const{data,error}=await sb.auth.signUp({email,password})
    if(error){
      err.textContent=error.message?.includes('already registered')?'❌ เบอร์โทรนี้มีบัญชีอยู่แล้ว':'❌ '+error.message
      btn.disabled=false;btn.textContent='🏡 ส่งคำขอสมัคร อสม.';return
    }
    const uid=data?.user?.id
    if(!uid)throw new Error('สร้างบัญชีไม่สำเร็จ')
    let fileUrl=null
    if(file&&data.session){
      btn.textContent='กำลังอัพโหลดไฟล์...'
      const ext=file.name.split('.').pop()
      const filename=`members/${Date.now()}_${phone}.${ext}`
      const{error:ue}=await sb.storage.from('patient-files').upload(filename,file)
      if(!ue){const{data:{publicUrl}}=sb.storage.from('patient-files').getPublicUrl(filename);fileUrl=publicUrl}
    }
    const prof={id:uid,email,display_name:name,role:'aosomo',village,status:'pending',last_login:new Date().toISOString()}
    if(nid)prof.national_id=nid
    if(fileUrl)prof.profile_file_url=fileUrl
    await sb.from('user_profiles').upsert(prof,{onConflict:'id'})
    await sb.auth.signOut()
    showAuthWall('submitted')
  }catch(e){err.textContent='❌ '+e.message;btn.disabled=false;btn.textContent='🏡 ส่งคำขอสมัคร อสม.'}
}

async function logoutUser(){
  try{sessionStorage.removeItem(_confKey())}catch(e){}
  await auditLog('logout','auth',currentUser?.id)
  if(_sessionTimer){clearInterval(_sessionTimer);_sessionTimer=null}
  teardownRealtime()
  document.getElementById('session-warn-toast')?.remove()
  await sb.auth.signOut()
  currentUser=null;currentRole='viewer'
  showAuthWall('login')
}

// ─── Profile / Role ──────────────────────────────────────────────
async function loadProfile(user){
  const{data}=await sb.from('user_profiles').select('*').eq('id',user.id).single()
  _myProfile=data||null
  if(data){
    currentRole=data.role
    currentDisplayName=data.display_name||user.email.split('@')[0]
    currentVillage=data.village||''
    return data
  }
  // ถ้ายังไม่มี profile → สร้างใหม่ (คนแรกเป็น admin)
  const{count}=await sb.from('user_profiles').select('*',{count:'exact',head:true})
  const role=count===0?'admin':'viewer'
  const dn=user.email.split('@')[0]
  const profile={id:user.id,email:user.email,display_name:dn,role,village:'',last_login:new Date().toISOString()}
  const{data:saved}=await sb.from('user_profiles').insert(profile).select().single()
  const row=saved||profile
  currentRole=row.role;currentDisplayName=row.display_name||dn;currentVillage=row.village||''
  return row
}

async function updateLastLogin(userId){
  await sb.from('user_profiles').update({last_login:new Date().toISOString()}).eq('id',userId)
}

// ─── Audit Log ───────────────────────────────────────────────────
async function auditLog(action,entityType,entityId,details){
  try{
    const{error}=await sb.from('audit_logs').insert({
      user_id:currentUser?.id||null,
      user_email:currentUser?.email||null,
      user_name:currentDisplayName||null,
      action,
      entity_type:entityType||null,
      entity_id:entityId!=null?String(entityId):null,
      details:details||null
    })
    if(error)console.error('auditLog:',action,error.message)
  }catch(e){console.error('auditLog:',action,e)}
}

async function loadAuditLog(){
  const container=document.getElementById('audit-log-container')
  if(!container)return
  container.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3)">⏳ กำลังโหลด...</div>'
  auditLog('view_audit_log','audit_logs',null)
  const actionFilter=document.getElementById('al-filter-action')?.value||''
  let q=sb.from('audit_logs').select('created_at,user_name,user_email,action,entity_type,entity_id,details').order('created_at',{ascending:false}).limit(100)
  if(actionFilter)q=q.eq('action',actionFilter)
  const{data,error}=await q
  if(error){container.innerHTML=`<div style="color:var(--red);font-size:12px;padding:8px">❌ ${esc(error.message)}</div>`;return}
  if(!data?.length){container.innerHTML='<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px">ยังไม่มีข้อมูล</div>';return}
  const ACTION_LABEL={
    login:'เข้าสู่ระบบ',logout:'ออกจากระบบ',login_failed:'เข้าสู่ระบบล้มเหลว',
    create_patient:'เพิ่มผู้ป่วย',edit_patient:'แก้ไขผู้ป่วย',delete_patient:'ลบผู้ป่วย',
    view_patient:'ดูผู้ป่วย',save_visit:'บันทึกเยี่ยมบ้าน',edit_visit:'แก้ไขเยี่ยม',
    delete_visit:'ลบเยี่ยม',verify_visit:'ตรวจสอบเยี่ยม',resolve_referral:'รับเรื่องส่งต่อ',
    create_record:'บันทึกฉีดยา/เยี่ยม',edit_record:'แก้ไขบันทึก',delete_record:'ลบบันทึก',
    create_appointment:'นัดพบแพทย์',edit_appointment:'แก้ไขนัด',delete_appointment:'ลบนัด',
    create_aosomo_account:'สร้างบัญชี อสม.',reset_password:'รีเซ็ตรหัสผ่าน',
    delete_member:'ลบสมาชิก',member_approved:'อนุมัติสมาชิก',member_rejected:'ปฏิเสธสมาชิก',
    member_role_changed:'เปลี่ยน role',change_village:'เปลี่ยนหมู่บ้าน',account_unlocked:'ปลดล็อคบัญชี',
    import_aosomo_directory:'นำเข้ารายชื่อ อสม.',import_staff_directory:'นำเข้ารายชื่อเจ้าหน้าที่',
    export_csv:'ส่งออก CSV',export_json:'ส่งออก JSON',export_visits_excel:'ส่งออก Excel เยี่ยม',
    print_monthly_report:'พิมพ์รายงานเดือน',print_patient_timeline:'พิมพ์ Timeline ผู้ป่วย',
    view_audit_log:'ดู Audit Log',privacy_accepted:'ยอมรับนโยบาย',
  }
  const ACTION_COLOR={
    login:'#16a34a',logout:'#6b7280',login_failed:'#dc2626',
    delete_patient:'#dc2626',delete_visit:'#dc2626',delete_record:'#dc2626',delete_member:'#dc2626',delete_appointment:'#dc2626',
    reset_password:'#d97706',member_role_changed:'#d97706',account_unlocked:'#d97706',
  }
  const rows=data.map(r=>{
    const dt=new Date(r.created_at)
    const dtStr=dt.toLocaleString('th-TH',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})
    const label=ACTION_LABEL[r.action]||r.action
    const color=ACTION_COLOR[r.action]||'var(--primary)'
    const phone=(r.user_email||'').replace('@jithome.local','')
    const user=r.user_name||(phone?phone:'—')
    const det=r.details?Object.entries(r.details).filter(([k,v])=>v!=null).map(([k,v])=>`${k}: ${v}`).join(' · '):''
    return`<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px">
      <div style="width:90px;flex-shrink:0;color:var(--text3);font-size:11px;padding-top:1px">${dtStr}</div>
      <div style="width:80px;flex-shrink:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(user)}</div>
      <div style="min-width:0;flex:1">
        <span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:700;background:${color}22;color:${color}">${esc(label)}</span>
        ${det?`<span style="color:var(--text3);margin-left:6px">${esc(det.slice(0,80))}${det.length>80?'...':''}</span>`:''}
      </div>
    </div>`
  }).join('')
  container.innerHTML=`<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;max-height:480px;overflow-y:auto">
    <div style="display:flex;gap:10px;padding:6px 10px;background:var(--bg);border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--text3)">
      <div style="width:90px">วันเวลา</div>
      <div style="width:80px">ผู้ใช้</div>
      <div style="flex:1">การกระทำ / รายละเอียด</div>
    </div>
    ${rows}
  </div>
  <div style="font-size:11px;color:var(--text3);margin-top:6px;text-align:right">แสดง ${data.length} รายการล่าสุด</div>`
}

function renderAuditPage(el){
  if(!canDo('admin')){el.innerHTML='<div style="text-align:center;padding:60px 20px;color:var(--text3)">🔒 เฉพาะผู้ดูแลระบบเท่านั้น</div>';return}
  el.innerHTML=`<div class="page">
  <div class="page-header"><h2>🔍 Audit Log</h2><p style="color:var(--text3);font-size:13px">บันทึกการใช้งานระบบทั้งหมด</p></div>
  <div class="card" style="padding:16px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <select id="al-filter-action" onchange="loadAuditLog()" style="font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text1);font-family:'Sarabun',sans-serif;flex:1;min-width:160px">
        <option value="">ทุกประเภท</option>
        <option value="login">เข้าสู่ระบบ</option>
        <option value="logout">ออกจากระบบ</option>
        <option value="login_failed">เข้าสู่ระบบล้มเหลว</option>
        <option value="create_patient">เพิ่มผู้ป่วย</option>
        <option value="edit_patient">แก้ไขผู้ป่วย</option>
        <option value="delete_patient">ลบผู้ป่วย</option>
        <option value="view_patient">ดูผู้ป่วย</option>
        <option value="save_visit">บันทึกเยี่ยมบ้าน</option>
        <option value="edit_visit">แก้ไขเยี่ยม</option>
        <option value="delete_visit">ลบเยี่ยม</option>
        <option value="create_record">บันทึกฉีดยา/เยี่ยม</option>
        <option value="create_appointment">นัดพบแพทย์</option>
        <option value="delete_appointment">ลบนัด</option>
        <option value="resolve_referral">รับเรื่องส่งต่อ</option>
        <option value="reset_password">รีเซ็ตรหัสผ่าน</option>
        <option value="create_aosomo_account">สร้างบัญชี อสม.</option>
        <option value="delete_member">ลบสมาชิก</option>
        <option value="member_approved">อนุมัติสมาชิก</option>
        <option value="member_role_changed">เปลี่ยน role</option>
        <option value="export_csv">ส่งออก CSV</option>
        <option value="export_visits_excel">ส่งออก Excel</option>
        <option value="import_aosomo_directory">นำเข้า อสม.</option>
        <option value="print_monthly_report">พิมพ์รายงาน</option>
      </select>
      <button onclick="loadAuditLog()" style="padding:7px 16px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif;white-space:nowrap">🔄 โหลด</button>
    </div>
    <div id="audit-log-container"><div style="color:var(--text3);font-size:13px;text-align:center;padding:40px">⏳ กำลังโหลด...</div></div>
  </div>
  </div>`
  setTimeout(loadAuditLog,0)
}

// ─── Session Timeout (30 นาที) ────────────────────────────────────
let _lastActivity=Date.now()
let _sessionTimer=null
let _warnShown=false
const SESSION_TIMEOUT_MS=30*60*1000
const SESSION_WARN_MS=28*60*1000
function resetActivityTimer(){
  _lastActivity=Date.now()
  if(_warnShown){_warnShown=false;document.getElementById('session-warn-toast')?.remove()}
}
let _activityListenersAdded=false
function startSessionTimer(){
  if(_sessionTimer)clearInterval(_sessionTimer)
  if(!_activityListenersAdded){
    ;['click','keydown','mousedown','touchstart'].forEach(ev=>document.addEventListener(ev,resetActivityTimer,true))
    _activityListenersAdded=true
  }
  _sessionTimer=setInterval(()=>{
    const idle=Date.now()-_lastActivity
    if(idle>=SESSION_TIMEOUT_MS){
      clearInterval(_sessionTimer);document.getElementById('session-warn-toast')?.remove()
      alert('หมดเวลาเซสชัน — กรุณาเข้าสู่ระบบใหม่')
      logoutUser()
    }else if(idle>=SESSION_WARN_MS&&!_warnShown){
      _warnShown=true
      const t=document.createElement('div');t.id='session-warn-toast'
      t.innerHTML=`<div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-family:'Sarabun',sans-serif;z-index:9999;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,.3)">⏰ เซสชันจะหมดใน 2 นาที — <button onclick="resetActivityTimer()" style="background:#0a7ea4;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;font-family:'Sarabun',sans-serif">ต่ออายุ</button></div>`
      document.body.appendChild(t)
    }
  },30000)
}

async function sendResetEmail(){
  const email=(document.getElementById('auth-email')?.value||'').trim()
  const btn=document.getElementById('auth-btn')
  const err=document.getElementById('auth-error')
  if(!email){err.style.color='var(--red)';err.textContent='กรุณากรอก Email';return}
  btn.disabled=true;btn.textContent='กำลังส่ง...'
  const{error}=await sb.auth.resetPasswordForEmail(email,{
    redirectTo:location.origin+location.pathname
  })
  if(error){err.style.color='var(--red)';err.textContent='❌ '+error.message;btn.disabled=false;btn.textContent='ส่งลิงค์รีเซ็ตรหัสผ่าน';return}
  err.style.color='var(--green)';err.textContent='✅ ส่ง Email สำเร็จ! กรุณาตรวจสอบ Inbox (และ Spam)'
  btn.textContent='ส่งแล้ว ✅';btn.disabled=true
}

async function resetPassword(){
  const password=document.getElementById('auth-password')?.value||''
  const password2=document.getElementById('auth-password2')?.value||''
  const btn=document.getElementById('auth-btn')
  const err=document.getElementById('auth-error')
  if(password.length<8){err.textContent='รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';return}
  if(!/\d/.test(password)){err.textContent='รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว';return}
  if(password!==password2){err.textContent='รหัสผ่านไม่ตรงกัน';return}
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  const fail=m=>{err.textContent=m;btn.disabled=false;btn.textContent='บันทึกรหัสผ่านใหม่'}
  // บัญชีที่เปิด 2FA: Supabase ให้เปลี่ยนรหัสผ่านได้เมื่อยืนยันรหัส 6 หลักแล้ว (AAL2)
  const{data:aal}=await sb.auth.mfa.getAuthenticatorAssuranceLevel()
  if(aal?.nextLevel==='aal2'&&aal?.currentLevel!=='aal2'){
    const grp=document.getElementById('reset-mfa-group'),code=(document.getElementById('reset-mfa-code')?.value||'').trim()
    if(grp.style.display==='none'||!/^\d{6}$/.test(code)){
      grp.style.display='';document.getElementById('reset-mfa-code').focus()
      return fail('บัญชีนี้เปิด 2FA — กรอกรหัส 6 หลักจากแอป Authenticator แล้วกดบันทึกอีกครั้ง')
    }
    const{data:f}=await sb.auth.mfa.listFactors()
    const totp=(f?.totp||[]).find(x=>x.status==='verified')
    if(!totp)return fail('❌ ไม่พบการตั้งค่า 2FA ของบัญชีนี้ — ติดต่อผู้ดูแลระบบ')
    const{error:mfaErr}=await sb.auth.mfa.challengeAndVerify({factorId:totp.id,code})
    if(mfaErr)return fail('❌ รหัส 6 หลักไม่ถูกต้องหรือหมดเวลา ลองรหัสใหม่')
  }
  const{error}=await sb.auth.updateUser({password})
  if(error)return fail('❌ '+error.message)
  err.style.color='var(--green)';err.textContent='✅ เปลี่ยนรหัสผ่านสำเร็จ!'
  // โหลดหน้าใหม่ให้ผ่านขั้นตอนเข้าระบบตามปกติ (ตรวจสถานะบัญชี 2FA และข้อตกลงรักษาความลับ)
  setTimeout(()=>location.replace(location.pathname),1500)
}

function updateUserUI(){
  const av=document.querySelector('.avatar')
  if(av&&currentUser?.email){
    const initials=(currentDisplayName||currentUser.email).slice(0,2).toUpperCase()
    av.textContent=initials
    av.title=`${currentDisplayName||currentUser.email}\nสิทธิ์: ${ROLE_LABEL[currentRole]||currentRole}`
    av.style.cursor='default'
    av.style.background=ROLE_COLOR[currentRole]||'var(--primary)'
    av.onclick=null
  }
  const sideInfo=document.getElementById('sidebar-user-info')
  if(sideInfo&&currentUser){
    sideInfo.textContent=`${currentDisplayName||currentUser.email} · ${ROLE_LABEL[currentRole]||currentRole}`
    sideInfo.title=currentUser.email
  }
  // ซ่อนเมนูตามสิทธิ์
  document.querySelectorAll('[data-page="admin"]').forEach(el=>{
    el.style.display=canDo('admin')?'':'none'
  })
  // viewer เห็นเฉพาะเมนู overview
  const isViewer = currentRole==='viewer' && !_previewOrigRole
  ;['dashboard','patients','timeline','visit','members','guide'].forEach(p=>{
    document.querySelectorAll(`[data-page="${p}"]`).forEach(el=>{
      el.style.display=isViewer?'none':''
    })
  })
}

// ─── Add Patient ─────────────────────────────────────────────────
function openAddPatient(){
  const ov=document.getElementById('addpt-overlay')
  const ct=document.getElementById('addpt-content')
  if(!ov||!ct)return
  ct.innerHTML=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <div style="font-size:17px;font-weight:700">➕ เพิ่มผู้ป่วยใหม่</div>
    <button onclick="closeAddPatient()" style="background:none;border:none;cursor:pointer;color:var(--text3)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>
  <div style="background:#f0f9ff;border:1.5px dashed #38bdf8;border-radius:10px;padding:12px 14px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:10px">
    <div>
      <div style="font-size:13px;font-weight:700;color:#0369a1">📥 นำเข้าหลายรายชื่อจากไฟล์</div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px">Excel / CSV — นำเข้าได้ครั้งละหลายร้อยราย</div>
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0">
      <button onclick="downloadTemplate('patient')" style="padding:6px 10px;background:#fff;color:#0369a1;border:1px solid #38bdf8;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">⬇️ ตัวอย่าง</button>
      <button onclick="document.getElementById('addpt-import-input').click()" style="padding:6px 10px;background:#0369a1;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Sarabun',sans-serif">📂 เลือกไฟล์</button>
    </div>
    <input type="file" id="addpt-import-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="importPatientFile(this);closeAddPatient()">
  </div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
    <div style="flex:1;height:1px;background:var(--border)"></div>
    <div style="font-size:11px;color:var(--text3);white-space:nowrap">— หรือเพิ่มทีละราย —</div>
    <div style="flex:1;height:1px;background:var(--border)"></div>
  </div>
  <div class="form-group"><label>ชื่อ-นามสกุล *</label><input type="text" id="np-name" placeholder="เช่น นายสมชาย ใจดี"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <div class="form-group"><label>หมู่บ้าน</label><select id="np-village">${VILLAGES.map(v=>`<option>${v}</option>`).join('')}</select></div>
    <div class="form-group"><label>🏠 บ้านเลขที่</label><input type="text" id="np-house-no" placeholder="เช่น 123/4"></div>
  </div>
  <div class="form-group"><label>กลุ่มสี</label>
    <select id="np-group">
      <option value="yellow">🟡 กลุ่มสีเหลือง</option>
      <option value="red">🔴 กลุ่มสีแดง</option>
      <option value="green">🟢 กลุ่มสีเขียว</option>
    </select>
  </div>
  <div class="form-group"><label>วันที่ฉีดยาล่าสุด (ถ้ามี)</label><input type="date" id="np-date" value="${todayISO()}"></div>
  <div class="form-group"><label>รอบนัดต่อไป</label><select id="np-interval"><option>2 สัปดาห์</option><option>3 สัปดาห์</option><option>4 สัปดาห์</option><option selected>1 เดือน</option><option>3 เดือน</option></select></div>
  <div class="form-group"><label>หมายเหตุ</label><input type="text" id="np-note" placeholder="บันทึกเพิ่มเติม..."></div>
  <div class="form-group">
    <label>🪪 เลขบัตรประชาชน <span style="font-size:11px;color:var(--text3);font-weight:400">(13 หลัก — แสดงเฉพาะ admin)</span></label>
    <input type="text" id="np-nid" placeholder="X-XXXX-XXXXX-XX-X" maxlength="17" inputmode="numeric"
      oninput="this.value=formatNationalIdInput(this.value)"
      style="letter-spacing:1px">
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <div class="form-group"><label>🏡 เยี่ยมบ้านทุก (เดือน)</label><select id="np-visit-interval">
      <option value="">— ไม่ระบุ —</option>
      ${[1,2,3,6].map(n=>`<option value="${n}">${n} เดือน</option>`).join('')}
    </select></div>
    <div class="form-group"><label>💉 ฉีดยาทุก (เดือน)</label><select id="np-inject-interval">
      <option value="">— ไม่ระบุ —</option>
      ${[1,2,3,6].map(n=>`<option value="${n}">${n} เดือน</option>`).join('')}
    </select></div>
  </div>
  <div class="form-group"><label>💊 รายการยาที่ฉีด</label><input type="text" id="np-medication" placeholder="เช่น Invega 100mg, DEPO-A, Flupentixol 40mg"></div>
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:12px 14px;margin-bottom:12px">
    <div style="font-size:12px;font-weight:700;color:#0369a1;margin-bottom:8px">🔒 ความยินยอมตาม PDPA</div>
    <div style="display:flex;align-items:flex-start;gap:8px">
      <input type="checkbox" id="np-consent" style="margin-top:3px;flex-shrink:0">
      <label for="np-consent" style="font-size:12px;color:var(--text2);line-height:1.6;cursor:pointer">
        ผู้ป่วย/ผู้ดูแลรับทราบและยินยอมให้ <strong>${esc(hospitalName)}</strong> เก็บและประมวลผลข้อมูลสุขภาพ เพื่อการติดตามดูแลในชุมชน ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ.2562
      </label>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:6px">วันที่รับความยินยอม: ${todayISO()}</div>
  </div>
  <div style="display:flex;gap:10px;margin-top:4px">
    <button class="btn btn-primary" style="flex:1" id="np-btn" onclick="saveNewPatient()">บันทึกผู้ป่วย</button>
    <button class="btn btn-outline" onclick="closeAddPatient()">ยกเลิก</button>
  </div>`
  ov.style.display='flex'
  setTimeout(()=>document.getElementById('np-name')?.focus(),100)
}

function closeAddPatient(){document.getElementById('addpt-overlay').style.display='none'}

function previewFile(input){
  const file=input.files[0]
  const label=document.getElementById('np-file-label')
  const wrap=document.getElementById('np-file-wrap')
  if(!file){label.textContent='กดเพื่อเลือกไฟล์';return}
  if(file.size>10*1024*1024){alert('ไฟล์ใหญ่เกิน 10 MB');input.value='';return}
  label.textContent=`✅ ${file.name} (${(file.size/1024).toFixed(0)} KB)`
  wrap.style.borderColor='var(--primary)'
}

async function saveNewPatient(){
  const name=(document.getElementById('np-name')?.value||'').trim()
  const village=document.getElementById('np-village')?.value||'หมู่ 1'
  const gc=document.getElementById('np-group')?.value||'yellow'
  const date=document.getElementById('np-date')?.value
  const interval=document.getElementById('np-interval')?.value||'1 เดือน'
  const note=(document.getElementById('np-note')?.value||'').trim()
  const national_id=(document.getElementById('np-nid')?.value||'').replace(/\D/g,'')
  const visit_interval=parseInt(document.getElementById('np-visit-interval')?.value)||null
  const inject_interval=parseInt(document.getElementById('np-inject-interval')?.value)||null
  const medication_name=(document.getElementById('np-medication')?.value||'').trim()||null
  const consent_given=document.getElementById('np-consent')?.checked||false
  const consent_date=consent_given?todayISO():null
  const btn=document.getElementById('np-btn')
  if(!name){alert('กรุณากรอกชื่อ-นามสกุล');document.getElementById('np-name')?.focus();return}
  const gl={red:'สุขภาพจิต กลุ่ม สีแดง',yellow:'สุขภาพจิต กลุ่ม สีเหลือง',green:'สุขภาพจิต กลุ่ม สีเขียว'}[gc]
  btn.disabled=true;btn.textContent='กำลังบันทึก...'
  try{
    const house_no=(document.getElementById('np-house-no')?.value||'').trim()
    const{data:newPt,error:pe}=await sb.from('patients').insert({name,village,house_no,note:'',national_id,visit_interval,inject_interval,medication_name,consent_given,consent_date}).select('id').single()
    if(pe){
      if(pe.message?.includes('unique'))throw new Error(`ชื่อ "${name}" มีในระบบแล้ว กรุณาใช้ชื่ออื่น`)
      throw pe
    }
    auditLog('create_patient','patient',newPt?.id,{name,village})
    if(newPt)_markOwnWrite(newPt.id)
    if(date&&newPt){
      const{data:newRec3}=await sb.from('injection_records').insert({patient_id:newPt.id,injection_date:date,group_color:gc,group_label:gl,interval_str:interval,interval_days:parseInterval(interval),note,recorded_by:currentDisplayName||null}).select('id').single()
      if(newRec3)_markOwnWrite(newRec3.id)
    }
    btn.textContent='✅ บันทึกสำเร็จ'
    allPatients=await getPatients()
    setTimeout(()=>{closeAddPatient();navigate('patients')},1200)
  }catch(e){
    const msg=e.message?.includes('duplicate')||e.message?.includes('unique')?'มีชื่อนี้ในระบบแล้ว':e.message
    btn.textContent='❌ '+msg;btn.disabled=false
  }
}

// ─── Realtime ────────────────────────────────────────────────────
function setupRealtime(){
  if(_realtimeChannel)return
  _realtimeChannel=sb.channel('jithome-realtime')
    .on('postgres_changes',{event:'*',schema:'public',table:'patients'},_onRealtimeChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'home_visits'},_onRealtimeChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'injection_records'},_onRealtimeChange)
    .on('postgres_changes',{event:'*',schema:'public',table:'doctor_appointments'},_onRealtimeChange)
    .subscribe()
}

function teardownRealtime(){
  if(_realtimeChannel){sb.removeChannel(_realtimeChannel);_realtimeChannel=null}
  if(_realtimeDebounce){clearTimeout(_realtimeDebounce);_realtimeDebounce=null}
}

function _markOwnWrite(id){
  _ownWriteIds.add(String(id))
  setTimeout(()=>_ownWriteIds.delete(String(id)),5000)
}

function _onRealtimeChange(payload){
  const changedId=String(payload.new?.id||payload.old?.id||'')
  if(changedId&&_ownWriteIds.has(changedId))return
  clearTimeout(_realtimeDebounce)
  _realtimeDebounce=setTimeout(async()=>{
    try{
      const page=(location.hash||'').slice(1)||'dashboard'
      allPatients=await getPatients()
      const el=document.getElementById('page-content')
      if(!el)return
      if(page==='dashboard')renderDashboard(el)
      else if(page==='patients')renderPatients(el)
      else if(page==='timeline')renderTimeline(el)
      else if(page==='overview')renderOverview(el)
      else if(page==='visit')renderVisit(el)
      showToast('🔄 ข้อมูลอัปเดตแล้ว',2000)
    }catch(e){console.error('Realtime update failed:',e)}
  },800)
}

// ─── Init ────────────────────────────────────────────────────────
async function loadAndNav(){
  try{
    const s=await getSettings()
    if(s.hospital_name){hospitalName=s.hospital_name}
    if(s.app_subtitle){appSubtitle=s.app_subtitle;setSubtitle(document.getElementById('sidebar-sub'),s.app_subtitle)}
    const{count}=await sb.from('patient_status').select('*',{count:'exact',head:true}).lt('days_until',0)
    if(count){const b=document.getElementById('notif-badge');if(b){b.textContent=count;b.style.display='flex'}}
  }catch(e){console.warn('loadAndNav:',e)}
  const hash=(location.hash||'').slice(1)
  const startPage = currentRole==='viewer' ? 'overview' : (PAGES.includes(hash)?hash:'dashboard')
  await navigate(startPage)
}

async function init(){
  // ดัก PASSWORD_RECOVERY event เท่านั้น (ไม่ดัก SIGNED_IN เพื่อป้องกัน double-execute)
  sb.auth.onAuthStateChange((event) => {
    if(event === 'PASSWORD_RECOVERY') showAuthWall('reset')
  })

  // ตรวจ URL สำหรับ recovery link (รองรับทั้ง hash และ query string)
  const url = window.location.href
  const hash = window.location.hash
  if(url.includes('type=recovery') || hash.includes('type=recovery')){
    await new Promise(r => setTimeout(r, 300))
    const{data:{session}}=await sb.auth.getSession()
    if(session){showAuthWall('reset');return}
  }

  const{data:{user}}=await sb.auth.getUser()
  if(!user){
    try{
      const s=await getPublicSettings()
      if(s.app_subtitle){appSubtitle=s.app_subtitle;localStorage.setItem('jh_app_subtitle',s.app_subtitle)}
      else{const cached=localStorage.getItem('jh_app_subtitle');if(cached)appSubtitle=cached}
    }catch(e){const cached=localStorage.getItem('jh_app_subtitle');if(cached)appSubtitle=cached}
    setSubtitle(document.getElementById('sidebar-sub'),appSubtitle)
    showAuthWall('login');return
  }
  currentUser=user
  const profile=await loadProfile(user)
  await updateLastLogin(user.id)
  if(profile?.status==='pending'){showAuthWall('pending');return}
  if(profile?.status==='suspended'){await sb.auth.signOut();showAuthWall('suspended');return}
  if(profile?.status==='rejected'||profile?.status==='deleted'){await sb.auth.signOut();showAuthWall('rejected');return}
  if(currentRole==='admin'||currentRole==='staff'){
    const{data:aalData}=await sb.auth.mfa.getAuthenticatorAssuranceLevel()
    if(aalData?.currentLevel!=='aal2'){
      const blocked=await _handleAdminMFA()
      if(blocked)return
    }
  }
  if(_needsConfidentiality()){_showConfidentiality(()=>_postLoginSuccess(''));return}
  startSessionTimer()
  updateUserUI()
  await loadAndNav()
  setupRealtime()
}

window.addEventListener('hashchange',()=>{const p=(location.hash||'').slice(1);if(PAGES.includes(p))navigate(p)})
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeVisitModal();closeAddPatient()}})
document.addEventListener('DOMContentLoaded',init)
