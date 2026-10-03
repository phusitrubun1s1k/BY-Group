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

        IF match_row.team_a_score = match_row.team_b_score THEN
            delta := 0;
        ELSE
            SELECT
                avg(profile.mmr) FILTER (WHERE player.team = 'A'),
                avg(profile.mmr) FILTER (WHERE player.team = 'B')
            INTO average_a, average_b
            FROM public.match_players player
            JOIN public.profiles profile ON profile.id = player.user_id
            WHERE player.match_id = match_row.id;

            expected_a := 1 / (1 + power(10::numeric, (average_b - average_a) / 400));
            actual_a := CASE WHEN match_row.team_a_score > match_row.team_b_score THEN 1 ELSE 0 END;
            delta := round(64 * (actual_a - expected_a));
        END IF;

        FOR participant IN
            SELECT player.user_id, player.team, profile.mmr
            FROM public.match_players player
            JOIN public.profiles profile ON profile.id = player.user_id
            WHERE player.match_id = match_row.id
            ORDER BY player.user_id
        LOOP
            previous := participant.mmr;
            UPDATE public.profiles
            SET mmr = previous + CASE WHEN participant.team = 'A' THEN delta ELSE -delta END
            WHERE id = participant.user_id;
            INSERT INTO public.mmr_history(user_id, match_id, old_mmr, new_mmr, change, reason, created_at)
            VALUES (
                participant.user_id,
                match_row.id,
                previous,
                previous + CASE WHEN participant.team = 'A' THEN delta ELSE -delta END,
                CASE WHEN participant.team = 'A' THEN delta ELSE -delta END,
                'match_result',
                item.occurred_at
            );
        END LOOP;
    END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.rebuild_current_mmr() FROM PUBLIC, anon, authenticated;

SELECT public.rebuild_current_mmr();

COMMIT;
