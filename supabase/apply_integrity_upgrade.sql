BEGIN;

DO $$
BEGIN
    IF (SELECT udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'shuttlecock_numbers') IS DISTINCT FROM '_text' THEN
        RAISE EXCEPTION 'Expected public.matches.shuttlecock_numbers text[]. Run integrity_preflight.sql and review the schema first.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.integrity_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') $$;

CREATE OR REPLACE FUNCTION public.integrity_require_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.integrity_is_admin() THEN RAISE EXCEPTION 'ต้องใช้สิทธิ์ผู้ดูแลระบบ'; END IF;
END $$;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_name text DEFAULT '';
ALTER TABLE public.event_players ADD COLUMN IF NOT EXISTS additional_cost numeric DEFAULT 0;
ALTER TABLE public.event_players ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0;
ALTER TABLE public.event_players ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.event_players ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.billing_shuttle_count(numbers text[])
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
    SELECT GREATEST(1, count(*))::integer FROM unnest(numbers) AS item WHERE btrim(item) <> ''
$$;

CREATE OR REPLACE FUNCTION public.player_bill_total(player_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT round(GREATEST(0, COALESCE(event.entry_fee,0) + COALESCE(event.shuttlecock_price,0) *
        COALESCE((SELECT sum(public.billing_shuttle_count(match.shuttlecock_numbers))
            FROM public.match_players participant JOIN public.matches match ON match.id = participant.match_id
            WHERE participant.user_id = player.user_id AND match.event_id = player.event_id
                AND match.status IN ('playing','finished')),0)
        + COALESCE(player.additional_cost,0) - COALESCE(player.discount,0)),2)
    FROM public.event_players player JOIN public.events event ON event.id = player.event_id
    WHERE player.id = player_id
$$;
REVOKE ALL ON FUNCTION public.player_bill_total(uuid) FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.player_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_player_id uuid NOT NULL REFERENCES public.event_players(id) ON DELETE RESTRICT,
    amount numeric(14,2) NOT NULL CHECK (amount >= 0),
    method text CHECK (method IN ('cash','transfer')),
    received_by uuid REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    voided_at timestamptz,
    voided_by uuid REFERENCES public.profiles(id),
    imported boolean NOT NULL DEFAULT false
);
ALTER TABLE public.player_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_read ON public.player_payments;
CREATE POLICY payment_read ON public.player_payments FOR SELECT TO authenticated
USING (public.integrity_is_admin() OR EXISTS (
    SELECT 1 FROM public.event_players player WHERE player.id = event_player_id AND player.user_id = auth.uid()
));
GRANT SELECT ON public.player_payments TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.player_payments FROM anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS player_payments_import_once ON public.player_payments(event_player_id) WHERE imported;

INSERT INTO public.player_payments(event_player_id, amount, method, imported)
SELECT player.id, public.player_bill_total(player.id), player.payment_method, true
FROM public.event_players player WHERE player.payment_status = 'paid'
AND NOT EXISTS (SELECT 1 FROM public.player_payments payment WHERE payment.event_player_id = player.id)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_event_billing(event_id_to_sync uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    UPDATE public.event_players player
    SET paid_amount = COALESCE((SELECT sum(payment.amount) FROM public.player_payments payment
            WHERE payment.event_player_id = player.id AND payment.voided_at IS NULL),0),
        payment_status = CASE WHEN COALESCE((SELECT sum(payment.amount) FROM public.player_payments payment
            WHERE payment.event_player_id = player.id AND payment.voided_at IS NULL),0) >= public.player_bill_total(player.id)
            THEN 'paid' ELSE 'pending' END
    WHERE player.event_id = event_id_to_sync;
END $$;
REVOKE ALL ON FUNCTION public.sync_event_billing(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.view_billing_details WITH (security_invoker = true) AS
WITH match_cost AS (
    SELECT participant.user_id, match.event_id, count(*)::integer AS total_games,
        sum(public.billing_shuttle_count(match.shuttlecock_numbers))::integer AS total_shuttlecocks,
        count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM unnest(match.shuttlecock_numbers) item WHERE btrim(item) <> ''))::integer AS missing_shuttle_matches,
        string_agg(array_to_string(match.shuttlecock_numbers, ', '), ', ' ORDER BY match.created_at, match.id) AS shuttlecock_nums
    FROM public.match_players participant JOIN public.matches match ON match.id = participant.match_id
    WHERE match.status IN ('playing','finished') GROUP BY participant.user_id, match.event_id
), receipts AS (
    SELECT event_player_id, sum(amount) AS total_paid,
        COALESCE(sum(amount) FILTER (WHERE method = 'cash'),0) AS cash_paid,
        COALESCE(sum(amount) FILTER (WHERE method = 'transfer'),0) AS transfer_paid,
        bool_or(imported) AS imported_payment
    FROM public.player_payments WHERE voided_at IS NULL GROUP BY event_player_id
), totals AS (
    SELECT player.id AS event_player_id, player.user_id, event.id AS event_id,
        event.event_date, event.event_name, profile.display_name, event.entry_fee, event.shuttlecock_price,
        player.slip_url, player.payment_method,
        COALESCE(cost.total_games,0) AS total_games,
        COALESCE(cost.total_shuttlecocks,0) AS total_shuttlecocks,
        COALESCE(cost.missing_shuttle_matches,0) AS missing_shuttle_matches,
        COALESCE(cost.shuttlecock_nums,'') AS shuttlecock_nums,
        COALESCE(player.additional_cost,0) AS additional_cost, COALESCE(player.discount,0) AS discount,
        round(COALESCE(event.entry_fee,0) + COALESCE(event.shuttlecock_price,0) * COALESCE(cost.total_shuttlecocks,0),2) AS base_amount,
        round(GREATEST(0,COALESCE(event.entry_fee,0) + COALESCE(event.shuttlecock_price,0) * COALESCE(cost.total_shuttlecocks,0)
            + COALESCE(player.additional_cost,0) - COALESCE(player.discount,0)),2) AS total_cost,
        COALESCE(receipts.total_paid,0) AS total_paid,
        COALESCE(receipts.cash_paid,0) AS cash_paid, COALESCE(receipts.transfer_paid,0) AS transfer_paid,
        COALESCE(receipts.imported_payment,false) AS imported_payment
    FROM public.event_players player JOIN public.events event ON event.id = player.event_id
    JOIN public.profiles profile ON profile.id = player.user_id
    LEFT JOIN match_cost cost ON cost.user_id = player.user_id AND cost.event_id = player.event_id
    LEFT JOIN receipts ON receipts.event_player_id = player.id
)
SELECT totals.*, GREATEST(0,total_cost-total_paid) AS pending_amount,
    GREATEST(0,total_paid-total_cost) AS credit_amount,
    CASE WHEN total_paid >= total_cost THEN 'paid' ELSE 'pending' END::text AS payment_status
FROM totals;
GRANT SELECT ON public.view_billing_details TO authenticated;

CREATE OR REPLACE FUNCTION public.record_player_payment(p_event_player_id uuid, p_method text, p_expected_due numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE player public.event_players; due numeric;
BEGIN
    PERFORM public.integrity_require_admin();
    SELECT * INTO STRICT player FROM public.event_players WHERE id = p_event_player_id;
    PERFORM pg_advisory_xact_lock(9142026);
    PERFORM pg_advisory_xact_lock(hashtextextended(player.event_id::text, 0));
    SELECT * INTO STRICT player FROM public.event_players WHERE id = p_event_player_id FOR UPDATE;
    IF p_method IS NULL OR p_method NOT IN ('cash','transfer') THEN RAISE EXCEPTION 'กรุณาเลือกช่องทางชำระเงิน'; END IF;
    IF EXISTS (SELECT 1 FROM public.match_players participant JOIN public.matches match ON match.id = participant.match_id
        WHERE participant.user_id = player.user_id AND match.event_id = player.event_id AND match.status IN ('playing','finished')
        AND NOT EXISTS (SELECT 1 FROM unnest(match.shuttlecock_numbers) item WHERE btrim(item) <> '')) THEN
        RAISE EXCEPTION 'มีแมตช์ที่ยังไม่ระบุหมายเลขลูก กรุณาตรวจสอบก่อนรับเงิน';
    END IF;
    SELECT GREATEST(0,public.player_bill_total(player.id)-COALESCE(sum(amount),0)) INTO due
    FROM public.player_payments WHERE event_player_id = player.id AND voided_at IS NULL;
    IF p_expected_due IS NULL OR due <> round(p_expected_due,2) THEN RAISE EXCEPTION 'ยอดบิลเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่ก่อนรับเงิน'; END IF;
    IF due <= 0 THEN RETURN; END IF;
    INSERT INTO public.player_payments(event_player_id, amount, method, received_by) VALUES (player.id,due,p_method,auth.uid());
    UPDATE public.event_players SET payment_method = p_method WHERE id = player.id;
    PERFORM public.sync_event_billing(player.event_id);
END $$;
REVOKE ALL ON FUNCTION public.record_player_payment(uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_player_payment(uuid,text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_player_payments(p_event_player_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE player public.event_players;
BEGIN
    PERFORM public.integrity_require_admin();
    SELECT * INTO STRICT player FROM public.event_players WHERE id = p_event_player_id;
    PERFORM pg_advisory_xact_lock(9142026);
    PERFORM pg_advisory_xact_lock(hashtextextended(player.event_id::text,0));
    PERFORM 1 FROM public.event_players WHERE id = player.id FOR UPDATE;
    UPDATE public.player_payments SET voided_at = now(), voided_by = auth.uid()
    WHERE event_player_id = player.id AND voided_at IS NULL;
    UPDATE public.event_players SET payment_method = NULL WHERE id = player.id;
    PERFORM public.sync_event_billing(player.event_id);
END $$;
REVOKE ALL ON FUNCTION public.void_player_payments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_player_payments(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.integrity_sync_billing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE affected_event uuid;
BEGIN
    IF TG_TABLE_NAME = 'matches' THEN
        affected_event := CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END;
    ELSIF TG_TABLE_NAME = 'match_players' THEN
        SELECT event_id INTO affected_event FROM public.matches WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.match_id ELSE NEW.match_id END;
    ELSIF TG_TABLE_NAME = 'events' THEN affected_event := NEW.id;
    ELSE affected_event := NEW.event_id;
    END IF;
    IF affected_event IS NOT NULL THEN PERFORM public.sync_event_billing(affected_event); END IF;
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS integrity_bill_match ON public.matches;
CREATE TRIGGER integrity_bill_match AFTER INSERT OR UPDATE OR DELETE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.integrity_sync_billing();
DROP TRIGGER IF EXISTS integrity_bill_players ON public.match_players;
CREATE TRIGGER integrity_bill_players AFTER INSERT OR UPDATE OR DELETE ON public.match_players FOR EACH ROW EXECUTE FUNCTION public.integrity_sync_billing();
DROP TRIGGER IF EXISTS integrity_bill_event ON public.events;
CREATE TRIGGER integrity_bill_event AFTER UPDATE OF entry_fee, shuttlecock_price ON public.events FOR EACH ROW EXECUTE FUNCTION public.integrity_sync_billing();
DROP TRIGGER IF EXISTS integrity_bill_adjustment ON public.event_players;
CREATE TRIGGER integrity_bill_adjustment AFTER UPDATE OF additional_cost, discount ON public.event_players FOR EACH ROW EXECUTE FUNCTION public.integrity_sync_billing();

CREATE OR REPLACE FUNCTION public.integrity_validate_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.event_id::text,0));
    IF TG_OP = 'UPDATE' AND NEW.event_id IS DISTINCT FROM OLD.event_id THEN RAISE EXCEPTION 'ไม่สามารถย้ายแมตช์ไปก๊วนอื่นได้'; END IF;
    IF TG_OP = 'INSERT' OR NEW.court_number IS DISTINCT FROM OLD.court_number OR NEW.match_number IS DISTINCT FROM OLD.match_number THEN
        IF btrim(COALESCE(NEW.court_number,'')) = '' OR NEW.match_number IS NULL OR NEW.match_number < 1 THEN RAISE EXCEPTION 'กรุณาระบุคอร์ทและลำดับแมตช์ที่ถูกต้อง'; END IF;
        IF EXISTS (SELECT 1 FROM public.matches WHERE event_id = NEW.event_id AND match_number = NEW.match_number AND id <> NEW.id) THEN RAISE EXCEPTION 'ลำดับแมตช์ซ้ำ'; END IF;
    END IF;
    IF TG_OP = 'INSERT' OR NEW.shuttlecock_numbers IS DISTINCT FROM OLD.shuttlecock_numbers OR (OLD.status = 'waiting' AND NEW.status = 'playing') THEN
        IF NEW.status <> 'waiting' OR TG_OP = 'INSERT' THEN
            IF cardinality(NEW.shuttlecock_numbers) IS NULL OR cardinality(NEW.shuttlecock_numbers) = 0 THEN RAISE EXCEPTION 'กรุณาระบุหมายเลขลูกก่อนเริ่มแมตช์'; END IF;
        END IF;
        IF EXISTS (SELECT 1 FROM unnest(NEW.shuttlecock_numbers) item WHERE item IS NULL OR btrim(item) = '')
            OR (SELECT count(*) <> count(DISTINCT btrim(item)) FROM unnest(NEW.shuttlecock_numbers) item) THEN RAISE EXCEPTION 'หมายเลขลูกว่างหรือซ้ำ'; END IF;
        IF EXISTS (SELECT 1 FROM public.matches other, unnest(other.shuttlecock_numbers) previous, unnest(NEW.shuttlecock_numbers) current_number
            WHERE other.event_id = NEW.event_id AND other.id <> NEW.id AND btrim(previous) = btrim(current_number)) THEN RAISE EXCEPTION 'หมายเลขลูกนี้ถูกใช้ในแมตช์อื่นแล้ว'; END IF;
    END IF;
    IF NEW.status IN ('playing','finished') AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
        IF (SELECT count(*) FROM public.match_players WHERE match_id = NEW.id AND team = 'A') <> 2 OR
            (SELECT count(*) FROM public.match_players WHERE match_id = NEW.id AND team = 'B') <> 2 THEN RAISE EXCEPTION 'ต้องมีผู้เล่นทีมละ 2 คน'; END IF;
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS integrity_validate_match ON public.matches;
CREATE TRIGGER integrity_validate_match BEFORE INSERT OR UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.integrity_validate_match();

CREATE OR REPLACE FUNCTION public.save_match(p_match_id uuid, p_event_id uuid, p_court text, p_number integer,
    p_shuttles text[], p_team_a uuid[], p_team_b uuid[], p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE saved_id uuid; existing public.matches;
BEGIN
    PERFORM public.integrity_require_admin();
    PERFORM pg_advisory_xact_lock(9142026);
    PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text,0));
    IF cardinality(p_team_a) IS DISTINCT FROM 2 OR cardinality(p_team_b) IS DISTINCT FROM 2 OR
        (SELECT count(DISTINCT player) FROM unnest(p_team_a || p_team_b) player) <> 4 THEN RAISE EXCEPTION 'ต้องมีผู้เล่นไม่ซ้ำกันทีมละ 2 คน'; END IF;
    IF (SELECT count(*) FROM public.event_players WHERE event_id = p_event_id AND user_id = ANY(p_team_a || p_team_b)) <> 4 THEN RAISE EXCEPTION 'ผู้เล่นบางคนไม่ได้อยู่ในก๊วนนี้'; END IF;
    IF cardinality(p_shuttles) IS NULL OR cardinality(p_shuttles) = 0 THEN RAISE EXCEPTION 'กรุณาระบุหมายเลขลูก'; END IF;
    IF p_match_id IS NULL THEN
        INSERT INTO public.matches(event_id,court_number,match_number,shuttlecock_numbers,status)
        VALUES (p_event_id,btrim(p_court),p_number,p_shuttles,'waiting') RETURNING id INTO saved_id;
    ELSE
        SELECT * INTO STRICT existing FROM public.matches WHERE id = p_match_id FOR UPDATE;
        IF existing.event_id <> p_event_id OR existing.status = 'finished' THEN RAISE EXCEPTION 'ไม่สามารถแก้แมตช์นี้ได้'; END IF;
        IF p_expected_updated_at IS NULL OR existing.updated_at <> p_expected_updated_at THEN RAISE EXCEPTION 'ข้อมูลแมตช์เปลี่ยนแล้ว กรุณาโหลดใหม่'; END IF;
        saved_id := existing.id;
        UPDATE public.matches SET court_number = btrim(p_court), match_number = p_number, shuttlecock_numbers = p_shuttles WHERE id = saved_id;
        DELETE FROM public.match_players WHERE match_id = saved_id;
    END IF;
    INSERT INTO public.match_players(match_id,user_id,team)
    SELECT saved_id,player,'A' FROM unnest(p_team_a) player UNION ALL SELECT saved_id,player,'B' FROM unnest(p_team_b) player;
    PERFORM public.sync_event_billing(p_event_id);
    RETURN saved_id;
END $$;
REVOKE ALL ON FUNCTION public.save_match(uuid,uuid,text,integer,text[],uuid[],uuid[],timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_match(uuid,uuid,text,integer,text[],uuid[],uuid[],timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.integrity_protect_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT public.integrity_is_admin() THEN
        IF TG_OP = 'INSERT' THEN
            IF NEW.role <> 'user' OR COALESCE(NEW.mmr,1000) <> 1000 THEN RAISE EXCEPTION 'ไม่มีสิทธิ์กำหนดบทบาทหรือคะแนน'; END IF;
        ELSIF NEW.role IS DISTINCT FROM OLD.role OR NEW.mmr IS DISTINCT FROM OLD.mmr OR NEW.is_guest IS DISTINCT FROM OLD.is_guest THEN
            RAISE EXCEPTION 'ไม่มีสิทธิ์เปลี่ยนบทบาทหรือคะแนน';
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS integrity_protect_profile ON public.profiles;
CREATE TRIGGER integrity_protect_profile BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.integrity_protect_profile();

CREATE OR REPLACE FUNCTION public.integrity_protect_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF auth.uid() IS NOT NULL THEN PERFORM public.integrity_require_admin(); END IF;
        NEW.paid_amount := 0;
        NEW.payment_status := 'pending';
        NEW.payment_method := NULL;
    ELSIF NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'ไม่สามารถย้ายบิลไปผู้เล่นหรือก๊วนอื่นได้';
    ELSIF auth.uid() IS NOT NULL AND NOT public.integrity_is_admin() AND
        (to_jsonb(NEW) - 'slip_url') IS DISTINCT FROM (to_jsonb(OLD) - 'slip_url') THEN RAISE EXCEPTION 'ผู้เล่นแก้ไขได้เฉพาะสลิปของตนเอง'; END IF;
    IF COALESCE(NEW.discount,0) < 0 OR COALESCE(NEW.additional_cost,0) < 0 THEN RAISE EXCEPTION 'ค่าเพิ่มและส่วนลดต้องไม่ติดลบ'; END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS integrity_protect_payment ON public.event_players;
CREATE TRIGGER integrity_protect_payment BEFORE INSERT OR UPDATE ON public.event_players FOR EACH ROW EXECUTE FUNCTION public.integrity_protect_payment();

CREATE OR REPLACE FUNCTION public.integrity_write_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(9142026);
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS aa_integrity_write_lock ON public.events;
CREATE TRIGGER aa_integrity_write_lock BEFORE INSERT OR UPDATE OR DELETE ON public.events FOR EACH STATEMENT EXECUTE FUNCTION public.integrity_write_lock();
DROP TRIGGER IF EXISTS aa_integrity_write_lock ON public.event_players;
CREATE TRIGGER aa_integrity_write_lock BEFORE INSERT OR UPDATE OR DELETE ON public.event_players FOR EACH STATEMENT EXECUTE FUNCTION public.integrity_write_lock();
DROP TRIGGER IF EXISTS aa_integrity_write_lock ON public.match_players;
CREATE TRIGGER aa_integrity_write_lock BEFORE INSERT OR UPDATE OR DELETE ON public.match_players FOR EACH STATEMENT EXECUTE FUNCTION public.integrity_write_lock();

CREATE OR REPLACE FUNCTION public.integrity_validate_event_prices()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.entry_fee IS NULL OR NEW.shuttlecock_price IS NULL OR NEW.entry_fee < 0 OR NEW.shuttlecock_price < 0
        OR NEW.entry_fee::text IN ('NaN','Infinity','-Infinity') OR NEW.shuttlecock_price::text IN ('NaN','Infinity','-Infinity') THEN
        RAISE EXCEPTION 'ค่าลงก๊วนและค่าลูกต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS integrity_validate_event_prices ON public.events;
CREATE TRIGGER integrity_validate_event_prices BEFORE INSERT OR UPDATE OF entry_fee,shuttlecock_price ON public.events FOR EACH ROW EXECUTE FUNCTION public.integrity_validate_event_prices();

CREATE OR REPLACE FUNCTION public.integrity_protect_finished_players()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
    IF TG_OP <> 'INSERT' AND EXISTS (SELECT 1 FROM public.matches WHERE id=OLD.match_id AND status='finished') THEN
        RAISE EXCEPTION 'กรุณายกเลิกผลแมตช์ก่อนแก้ผู้เล่น';
    END IF;
    IF TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM public.matches WHERE id=NEW.match_id AND status='finished') THEN
        RAISE EXCEPTION 'กรุณายกเลิกผลแมตช์ก่อนแก้ผู้เล่น';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS integrity_protect_finished_players ON public.match_players;
CREATE TRIGGER integrity_protect_finished_players BEFORE INSERT OR UPDATE OR DELETE ON public.match_players FOR EACH ROW EXECUTE FUNCTION public.integrity_protect_finished_players();

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL TO authenticated
USING (public.integrity_is_admin()) WITH CHECK (public.integrity_is_admin());
DROP POLICY IF EXISTS rank_reset_schedule_insert ON public.rank_reset_schedule;
DROP POLICY IF EXISTS rank_reset_schedule_update ON public.rank_reset_schedule;
CREATE POLICY rank_reset_schedule_insert ON public.rank_reset_schedule FOR INSERT TO authenticated WITH CHECK (public.integrity_is_admin());
CREATE POLICY rank_reset_schedule_update ON public.rank_reset_schedule FOR UPDATE TO authenticated USING (public.integrity_is_admin()) WITH CHECK (public.integrity_is_admin());
DROP POLICY IF EXISTS season_history_insert ON public.season_history;
CREATE POLICY season_history_insert ON public.season_history FOR INSERT TO authenticated WITH CHECK (public.integrity_is_admin());

DO $$ DECLARE event_record record; BEGIN
    FOR event_record IN SELECT id FROM public.events LOOP PERFORM public.sync_event_billing(event_record.id); END LOOP;
END $$;

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
