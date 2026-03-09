export interface Profile {
    id: string;
    email?: string;
    full_name?: string;
    display_name: string;
    role: 'admin' | 'user';
    skill_level?: string;
    avatar_url?: string | null;
    mmr?: number;
    is_guest?: boolean;
    created_at?: string;
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
    created_at?: string;
}

export interface EventPlayer {
    id: string;
    event_id: string;
    user_id: string;
    payment_status: 'pending' | 'paid';
    slip_url: string | null;
    is_checked_in: boolean;
    is_substitute?: boolean;
    discount?: number;
    created_at?: string;
    profiles?: Profile;
    events?: Event;
}

export interface Match {
    id: string;
    event_id: string;
    court_number: string;
    shuttlecock_numbers: string[];
    status: 'waiting' | 'playing' | 'finished';
    team_a_score: number;
    team_b_score: number;
    match_number?: number;
    created_at?: string;
    match_players?: MatchPlayer[];
}

export interface MatchPlayer {
    id: string;
    match_id: string;
    user_id: string;
    team: 'A' | 'B';
    profiles?: Profile;
}
