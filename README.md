# Easycard HR

ระบบบริหารงานบุคคลและเงินเดือนสำหรับบริษัทประมาณ 50 คน หลายกะ (Next.js + Supabase)

## สถานะ

- [x] ส่วนที่ 1: Login 4 Role (CEO, บัญชี, ผู้จัดการ, พนักงาน), ข้อมูลพนักงาน แผนก กะ วันหยุด และสถานะทดลองงาน
- [ ] ส่วนที่ 2: นำเข้าไฟล์จากเครื่องบันทึกเวลา
- [ ] ส่วนที่ 3: ขอและอนุมัติ OT
- [ ] ส่วนที่ 4: คำนวณเงินเดือน ประกันสังคม ภาษี

## สิทธิ์

สิทธิ์ถูกบังคับที่ฐานข้อมูลด้วย Row Level Security (ดู `supabase/migrations`)

| Role | เห็นพนักงาน | แก้ข้อมูลพนักงาน/กะ | เปลี่ยน Role ผู้ใช้ |
| --- | --- | --- | --- |
| CEO | ทุกคน | ได้ | ได้ |
| บัญชี | ทุกคน | ได้ | - |
| ผู้จัดการ | ตัวเอง + ลูกทีม (`employees.manager_id`) | จัดกะลูกทีมได้ | - |
| พนักงาน | ตัวเอง | - | - |

## ติดตั้ง

1. คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ URL และ publishable key ของโปรเจกต์ Supabase
2. รัน SQL ใน `supabase/migrations` บนโปรเจกต์ Supabase (ตามลำดับชื่อไฟล์)
3. `npm install` แล้ว `npm run dev` เปิด http://localhost:3000

ผู้ใช้ใหม่ที่สร้างใน Supabase Auth จะได้ Role `employee` อัตโนมัติ CEO เปลี่ยน Role และผูกกับข้อมูลพนักงานได้ในตาราง `profiles`

## Deploy บน Vercel

Import repo นี้ใน Vercel แล้วตั้ง Environment Variables `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
