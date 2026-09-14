BEGIN;

CREATE OR REPLACE FUNCTION public.integrity_install_view(view_name text, definition text)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE source_name text := 'integrity_source_' || view_name; projection text; extra text; column_record record;
BEGIN
    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s',source_name,definition);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',source_name);
    IF to_regclass('public.'||view_name) IS NOT NULL THEN
        FOR column_record IN SELECT attname,format_type(atttypid,atttypmod) AS data_type
            FROM pg_attribute WHERE attrelid=to_regclass('public.'||view_name) AND attnum>0 AND NOT attisdropped ORDER BY attnum
        LOOP
            IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.'||source_name) AND attname=column_record.attname AND attnum>0) THEN
                RAISE EXCEPTION 'View % has unexpected column %. Review integrity_preflight.sql before changing this schema.',view_name,column_record.attname;
            END IF;
            projection := concat_ws(', ',projection,format('%I::%s AS %I',column_record.attname,column_record.data_type,column_record.attname));
        END LOOP;
        SELECT string_agg(format('%I',candidate.attname),', ' ORDER BY candidate.attnum) INTO extra
        FROM pg_attribute candidate WHERE candidate.attrelid=to_regclass('public.'||source_name) AND candidate.attnum>0 AND NOT candidate.attisdropped
            AND NOT EXISTS (SELECT 1 FROM pg_attribute old_column WHERE old_column.attrelid=to_regclass('public.'||view_name)
                AND old_column.attname=candidate.attname AND old_column.attnum>0 AND NOT old_column.attisdropped);
        projection := concat_ws(', ',projection,extra);
    ELSE projection := '*';
    END IF;
    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS SELECT %s FROM public.%I',view_name,projection,source_name);
END $$;
REVOKE ALL ON FUNCTION public.integrity_install_view(text,text) FROM PUBLIC, anon, authenticated;

SELECT public.integrity_install_view('view_billing_summary',$view$
    SELECT user_id,event_id,event_date,event_player_id,payment_status,slip_url,total_games,total_shuttlecocks,
        total_cost,total_cost AS total_amount,total_cost AS amount,total_cost AS cost,
        total_paid,pending_amount,credit_amount,missing_shuttle_matches,imported_payment
    FROM public.view_billing_details
    WHERE user_id=auth.uid() OR public.integrity_is_admin()
$view$);
SELECT public.integrity_install_view('view_user_billing_history',$view$
    SELECT user_id,event_id,event_name,event_date,entry_fee,shuttlecock_price,
        total_shuttlecocks AS shuttlecock_count,total_games AS games_played,payment_status,total_cost AS total_amount,
        total_paid,pending_amount,credit_amount,missing_shuttle_matches,imported_payment
    FROM public.view_billing_details
    WHERE user_id=auth.uid() OR public.integrity_is_admin()
$view$);

SELECT public.integrity_install_view('view_leaderboard',$view$
    WITH stats AS (
        SELECT participant.user_id,count(*)::integer AS total_games,
            count(*) FILTER (WHERE (participant.team='A' AND match.team_a_score>match.team_b_score) OR (participant.team='B' AND match.team_b_score>match.team_a_score))::integer AS total_wins,
            count(*) FILTER (WHERE (participant.team='A' AND match.team_a_score<match.team_b_score) OR (participant.team='B' AND match.team_b_score<match.team_a_score))::integer AS total_losses,
            sum(CASE WHEN participant.team='A' THEN match.team_a_score ELSE match.team_b_score END)::bigint AS total_points
        FROM public.match_players participant JOIN public.matches match ON match.id=participant.match_id
        WHERE match.status='finished' AND match.finished_at >= (SELECT started_at FROM public.rating_epochs WHERE closed_at IS NULL)
        GROUP BY participant.user_id
    ), spending AS (
        SELECT player.user_id,sum(payment.amount)::numeric AS total_spent
        FROM public.player_payments payment JOIN public.event_players player ON player.id=payment.event_player_id
        JOIN public.events event ON event.id=player.event_id
        WHERE payment.voided_at IS NULL AND event.event_date >=
            (SELECT (started_at AT TIME ZONE 'Asia/Bangkok')::date FROM public.rating_epochs WHERE closed_at IS NULL)
        GROUP BY player.user_id
    )
    SELECT profile.id AS user_id,profile.display_name,profile.skill_level,profile.mmr,
        COALESCE(stats.total_games,0)::integer AS total_games,COALESCE(stats.total_wins,0)::integer AS total_wins,
        COALESCE(stats.total_losses,0)::integer AS total_losses,COALESCE(stats.total_points,0)::bigint AS total_points,
        COALESCE(spending.total_spent,0)::numeric AS total_spent
    FROM public.profiles profile LEFT JOIN stats ON stats.user_id=profile.id LEFT JOIN spending ON spending.user_id=profile.id
    WHERE COALESCE(profile.is_guest,false)=false
$view$);

SELECT public.integrity_install_view('view_monthly_leaderboard',$view$
    WITH stats AS (
        SELECT participant.user_id,to_char(event.event_date,'YYYY-MM') AS month_key,count(*)::integer AS total_games,
            count(*) FILTER (WHERE (participant.team='A' AND match.team_a_score>match.team_b_score) OR (participant.team='B' AND match.team_b_score>match.team_a_score))::integer AS total_wins,
            count(*) FILTER (WHERE (participant.team='A' AND match.team_a_score<match.team_b_score) OR (participant.team='B' AND match.team_b_score<match.team_a_score))::integer AS total_losses,
            sum(CASE WHEN participant.team='A' THEN match.team_a_score ELSE match.team_b_score END)::bigint AS total_points
        FROM public.match_players participant JOIN public.matches match ON match.id=participant.match_id JOIN public.events event ON event.id=match.event_id
        WHERE match.status='finished' GROUP BY participant.user_id,to_char(event.event_date,'YYYY-MM')
    ), spending AS (
        SELECT user_id,to_char(event_date,'YYYY-MM') AS month_key,sum(total_paid)::numeric AS total_spent
        FROM public.view_billing_details GROUP BY user_id,to_char(event_date,'YYYY-MM')
    )
    SELECT profile.id AS user_id,stats.month_key,profile.display_name,profile.skill_level,
        CASE WHEN stats.month_key=to_char(now() AT TIME ZONE 'Asia/Bangkok','YYYY-MM') THEN profile.mmr
            ELSE COALESCE((SELECT history.new_mmr FROM public.mmr_history history WHERE history.user_id=profile.id
                AND history.created_at < ((to_date(stats.month_key||'-01','YYYY-MM-DD')+interval '1 month') AT TIME ZONE 'Asia/Bangkok')
                ORDER BY history.created_at DESC,history.id DESC LIMIT 1),1000) END::integer AS mmr,
        stats.total_games,stats.total_wins,stats.total_losses,stats.total_points,COALESCE(spending.total_spent,0)::numeric AS total_spent
    FROM public.profiles profile JOIN stats ON stats.user_id=profile.id
    LEFT JOIN spending ON spending.user_id=profile.id AND spending.month_key=stats.month_key
    WHERE COALESCE(profile.is_guest,false)=false
$view$);

SELECT public.integrity_install_view('view_hall_of_fame',$view$
    WITH ranked AS (
        SELECT month_key,user_id,display_name,skill_level,mmr,total_games,total_wins,total_points,total_spent,
            row_number() OVER (PARTITION BY month_key ORDER BY mmr DESC,total_wins DESC,total_points DESC,user_id) AS rank_position
        FROM public.view_monthly_leaderboard
    )
    SELECT month_key,user_id,display_name,skill_level,mmr,total_games,total_wins,total_points,total_spent,rank_position
    FROM ranked WHERE rank_position<=3 ORDER BY month_key DESC,rank_position
$view$);

SELECT public.integrity_install_view('view_user_badges',$view$
    WITH results AS (
        SELECT participant.user_id,CASE WHEN (participant.team='A' AND match.team_a_score>match.team_b_score) OR
            (participant.team='B' AND match.team_b_score>match.team_a_score) THEN 1 ELSE 0 END AS is_win,
            row_number() OVER (PARTITION BY participant.user_id ORDER BY match.finished_at DESC,match.id DESC) AS position
        FROM public.match_players participant JOIN public.matches match ON match.id=participant.match_id WHERE match.status='finished'
    ), stats AS (
        SELECT user_id,count(*) AS games,bool_and(is_win=1) FILTER (WHERE position<=3) AND count(*)>=3 AS streak
        FROM results GROUP BY user_id
    ), spending AS (
        SELECT user_id,sum(total_paid) AS spent FROM public.view_billing_details
        WHERE event_date >= (now() AT TIME ZONE 'Asia/Bangkok')::date-6 AND event_date <= (now() AT TIME ZONE 'Asia/Bangkok')::date
        GROUP BY user_id
    )
    SELECT profile.id AS user_id,COALESCE(stats.streak,false) AS badge_win_streak,
        COALESCE(stats.games,0)>=100 AS badge_marathon,
        COALESCE(spending.spent,0)>0 AND spending.spent=(SELECT max(spent) FROM spending) AS badge_patron
    FROM public.profiles profile LEFT JOIN stats ON stats.user_id=profile.id LEFT JOIN spending ON spending.user_id=profile.id
$view$);
SELECT public.integrity_install_view('view_mmr_history',$view$
    SELECT history.id AS history_id,history.user_id,history.match_id,history.old_mmr,history.new_mmr,history.change,
        history.reason,history.created_at AS change_date,match.team_a_score,match.team_b_score,match.court_number,
        event.event_name,event.event_date,
        CASE WHEN history.reason IS DISTINCT FROM 'match_result' OR match.id IS NULL THEN 'Adjustment'
            WHEN match.team_a_score=0 AND match.team_b_score=0 THEN 'Unrated'
            WHEN match.team_a_score=match.team_b_score THEN 'Draw'
            WHEN (participant.team='A' AND match.team_a_score>match.team_b_score) OR
                (participant.team='B' AND match.team_b_score>match.team_a_score) THEN 'Win'
            ELSE 'Loss' END::text AS result
    FROM public.mmr_history history LEFT JOIN public.matches match ON match.id=history.match_id
    LEFT JOIN public.match_players participant ON participant.match_id=history.match_id AND participant.user_id=history.user_id
    LEFT JOIN public.events event ON event.id=COALESCE(match.event_id,
        CASE WHEN history.reason ~ '^absence_penalty:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            THEN substring(history.reason FROM 17)::uuid END)
$view$);
DROP FUNCTION public.integrity_install_view(text,text);

REVOKE ALL ON public.view_billing_summary,public.view_user_billing_history FROM PUBLIC,anon;
GRANT SELECT ON public.view_billing_summary,public.view_user_billing_history TO authenticated;
GRANT SELECT ON public.view_mmr_history TO authenticated;
GRANT SELECT ON public.view_leaderboard,public.view_monthly_leaderboard,public.view_hall_of_fame,public.view_user_badges TO anon,authenticated;

COMMIT;
