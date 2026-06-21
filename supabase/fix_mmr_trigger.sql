-- ============================================================
-- 🛠 FIX: MMR Trigger — Revert, Delete & NULL Safety
-- รันไฟล์นี้ใน Supabase SQL Editor เพื่อแก้บั๊ก:
--   BUG 1: Trigger crash ถ้า team ว่าง (NULL array)
--   BUG 2: MMR คำนวณซ้ำเมื่อ revert + finish ใหม่
--   BUG 3: ลบแมตช์ finished ไม่ revert MMR
-- ============================================================

-- ============================================================
-- 1. ปรับปรุง fn_calculate_match_mmr()
--    - เพิ่ม NULL check
--    - เพิ่ม revert MMR เมื่อ status เปลี่ยนจาก finished → อื่น
-- ============================================================
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
    hist RECORD;
BEGIN
    -- ============================================================
    -- STEP A: Revert MMR if match was previously finished
    -- (handles: revert to playing, revert to waiting, etc.)
    -- ============================================================
    IF (OLD.status = 'finished' AND NEW.status <> 'finished') THEN
        -- Revert each player's MMR from the history
        FOR hist IN
            SELECT user_id, change FROM mmr_history
            WHERE match_id = NEW.id AND reason = 'match_result'
        LOOP
            UPDATE profiles SET mmr = mmr - hist.change WHERE id = hist.user_id;
        END LOOP;
        -- Remove the history entries for this match
        DELETE FROM mmr_history WHERE match_id = NEW.id AND reason = 'match_result';
    END IF;

    -- ============================================================
    -- STEP B: Calculate MMR when match finishes
    -- ============================================================
    IF (OLD.status <> 'finished' AND NEW.status = 'finished') THEN
        -- Get players for Team A
        SELECT array_agg(user_id) INTO team_a_ids FROM match_players WHERE match_id = NEW.id AND team = 'A';
        -- Get players for Team B
        SELECT array_agg(user_id) INTO team_b_ids FROM match_players WHERE match_id = NEW.id AND team = 'B';

        -- BUG 1 FIX: Skip if teams are incomplete
        IF team_a_ids IS NULL OR team_b_ids IS NULL THEN
            RETURN NEW;
        END IF;

        -- Calculate Average MMR for teams
        SELECT AVG(mmr) INTO team_a_avg FROM profiles WHERE id = ANY(team_a_ids);
        SELECT AVG(mmr) INTO team_b_avg FROM profiles WHERE id = ANY(team_b_ids);

        -- Handle NULL MMR (default to 1000)
        team_a_avg := COALESCE(team_a_avg, 1000);
        team_b_avg := COALESCE(team_b_avg, 1000);

        -- Elo Formula: Expected Score
        expected_a := 1.0 / (1.0 + pow(10, (team_b_avg - team_a_avg) / 400.0));
        expected_b := 1.0 - expected_a;

        -- Actual Result
        IF NEW.team_a_score > NEW.team_b_score THEN
            actual_a := 1.0;
            actual_b := 0.0;
        ELSIF NEW.team_b_score > NEW.team_a_score THEN
            actual_a := 0.0;
            actual_b := 1.0;
        ELSE
            -- Draw
            actual_a := 0.5;
            actual_b := 0.5;
        END IF;

        -- Update Team A Players
        FOREACH p_id IN ARRAY team_a_ids LOOP
            SELECT COALESCE(mmr, 1000) INTO old_r FROM profiles WHERE id = p_id;
            diff := round(k_factor * (actual_a - expected_a));
            new_r := old_r + diff;
            
            UPDATE profiles SET mmr = new_r WHERE id = p_id;
            INSERT INTO mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
            VALUES (p_id, NEW.id, old_r, new_r, diff, 'match_result');
        END LOOP;

        -- Update Team B Players
        FOREACH p_id IN ARRAY team_b_ids LOOP
            SELECT COALESCE(mmr, 1000) INTO old_r FROM profiles WHERE id = p_id;
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

-- ============================================================
-- 2. สร้าง fn_revert_mmr_on_delete()
--    เมื่อลบแมตช์ที่ finished → revert MMR ของผู้เล่นทุกคน
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_revert_mmr_on_delete()
RETURNS TRIGGER AS $$
DECLARE
    hist RECORD;
BEGIN
    -- Only revert if the match was finished
    IF OLD.status = 'finished' THEN
        -- Revert each player's MMR from the history
        FOR hist IN
            SELECT user_id, change FROM mmr_history
            WHERE match_id = OLD.id AND reason = 'match_result'
        LOOP
            UPDATE profiles SET mmr = mmr - hist.change WHERE id = hist.user_id;
        END LOOP;
        -- Remove the history entries for this match
        DELETE FROM mmr_history WHERE match_id = OLD.id AND reason = 'match_result';
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. ลบ Trigger เดิมและสร้างใหม่
-- ============================================================

-- Trigger สำหรับ UPDATE (คำนวณ + revert MMR)
DROP TRIGGER IF EXISTS tr_after_match_finished ON public.matches;
CREATE TRIGGER tr_after_match_finished
AFTER UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.fn_calculate_match_mmr();

-- Trigger สำหรับ DELETE (revert MMR ก่อนลบ)
DROP TRIGGER IF EXISTS tr_before_match_delete ON public.matches;
CREATE TRIGGER tr_before_match_delete
BEFORE DELETE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.fn_revert_mmr_on_delete();
