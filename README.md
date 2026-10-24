# Easycard HR

ระบบบริหารงานบุคคลและเงินเดือนสำหรับบริษัทประมาณ 50 คน หลายกะ (Next.js + Supabase + Cloudflare Workers)

เว็บที่ใช้งาน: https://easycard-hr.easycardai2026.workers.dev

## สถานะ

- [x] ส่วนที่ 1: Login 4 Role (CEO, บัญชี, ผู้จัดการ, พนักงาน), ข้อมูลพนักงาน แผนก กะ วันหยุด และสถานะทดลองงาน
- [ ] ส่วนที่ 2: นำเข้าไฟล์จากเครื่องบันทึกเวลา
- [x] ส่วนที่ 3: ขอและอนุมัติ OT (`/ot`)
- [x] ส่วนที่ 4: คำนวณเงินเดือน ประกันสังคม ภาษี สลิป และไฟล์ส่งออก (`/payroll`, `/payslips`)

## สิทธิ์

สิทธิ์ถูกบังคับที่ฐานข้อมูลด้วย Row Level Security (ดู `supabase/migrations`)

| Role | เห็นพนักงาน | แก้ข้อมูลพนักงาน/กะ | เปลี่ยน Role ผู้ใช้ |
| --- | --- | --- | --- |
| CEO | ทุกคน | ได้ | ได้ |
| บัญชี | ทุกคน | ได้ | - |
| ผู้จัดการ | ตัวเอง + ลูกทีม (`employees.manager_id`) | จัดกะลูกทีมได้ | - |
| พนักงาน | ตัวเอง | - | - |

## เงินเดือน

ขั้นตอน: บัญชีตั้งเงินเดือนพนักงาน → สร้างงวด (ระบบคำนวณให้) → บัญชีตรวจ/เพิ่มรายการหักเอง → CEO อนุมัติ (พนักงานเห็นสลิป) → CEO ปิดงวด (ล็อก)

- สูตรอยู่ใน `src/lib/payroll/calc.ts` ทดสอบด้วย `npm test`
- ตัวเลข (อัตรา OT ฐานประกันสังคม ขั้นภาษี) เก็บในตาราง `payroll_settings` แก้ได้ที่ `/payroll/settings`
- OT ที่จ่าย = ชั่วโมงที่อนุมัติ (หรือชั่วโมงจริงจากเครื่องสแกนถ้าน้อยกว่า เมื่อมีส่วนที่ 2) ปัดลงทีละ 30 นาที
- งวดแรกที่เริ่มใช้กลางปี: ระบบถือว่าเดือนก่อนหน้ามีรายได้เท่าเดือนนี้และหักภาษีไปแล้ว
- ทดสอบสิทธิ์ฐานข้อมูล: `supabase/tests/ot_payroll_rls.sql` (รันบนฐานข้อมูลทดสอบเท่านั้น)

## ติดตั้งบนเครื่อง

1. `npm install` แล้ว `npm run dev` เปิด http://localhost:3000
2. ค่าเชื่อมต่อ Supabase อยู่ใน `src/lib/supabase/config.ts` (ตั้ง `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` ใน `.env.local` เพื่อใช้โปรเจกต์อื่นได้)
3. โครงสร้างฐานข้อมูลอยู่ใน `supabase/migrations` (รันตามลำดับชื่อไฟล์)

ผู้ใช้ใหม่ที่สร้างใน Supabase Auth จะได้ Role `employee` อัตโนมัติ CEO เปลี่ยน Role และผูกกับข้อมูลพนักงานได้ในตาราง `profiles`

## Deploy บน Cloudflare Workers

ใช้ [OpenNext](https://opennext.js.org/cloudflare) แปลง Next.js ให้รันบน Cloudflare Workers ตั้งค่าอยู่ใน `wrangler.jsonc` และ `open-next.config.ts`

ตั้งครั้งเดียวใน Cloudflare Dashboard: Workers & Pages → Create → Import a repository → เลือก repo นี้ แล้วตั้ง

- Project name: `easycard-hr` (ต้องตรงกับ `name` ใน `wrangler.jsonc`)
- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`

หลังจากนั้นทุกครั้งที่ push เข้า `main` Cloudflare จะ build และ deploy ให้อัตโนมัติ ทดสอบแบบ Cloudflare บนเครื่องได้ด้วย `npm run preview`
