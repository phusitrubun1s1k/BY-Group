BEGIN;

CREATE OR REPLACE FUNCTION public.execute_rank_reset(p_schedule_id uuid,p_rank_tiers jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE schedule public.rank_reset_schedule; epoch public.rating_epochs; profile_row record;
    executed_time timestamptz; cutoff_time timestamptz; cutoff_rating integer; new_rating integer; new_epoch uuid;
BEGIN
    PERFORM public.integrity_require_admin();
    PERFORM pg_advisory_xact_lock(9142026);
    SELECT * INTO STRICT schedule FROM public.rank_reset_schedule WHERE id = p_schedule_id FOR UPDATE;
    IF schedule.status <> 'pending' THEN RAISE EXCEPTION 'รายการรีเซ็ตนี้ดำเนินการแล้วหรือถูกยกเลิก'; END IF;
    IF jsonb_typeof(p_rank_tiers) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rank_tiers) = 0 THEN RAISE EXCEPTION 'ข้อมูลระดับคะแนนไม่ครบ'; END IF;

    executed_time := clock_timestamp();
    cutoff_time := LEAST(schedule.reset_at, executed_time);
    PERFORM public.rebuild_current_mmr();
    SELECT * INTO STRICT epoch FROM public.rating_epochs WHERE closed_at IS NULL;
    IF cutoff_time <= epoch.started_at THEN RAISE EXCEPTION 'วันตัดรอบต้องอยู่หลังวันเริ่มซีซันปัจจุบัน'; END IF;

    FOR profile_row IN SELECT * FROM public.profiles WHERE COALESCE(is_guest,false) = false ORDER BY id FOR UPDATE LOOP
        SELECT COALESCE(
            (SELECT history.new_mmr
             FROM public.mmr_history history
             WHERE history.user_id = profile_row.id
               AND history.created_at >= epoch.started_at
               AND history.created_at < cutoff_time
               AND COALESCE(history.reason,'') NOT LIKE 'season_reset:%'
             ORDER BY history.created_at DESC, COALESCE(history.match_id,history.id) DESC
             LIMIT 1),
            (SELECT seed.starting_mmr FROM public.rating_seeds seed WHERE seed.epoch_id=epoch.id AND seed.user_id=profile_row.id),
            1000
        )::integer INTO cutoff_rating;

        INSERT INTO public.season_history(reset_id,user_id,season_label,final_mmr,final_rank_name,total_games,total_wins,total_losses,total_draws,total_unrated,created_at)
        SELECT schedule.id,profile_row.id,schedule.season_label,cutoff_rating,
            COALESCE((SELECT tier->>'name' FROM jsonb_array_elements(p_rank_tiers) tier WHERE (tier->>'minMMR')::integer <= cutoff_rating ORDER BY (tier->>'minMMR')::integer DESC LIMIT 1),'Wood'),
            count(*), count(*) FILTER (WHERE (participant.team='A' AND match.team_a_score>match.team_b_score) OR (participant.team='B' AND match.team_b_score>match.team_a_score)),
            count(*) FILTER (WHERE (participant.team='A' AND match.team_a_score<match.team_b_score) OR (participant.team='B' AND match.team_b_score<match.team_a_score)),
            count(*) FILTER (WHERE match.team_a_score=match.team_b_score AND match.team_a_score>0),
            count(*) FILTER (WHERE match.team_a_score=0 AND match.team_b_score=0),cutoff_time
        FROM public.match_players participant JOIN public.matches match ON match.id=participant.match_id
        WHERE participant.user_id=profile_row.id AND match.status='finished'
          AND match.finished_at>=epoch.started_at AND match.finished_at<cutoff_time;

        new_rating := round(1000 + (cutoff_rating-1000)::numeric/2);
        UPDATE public.profiles SET mmr=new_rating WHERE id=profile_row.id;
        INSERT INTO public.mmr_history(user_id,old_mmr,new_mmr,change,reason,created_at)
        VALUES(profile_row.id,cutoff_rating,new_rating,new_rating-cutoff_rating,'season_reset:'||schedule.season_label,cutoff_time);
    END LOOP;

    FOR profile_row IN SELECT * FROM public.profiles WHERE COALESCE(is_guest,false) = true ORDER BY id FOR UPDATE LOOP
        SELECT COALESCE(
            (SELECT history.new_mmr
             FROM public.mmr_history history
             WHERE history.user_id = profile_row.id
               AND history.created_at >= epoch.started_at
               AND history.created_at < cutoff_time
               AND COALESCE(history.reason,'') NOT LIKE 'season_reset:%'
             ORDER BY history.created_at DESC, COALESCE(history.match_id,history.id) DESC
             LIMIT 1),
            (SELECT seed.starting_mmr FROM public.rating_seeds seed WHERE seed.epoch_id=epoch.id AND seed.user_id=profile_row.id),
            1000
        )::integer INTO cutoff_rating;
        UPDATE public.profiles SET mmr=cutoff_rating WHERE id=profile_row.id;
    END LOOP;

    UPDATE public.rating_epochs SET closed_at=cutoff_time WHERE id=epoch.id;
    INSERT INTO public.rating_epochs(reset_id,started_at) VALUES(schedule.id,cutoff_time) RETURNING id INTO new_epoch;
    INSERT INTO public.rating_seeds(epoch_id,user_id,starting_mmr) SELECT new_epoch,id,COALESCE(mmr,1000) FROM public.profiles;

    UPDATE public.rating_match_order
    SET epoch_id=new_epoch
    WHERE epoch_id=epoch.id AND occurred_at>=cutoff_time;
    INSERT INTO public.rating_match_order(match_id,epoch_id,occurred_at)
    SELECT match.id,new_epoch,match.finished_at
    FROM public.matches match
    WHERE match.status='finished' AND match.finished_at>=cutoff_time
    ON CONFLICT (match_id) DO UPDATE SET epoch_id=EXCLUDED.epoch_id,occurred_at=EXCLUDED.occurred_at;

    UPDATE public.rank_reset_schedule
    SET status='executed',reset_at=cutoff_time,executed_at=executed_time
    WHERE id=schedule.id;
    PERFORM public.rebuild_current_mmr();
END $$;

REVOKE ALL ON FUNCTION public.execute_rank_reset(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_rank_reset(uuid,jsonb) TO authenticated;

COMMIT;
