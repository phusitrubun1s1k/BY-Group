import type { SupabaseClient } from '@supabase/supabase-js';

export interface BillingRow {
    event_player_id: string;
    user_id: string;
    event_id: string;
    event_date: string;
    display_name: string;
    entry_fee: number;
    shuttlecock_price: number;
    total_games: number;
    total_shuttlecocks: number;
    missing_shuttle_matches: number;
    shuttlecock_nums: string;
    additional_cost: number;
    discount: number;
    base_amount: number;
    total_cost: number;
    total_paid: number;
    pending_amount: number;
    credit_amount: number;
    cash_paid: number;
    transfer_paid: number;
    payment_status: 'pending' | 'paid';
    payment_method: 'cash' | 'transfer' | null;
    slip_url: string | null;
    imported_payment: boolean;
}

export async function fetchBilling(client: SupabaseClient, filter: { eventId?: string; userId?: string } = {}): Promise<BillingRow[]> {
    const rows: BillingRow[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
        let query = client.from('view_billing_details').select('*').order('event_player_id').range(offset, offset + pageSize - 1);
        if (filter.eventId) query = query.eq('event_id', filter.eventId);
        if (filter.userId) query = query.eq('user_id', filter.userId);
        const { data, error } = await query;
        if (error) throw new Error('โหลดข้อมูลบิลไม่สำเร็จ กรุณาตรวจการอัปเดตฐานข้อมูล: ' + error.message);
        rows.push(...(data as BillingRow[]));
        if (data.length < pageSize) return rows;
    }
}

export async function savePayment(client: SupabaseClient, playerId: string, method: 'cash' | 'transfer', expectedDue: number) {
    return client.rpc('record_player_payment', { p_event_player_id: playerId, p_method: method, p_expected_due: expectedDue });
}

export async function cancelPayment(client: SupabaseClient, playerId: string) {
    return client.rpc('void_player_payments', { p_event_player_id: playerId });
}
