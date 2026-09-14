-- ============================================================
-- 🚑 กู้คืน MMR แบบแม่นยำ — คำนวณใหม่จากประวัติ ตัดเฉพาะ "โทษขาดก๊วน" ออก
-- วิธีนี้ "รันซ้ำได้ ผลเท่าเดิม" (idempotent) และแก้ได้แม้โค้ดเก่าจะเผลอหักซ้ำไปแล้ว
--
-- หลักการ: mmr ที่ถูกต้อง = 1000 + ผลรวมการเปลี่ยนแปลงทั้งหมด "ที่ไม่ใช่โทษขาดก๊วน"
--          (คือ match_result + season_reset + admin_adjustment ...)
-- ============================================================

-- ── ขั้นที่ 1: พรีวิวก่อน (ไม่แก้ข้อมูล) — ดูว่าค่าใหม่จะเป็นเท่าไหร่ ก่อนตัดสินใจ ──
-- คัดลอกเฉพาะบล็อก SELECT นี้ไปรันดูก่อน ถ้าตัวเลข "ค่าที่จะกู้เป็น" ดูถูกแล้วค่อยรันขั้นที่ 2
/*
SELECT
    p.display_name,
    p.mmr AS ปัจจุบัน,
    1000 + COALESCE((
        SELECT SUM(h.change) FROM public.mmr_history h
        WHERE h.user_id = p.id AND h.reason NOT LIKE 'absence_penalty:%'
    ), 0) AS ค่าที่จะกู้เป็น,
    COALESCE((
        SELECT SUM(ABS(h.change)) FROM public.mmr_history h
        WHERE h.user_id = p.id AND h.reason LIKE 'absence_penalty:%'
    ), 0) AS เคยโดนหักไป
FROM public.profiles p
WHERE p.is_guest = false
ORDER BY ค่าที่จะกู้เป็น DESC;
*/

-- ── ขั้นที่ 2: กู้จริง — คำนวณ MMR ใหม่จากประวัติ (ตัดโทษขาดก๊วนออก) ──
UPDATE public.profiles p
SET mmr = 1000 + COALESCE((
    SELECT SUM(h.change)
    FROM public.mmr_history h
    WHERE h.user_id = p.id
      AND h.reason NOT LIKE 'absence_penalty:%'
), 0);

-- ── ขั้นที่ 3: ลบประวัติโทษขาดก๊วน + แจ้งเตือนที่ค้าง (กันนับซ้ำในอนาคต) ──
DELETE FROM public.mmr_history WHERE reason LIKE 'absence_penalty:%';
DELETE FROM public.notifications WHERE title LIKE '%ถูกหักเนื่องจากขาดก๊วน%';
