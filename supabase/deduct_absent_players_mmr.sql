-- ============================================================
-- 🏸 SQL Command: Deduct MMR for Absent Players
-- ตัดคะแนน MMR -20 ต่อการขาดก๊วนครบทุก 3 ครั้ง (สะสม 3, 6, 9...)
-- นับ "เฉพาะซีซันปัจจุบัน" (ก๊วนหลังรีเซ็ตล่าสุด) และเฉพาะการขาด "หลังเล่นครั้งล่าสุด" เท่านั้น
-- Idempotent (รันซ้ำได้ ไม่ตัดซ้ำก๊วนเดิม)
--
-- ⚠️ รันด้วยตนเองเมื่อเจตนาจะหักเท่านั้น (แนะนำให้รันหลังปิดก๊วนแต่ละรอบ)
--    ห้ามให้ทำงานอัตโนมัติ เพราะทำให้แต้มหายโดยไม่ตั้งใจ
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
    -- 1. หาเวลาของการรีเซ็ตซีซันครั้งล่าสุดที่ทำเสร็จแล้ว
    SELECT COALESCE(
        (SELECT reset_at FROM public.rank_reset_schedule WHERE status = 'executed' ORDER BY reset_at DESC LIMIT 1),
        '1970-01-01T00:00:00Z'::TIMESTAMPTZ
    ) INTO last_reset;

    RAISE NOTICE 'Latest reset time: %', last_reset;

    -- 2. วนลูปเช็คผู้เล่นทุกคน (ยกเว้นแขก guest)
    FOR rec_user IN
        SELECT id, mmr, display_name
        FROM public.profiles
        WHERE COALESCE(is_guest, false) = false
    LOOP
        current_mmr := COALESCE(rec_user.mmr, 1000);

        -- 2.1 นับก๊วนที่ขาดติดต่อกัน (นับย้อนจากล่าสุด) — เฉพาะซีซันนี้ (event_date > last_reset)
        consecutive_misses := 0;
        FOR rec_event IN
            SELECT id
            FROM public.events
            WHERE status = 'closed' AND event_date > last_reset
            ORDER BY event_date DESC, id DESC
        LOOP
            SELECT EXISTS (
                SELECT 1
                FROM public.event_players
                WHERE user_id = rec_user.id AND event_id = rec_event.id
            ) INTO has_played;

            IF has_played THEN
                EXIT; -- เจอก๊วนที่ลงเล่น → หยุดนับ (นับเฉพาะการขาดหลังเล่นล่าสุด)
            END IF;
            consecutive_misses := consecutive_misses + 1;
        END LOOP;

        -- 2.2 ตัดคะแนนเฉพาะการขาดลำดับพหุคูณของ 3 (ครั้งที่ 3, 6, 9 นับจากเก่าสุด)
        idx := consecutive_misses;

        FOR rec_event IN
            SELECT id, event_date
            FROM public.events
            WHERE status = 'closed' AND event_date > last_reset
            ORDER BY event_date DESC, id DESC
        LOOP
            SELECT EXISTS (
                SELECT 1
                FROM public.event_players
                WHERE user_id = rec_user.id AND event_id = rec_event.id
            ) INTO has_played;

            IF has_played THEN
                EXIT;
            END IF;

            -- หักเฉพาะครั้งที่ขาดลำดับพหุคูณของ 3
            IF idx % 3 = 0 THEN
                penalty_reason := 'absence_penalty:' || rec_event.id;

                SELECT EXISTS (
                    SELECT 1
                    FROM public.mmr_history
                    WHERE user_id = rec_user.id AND reason = penalty_reason
                ) INTO penalty_exists;

                -- ยังไม่เคยตัด และ MMR ปัจจุบัน > 1000 (ไม่ตัดต่ำกว่าฐาน)
                IF NOT penalty_exists AND current_mmr > 1000 THEN
                    deduction := LEAST(20, current_mmr - 1000);
                    new_mmr := current_mmr - deduction;

                    UPDATE public.profiles SET mmr = new_mmr WHERE id = rec_user.id;

                    INSERT INTO public.mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
                    VALUES (rec_user.id, NULL, current_mmr, new_mmr, -deduction, penalty_reason);

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

            idx := idx - 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Deduction process completed. Total penalties applied: %', deduction_count;
END $$;
