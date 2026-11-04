-- =====================================================================
-- เพิ่ม index ให้คอลัมน์ที่แอปใช้กรอง/เรียงบ่อย (ดูจากโค้ดที่ query จริง)
-- ไม่มี index = ฐานข้อมูลต้องอ่านทั้งตารางทุกครั้ง ยิ่งข้อมูลเยอะยิ่งช้า
--
-- ปลอดภัย: สร้างเฉพาะเมื่อตาราง/คอลัมน์มีอยู่จริง และข้าม index ที่มีแล้ว
-- (ไม่ error แบบคราวที่แล้ว) รันซ้ำได้
-- =====================================================================
DO $$
DECLARE
    spec text[];
    specs text[][] := ARRAY[
        -- ARRAY[ชื่อ index, ตาราง, คอลัมน์ (คั่นด้วย ,)]
        ARRAY['idx_event_players_event_id',      'event_players',       'event_id'],
        ARRAY['idx_event_players_user_id',       'event_players',       'user_id'],
        ARRAY['idx_match_players_match_id',      'match_players',       'match_id'],
        ARRAY['idx_match_players_user_id',       'match_players',       'user_id'],
        ARRAY['idx_matches_event_id',            'matches',             'event_id'],
        ARRAY['idx_matches_status_finished_at',  'matches',             'status,finished_at'],
        ARRAY['idx_events_status_event_date',    'events',              'status,event_date'],
        ARRAY['idx_events_event_date',           'events',              'event_date'],
        ARRAY['idx_mmr_history_user_created',    'mmr_history',         'user_id,created_at'],
        ARRAY['idx_mmr_history_created_at',      'mmr_history',         'created_at'],
        ARRAY['idx_notifications_user_read',     'notifications',       'user_id,is_read'],
        ARRAY['idx_notifications_user_created',  'notifications',       'user_id,created_at'],
        ARRAY['idx_rank_reset_status_reset_at',  'rank_reset_schedule', 'status,reset_at'],
        ARRAY['idx_season_history_label',        'season_history',      'season_label'],
        ARRAY['idx_season_history_user',         'season_history',      'user_id'],
        ARRAY['idx_player_payments_ep',          'player_payments',     'event_player_id'],
        ARRAY['idx_activity_logs_created_at',    'activity_logs',       'created_at']
    ];
    col text;
    ok boolean;
BEGIN
    FOREACH spec SLICE 1 IN ARRAY specs LOOP
        ok := to_regclass('public.' || spec[2]) IS NOT NULL;
        IF ok THEN
            FOREACH col IN ARRAY string_to_array(spec[3], ',') LOOP
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_schema = 'public' AND table_name = spec[2] AND column_name = col) THEN
                    ok := false;
                END IF;
            END LOOP;
        END IF;

        IF ok THEN
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', spec[1], spec[2], spec[3]);
            RAISE NOTICE 'index ok: %', spec[1];
        ELSE
            RAISE NOTICE 'skip (ไม่มีตาราง/คอลัมน์): % on %(%)', spec[1], spec[2], spec[3];
        END IF;
    END LOOP;
END $$;

-- อัปเดตสถิติให้ planner เลือกใช้ index ใหม่ทันที
ANALYZE public.event_players;
ANALYZE public.match_players;
ANALYZE public.matches;
ANALYZE public.events;
