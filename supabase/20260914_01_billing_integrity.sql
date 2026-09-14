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

COMMIT;
