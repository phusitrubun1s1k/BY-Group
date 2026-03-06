export interface Profile {
    id: string;
    role: 'admin' | 'user';
    email: string;
    full_name: string;
    display_name: string;
    phone: string | null;
    skill_level: 'เปาะแปะ' | 'BG' | 'N' | 'S' | 'P-' | 'P' | 'P+' | 'C' | 'B' | 'A' | null;
    is_guest: boolean;
    mmr?: number;
    avatar_url: string | null;
    birth_date: string | null;
    created_at: string;
}

export interface Event {
    id: string;
    event_date: string;
    shuttlecock_brand: string;
    shuttlecock_price: number;
    entry_fee: number;
    courts: string[];
    start_time: string;
    end_time: string;
    status: 'open' | 'closed';
    created_at: string;
}

export interface EventPlayer {
    id: string;
    event_id: string;
    user_id: string;
    payment_status: 'pending' | 'paid';
    is_checked_in: boolean;
    is_substitute: boolean;
    slip_url: string | null;
    discount: number;
    created_at: string;
    // Joined fields
    profiles?: Profile;
}

export interface Match {
    id: string;
    event_id: string;
    court_number: string;
    shuttlecock_numbers: string[] | null;
    status: 'waiting' | 'playing' | 'finished';
    team_a_score: number;
    team_b_score: number;
    created_at: string;
    // Joined fields
    match_players?: MatchPlayer[];
}

export interface MatchPlayer {
    id: string;
    match_id: string;
    user_id: string;
    team: 'A' | 'B';
    // Joined fields
    profiles?: Profile;
}

export interface RegisterFormData {
    email: string;
    password: string;
    confirmPassword: string;
    full_name: string;
    display_name: string;
    phone: string;
    skill_level: string;
}

export interface LoginFormData {
    email: string;
    password: string;
}
