-- ============================================================
-- 🏸 SQL Command: Deduct MMR for Absent Players
-- รันไฟล์นี้ใน Supabase SQL Editor เพื่อคำนวณและตัดคะแนน MMR (-20 แต้มต่อก๊วน) 
-- ของคนที่ไม่มาเล่นก๊วนเลยตั้งแต่รีแรงค์ซีซันล่าสุด (ย้อนหลังข้ามซีซันแบบ Idempotent)
-- ============================================================

DO $$
DECLARE
    last_reset TIMESTAMPTZ;
    rec_user RECORD;
    rec_event RECORD;
    has_played BOOLEAN;
    current_mmr INT;
    deduction INT;
    new_mmr INT;
    penalty_reason TEXT;
    penalty_exists BOOLEAN;
    deduction_count INT := 0;
    consecutive_misses INT := 0;
    idx INT := 0;
BEGIN
    -- 1. หาเวลาของการรีแรงค์ครั้งล่าสุดที่ทำเสร็จแล้ว
    SELECT COALESCE(
        (SELECT reset_at FROM public.rank_reset_schedule WHERE status = 'executed' ORDER BY reset_at DESC LIMIT 1),
        '1970-01-01T00:00:00Z'::TIMESTAMPTZ
    ) INTO last_reset;

    RAISE NOTICE 'Latest reset time: %', last_reset;

    -- 2. วนลูปเช็คผู้เล่นทุกคนในระบบ
    FOR rec_user IN SELECT id, mmr, display_name FROM public.profiles LOOP
        current_mmr := COALESCE(rec_user.mmr, 1000);
        
        -- 2.1 นับจำนวนก๊วนที่ขาดติดต่อกันทั้งหมดก่อน (นับย้อนกลับจากล่าสุด)
        consecutive_misses := 0;
        FOR rec_event IN 
            SELECT id 
            FROM public.events 
            WHERE status = 'closed' 
            ORDER BY event_date DESC
        LOOP
            SELECT EXISTS (
                SELECT 1 
                FROM public.event_players 
                WHERE user_id = rec_user.id AND event_id = rec_event.id
            ) INTO has_played;

            IF has_played THEN
                EXIT;
            END IF;
            consecutive_misses := consecutive_misses + 1;
        END LOOP;

        -- 2.2 วนลูปเช็คเพื่อตัดคะแนนเฉพาะก๊วนที่ขาดลำดับพหุคูณของ 3 (เช่น ลำดับที่ 3, 6, 9...)
        -- โดยนับตามลำดับเวลาจากเก่าสุดไปใหม่สุด (1-based index)
        -- ซึ่งรอบ loop event_date DESC ตัวแรก (ใหม่สุด) จะมีดัชนี = consecutive_misses
        idx := consecutive_misses;

        FOR rec_event IN 
            SELECT id, event_date 
            FROM public.events 
            WHERE status = 'closed' 
            ORDER BY event_date DESC
        LOOP
            -- เช็คว่าใน event นี้ผู้เล่นได้ลงทะเบียนเล่นหรือไม่
            SELECT EXISTS (
                SELECT 1 
                FROM public.event_players 
                WHERE user_id = rec_user.id AND event_id = rec_event.id
            ) INTO has_played;

            -- ถ้าผู้เล่นลงเล่นใน event นี้ แสดงว่าหยุดขาดที่ event นี้ (หยุดนับย้อนกลับ)
            IF has_played THEN
                EXIT;
            END IF;

            -- หักคะแนนเฉพาะครั้งที่ขาดลำดับพหุคูณของ 3 (เช่น ครั้งที่ 3, 6, 9)
            IF idx % 3 = 0 THEN
                -- ขาดก๊วนนี้ -> ตรวจสอบว่าเคยโดนตัดคะแนนก๊วนนี้ไปหรือยัง (Idempotency)
                penalty_reason := 'absence_penalty:' || rec_event.id;
                
                SELECT EXISTS (
                    SELECT 1 
                    FROM public.mmr_history 
                    WHERE user_id = rec_user.id AND reason = penalty_reason
                ) INTO penalty_exists;

                -- ถ้ายังไม่เคยตัดคะแนน และ MMR ปัจจุบันมากกว่า 1000
                IF NOT penalty_exists THEN
                    IF current_mmr > 1000 THEN
                        deduction := LEAST(20, current_mmr - 1000);
                        new_mmr := current_mmr - deduction;

                        -- อัปเดต MMR ใน profiles
                        UPDATE public.profiles SET mmr = new_mmr WHERE id = rec_user.id;

                        -- บันทึกประวัติการหักคะแนนใน mmr_history
                        INSERT INTO public.mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
                        VALUES (rec_user.id, NULL, current_mmr, new_mmr, -deduction, penalty_reason);

                        -- บันทึกแจ้งเตือนใน notifications
                        INSERT INTO public.notifications (user_id, title, body, type, link_url)
                        VALUES (
                            rec_user.id,
                            'คะแนน MMR ถูกหักเนื่องจากขาดก๊วน 🏸',
                            'ขาดเล่นก๊วนติดต่อกัน ' || idx || ' ครั้ง หักวันที่ ' || to_char(rec_event.event_date, 'DD/MM/YYYY'),
                            'system',
                            '/dashboard/profile'
                        );

                        deduction_count := deduction_count + 1;
                        RAISE NOTICE 'Deducted % MMR from % (Current: %, New: %) for event on % (Absence index: %)', 
                            deduction, rec_user.display_name, current_mmr, new_mmr, rec_event.event_date, idx;

                        current_mmr := new_mmr;
                    END IF;
                END IF;
            END IF;

            -- ลดดัชนีลงเนื่องจากเคลื่อนจากใหม่สุดไปเก่าสุด
            idx := idx - 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Deduction process completed. Total penalties applied: %', deduction_count;
END $$;
