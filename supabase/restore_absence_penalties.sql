-- ============================================================
-- 🚑 กู้คืนแต้ม MMR ที่ถูกหักจาก "การขาดก๊วน" (แก้บั๊กแต้มหาย)
-- รันไฟล์นี้ครั้งเดียวใน Supabase SQL Editor
-- ผลลัพธ์: บวกแต้มที่เคยถูกหักคืนให้ทุกคน แล้วลบประวัติการหักออก (กันนับซ้ำ)
-- ปลอดภัย: คืนตาม "ยอดที่ถูกหักจริง" ในตาราง mmr_history เท่านั้น
--          ไม่ยุ่งกับแต้มจากการเล่นแมตช์หรือการรีเซ็ตซีซัน
-- ============================================================

DO $$
DECLARE
    rec RECORD;
    total_restored INT := 0;
    users_affected INT := 0;
BEGIN
    -- 1) บวกแต้มที่ถูกหักคืนให้แต่ละคน (ABS(change) เพราะ change เป็นค่าลบ)
    FOR rec IN
        SELECT user_id, SUM(ABS(change)) AS restore_amount
        FROM public.mmr_history
        WHERE reason LIKE 'absence_penalty:%'
        GROUP BY user_id
    LOOP
        UPDATE public.profiles
        SET mmr = COALESCE(mmr, 1000) + rec.restore_amount
        WHERE id = rec.user_id;

        total_restored := total_restored + rec.restore_amount;
        users_affected := users_affected + 1;

        RAISE NOTICE 'คืน % แต้มให้ user %', rec.restore_amount, rec.user_id;
    END LOOP;

    -- 2) ลบประวัติการหักแต้มขาดก๊วนทั้งหมด (กันโค้ด/สคริปต์นับซ้ำในอนาคต)
    DELETE FROM public.mmr_history WHERE reason LIKE 'absence_penalty:%';

    -- 3) ลบแจ้งเตือน "ถูกหักเนื่องจากขาดก๊วน" ที่ค้างอยู่
    DELETE FROM public.notifications WHERE title LIKE '%ถูกหักเนื่องจากขาดก๊วน%';

    RAISE NOTICE '=== เสร็จสิ้น: คืนรวม % แต้ม ให้ % คน ===', total_restored, users_affected;
END $$;
