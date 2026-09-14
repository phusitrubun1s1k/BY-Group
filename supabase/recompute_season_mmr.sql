-- ============================================================
-- 🔧 คำนวณ MMR "ซีซันล่าสุด" ใหม่ทั้งหมด (Replay) — แก้แต้มที่บวก/ลบผิด
--
-- ทำอะไร: รีเซ็ตแต้มทุกคนกลับไปที่ "ค่าเริ่มซีซัน" (หลังรีเซ็ตล่าสุด) แล้ว
--          เล่นซ้ำทุกแมทที่ 'finished' ตามลำดับการเล่น ด้วยกติกาที่ถูกต้อง:
--            • นับแต่ละแมทครั้งเดียว (แก้บั๊กหักซ้ำ)
--            • ข้ามแมทที่จบแบบไม่แจ้งผล (สกอร์ 0-0)
--            • ไม่รวมแมทที่ถูกลบไปแล้ว (หายจากตาราง matches)
--          → ได้แต้มที่ควรจะเป็นจริง
--
-- ⚠️ ก่อนรัน: ให้รัน fix_mmr_reverse.sql (แก้ trigger) ก่อน เพื่อไม่ให้เพี้ยนอีก
-- ⚠️ สคริปต์นี้เขียนทับ profiles.mmr ของทุกคน — มี backup ให้ในขั้นที่ 1
-- ============================================================

-- ── ขั้นที่ 1: สำรองแต้มปัจจุบันไว้ก่อน (เผื่อย้อนกลับ) ──
DROP TABLE IF EXISTS public.profiles_mmr_backup;
CREATE TABLE public.profiles_mmr_backup AS
SELECT id, display_name, mmr AS mmr_before, now() AS backed_up_at
FROM public.profiles;
-- ถ้าต้องการย้อนกลับภายหลัง:
--   UPDATE public.profiles p SET mmr = b.mmr_before
--   FROM public.profiles_mmr_backup b WHERE b.id = p.id;


-- ── ขั้นที่ 2: Replay คำนวณใหม่ทั้งซีซัน ──
DO $$
DECLARE
    last_reset TIMESTAMPTZ;
    m RECORD;
    team_a_ids UUID[];
    team_b_ids UUID[];
    a_avg FLOAT;
    b_avg FLOAT;
    exp_a FLOAT;
    exp_b FLOAT;
    act_a FLOAT;
    act_b FLOAT;
    k INT := 64;
    pid UUID;
    oldr INT;
    newr INT;
    d INT;
    replayed INT := 0;
BEGIN
    -- 2.1 หาเวลารีเซ็ตซีซันล่าสุด
    SELECT COALESCE(
        (SELECT reset_at FROM public.rank_reset_schedule WHERE status = 'executed' ORDER BY reset_at DESC LIMIT 1),
        '1970-01-01T00:00:00Z'::TIMESTAMPTZ
    ) INTO last_reset;
    RAISE NOTICE 'Replaying season since: %', last_reset;

    -- 2.2 ตั้งแต้มทุกคนกลับไปที่ "ค่าเริ่มซีซัน" = new_mmr ของ season_reset ล่าสุด (ไม่มี = 1000)
    UPDATE public.profiles p
    SET mmr = COALESCE(
        (SELECT h.new_mmr FROM public.mmr_history h
         WHERE h.user_id = p.id AND h.reason LIKE 'season_reset:%'
         ORDER BY h.created_at DESC LIMIT 1),
        1000
    );

    -- 2.3 ลบประวัติ match_result ของ "ซีซันนี้" ทิ้ง (จะสร้างใหม่ตอน replay)
    DELETE FROM public.mmr_history
    WHERE reason = 'match_result'
      AND match_id IN (
          SELECT mt.id FROM public.matches mt
          JOIN public.events e ON e.id = mt.event_id
          WHERE e.event_date > last_reset
      );

    -- 2.4 เล่นซ้ำทุกแมทที่จบ ตามลำดับการเล่น (วันก๊วน → เลขแมท → เวลาสร้าง)
    FOR m IN
        SELECT mt.id, mt.team_a_score, mt.team_b_score
        FROM public.matches mt
        JOIN public.events e ON e.id = mt.event_id
        WHERE mt.status = 'finished' AND e.event_date > last_reset
        ORDER BY e.event_date ASC, mt.match_number ASC NULLS LAST, mt.created_at ASC
    LOOP
        -- ข้ามแมทไม่แจ้งผล (0-0)
        CONTINUE WHEN m.team_a_score = 0 AND m.team_b_score = 0;

        SELECT array_agg(user_id) INTO team_a_ids FROM public.match_players WHERE match_id = m.id AND team = 'A';
        SELECT array_agg(user_id) INTO team_b_ids FROM public.match_players WHERE match_id = m.id AND team = 'B';
        CONTINUE WHEN team_a_ids IS NULL OR team_b_ids IS NULL;

        SELECT AVG(COALESCE(mmr, 1000)) INTO a_avg FROM public.profiles WHERE id = ANY(team_a_ids);
        SELECT AVG(COALESCE(mmr, 1000)) INTO b_avg FROM public.profiles WHERE id = ANY(team_b_ids);

        exp_a := 1.0 / (1.0 + pow(10, (b_avg - a_avg) / 400.0));
        exp_b := 1.0 - exp_a;

        IF m.team_a_score > m.team_b_score THEN
            act_a := 1.0; act_b := 0.0;
        ELSIF m.team_b_score > m.team_a_score THEN
            act_a := 0.0; act_b := 1.0;
        ELSE
            act_a := 0.5; act_b := 0.5;  -- เสมอจริง (1-1)
        END IF;

        FOREACH pid IN ARRAY team_a_ids LOOP
            SELECT mmr INTO oldr FROM public.profiles WHERE id = pid;
            d := round(k * (act_a - exp_a));
            newr := oldr + d;
            UPDATE public.profiles SET mmr = newr WHERE id = pid;
            INSERT INTO public.mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
            VALUES (pid, m.id, oldr, newr, d, 'match_result');
        END LOOP;

        FOREACH pid IN ARRAY team_b_ids LOOP
            SELECT mmr INTO oldr FROM public.profiles WHERE id = pid;
            d := round(k * (act_b - exp_b));
            newr := oldr + d;
            UPDATE public.profiles SET mmr = newr WHERE id = pid;
            INSERT INTO public.mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
            VALUES (pid, m.id, oldr, newr, d, 'match_result');
        END LOOP;

        replayed := replayed + 1;
    END LOOP;

    RAISE NOTICE '=== Replay เสร็จ: คำนวณใหม่ % แมท ===', replayed;
END $$;


-- ── ขั้นที่ 3: ตรวจผล (เทียบก่อน/หลัง) ──
SELECT
    p.display_name,
    b.mmr_before AS ก่อน,
    p.mmr AS หลัง,
    p.mmr - b.mmr_before AS ต่าง
FROM public.profiles p
JOIN public.profiles_mmr_backup b ON b.id = p.id
WHERE p.is_guest = false
ORDER BY p.mmr DESC;
