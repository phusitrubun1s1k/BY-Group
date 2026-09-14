-- ============================================================
-- 🚑 กู้คืน MMR = "แต้มหลังเล่นแมตช์ล่าสุดของแต่ละคน" (เช่น รอบวันที่ 29 กค)
-- ตัดโทษขาดก๊วนที่มาหักทีหลังออกทั้งหมด
--
-- หลักการ: ทุกแมตช์ที่จบ ระบบบันทึก new_mmr (แต้มหลังจบเกม) ไว้ใน mmr_history
--          → ดึงแถว match_result "ล่าสุด" ของแต่ละคน มาตั้งเป็น mmr ปัจจุบัน
-- รันซ้ำได้ ผลเท่าเดิม (idempotent)
-- ============================================================

-- ── ขั้นที่ 1: พรีวิวก่อน (ไม่แก้ข้อมูล) ──
-- คัดลอกเฉพาะ SELECT นี้ไปรันดูก่อน ถ้า "แต้มเล่นล่าสุด" ถูกต้องแล้วค่อยรันขั้นที่ 2
/*
SELECT
    p.display_name,
    p.mmr AS ปัจจุบัน,
    (
        SELECT h.new_mmr FROM public.mmr_history h
        WHERE h.user_id = p.id AND h.reason = 'match_result'
        ORDER BY h.created_at DESC
        LIMIT 1
    ) AS แต้มเล่นล่าสุด
FROM public.profiles p
WHERE p.is_guest = false
ORDER BY แต้มเล่นล่าสุด DESC NULLS LAST;
*/

-- ── ขั้นที่ 2: กู้จริง — ตั้ง mmr = new_mmr ของ match_result ล่าสุดของแต่ละคน ──
UPDATE public.profiles p
SET mmr = sub.new_mmr
FROM (
    SELECT DISTINCT ON (user_id) user_id, new_mmr
    FROM public.mmr_history
    WHERE reason = 'match_result'
    ORDER BY user_id, created_at DESC
) sub
WHERE p.id = sub.user_id;

-- ── ขั้นที่ 3: ลบประวัติโทษขาดก๊วน + แจ้งเตือนที่ค้าง (กันนับซ้ำในอนาคต) ──
DELETE FROM public.mmr_history WHERE reason LIKE 'absence_penalty:%';
DELETE FROM public.notifications WHERE title LIKE '%ถูกหักเนื่องจากขาดก๊วน%';
