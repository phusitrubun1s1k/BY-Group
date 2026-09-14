BEGIN TRANSACTION READ ONLY;

SELECT version() AS database_version;

SELECT table_name,column_name,data_type,udt_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('profiles','events','event_players','matches','match_players','mmr_history','rank_reset_schedule','season_history')
ORDER BY table_name,ordinal_position;

SELECT viewname,definition FROM pg_views
WHERE schemaname='public' AND viewname LIKE 'view_%' ORDER BY viewname;

SELECT event_object_table,trigger_name,action_timing,event_manipulation,action_statement
FROM information_schema.triggers WHERE trigger_schema='public'
ORDER BY event_object_table,trigger_name;

SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' ORDER BY tablename,policyname;

SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('profiles','event_players','mmr_history','rank_reset_schedule','season_history')
ORDER BY table_name,grantee,privilege_type;

SELECT 'invalid_event_price' AS issue,id,event_date,entry_fee,shuttlecock_price
FROM public.events WHERE entry_fee IS NULL OR shuttlecock_price IS NULL OR entry_fee<0 OR shuttlecock_price<0
    OR entry_fee::text IN ('NaN','Infinity','-Infinity') OR shuttlecock_price::text IN ('NaN','Infinity','-Infinity');

SELECT 'missing_match_fields' AS issue,id,event_id,match_number,court_number,shuttlecock_numbers,status
FROM public.matches WHERE match_number IS NULL OR match_number<1 OR btrim(COALESCE(court_number,''))=''
    OR NOT EXISTS (SELECT 1 FROM unnest(shuttlecock_numbers) item WHERE btrim(item)<>'');

SELECT 'duplicate_match_number' AS issue,event_id,match_number,array_agg(id) AS matches
FROM public.matches WHERE match_number IS NOT NULL GROUP BY event_id,match_number HAVING count(*)>1;

SELECT 'duplicate_or_blank_shuttle' AS issue,match.event_id,btrim(item) AS shuttle,array_agg(match.id) AS matches
FROM public.matches match LEFT JOIN LATERAL unnest(match.shuttlecock_numbers) item ON true
GROUP BY match.event_id,btrim(item) HAVING count(*)>1 OR btrim(item)='' OR btrim(item) IS NULL;

SELECT 'incomplete_or_duplicate_team' AS issue,match.id,match.event_id,match.match_number,match.status,
    count(*) FILTER (WHERE participant.team='A') AS team_a,count(*) FILTER (WHERE participant.team='B') AS team_b,
    count(DISTINCT participant.user_id) AS distinct_players
FROM public.matches match LEFT JOIN public.match_players participant ON participant.match_id=match.id
GROUP BY match.id HAVING count(*) FILTER (WHERE participant.team='A')<>2 OR count(*) FILTER (WHERE participant.team='B')<>2
    OR count(DISTINCT participant.user_id)<>4;

SELECT 'unregistered_match_player' AS issue,participant.match_id,participant.user_id,match.event_id
FROM public.match_players participant JOIN public.matches match ON match.id=participant.match_id
WHERE NOT EXISTS (SELECT 1 FROM public.event_players player WHERE player.event_id=match.event_id AND player.user_id=participant.user_id);

SELECT 'duplicate_season_snapshot' AS issue,reset_id,user_id,count(*) AS copies
FROM public.season_history GROUP BY reset_id,user_id HAVING count(*)>1;

SELECT 'legacy_paid_flag_requires_cash_review' AS issue,player.id,player.user_id,player.event_id,event.event_date,
    to_jsonb(player)->>'payment_method' AS recorded_method,
    to_jsonb(player)->>'paid_amount' AS recorded_amount,
    to_jsonb(player)->>'discount' AS discount,to_jsonb(player)->>'additional_cost' AS additional_cost
FROM public.event_players player JOIN public.events event ON event.id=player.event_id
WHERE player.payment_status='paid' ORDER BY event.event_date,player.user_id;

SELECT 'invalid_adjustment_or_method' AS issue,id,user_id,event_id,to_jsonb(player)->>'discount' AS discount,
    to_jsonb(player)->>'additional_cost' AS additional_cost,to_jsonb(player)->>'payment_method' AS payment_method
FROM public.event_players player
WHERE COALESCE((to_jsonb(player)->>'discount')::numeric,0)<0
    OR COALESCE((to_jsonb(player)->>'additional_cost')::numeric,0)<0
    OR (to_jsonb(player)->>'payment_method') NOT IN ('cash','transfer');

COMMIT;
