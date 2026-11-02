-- Migration: Add payment time tracking and sync paid_at column
-- Date: 2026-11-02

-- 1. เพิ่มคอลัมน์ paid_at ใน event_players
ALTER TABLE public.event_players ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 2. Backfill ข้อมูล paid_at สำหรับผู้เล่นที่ชำระเงินแล้ว
UPDATE public.event_players ep
SET paid_at = (
    SELECT max(created_at)
    FROM public.player_payments pp
    WHERE pp.event_player_id = ep.id AND pp.voided_at IS NULL
)
WHERE ep.payment_status = 'paid' AND ep.paid_at IS NULL;

-- 3. อัปเดตฟังก์ชัน record_player_payment ให้บันทึก paid_at = now()
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
    UPDATE public.event_players SET payment_method = p_method, paid_at = now() WHERE id = player.id;
    PERFORM public.sync_event_billing(player.event_id);
END $$;
REVOKE ALL ON FUNCTION public.record_player_payment(uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_player_payment(uuid,text,numeric) TO authenticated;

-- 4. อัปเดตฟังก์ชัน void_player_payments ให้ล้าง paid_at = NULL
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
    UPDATE public.event_players SET payment_method = NULL, paid_at = NULL WHERE id = player.id;
    PERFORM public.sync_event_billing(player.event_id);
END $$;
REVOKE ALL ON FUNCTION public.void_player_payments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_player_payments(uuid) TO authenticated;

-- 5. อัปเดต View view_billing_details ให้รวม paid_at ไว้คอลัมน์ท้ายสุด
-- หมายเหตุ: ใน PostgreSQL คำสั่ง CREATE OR REPLACE VIEW อนุญาตให้เพิ่มคอลัมน์ใหม่ต่อท้ายสุดเท่านั้น
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
        bool_or(imported) AS imported_payment,
        max(created_at) AS paid_at
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
        COALESCE(receipts.imported_payment,false) AS imported_payment,
        COALESCE(receipts.paid_at, player.paid_at) AS paid_at
    FROM public.event_players player JOIN public.events event ON event.id = player.event_id
    JOIN public.profiles profile ON profile.id = player.user_id
    LEFT JOIN match_cost cost ON cost.user_id = player.user_id AND cost.event_id = player.event_id
    LEFT JOIN receipts ON receipts.event_player_id = player.id
)
SELECT 
    event_player_id,
    user_id,
    event_id,
    event_date,
    event_name,
    display_name,
    entry_fee,
    shuttlecock_price,
    slip_url,
    payment_method,
    total_games,
    total_shuttlecocks,
    missing_shuttle_matches,
    shuttlecock_nums,
    additional_cost,
    discount,
    base_amount,
    total_cost,
    total_paid,
    cash_paid,
    transfer_paid,
    imported_payment,
    GREATEST(0,total_cost-total_paid) AS pending_amount,
    GREATEST(0,total_paid-total_cost) AS credit_amount,
    CASE WHEN total_paid >= total_cost THEN 'paid' ELSE 'pending' END::text AS payment_status,
    paid_at
FROM totals;

GRANT SELECT ON public.view_billing_details TO authenticated;
