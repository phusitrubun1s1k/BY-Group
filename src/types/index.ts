export interface Profile {
    id: string;
    role: 'admin' | 'user';
    email?: string;
    full_name: string;
    display_name: string;
    phone?: string;
    skill_level?: 'เปาะแปะ' | 'BG' | 'N' | 'S' | 'P-' | 'P' | 'P+' | 'C' | 'B' | 'A';
    created_at: string;
    is_guest?: boolean;
    mmr?: number;
    birth_date?: string;
    avatar_url?: string | null;
}

export interface Event {
    id: string;
    event_name: string;
    event_date: string;
    shuttlecock_brand: string;
    shuttlecock_price: number;
    entry_fee: number;
    status: 'open' | 'closed';
    courts?: string[];
    start_time?: string;
    end_time?: string;
    actual_court_fee?: number;
    actual_shuttle_box_price?: number;
    actual_shuttle_boxes_used?: number;
    created_at: string;
}

export interface EventPlayer {
    id: string;
    event_id: string;
    user_id: string;
    payment_status: 'pending' | 'paid';
    slip_url: string | null;
    is_checked_in: boolean;
    is_substitute: boolean;
    discount: number;
    additional_cost?: number;
    created_at: string;
    profiles?: Profile;
    events?: Event;
}

export interface Match {
    id: string;
    event_id: string;
    court_number: string;
    status: 'waiting' | 'playing' | 'finished';
    team_a_score: number;
    team_b_score: number;
    shuttlecock_numbers: string[];
    match_number?: number;
    created_at: string;
    match_players?: MatchPlayer[];
}

export interface MatchPlayer {
    id: string;
    match_id: string;
    user_id: string;
    team: 'A' | 'B';
    profiles?: Profile;
}

export interface Achievement {
    id: string;
    name: string;
    icon: string;
    description?: string;
    category: 'performance' | 'participation' | 'spending';
    created_at: string;
}

export interface UserAchievement {
    id: string;
    user_id: string;
    achievement_id: string;
    earned_at: string;
}

export interface MMRHistory {
    id: string;
    user_id: string;
    match_id?: string;
    old_mmr: number;
    new_mmr: number;
    change: number;
    reason?: string;
    created_at: string;
}
