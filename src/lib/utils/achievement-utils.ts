import { createClient } from '@/src/lib/supabase/client';
import { ACHIEVEMENTS, AchievementMetadata } from '../constants/achievements';
import { fetchBilling } from './billing-data';

export interface PlayerStats {
    games_count: number;
    win_count: number;
    streak_day: number;
    streak_wins: number;
    event_attendance: number;
    early_bird: number;
    paid_on_time: number;
    total_spent: number;
    unique_partners: number;
    birthday_play: number;
    member_status: number;
    og_member: number;
    mvp_votes: number;
    lose_count: number;
}

export interface AchievementProgress {
    achievement: AchievementMetadata;
    currentValue: number;
    currentTier: number; // 0 if none
    nextTierTarget: number | null;
    isMaxed: boolean;
    percentToNext: number;
}

export async function fetchPlayerStats(userId: string): Promise<PlayerStats> {
    const supabase = createClient();

    // ยิงทุก query พร้อมกัน (เดิมรอทีละอัน 4 รอบ)
    const [{ data: profile }, { data: allProfiles }, { data: eventPlayers }, { data: matchPlayers }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('profiles').select('id').order('created_at', { ascending: true }).limit(10),
        supabase.from('event_players').select('*, events(entry_fee, shuttlecock_price)').eq('user_id', userId),
        supabase.from('match_players').select('*, matches(*, match_players(*, profiles(display_name)))').eq('user_id', userId),
    ]);

    const isOG = allProfiles?.some(p => p.id === userId) ? 1 : 0;
    const event_attendance = eventPlayers?.length || 0;
    const paid_on_time = eventPlayers?.filter(ep => ep.payment_status === 'paid').length || 0;

    let games_count = 0;
    let win_count = 0;
    let max_global_streak = 0;
    let current_global_streak = 0;
    let max_day_streak = 0;
    const partners = new Set<string>();

    if (matchPlayers) {
        // Group by event for day streak
        const matchesByEvent: Record<string, any[]> = {};

        matchPlayers
            .filter(mp => mp.matches?.status === 'finished')
            .sort((a, b) => new Date(a.matches.created_at).getTime() - new Date(b.matches.created_at).getTime())
            .forEach(mp => {
                const eventId = mp.matches.event_id;
                if (!matchesByEvent[eventId]) matchesByEvent[eventId] = [];
                matchesByEvent[eventId].push(mp);
            });

        // Global Streak calculation
        const allFinishedSorted = matchPlayers
            .filter(mp => mp.matches?.status === 'finished')
            .sort((a, b) => new Date(a.matches.created_at).getTime() - new Date(b.matches.created_at).getTime());

        games_count = allFinishedSorted.length;

        allFinishedSorted.forEach(mp => {
            const match = mp.matches;
            const isTeamA = mp.team === 'A';
            const isWin = (isTeamA && match.team_a_score > match.team_b_score) || (!isTeamA && match.team_b_score > match.team_a_score);

            if (isWin) {
                win_count++;
                current_global_streak++;
                if (current_global_streak > max_global_streak) max_global_streak = current_global_streak;
            } else {
                current_global_streak = 0;
            }

            // Partners
            match.match_players?.forEach((p: any) => {
                if (p.user_id !== userId && p.team === mp.team) {
                    partners.add(p.user_id);
                }
            });
        });

        // Day Streak calculation
        Object.values(matchesByEvent).forEach(eventMPs => {
            let currentDayStreak = 0;
            let maxDayStreakInEvent = 0;
            eventMPs.forEach(mp => {
                const match = mp.matches;
                const isTeamA = mp.team === 'A';
                const isWin = (isTeamA && match.team_a_score > match.team_b_score) || (!isTeamA && match.team_b_score > match.team_a_score);
                if (isWin) {
                    currentDayStreak++;
                    if (currentDayStreak > maxDayStreakInEvent) maxDayStreakInEvent = currentDayStreak;
                } else {
                    currentDayStreak = 0;
                }
            });
            if (maxDayStreakInEvent > max_day_streak) max_day_streak = maxDayStreakInEvent;
        });
    }

    // 4. Calculate total spent - ยอดที่จ่ายจริงจากฐานข้อมูล (view_billing_details) ที่เดียว
    const billingRows = await fetchBilling(supabase, { userId }).catch(() => [] as Awaited<ReturnType<typeof fetchBilling>>);
    const total_spent = billingRows.reduce((sum, r) => sum + Number(r.total_paid || 0), 0);

    // 5. Birthday check
    let birthday_play = 0;
    if (profile?.birth_date && matchPlayers) {
        const bd = new Date(profile.birth_date);
        const birthDay = bd.getDate();
        const birthMonth = bd.getMonth();

        const playedOnBirthday = matchPlayers.some(mp => {
            if (!mp.matches?.event_date) return false;
            const ed = new Date(mp.matches.event_date);
            return ed.getDate() === birthDay && ed.getMonth() === birthMonth;
        });

        if (playedOnBirthday) birthday_play = 1;
    }

    return {
        games_count,
        win_count,
        streak_day: max_day_streak,
        streak_wins: max_global_streak,
        event_attendance,
        early_bird: 0,
        paid_on_time,
        total_spent: Math.max(0, total_spent),
        unique_partners: partners.size,
        birthday_play,
        member_status: profile?.is_guest ? 0 : 1,
        og_member: isOG,
        mvp_votes: 0,
        lose_count: (matchPlayers || []).filter(participant => {
            const match = participant.matches;
            return match?.status === 'finished' && (participant.team === 'A' ? match.team_a_score < match.team_b_score : match.team_b_score < match.team_a_score);
        }).length,
    };
}

export function calculateAchievementProgress(stats: PlayerStats): AchievementProgress[] {
    return ACHIEVEMENTS.map(ach => {
        const val = (stats[ach.id as keyof PlayerStats] as number) || 0;

        let currentTier = 0;
        let nextTierTarget: number | null = null;

        for (let i = 0; i < ach.tiers.length; i++) {
            if (val >= ach.tiers[i].target) {
                currentTier = i + 1;
            } else {
                nextTierTarget = ach.tiers[i].target;
                break;
            }
        }

        const isMaxed = currentTier === ach.tiers.length;
        const currentTierTarget = currentTier === 0 ? 0 : ach.tiers[currentTier - 1].target;

        let percentToNext = 0;
        if (isMaxed) {
            percentToNext = 100;
        } else if (nextTierTarget !== null) {
            const range = nextTierTarget - currentTierTarget;
            const progress = val - currentTierTarget;
            percentToNext = Math.min(100, Math.max(0, (progress / range) * 100));
        }

        return {
            achievement: ach,
            currentValue: val,
            currentTier,
            nextTierTarget,
            isMaxed,
            percentToNext
        };
    });
}
