BEGIN;

CREATE OR REPLACE FUNCTION public.install_compatible_view(view_name text, definition text)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE source_name text := 'migration_source_' || view_name; projection text; extra text; column_record record;
BEGIN
    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s',source_name,definition);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',source_name);
    IF to_regclass('public.'||view_name) IS NOT NULL THEN
        FOR column_record IN SELECT attname,format_type(atttypid,atttypmod) AS data_type
            FROM pg_attribute WHERE attrelid=to_regclass('public.'||view_name) AND attnum>0 AND NOT attisdropped ORDER BY attnum
        LOOP
            IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.'||source_name) AND attname=column_record.attname AND attnum>0) THEN
                RAISE EXCEPTION 'View % has unexpected column %',view_name,column_record.attname;
            END IF;
            projection := concat_ws(', ',projection,format('%I::%s AS %I',column_record.attname,column_record.data_type,column_record.attname));
        END LOOP;
        SELECT string_agg(format('%I',candidate.attname),', ' ORDER BY candidate.attnum) INTO extra
        FROM pg_attribute candidate WHERE candidate.attrelid=to_regclass('public.'||source_name) AND candidate.attnum>0 AND NOT candidate.attisdropped
            AND NOT EXISTS (SELECT 1 FROM pg_attribute old_column WHERE old_column.attrelid=to_regclass('public.'||view_name)
                AND old_column.attname=candidate.attname AND old_column.attnum>0 AND NOT old_column.attisdropped);
        projection := concat_ws(', ',projection,extra);
    ELSE
        projection := '*';
    END IF;
    EXECUTE format('CREATE OR REPLACE VIEW public.%I AS SELECT %s FROM public.%I',view_name,projection,source_name);
END $$;

SELECT public.install_compatible_view('view_mmr_history',$view$
    SELECT
        history.id AS history_id,
        history.user_id,
        history.match_id,
        history.old_mmr,
        history.new_mmr,
        history.change,
        history.reason,
        history.created_at AS change_date,
        match.team_a_score,
        match.team_b_score,
        match.court_number,
        event.event_name,
        event.event_date,
        CASE
            WHEN history.reason IS DISTINCT FROM 'match_result' OR match.id IS NULL THEN 'Adjustment'
            WHEN match.team_a_score = 0 AND match.team_b_score = 0 THEN 'Unrated'
            WHEN match.team_a_score = match.team_b_score THEN 'Draw'
            WHEN (participant.team = 'A' AND match.team_a_score > match.team_b_score)
                OR (participant.team = 'B' AND match.team_b_score > match.team_a_score) THEN 'Win'
            ELSE 'Loss'
        END::text AS result
    FROM public.mmr_history history
    LEFT JOIN public.matches match ON match.id = history.match_id
    LEFT JOIN public.match_players participant
        ON participant.match_id = history.match_id AND participant.user_id = history.user_id
    LEFT JOIN public.events event ON event.id = COALESCE(
        match.event_id,
        CASE
            WHEN history.reason ~ '^absence_penalty:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                THEN substring(history.reason FROM 17)::uuid
        END
    )
$view$);

DROP FUNCTION public.install_compatible_view(text,text);

GRANT SELECT ON public.view_mmr_history TO authenticated;

COMMIT;
