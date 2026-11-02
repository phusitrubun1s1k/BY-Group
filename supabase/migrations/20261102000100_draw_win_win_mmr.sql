-- ============================================================
-- Migration: Draw Match Win-Win MMR
-- Date: 2026-11-02
-- กติกาผลเสมอ:
--   1. คนแต้มน้อย (มือใหม่): ได้โบนัส +10 MMR (เมื่อต่ำกว่าคู่แข่ง หรือต่ำกว่าเพื่อนร่วมทีม)
--   2. คนแต้มสูง (คนแบก): แต้มไม่ลด (0 MMR) ไม่ถูกลงโทษที่ลงมาช่วยแบก
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rebuild_current_mmr()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    epoch public.rating_epochs;
    item record;
    participant record;
    match_row public.matches;
    average_a numeric;
    average_b numeric;
    expected_a numeric;
    actual_a numeric;
    delta integer;
    previous integer;
    opponent_avg numeric;
    player_change integer;
    bonus_amount integer := 10;
BEGIN
    PERFORM pg_advisory_xact_lock(9142026);
    SELECT * INTO STRICT epoch FROM public.rating_epochs WHERE closed_at IS NULL;
    PERFORM id FROM public.profiles ORDER BY id FOR UPDATE;

    INSERT INTO public.rating_seeds(epoch_id, user_id, starting_mmr)
    SELECT epoch.id, id, COALESCE(mmr, 1000)
    FROM public.profiles
    ON CONFLICT DO NOTHING;

    UPDATE public.profiles profile
    SET mmr = seed.starting_mmr
    FROM public.rating_seeds seed
    WHERE seed.epoch_id = epoch.id AND seed.user_id = profile.id;

    DELETE FROM public.mmr_history history
    USING public.rating_match_order ordering
    WHERE history.match_id = ordering.match_id
      AND history.reason = 'match_result'
      AND ordering.epoch_id = epoch.id;

    FOR item IN
        SELECT ordering.occurred_at, ordering.match_id AS item_id, 'match' AS kind,
            NULL::uuid AS user_id, NULL::integer AS adjustment, NULL::text AS reason
        FROM public.rating_match_order ordering
        WHERE ordering.epoch_id = epoch.id
        UNION ALL
        SELECT history.created_at, history.id, 'adjustment', history.user_id, history.change, history.reason
        FROM public.mmr_history history
        WHERE history.created_at >= epoch.started_at
          AND COALESCE(history.reason, '') <> 'match_result'
          AND COALESCE(history.reason, '') NOT LIKE 'season_reset:%'
        ORDER BY occurred_at, item_id
    LOOP
        IF item.kind = 'adjustment' THEN
            SELECT mmr INTO previous FROM public.profiles WHERE id = item.user_id;
            delta := CASE
                WHEN item.reason LIKE 'absence_penalty:%' THEN -LEAST(20, GREATEST(previous - 1000, 0))
                ELSE item.adjustment
            END;
            UPDATE public.profiles SET mmr = previous + delta WHERE id = item.user_id;
            UPDATE public.mmr_history
            SET old_mmr = previous, new_mmr = previous + delta, change = delta
            WHERE id = item.item_id;
            CONTINUE;
        END IF;

        SELECT * INTO match_row FROM public.matches WHERE id = item.item_id;
        IF NOT FOUND
            OR match_row.status <> 'finished'
            OR (match_row.team_a_score = 0 AND match_row.team_b_score = 0) THEN
            CONTINUE;
        END IF;

        IF (SELECT count(*) FROM public.match_players WHERE match_id = match_row.id AND team = 'A') <> 2
            OR (SELECT count(*) FROM public.match_players WHERE match_id = match_row.id AND team = 'B') <> 2 THEN
            RAISE EXCEPTION 'แมตช์ % มีผู้เล่นไม่ครบ กรุณาตรวจข้อมูลก่อนคำนวณคะแนน', match_row.match_number;
        END IF;

        -- คำนวณค่าเฉลี่ย MMR ของทั้งสองทีม
        SELECT
            avg(profile.mmr) FILTER (WHERE player.team = 'A'),
            avg(profile.mmr) FILTER (WHERE player.team = 'B')
        INTO average_a, average_b
        FROM public.match_players player
        JOIN public.profiles profile ON profile.id = player.user_id
        WHERE player.match_id = match_row.id;

        IF match_row.team_a_score <> match_row.team_b_score THEN
            -- กรณีมีผลแพ้ชนะ: คำนวณตามสูตร Elo ปกติ
            expected_a := 1 / (1 + power(10::numeric, (average_b - average_a) / 400));
            actual_a := CASE WHEN match_row.team_a_score > match_row.team_b_score THEN 1 ELSE 0 END;
            delta := round(64 * (actual_a - expected_a));

            FOR participant IN
                SELECT player.user_id, player.team, profile.mmr
                FROM public.match_players player
                JOIN public.profiles profile ON profile.id = player.user_id
                WHERE player.match_id = match_row.id
                ORDER BY player.user_id
            LOOP
                previous := participant.mmr;
                player_change := CASE WHEN participant.team = 'A' THEN delta ELSE -delta END;

                UPDATE public.profiles
                SET mmr = previous + player_change
                WHERE id = participant.user_id;

                INSERT INTO public.mmr_history(user_id, match_id, old_mmr, new_mmr, change, reason, created_at)
                VALUES (
                    participant.user_id,
                    match_row.id,
                    previous,
                    previous + player_change,
                    player_change,
                    'match_result',
                    item.occurred_at
                );
            END LOOP;
        ELSE
            -- กรณีเสมอ (Draw): โมเดล Win-Win
            -- คนแต้มน้อย (มือใหม่) ได้โบนัส +10 MMR
            -- คนแต้มสูง (คนแบก) แต้มไม่ลด (0 MMR)
            FOR participant IN
                SELECT player.user_id, player.team, profile.mmr,
                    (SELECT p2.mmr 
                     FROM public.match_players mp2 
                     JOIN public.profiles p2 ON p2.id = mp2.user_id 
                     WHERE mp2.match_id = match_row.id AND mp2.team = player.team AND mp2.user_id <> player.user_id 
                     LIMIT 1) AS teammate_mmr
                FROM public.match_players player
                JOIN public.profiles profile ON profile.id = player.user_id
                WHERE player.match_id = match_row.id
                ORDER BY player.user_id
            LOOP
                previous := participant.mmr;
                opponent_avg := CASE WHEN participant.team = 'A' THEN average_b ELSE average_a END;

                -- เงื่อนไขคนแต้มน้อย / มือใหม่:
                -- 1. ต่ำกว่าค่าเฉลี่ยคู่ต่อสู้ (เป็นรองคู่แข่ง)
                -- 2. หรือต่ำกว่าเพื่อนร่วมทีม (มีคนเก่งลงมาช่วยแบก)
                IF participant.mmr < opponent_avg OR (participant.teammate_mmr IS NOT NULL AND participant.mmr < participant.teammate_mmr) THEN
                    player_change := bonus_amount; -- +10 MMR
                ELSE
                    player_change := 0; -- คนเก่งแต้มไม่ลด
                END IF;

                UPDATE public.profiles
                SET mmr = previous + player_change
                WHERE id = participant.user_id;

                INSERT INTO public.mmr_history(user_id, match_id, old_mmr, new_mmr, change, reason, created_at)
                VALUES (
                    participant.user_id,
                    match_row.id,
                    previous,
                    previous + player_change,
                    player_change,
                    'match_result',
                    item.occurred_at
                );
            END LOOP;
        END IF;
    END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.rebuild_current_mmr() FROM PUBLIC, anon, authenticated;

-- อัปเดต trigger fn_calculate_match_mmr ให้สอดคล้องกันด้วย
CREATE OR REPLACE FUNCTION public.fn_calculate_match_mmr()
RETURNS TRIGGER AS $$
DECLARE
    team_a_ids UUID[];
    team_b_ids UUID[];
    team_a_avg FLOAT;
    team_b_avg FLOAT;
    expected_a FLOAT;
    k_factor INT := 64;
    actual_a FLOAT;
    p_id UUID;
    old_r INT;
    new_r INT;
    diff INT;
    hist RECORD;
    teammate_id UUID;
    teammate_r INT;
    opp_avg FLOAT;
BEGIN
    -- Revert MMR if match was previously finished
    IF (OLD.status = 'finished' AND NEW.status <> 'finished') THEN
        FOR hist IN
            SELECT user_id, change FROM mmr_history
            WHERE match_id = NEW.id AND reason = 'match_result'
        LOOP
            UPDATE profiles SET mmr = mmr - hist.change WHERE id = hist.user_id;
        END LOOP;
        DELETE FROM mmr_history WHERE match_id = NEW.id AND reason = 'match_result';
    END IF;

    -- Calculate MMR when match finishes
    IF (OLD.status <> 'finished' AND NEW.status = 'finished') THEN
        SELECT array_agg(user_id) INTO team_a_ids FROM match_players WHERE match_id = NEW.id AND team = 'A';
        SELECT array_agg(user_id) INTO team_b_ids FROM match_players WHERE match_id = NEW.id AND team = 'B';

        IF team_a_ids IS NULL OR team_b_ids IS NULL THEN
            RETURN NEW;
        END IF;

        SELECT AVG(COALESCE(mmr, 1000)) INTO team_a_avg FROM profiles WHERE id = ANY(team_a_ids);
        SELECT AVG(COALESCE(mmr, 1000)) INTO team_b_avg FROM profiles WHERE id = ANY(team_b_ids);

        team_a_avg := COALESCE(team_a_avg, 1000);
        team_b_avg := COALESCE(team_b_avg, 1000);

        IF NEW.team_a_score <> NEW.team_b_score THEN
            -- แพ้ชนะ ปกติ
            expected_a := 1.0 / (1.0 + pow(10, (team_b_avg - team_a_avg) / 400.0));
            actual_a := CASE WHEN NEW.team_a_score > NEW.team_b_score THEN 1.0 ELSE 0.0 END;
            diff := round(k_factor * (actual_a - expected_a));

            FOREACH p_id IN ARRAY team_a_ids LOOP
                SELECT COALESCE(mmr, 1000) INTO old_r FROM profiles WHERE id = p_id;
                new_r := old_r + diff;
                UPDATE profiles SET mmr = new_r WHERE id = p_id;
                INSERT INTO mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
                VALUES (p_id, NEW.id, old_r, new_r, diff, 'match_result');
            END LOOP;

            FOREACH p_id IN ARRAY team_b_ids LOOP
                SELECT COALESCE(mmr, 1000) INTO old_r FROM profiles WHERE id = p_id;
                new_r := old_r - diff;
                UPDATE profiles SET mmr = new_r WHERE id = p_id;
                INSERT INTO mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
                VALUES (p_id, NEW.id, old_r, new_r, -diff, 'match_result');
            END LOOP;
        ELSE
            -- เสมอ (Draw): Win-Win
            -- Team A
            FOREACH p_id IN ARRAY team_a_ids LOOP
                SELECT COALESCE(mmr, 1000) INTO old_r FROM profiles WHERE id = p_id;
                SELECT user_id INTO teammate_id FROM match_players WHERE match_id = NEW.id AND team = 'A' AND user_id <> p_id LIMIT 1;
                IF teammate_id IS NOT NULL THEN
                    SELECT COALESCE(mmr, 1000) INTO teammate_r FROM profiles WHERE id = teammate_id;
                ELSE
                    teammate_r := NULL;
                END IF;

                IF old_r < team_b_avg OR (teammate_r IS NOT NULL AND old_r < teammate_r) THEN
                    diff := 10;
                ELSE
                    diff := 0;
                END IF;

                new_r := old_r + diff;
                UPDATE profiles SET mmr = new_r WHERE id = p_id;
                INSERT INTO mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
                VALUES (p_id, NEW.id, old_r, new_r, diff, 'match_result');
            END LOOP;

            -- Team B
            FOREACH p_id IN ARRAY team_b_ids LOOP
                SELECT COALESCE(mmr, 1000) INTO old_r FROM profiles WHERE id = p_id;
                SELECT user_id INTO teammate_id FROM match_players WHERE match_id = NEW.id AND team = 'B' AND user_id <> p_id LIMIT 1;
                IF teammate_id IS NOT NULL THEN
                    SELECT COALESCE(mmr, 1000) INTO teammate_r FROM profiles WHERE id = teammate_id;
                ELSE
                    teammate_r := NULL;
                END IF;

                IF old_r < team_a_avg OR (teammate_r IS NOT NULL AND old_r < teammate_r) THEN
                    diff := 10;
                ELSE
                    diff := 0;
                END IF;

                new_r := old_r + diff;
                UPDATE profiles SET mmr = new_r WHERE id = p_id;
                INSERT INTO mmr_history (user_id, match_id, old_mmr, new_mmr, change, reason)
                VALUES (p_id, NEW.id, old_r, new_r, diff, 'match_result');
            END LOOP;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- คำนวณ MMR ทั้งหมดของซีซั่นปัจจุบันใหม่ทันที
SELECT public.rebuild_current_mmr();

COMMIT;

