# ระบบจัดการก๊วนแบดมินตัน (Badminton Group Management System)

ระบบเว็บแอปพลิเคชันสำหรับจัดการก๊วนแบดมินตันแบบครบวงจร ตั้งแต่การลงทะเบียน สุ่มจับคู่แข่งขัน ติดตามการใช้ลูกแบดมินตัน ไปจนถึงการคำนวณค่าใช้จ่ายรายบุคคลและระบบทำอันดับ (Leaderboard)

## 🌟 ฟีเจอร์เด่น (Key Features)

### สำหรับผู้ดูแล (Admin)
- **จัดการก๊วน (Event Management):** สร้าง เปิด หรือปิดก๊วนในแต่ละวัน กำหนดค่าสนามและราคาลูกแบด
- **ระบบจัดแมตช์อัจฉริยะ (Smart Matchmaking):** 
  - สุ่มจัดแมตช์อัตโนมัติโดยคำนวณจากระดับฝีมือ (Skill Level) เพื่อความสมดุล
  - จัดแมตช์แบบกำหนดเอง (Manual Match)
  - กำหนดคอร์ทที่ใช้แข่งขัน
- **จัดการลูกแบด (Shuttlecock Tracking):** บันทึกหมายเลขลูกแบดที่ใช้ในแต่ละแมตช์เพื่อความโปร่งใส
- **ติดตามการชำระเงิน (Payment Tracking):** ตรวจสอบสถานะการจ่ายเงินของผู้เล่นทุกคนแบบ Real-time
- **สถิติ (Statistics):** ดูภาพรวมจำนวนผู้เล่น จำนวนแมตช์ และยอดเงินรวมทั้งหมด

### สำหรับผู้เล่น (User)
- **กระดานคิวอัจฉริยะ (Live Board):** ดูสถานะแมตช์ปัจจุบัน (รอคิว, กำลังตี, จบแล้ว) แบบ Real-time
- **สรุปค่าใช้จ่ายส่วนตัว (My Expenses):** ระบบคำนวณค่าสนามและค่าลูกแบดตามจำนวนที่ใช้จริงให้ทันที พร้อมสถานะว่าจ่ายแล้วหรือยัง
- **ทำอันดับ (Leaderboard):** ติดตามสถิติการแพ้-ชนะ และอันดับในก๊วน
- **ข้อมูลส่วนตัว (Profile):** จัดการระดับฝีมือและข้อมูลการติดต่อ

---

## 🛠 เทคโนโลยีที่ใช้ (Tech Stack)

- **Frontend:** [Next.js](https://nextjs.org/) (App Router), [React](https://reactjs.org/)
- **Styling:** Vanilla CSS, [TailwindCSS](https://tailwindcss.com/)
- **Database & Real-time:** [Supabase](https://supabase.com/) (PostgreSQL)
- **Icons:** [Iconify](https://iconify.design/)
- **Notification:** [React Hot Toast](https://react-hot-toast.com/)

---

## 📂 โครงสร้างฐานข้อมูล (Database Schema)

ระบบทำงานบน Supabase โดยมีตารางหลักดังนี้:
- `profiles`: ข้อมูลผู้ใช้งาน, บทบาท (Admin/User), และระดับฝีมือ
- `events`: ข้อมูลก๊วนในแต่ละวัน, ค่าสนาม, ราคาสลูกแบด
- `event_players`: ประวัติการเข้าร่วมก๊วนของผู้เล่น และสถานะการชำระเงิน
- `matches`: ข้อมูลแมตช์การแข่งขัน, คอร์ท, และหมายเลขลูกแบดที่ใช้
- `match_players`: รายชื่อผู้เล่นในแต่ละแมตช์ (แบ่งทีม A และ B)

---

## 🚀 การติดตั้งและตั้งค่า (Setup & Installation)

1. **Clone project:**
   ```bash
   git clone <repository-url>
   cd badminton-group-web
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   สร้างไฟล์ `.env.local` และกำหนดค่า Supabase ของคุณ:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run development server:**
   ```bash
   npm run dev
   ```

5. **Database Setup:**
   รันสคริปต์ SQL ในโฟลเดอร์ `supabase/full_database_setup.sql` ใน Supabase SQL Editor เพื่อสร้างตารางและฟังก์ชันที่จำเป็น
