-- ============================================================
-- 🩹 แก้บั๊กการคิดแต้ม MMR (3 จุด) — รันไฟล์นี้ใน Supabase SQL Editor (ทับ trigger เดิม)
--   1) "จบโดยไม่แจ้งผล" (สกอร์ 0-0) จะไม่แตะ MMR อีก (เดิมถูกคิดเป็นเสมอ → ฝั่งแกร่งโดนหัก)
--   2) แก้ผลแมท (ย้อนกลับไปเล่นต่อ แล้ว finish ใหม่) จะ "คืนแต้มเดิมก่อนคิดใหม่" (ไม่หักซ้ำ)
--   3) ลบ/ยกเลิกแมทที่จบแล้ว จะ "คืนแต้ม" อัตโนมัติ
-- ไม่ต้องแก้/deploy โค้ดหน้าเว็บ — client เก็บค่าถูกอยู่แล้ว (ชนะ=1-0, เสมอ=1-1, ไม่แจ้งผล=0-0)
-- ============================================================

-- ── 1) ฟังก์ชันคืนแต้มของแมทหนึ่ง (ถอน match_result ที่เคยคิดไว้) ──
CREATE OR REPLACE FUNCTION public.fn_reverse_match_mmr(p_match_id UUID)
RETURNS VOID AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT user_id, change
        FROM public.mmr_history
        WHERE match_id = p_match_id AND reason = 'match_result'
    LOOP
        -- ถอนแต้มที่เคยบวก/ลบไปของแมทนี้ออก (mmr - change)
        UPDATE public.profiles SET mmr = mmr - r.change WHERE id = r.user_id;
    END LOOP;

    DELETE FROM public.mmr_history WHERE match_id = p_match_id AND reason = 'match_result';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 2) ฟังก์ชันหลัก (AFTER UPDATE): คืนของเดิม → คิดใหม่ + guard ไม่แจ้งผล ──
CREATE OR REPLACE FUNCTION public.fn_calculate_match_mmr()
RETURNS TRIGGER AS $$
DECLARE
    team_a_ids UUID[];
    team_b_ids UUID[];
    team_a_avg FLOAT;
    team_b_avg FLOAT;
    expected_a FLOAT;
    expected_b FLOAT;
    k_factor INT := 64;
    actual_a FLOAT;
    actual_b FLOAT;
    p_id UUID;
    old_r INT;
    new_r INT;
    diff INT;
BEGIN
    -- (ก) ออกจากสถานะ finished (กด "เล่นต่อ/แก้ไข" หรือ "ยกเลิกแมท") → คืนแต้ม แล้วจบ
    IF OLD.status = 'finished' AND NEW.status IS DISTINCT FROM 'finished' THEN
        PERFORM public.fn_reverse_match_mmr(OLD.id);
        RETURN NEW;
    END IF;

    -- (ข) เข้าสู่ finished หรือแก้สกอร์ทั้งที่ finished อยู่
    IF NEW.status = 'finished' AND (
            OLD.status IS DISTINCT FROM 'finished'
            OR OLD.team_a_score IS DISTINCT FROM NEW.team_a_score
            OR OLD.team_b_score IS DISTINCT FROM NEW.team_b_score
    ) THEN
        -- กันหักซ้ำ: ถ้าแมทนี้เคยถูกคิดไปแล้ว ให้คืนของเดิมก่อน
        PERFORM public.fn_reverse_match_mmr(NEW.id);

        -- จบโดยไม่แจ้งผล (0-0) → ไม่แตะ MMR (ชนะจะเป็น 1-0, เสมอจริงเป็น 1-1)
        IF NEW.team_a_score = 0 AND NEW.team_b_score = 0 THEN
            RETURN NEW;
        END IF;

        -- ===== คิด Elo (สูตรเดิม K=64) =====
        SELECT array_agg(user_id) INTO team_a_ids FROM match_players WHERE match_id = NEW.id AND team = 'A';
        SELECT array_agg(user_id) INTO team_b_ids FROM match_players WHERE match_id = NEW.id AND team = 'B';

        -- ถ้าผู้เล่นไม่ครบทั้ง 2 ทีม ไม่คิดแต้ม
        IF team_a_ids IS NULL OR team_b_ids IS NULL THEN
            RETURN NEW;
        END IF;

        SELECT AVG(COALESCE(mmr, 1000)) INTO team_a_avg FROM profiles WHERE id = ANY(team_a_ids);
        SELECT AVG(COALESCE(mmr, 1000)) INTO team_b_avg FROM profiles WHERE id = ANY(team_b_ids);

        expected_a := 1.0 / (1.0 + pow(10, (team_b_avg - team_a_avg) / 400.0));
        expected_b := 1.0 - expected_a;

        IF NEW.team_a_score > NEW.team_b_score THEN
            actual_a := 1.0; actual_b := 0.0;
        ELSIF NEW.team_b_score > NEW.team_a_score THEN
            actual_a := 0.0; actual_b := 1.0;
        ELSE
            actual_a := 0.5; actual_b := 0.5;  -- เสมอจริง (สกอร์ 1-1)
        END IF;

        FOREACH p_id IN ARRAY team_a_ids LOOP
            SELECT mmr INTO old_r FROM profiles WHERE id = p_id;
            diff := round(k_factor * (actual_a - expected_a));
            new_r := old_r + diff;
            UPDATE profiles SET mmr = new_r WHERE id = p_id;
            INSERT INTO mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
            VALUES (p_id, NEW.id, old_r, new_r, diff, 'match_result');
        END LOOP;

        FOREACH p_id IN ARRAY team_b_ids LOOP
            SELECT mmr INTO old_r FROM profiles WHERE id = p_id;
            diff := round(k_factor * (actual_b - expected_b));
            new_r := old_r + diff;
            UPDATE profiles SET mmr = new_r WHERE id = p_id;
            INSERT INTO mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
            VALUES (p_id, NEW.id, old_r, new_r, diff, 'match_result');
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ผูก trigger เดิมกับฟังก์ชันใหม่ให้ชัวร์
DROP TRIGGER IF EXISTS tr_after_match_finished ON public.matches;
CREATE TRIGGER tr_after_match_finished
AFTER UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.fn_calculate_match_mmr();


-- ── 3) คืนแต้มเมื่อ "ลบ" แมทที่จบแล้ว (BEFORE DELETE เพื่อให้ยังอ่าน mmr_history ได้ทัน) ──
CREATE OR REPLACE FUNCTION public.fn_reverse_mmr_on_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'finished' THEN
        PERFORM public.fn_reverse_match_mmr(OLD.id);
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_before_match_delete ON public.matches;
CREATE TRIGGER tr_before_match_delete
BEFORE DELETE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.fn_reverse_mmr_on_delete();
