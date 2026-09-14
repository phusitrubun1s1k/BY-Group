BEGIN;

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE public.rank_reset_schedule ADD COLUMN IF NOT EXISTS executed_at timestamptz;
ALTER TABLE public.season_history ADD COLUMN IF NOT EXISTS total_losses integer;
ALTER TABLE public.season_history ADD COLUMN IF NOT EXISTS total_draws integer;
ALTER TABLE public.season_history ADD COLUMN IF NOT EXISTS total_unrated integer;
CREATE UNIQUE INDEX IF NOT EXISTS season_snapshot_once ON public.season_history(reset_id,user_id);

UPDATE public.rank_reset_schedule schedule SET executed_at = COALESCE(
    (SELECT min(history.created_at) FROM public.mmr_history history WHERE history.reason = 'season_reset:' || schedule.season_label),
    schedule.reset_at
) WHERE schedule.status = 'executed' AND schedule.executed_at IS NULL;
UPDATE public.matches match SET finished_at = COALESCE(
    (SELECT min(history.created_at) FROM public.mmr_history history WHERE history.match_id = match.id AND history.reason = 'match_result'),
    match.created_at
) WHERE match.status = 'finished' AND match.finished_at IS NULL;

CREATE TABLE IF NOT EXISTS public.rating_epochs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reset_id uuid REFERENCES public.rank_reset_schedule(id),
    started_at timestamptz NOT NULL,
    closed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_rating_epoch ON public.rating_epochs((true)) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS public.rating_seeds (
    epoch_id uuid NOT NULL REFERENCES public.rating_epochs(id),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    starting_mmr integer NOT NULL,
    PRIMARY KEY(epoch_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.rating_match_order (
    match_id uuid PRIMARY KEY,
    epoch_id uuid NOT NULL REFERENCES public.rating_epochs(id),
    occurred_at timestamptz NOT NULL
);
ALTER TABLE public.rating_epochs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rating_seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rating_match_order ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rating_epochs, public.rating_seeds, public.rating_match_order FROM anon, authenticated;

INSERT INTO public.rating_epochs(reset_id,started_at)
SELECT (SELECT id FROM public.rank_reset_schedule WHERE status = 'executed' ORDER BY executed_at DESC LIMIT 1),
    COALESCE((SELECT max(executed_at) FROM public.rank_reset_schedule WHERE status = 'executed'),'1970-01-01'::timestamptz)
WHERE NOT EXISTS (SELECT 1 FROM public.rating_epochs WHERE closed_at IS NULL);
INSERT INTO public.rating_seeds(epoch_id,user_id,starting_mmr)
SELECT epoch.id, profile.id, COALESCE(profile.mmr,1000) - COALESCE((
    SELECT sum(history.change) FROM public.mmr_history history WHERE history.user_id = profile.id
    AND history.created_at >= epoch.started_at AND history.reason IS DISTINCT FROM
        (SELECT 'season_reset:' || season_label FROM public.rank_reset_schedule WHERE id = epoch.reset_id)
),0)::integer
FROM public.rating_epochs epoch CROSS JOIN public.profiles profile WHERE epoch.closed_at IS NULL
ON CONFLICT DO NOTHING;
INSERT INTO public.rating_match_order(match_id,epoch_id,occurred_at)
SELECT match.id,epoch.id,match.finished_at FROM public.matches match CROSS JOIN public.rating_epochs epoch
WHERE epoch.closed_at IS NULL AND match.status = 'finished' AND match.finished_at >= epoch.started_at
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.rebuild_current_mmr()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE epoch public.rating_epochs; item record; participant record; match_row public.matches;
    average_a numeric; average_b numeric; expected_a numeric; actual_a numeric; delta integer; previous integer;
BEGIN
    PERFORM pg_advisory_xact_lock(9142026);
    SELECT * INTO STRICT epoch FROM public.rating_epochs WHERE closed_at IS NULL;
    PERFORM id FROM public.profiles ORDER BY id FOR UPDATE;
    INSERT INTO public.rating_seeds(epoch_id,user_id,starting_mmr)
    SELECT epoch.id,id,COALESCE(mmr,1000) FROM public.profiles ON CONFLICT DO NOTHING;
    UPDATE public.profiles profile SET mmr = seed.starting_mmr FROM public.rating_seeds seed
    WHERE seed.epoch_id = epoch.id AND seed.user_id = profile.id;
    DELETE FROM public.mmr_history history USING public.rating_match_order ordering
    WHERE history.match_id = ordering.match_id AND history.reason = 'match_result' AND ordering.epoch_id = epoch.id;

    FOR item IN
        SELECT ordering.occurred_at AS occurred_at, ordering.match_id AS item_id, 'match' AS kind,
            NULL::uuid AS user_id, NULL::integer AS adjustment, NULL::text AS reason
        FROM public.rating_match_order ordering WHERE ordering.epoch_id = epoch.id
        UNION ALL
        SELECT history.created_at,history.id,'adjustment',history.user_id,history.change,history.reason
        FROM public.mmr_history history WHERE history.created_at >= epoch.started_at
            AND COALESCE(history.reason,'') <> 'match_result'
            AND COALESCE(history.reason,'') NOT LIKE 'season_reset:%'
        ORDER BY occurred_at,item_id
    LOOP
        IF item.kind = 'adjustment' THEN
            SELECT mmr INTO previous FROM public.profiles WHERE id = item.user_id;
            delta := CASE WHEN item.reason LIKE 'absence_penalty:%' THEN -LEAST(20,GREATEST(previous-1000,0)) ELSE item.adjustment END;
            UPDATE public.profiles SET mmr = previous + delta WHERE id = item.user_id;
            UPDATE public.mmr_history SET old_mmr = previous, new_mmr = previous + delta, change = delta WHERE id = item.item_id;
            CONTINUE;
        END IF;
        SELECT * INTO match_row FROM public.matches WHERE id = item.item_id;
        IF NOT FOUND OR match_row.status <> 'finished' OR (match_row.team_a_score = 0 AND match_row.team_b_score = 0) THEN CONTINUE; END IF;
        IF (SELECT count(*) FROM public.match_players WHERE match_id = match_row.id AND team = 'A') <> 2 OR
            (SELECT count(*) FROM public.match_players WHERE match_id = match_row.id AND team = 'B') <> 2 THEN
            RAISE EXCEPTION 'แมตช์ % มีผู้เล่นไม่ครบ กรุณาตรวจข้อมูลก่อนคำนวณคะแนน', match_row.match_number;
        END IF;
        SELECT avg(profile.mmr) FILTER (WHERE player.team = 'A'), avg(profile.mmr) FILTER (WHERE player.team = 'B')
        INTO average_a,average_b FROM public.match_players player JOIN public.profiles profile ON profile.id = player.user_id WHERE player.match_id = match_row.id;
        expected_a := 1 / (1 + power(10::numeric,(average_b-average_a)/400));
        actual_a := CASE WHEN match_row.team_a_score > match_row.team_b_score THEN 1 WHEN match_row.team_a_score < match_row.team_b_score THEN 0 ELSE 0.5 END;
        delta := round(64*(actual_a-expected_a));
        FOR participant IN SELECT player.user_id, player.team, profile.mmr FROM public.match_players player JOIN public.profiles profile ON profile.id = player.user_id
            WHERE player.match_id = match_row.id ORDER BY player.user_id
        LOOP
            previous := participant.mmr;
            UPDATE public.profiles SET mmr = previous + CASE WHEN participant.team = 'A' THEN delta ELSE -delta END WHERE id = participant.user_id;
            INSERT INTO public.mmr_history(user_id,match_id,old_mmr,new_mmr,change,reason,created_at)
            VALUES(participant.user_id,match_row.id,previous,previous + CASE WHEN participant.team = 'A' THEN delta ELSE -delta END,
                CASE WHEN participant.team = 'A' THEN delta ELSE -delta END,'match_result',item.occurred_at);
        END LOOP;
    END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.rebuild_current_mmr() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.integrity_rating_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE epoch public.rating_epochs; previous_epoch uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(9142026);
    SELECT * INTO STRICT epoch FROM public.rating_epochs WHERE closed_at IS NULL;
    SELECT epoch_id INTO previous_epoch FROM public.rating_match_order WHERE match_id = OLD.id;
    IF TG_OP = 'DELETE' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.team_a_score IS DISTINCT FROM OLD.team_a_score OR NEW.team_b_score IS DISTINCT FROM OLD.team_b_score THEN
        IF (previous_epoch IS NOT NULL AND previous_epoch <> epoch.id) OR
            (OLD.finished_at IS NOT NULL AND OLD.finished_at < epoch.started_at) THEN RAISE EXCEPTION 'แมตช์นี้อยู่ในซีซันที่ปิดแล้ว กรุณาตรวจประวัติก่อนแก้คะแนนย้อนหลัง'; END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished' THEN
        NEW.finished_at := COALESCE(OLD.finished_at,clock_timestamp());
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.integrity_match_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(9142026);
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS aa_integrity_match_lock ON public.matches;
CREATE TRIGGER aa_integrity_match_lock BEFORE INSERT OR UPDATE OR DELETE ON public.matches FOR EACH STATEMENT EXECUTE FUNCTION public.integrity_match_lock();

CREATE OR REPLACE FUNCTION public.integrity_rating_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE epoch public.rating_epochs;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.finished_at IS NOT NULL THEN PERFORM public.rebuild_current_mmr(); END IF;
        RETURN NULL;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.team_a_score IS DISTINCT FROM OLD.team_a_score OR NEW.team_b_score IS DISTINCT FROM OLD.team_b_score THEN
        IF NEW.status = 'finished' THEN
            SELECT * INTO STRICT epoch FROM public.rating_epochs WHERE closed_at IS NULL;
            INSERT INTO public.rating_match_order(match_id,epoch_id,occurred_at)
            VALUES(NEW.id,epoch.id,NEW.finished_at) ON CONFLICT DO NOTHING;
        END IF;
        IF NEW.status = 'finished' OR OLD.status = 'finished' THEN PERFORM public.rebuild_current_mmr(); END IF;
    END IF;
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS tr_after_match_finished ON public.matches;
DROP TRIGGER IF EXISTS tr_before_match_delete ON public.matches;
DROP TRIGGER IF EXISTS aa_integrity_rating_before ON public.matches;
CREATE TRIGGER aa_integrity_rating_before BEFORE UPDATE OR DELETE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.integrity_rating_before();
DROP TRIGGER IF EXISTS integrity_rating_after ON public.matches;
CREATE TRIGGER integrity_rating_after AFTER UPDATE OR DELETE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.integrity_rating_after();

DO $$ BEGIN
    IF to_regprocedure('public.fn_reverse_match_mmr(uuid)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.fn_reverse_match_mmr(uuid) FROM PUBLIC, anon, authenticated;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.finish_match(p_match_id uuid,p_score_a integer,p_score_b integer,p_expected_updated_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE existing public.matches;
BEGIN
    PERFORM public.integrity_require_admin();
    PERFORM pg_advisory_xact_lock(9142026);
    SELECT * INTO STRICT existing FROM public.matches WHERE id = p_match_id FOR UPDATE;
    IF p_score_a IS NULL OR p_score_b IS NULL OR p_score_a NOT IN (0,1) OR p_score_b NOT IN (0,1) THEN RAISE EXCEPTION 'ผลการแข่งขันไม่ถูกต้อง'; END IF;
    IF p_expected_updated_at IS NULL OR existing.updated_at <> p_expected_updated_at THEN RAISE EXCEPTION 'ผลแมตช์เปลี่ยนแล้ว กรุณาโหลดใหม่'; END IF;
    IF existing.status NOT IN ('playing','finished') THEN RAISE EXCEPTION 'กรุณาเริ่มแมตช์ก่อนบันทึกผล'; END IF;
    UPDATE public.matches SET status = 'finished', team_a_score = p_score_a, team_b_score = p_score_b WHERE id = p_match_id;
END $$;
REVOKE ALL ON FUNCTION public.finish_match(uuid,integer,integer,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_match(uuid,integer,integer,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.execute_rank_reset(p_schedule_id uuid,p_rank_tiers jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE schedule public.rank_reset_schedule; epoch public.rating_epochs; profile_row record;
    reset_time timestamptz; new_rating integer; new_epoch uuid;
BEGIN
    PERFORM public.integrity_require_admin();
    PERFORM pg_advisory_xact_lock(9142026);
    SELECT * INTO STRICT schedule FROM public.rank_reset_schedule WHERE id = p_schedule_id FOR UPDATE;
    IF schedule.status <> 'pending' THEN RAISE EXCEPTION 'รายการรีเซ็ตนี้ดำเนินการแล้วหรือถูกยกเลิก'; END IF;
    IF EXISTS (SELECT 1 FROM public.matches WHERE status = 'playing') THEN RAISE EXCEPTION 'กรุณาจบแมตช์ที่กำลังเล่นก่อนรีเซ็ตซีซัน'; END IF;
    IF jsonb_typeof(p_rank_tiers) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rank_tiers) = 0 THEN RAISE EXCEPTION 'ข้อมูลระดับคะแนนไม่ครบ'; END IF;
    PERFORM public.rebuild_current_mmr();
    SELECT * INTO STRICT epoch FROM public.rating_epochs WHERE closed_at IS NULL;
    reset_time := clock_timestamp();
    FOR profile_row IN SELECT * FROM public.profiles WHERE COALESCE(is_guest,false) = false ORDER BY id FOR UPDATE LOOP
        INSERT INTO public.season_history(reset_id,user_id,season_label,final_mmr,final_rank_name,total_games,total_wins,total_losses,total_draws,total_unrated,created_at)
        SELECT schedule.id,profile_row.id,schedule.season_label,COALESCE(profile_row.mmr,1000),
            COALESCE((SELECT tier->>'name' FROM jsonb_array_elements(p_rank_tiers) tier WHERE (tier->>'minMMR')::integer <= profile_row.mmr ORDER BY (tier->>'minMMR')::integer DESC LIMIT 1),'Wood'),
            count(*), count(*) FILTER (WHERE (participant.team='A' AND match.team_a_score>match.team_b_score) OR (participant.team='B' AND match.team_b_score>match.team_a_score)),
            count(*) FILTER (WHERE (participant.team='A' AND match.team_a_score<match.team_b_score) OR (participant.team='B' AND match.team_b_score<match.team_a_score)),
            count(*) FILTER (WHERE match.team_a_score=match.team_b_score AND match.team_a_score>0),
            count(*) FILTER (WHERE match.team_a_score=0 AND match.team_b_score=0),reset_time
        FROM public.match_players participant JOIN public.matches match ON match.id=participant.match_id
        WHERE participant.user_id=profile_row.id AND match.status='finished' AND match.finished_at>=epoch.started_at;
        new_rating := round(1000 + (COALESCE(profile_row.mmr,1000)-1000)::numeric/2);
        UPDATE public.profiles SET mmr=new_rating WHERE id=profile_row.id;
        INSERT INTO public.mmr_history(user_id,old_mmr,new_mmr,change,reason,created_at)
        VALUES(profile_row.id,profile_row.mmr,new_rating,new_rating-profile_row.mmr,'season_reset:'||schedule.season_label,reset_time);
    END LOOP;
    UPDATE public.rating_epochs SET closed_at=reset_time WHERE id=epoch.id;
    INSERT INTO public.rating_epochs(reset_id,started_at) VALUES(schedule.id,reset_time) RETURNING id INTO new_epoch;
    INSERT INTO public.rating_seeds(epoch_id,user_id,starting_mmr) SELECT new_epoch,id,COALESCE(mmr,1000) FROM public.profiles;
    UPDATE public.rank_reset_schedule SET status='executed',executed_at=reset_time WHERE id=schedule.id;
END $$;
REVOKE ALL ON FUNCTION public.execute_rank_reset(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_rank_reset(uuid,jsonb) TO authenticated;

SELECT public.rebuild_current_mmr();

COMMIT;
