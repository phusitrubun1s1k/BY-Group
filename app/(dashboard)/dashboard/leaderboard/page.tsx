'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { Icon } from '@iconify/react';
import Link from 'next/link';
import RankBadge from '@/src/components/RankBadge';
import { getNextRank, RANK_TIERS } from '@/src/lib/rank-utils';

interface LeaderboardEntry {
    user_id: string;
    display_name: string;
    skill_level: string;
    mmr: number;
    total_games: number;
    total_wins: number;
    total_losses: number;
    total_points: number;
    total_spent: number;
    achievements?: { name: string; icon: string }[];
}

type FilterKey = 'mmr' | 'total_games' | 'total_wins' | 'total_spent';

const filters: { key: FilterKey; label: string; icon: string; emoji: string; unit: string }[] = [
    { key: 'mmr', label: 'อันดับ Rank', icon: 'solar:crown-star-bold', emoji: '⭐', unit: 'คะแนน' },
    { key: 'total_wins', label: 'ชนะเยอะสุด', icon: 'solar:cup-star-linear', emoji: '🏆', unit: 'ชนะ' },
    { key: 'total_games', label: 'เล่นบ่อยสุด', icon: 'solar:shuttlecock-linear', emoji: '🏸', unit: 'เกม' },
    { key: 'total_spent', label: 'สายเปย์', icon: 'solar:wallet-money-linear', emoji: '💸', unit: '฿' },
];

const skillColors: Record<string, string> = {
    'เปาะแปะ': '#16a34a', 'BG': '#16a34a', 'N': '#16a34a', 'S': '#16a34a',
    'P-': '#2563eb', 'P': '#2563eb', 'P+': '#2563eb',
    'C': '#9333ea', 'B': '#9333ea', 'A': '#9333ea',
    // Legacy fallback
    Beginner: '#16a34a', Intermediate: '#2563eb', Advanced: '#9333ea',
};

export default function LeaderboardPage() {
    const [data, setData] = useState<LeaderboardEntry[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [myPersonalData, setMyPersonalData] = useState<LeaderboardEntry | null>(null);
    const [myAbsences, setMyAbsences] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState<FilterKey>('mmr' as any);
    const [selectedSeason, setSelectedSeason] = useState<string>('current'); // 'current' or season_label
    const [pastSeasons, setPastSeasons] = useState<{ label: string; resetId: string; resetAt: string }[]>([]);
    const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);
    const [myMmrPenalty, setMyMmrPenalty] = useState<number>(0);
    const [myHasPlayedSinceReset, setMyHasPlayedSinceReset] = useState<boolean>(true);
    const [showRankLegend, setShowRankLegend] = useState(false);
    const [resetAt, setResetAt] = useState<string | null>(null);
    const [resetLabel, setResetLabel] = useState('');
    const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        loadRankings();
    }, [selectedSeason]);

    const loadInitialData = async () => {
        const supabase = createClient();

        // Fetch executed resets as past seasons (นับซีซันตามการกดรีแรงค์)
        const { data: executedResets } = await supabase
            .from('rank_reset_schedule')
            .select('id, reset_at, season_label')
            .eq('status', 'executed')
            .order('reset_at', { ascending: true });
        if (executedResets) {
            setPastSeasons(executedResets.map(r => ({
                label: r.season_label,
                resetId: r.id,
                resetAt: r.reset_at
            })));
        }

        // Fetch pending rank reset schedule
        const { data: resetData } = await supabase
            .from('rank_reset_schedule')
            .select('reset_at, season_label')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        if (resetData) {
            setResetAt(resetData.reset_at);
            setResetLabel(resetData.season_label);
        }
    };

    // Countdown timer effect
    useEffect(() => {
        if (!resetAt) return;
        const tick = () => {
            const now = new Date().getTime();
            const target = new Date(resetAt).getTime();
            const diff = Math.max(0, target - now);
            setCountdown({
                days: Math.floor(diff / (1000 * 60 * 60 * 24)),
                hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
                seconds: Math.floor((diff % (1000 * 60)) / 1000),
            });
        };
        tick();
        intervalRef.current = setInterval(tick, 1000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [resetAt]);

    const loadRankings = async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setCurrentUserId(user.id);

        // ===== Past Season: ดึงจาก season_history =====
        if (selectedSeason !== 'current') {
            const { data: seasonRows } = await supabase
                .from('season_history')
                .select('*, profiles:user_id(display_name, skill_level)')
                .eq('season_label', selectedSeason)
                .order('final_mmr', { ascending: false });

            const mapped: LeaderboardEntry[] = (seasonRows || []).map((r: any) => ({
                user_id: r.user_id,
                display_name: r.profiles?.display_name || 'Unknown',
                skill_level: r.profiles?.skill_level || '',
                mmr: r.final_mmr,
                total_games: r.total_games || 0,
                total_wins: r.total_wins || 0,
                total_losses: (r.total_games || 0) - (r.total_wins || 0),
                total_points: 0,
                total_spent: 0
            }));

            setData(mapped);
            setMyAbsences(0);
            setMyMmrPenalty(0);
            if (user) {
                const me = mapped.find(r => r.user_id === user.id);
                setMyPersonalData(me || null);
            }
            setLoading(false);
            return;
        }

        // ===== Current Season: ดึงจาก view_leaderboard =====
        const { data: rows, error } = await supabase.from('view_leaderboard').select('*');

        if (error) {
            console.error('Leaderboard error:', error.message, error.details, error.hint);
            setLoading(false);
            return;
        }

        // Calculate absences since last reset
        // Logic: นับก๊วนที่ขาดติดต่อกันทั้งหมดก่อน (นับย้อนกลับจากล่าสุด)
        // และตัด MMR -20 ต่อก๊วนที่ขาด ทุกๆ การขาดสะสม 3 ครั้ง (idempotent, ข้ามซีซัน)
        let activeUserAbsences: Record<string, number> = {};
        let appliedPenalties: Record<string, number> = {};
        let userHasPlayedSinceReset: Record<string, boolean> = {};
        try {
            // Fetch the latest executed reset date
            const { data: resets } = await supabase
                .from('rank_reset_schedule')
                .select('reset_at')
                .eq('status', 'executed')
                .order('reset_at', { ascending: false })
                .limit(1);
            const resetDate = resets && resets[0] ? resets[0].reset_at : '1970-01-01T00:00:00Z';

            // ดึง closed events หลังรีแรงค์ล่าสุด (ใช้เช็ค "เล่นครั้งเดียว = safe")
            const { data: currentSeasonEvents } = await supabase
                .from('events')
                .select('id, event_date')
                .eq('status', 'closed')
                .gt('event_date', resetDate)
                .order('event_date', { ascending: true });

            // ดึง closed events ทั้งหมด (ใช้คำนวณ penalty ข้ามซีซัน)
            const { data: allClosedEvents } = await supabase
                .from('events')
                .select('id, event_date')
                .eq('status', 'closed')
                .order('event_date', { ascending: true });

            if (allClosedEvents) {
                // Fetch all registrations for ALL closed events
                const { data: registrations } = await supabase
                    .from('event_players')
                    .select('user_id, event_id')
                    .in('event_id', allClosedEvents.map(e => e.id));
                const regSet = new Set(registrations?.map(r => `${r.user_id}_${r.event_id}`) || []);

                // ดึง absence penalties ที่เคยใช้แล้ว
                const { data: existingPenalties } = await supabase
                    .from('mmr_history')
                    .select('user_id, reason')
                    .like('reason', 'absence_penalty:%');
                const penaltySet = new Set(existingPenalties?.map(p => `${p.user_id}_${p.reason}`) || []);

                const allUserIds = rows?.map(r => r.user_id) || [];
                for (const userId of allUserIds) {
                    // เช็คว่าเล่นหลังรีแรงค์ล่าสุดไหม (สำหรับเช็คการแสดงตัวใน Leaderboard และ Banner แจ้งเตือน)
                    const hasPlayedSinceReset = currentSeasonEvents 
                        ? currentSeasonEvents.some(ev => regSet.has(`${userId}_${ev.id}`))
                        : false;
                    userHasPlayedSinceReset[userId] = hasPlayedSinceReset;

                    // ===== นับ consecutive absences ย้อนกลับจาก event ล่าสุด (ข้ามซีซัน) =====
                    let consecutiveMisses = 0;
                    for (let i = allClosedEvents.length - 1; i >= 0; i--) {
                        if (!regSet.has(`${userId}_${allClosedEvents[i].id}`)) {
                            consecutiveMisses++;
                        } else {
                            break; // เจอ event ที่เล่น → หยุดนับ
                        }
                    }
                    activeUserAbsences[userId] = consecutiveMisses;

                    // ===== ตัด MMR -20 ต่อก๊วนที่ขาด (idempotent, ข้ามซีซัน) =====
                    // เก็บ events ที่ขาดจากล่าสุดย้อนกลับ
                    const missedEvents: { id: string; event_date: string }[] = [];
                    for (let i = allClosedEvents.length - 1; i >= 0; i--) {
                        if (!regSet.has(`${userId}_${allClosedEvents[i].id}`)) {
                            missedEvents.push(allClosedEvents[i]);
                        } else {
                            break;
                        }
                    }
                    missedEvents.reverse(); // เรียงตามเวลาจากเก่า → ใหม่

                    const userRow = rows?.find(r => r.user_id === userId);
                    let currentMmr = userRow?.mmr || 1000;
                    let totalPenaltyApplied = 0;

                    for (let i = 0; i < missedEvents.length; i++) {
                        const ev = missedEvents[i];
                        const idx = i + 1; // 1-based index from oldest to newest (e.g. 1st, 2nd, 3rd absence)

                        // หักคะแนนเฉพาะครั้งที่ขาดลำดับพหุคูณของ 3 (เช่น ขาดสะสม 3, 6, 9 ครั้ง)
                        if (idx % 3 !== 0) {
                            continue;
                        }

                        const penaltyKey = `${userId}_absence_penalty:${ev.id}`;
                        if (penaltySet.has(penaltyKey)) {
                            // Penalty นี้ถูกใช้ไปแล้ว นับรวมเพื่อแสดง
                            totalPenaltyApplied += 20;
                            continue;
                        }
                        // ยังไม่เคยตัด → ตัดเลย (ถ้า mmr > 1000)
                        if (currentMmr > 1000) {
                            const deduction = Math.min(20, currentMmr - 1000);
                            const newMmr = currentMmr - deduction;
                            await supabase.from('profiles').update({ mmr: newMmr }).eq('id', userId);
                            await supabase.from('mmr_history').insert({
                                user_id: userId,
                                match_id: null,
                                old_mmr: currentMmr,
                                new_mmr: newMmr,
                                change: -deduction,
                                reason: `absence_penalty:${ev.id}`
                            });
                            await supabase.from('notifications').insert({
                                user_id: userId,
                                title: 'คะแนน MMR ถูกหักเนื่องจากขาดก๊วน 🏸',
                                body: `คะแนนของคุณถูกปรับลดลง ${deduction} แต้ม (คงเหลือ ${newMmr} แต้ม) เนื่องจากไม่มาเล่นก๊วนในวันที่ ${new Date(ev.event_date).toLocaleDateString('th-TH', { dateStyle: 'medium' })}`,
                                type: 'system',
                                link_url: '/dashboard/profile'
                            });
                            totalPenaltyApplied += deduction;
                            currentMmr = newMmr;
                        }
                    }
                    appliedPenalties[userId] = totalPenaltyApplied;
                }
            }
        } catch (err) {
            console.error('Error calculating absences on leaderboard:', err);
        }

        if (user) {
            setMyHasPlayedSinceReset(userHasPlayedSinceReset[user.id] ?? true);
            setMyAbsences(activeUserAbsences[user.id] || 0);
            setMyMmrPenalty(appliedPenalties[user.id] || 0);
        } else {
            setMyHasPlayedSinceReset(true);
            setMyAbsences(0);
            setMyMmrPenalty(0);
        }

        // Fetch badges for these users
        const userIds = rows?.map(r => r.user_id) || [];
        const { data: userBadges } = await supabase
            .from('view_user_badges')
            .select('*')
            .in('user_id', userIds);

        const achievementsMap: Record<string, any[]> = {};
        userBadges?.forEach((ub: any) => {
            const achs = [];
            if (ub.badge_win_streak) achs.push({ name: 'ชนะติดต่อกัน 3 เกม', icon: 'solar:fire-bold' });
            if (ub.badge_marathon) achs.push({ name: 'เล่นครบ 100 เกม', icon: 'solar:shuttlecock-bold' });
            if (ub.badge_patron) achs.push({ name: 'สายเปย์ประจำสัปดาห์', icon: 'solar:wallet-money-bold' });
            achievementsMap[ub.user_id] = achs;
        });

        const dataWithAchievements = (rows || [])
            .filter(r => {
                if (r.total_games <= 0) return false;
                // ซ่อนคนที่ไม่เคยมาเล่นเลยหลังรีแรงค์
                if (!userHasPlayedSinceReset[r.user_id]) {
                    return false;
                }
                return true;
            })
            .map(r => {
                const achs = [...(achievementsMap[r.user_id] || [])];
                const loseCount = r.total_games - r.total_wins;

                if (loseCount >= 20) {
                    achs.push({ name: 'เน้นเปิดไม่เน้นจบ', icon: 'solar:moon-stars-bold', type: 'troll' });
                }

                return {
                    ...r,
                    achievements: achs
                };
            });

        setData(dataWithAchievements as LeaderboardEntry[]);

        // Ensure we always have myPersonalData even if filtered out
        if (user) {
            let me = (rows || []).find(r => r.user_id === user.id);
            if (!me) {
                const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
                if (profile) {
                    me = {
                        user_id: profile.id,
                        display_name: profile.display_name,
                        skill_level: profile.skill_level || 'N/A',
                        mmr: profile.mmr || 1000,
                        total_games: 0,
                        total_wins: 0,
                        total_losses: 0,
                        total_points: 0,
                        total_spent: 0
                    };
                }
            }
            if (me) {
                setMyPersonalData({
                    ...me,
                    achievements: achievementsMap[me.user_id] || []
                });
            }
        }

        setLoading(false);
    };

    // Sort data by active filter
    const sorted = [...data]
        .sort((a, b) => (b[activeFilter] as number) - (a[activeFilter] as number));

    const currentFilter = filters.find((f) => f.key === activeFilter) || filters[0];

    // My rank
    const myRank = sorted.findIndex((p) => p.user_id === currentUserId) + 1;
    const myData = sorted.find((p) => p.user_id === currentUserId);
    const fullSorted = [...data].sort((a, b) => (b[activeFilter] as number) - (a[activeFilter] as number));
    const myFullRank = fullSorted.findIndex((p) => p.user_id === currentUserId) + 1;

    const top3 = sorted.slice(0, 3);
    const rest = sorted.slice(3);

    const getStatValue = (entry: LeaderboardEntry): string => {
        const val = entry[activeFilter];
        if (activeFilter === 'total_spent') return `฿${Number(val).toLocaleString()}`;
        return String(val);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="spinner" style={{ width: 28, height: 28 }} />
            </div>
        );
    }

    return (
        <>
            <div className="animate-in pb-12">
                {/* Header + Tabs */}
                <div className="mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2" style={{ color: 'var(--gray-900)' }}>
                                🏆 เลเวลบอร์ดจัดอันดับ
                            </h1>
                            <p className="text-sm font-medium" style={{ color: 'var(--gray-500)' }}>
                                ลานประลองฝีมือของคนในก๊วนเราทั้งหมด
                            </p>
                        </div>
                        <button
                            onClick={() => setShowRankLegend(true)}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 hover:bg-orange-100 text-xs font-bold uppercase tracking-wider transition-all shadow-sm"
                        >
                            <Icon icon="solar:info-circle-bold-duotone" width={18} />
                            เกณฑ์ระดับ Rank ทั้งหมด
                        </button>
                    </div>

                    {/* Premium Rank Reset Countdown */}
                    {resetAt && (
                        <div className="mb-8 relative rounded-[32px] overflow-hidden bg-gray-900 border border-gray-800 shadow-2xl group">
                            {/* Glowing background effects */}
                            <div className="absolute -top-24 -left-24 w-48 h-48 bg-orange-500 rounded-full mix-blend-screen filter blur-[80px] opacity-40 group-hover:opacity-60 transition-opacity duration-700" />
                            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-rose-500 rounded-full mix-blend-screen filter blur-[80px] opacity-30 group-hover:opacity-50 transition-opacity duration-700" />

                            {/* Subtle grid pattern */}
                            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at center, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

                            <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between p-6 sm:p-8 gap-6 backdrop-blur-sm">
                                <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/30 flex-shrink-0 relative overflow-hidden">
                                        <div className="absolute inset-0 bg-white/20 mix-blend-overlay" />
                                        <Icon icon="solar:history-bold-duotone" width={32} className="text-white drop-shadow-md" />
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-center sm:justify-start gap-2 mb-1.5">
                                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Scheduled Reset</span>
                                        </div>
                                        <h2 className="text-xl sm:text-2xl font-black text-white leading-tight">ฤดูกาลใหม่กำลังเริ่ม</h2>
                                        <p className="text-sm font-semibold text-gray-400 mt-1">ซีซันถัดไป: <span className="text-orange-400">{resetLabel}</span></p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 sm:gap-2.5 bg-black/40 p-2 sm:p-3 rounded-2xl border border-white/5 ring-1 ring-white/10">
                                    {[
                                        { val: countdown.days, label: 'วัน' },
                                        { val: countdown.hours, label: 'ชม.' },
                                        { val: countdown.minutes, label: 'นาที' },
                                        { val: countdown.seconds, label: 'วินาที' },
                                    ].map((item, i, arr) => (
                                        <div key={i} className="flex items-center">
                                            <div className="flex flex-col items-center justify-center w-[52px] h-[56px] sm:w-[64px] sm:h-[68px] rounded-xl bg-gray-800/80 border border-gray-700 shadow-inner relative overflow-hidden">
                                                <div className="absolute top-0 inset-x-0 h-1/2 bg-white/5 border-b border-white/5" />
                                                <div className="text-xl sm:text-2xl font-black text-white tabular-nums tracking-tighter drop-shadow-md relative z-10">
                                                    {String(item.val).padStart(2, '0')}
                                                </div>
                                                <div className="text-[8px] sm:text-[9px] font-bold text-gray-400 uppercase tracking-wider relative z-10 mt-0.5">
                                                    {item.label}
                                                </div>
                                            </div>
                                            {i < arr.length - 1 && (
                                                <div className="mx-0.5 sm:mx-1 text-gray-600 font-black animate-pulse">:</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Personal Rank Progress */}
                    {myPersonalData && (
                        <div className="mb-8 p-6 rounded-[32px] bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-xl relative overflow-hidden ring-1 ring-white/10">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-bl-full pointer-events-none" />
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center text-2xl font-black shadow-lg border border-orange-500/20 text-orange-500 shrink-0">
                                        {myPersonalData.display_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black leading-none mb-1.5">{myPersonalData.display_name}</h2>
                                        <div className="flex items-center gap-2">
                                            <RankBadge mmr={myPersonalData.mmr || 1000} size="sm" showName={true} className="bg-white/10 border-white/10 text-white" />
                                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                                อันดับของคุณ: {myFullRank > 0 ? `#${myFullRank}` : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 max-w-sm w-full">
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{currentFilter.label} ของคุณ</span>
                                        <span className="text-sm font-black text-orange-400">{getStatValue(myPersonalData)} <span className="text-[10px] font-bold text-white/40">{currentFilter.unit}</span></span>
                                    </div>
                                    {(() => {
                                        const { rank: nextRank, pointsNeeded, progress } = getNextRank(myPersonalData.mmr || 1000);
                                        return (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-end">
                                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Rank Progression</span>
                                                    {nextRank ? (
                                                        <span className="text-[10px] font-bold text-white/60">อีก {pointsNeeded} แต้มจะถึง {nextRank.name}</span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-orange-400">MAX RANK</span>
                                                    )}
                                                </div>
                                                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden p-[2px]">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 shadow-[0_0_12px_rgba(249,115,22,0.6)] transition-all duration-1000"
                                                        style={{ width: `${progress}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                            </div>
                        </div>
                    )}

                    {/* Absence Warning Banner — ขาดก๊วนหลังรีแรงค์ + ตัด MMR */}
                    {selectedSeason === 'current' && !myHasPlayedSinceReset && myAbsences > 0 && (
                        <div className="mb-8 p-5 rounded-2xl border flex items-start gap-4 transition-all duration-300 animate-in fade-in slide-in-from-top-4 bg-rose-50 border-rose-200 text-rose-800">
                            <div className="p-2.5 rounded-xl shrink-0 bg-rose-100 text-rose-600">
                                <Icon icon="solar:danger-bold" width={22} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-sm font-black mb-1">
                                    คุณถูกระงับการติดอันดับชั่วคราว ❌
                                </h3>
                                <p className="text-xs font-semibold opacity-90 leading-relaxed">
                                    {`คุณยังไม่ได้เข้าร่วมก๊วนเลยตั้งแต่รีแรงค์ (ขาดรวม ${myAbsences} ครั้ง) ระบบตัด MMR ไปแล้ว ${myMmrPenalty} แต้ม (ตัดครั้งละ 20 ต่อก๊วนที่ขาด) กรุณาลงก๊วนเล่นแมตช์เพียงครั้งเดียวเพื่อกลับเข้าสู่อันดับตลอดซีซัน`}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Filter Tabs & Month Selector */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex flex-wrap gap-2">
                            {filters.map((f) => (
                                <button
                                    key={f.key}
                                    onClick={() => setActiveFilter(f.key)}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                                    style={{
                                        background: activeFilter === f.key ? 'var(--orange-500)' : 'var(--white)',
                                        color: activeFilter === f.key ? 'var(--white)' : 'var(--gray-600)',
                                        border: `1.5px solid ${activeFilter === f.key ? 'var(--orange-500)' : 'var(--gray-200)'}`,
                                    }}
                                >
                                    <span>{f.emoji}</span>
                                    <span className="hidden sm:inline">{f.label}</span>
                                </button>
                            ))}
                        </div>

                        <div className="relative">
                            <button
                                onClick={() => setSeasonDropdownOpen(!seasonDropdownOpen)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:border-orange-500 transition-all min-w-[160px] justify-between"
                            >
                                <div className="flex items-center gap-2">
                                    <Icon icon="solar:medal-bold-duotone" width={18} className="text-orange-500" />
                                    <span>
                                        {selectedSeason === 'current'
                                            ? 'ซีซันปัจจุบัน'
                                            : selectedSeason
                                        }
                                    </span>
                                </div>
                                <Icon icon="solar:alt-arrow-down-linear" className={`transition-transform ${seasonDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {seasonDropdownOpen && (
                                <div className="absolute right-0 mt-2 w-full min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    <button
                                        onClick={() => { setSelectedSeason('current'); setSeasonDropdownOpen(false); }}
                                        className={`w-full text-left px-4 py-3 text-sm font-semibold hover:bg-gray-50 flex items-center justify-between ${selectedSeason === 'current' ? 'text-orange-500 bg-orange-50' : 'text-gray-700'}`}
                                    >
                                        ซีซันปัจจุบัน {selectedSeason === 'current' && <Icon icon="solar:check-circle-bold" />}
                                    </button>
                                    {[...pastSeasons].reverse().map((s, idx) => (
                                        <button
                                            key={s.resetId}
                                            onClick={() => { setSelectedSeason(s.label); setSeasonDropdownOpen(false); }}
                                            className={`w-full text-left px-4 py-3 text-sm font-semibold hover:bg-gray-50 flex items-center justify-between ${selectedSeason === s.label ? 'text-orange-500 bg-orange-50' : 'text-gray-700'}`}
                                        >
                                            <div className="flex flex-col leading-tight">
                                                <span>{s.label}</span>
                                                <span className="text-[10px] font-medium opacity-50">
                                                    {new Date(s.resetAt).toLocaleDateString('th-TH', { dateStyle: 'medium' })}
                                                </span>
                                            </div>
                                            {selectedSeason === s.label && <Icon icon="solar:check-circle-bold" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {data.length === 0 ? (
                    <div className="card text-center" style={{ padding: '64px 24px' }}>
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gray-100)' }}>
                            <Icon icon="solar:cup-star-linear" width={32} style={{ color: 'var(--gray-400)' }} />
                        </div>
                        <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--gray-900)' }}>ยังไม่มีข้อมูล</h2>
                        <p className="text-sm" style={{ color: 'var(--gray-500)' }}>เล่นแมตช์ให้จบเพื่อเริ่มสร้างสถิติ</p>
                    </div>
                ) : (
                    <>
                        {/* ========== TOP 3 PODIUM ========== */}
                        {top3.length >= 3 && (
                            <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8 items-end">
                                {/* 2nd Place */}
                                <PodiumCard entry={top3[1]} rank={2} statValue={getStatValue(top3[1])} unit={currentFilter.unit} isMe={top3[1].user_id === currentUserId} />
                                {/* 1st Place (taller) */}
                                <PodiumCard entry={top3[0]} rank={1} statValue={getStatValue(top3[0])} unit={currentFilter.unit} isMe={top3[0].user_id === currentUserId} />
                                {/* 3rd Place */}
                                <PodiumCard entry={top3[2]} rank={3} statValue={getStatValue(top3[2])} unit={currentFilter.unit} isMe={top3[2].user_id === currentUserId} />
                            </div>
                        )}

                        {/* If less than 3 players, show them as regular list */}
                        {top3.length < 3 && top3.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                                {top3.map((entry, i) => (
                                    <PodiumCard key={entry.user_id} entry={entry} rank={(i + 1) as 1 | 2 | 3} statValue={getStatValue(entry)} unit={currentFilter.unit} isMe={entry.user_id === currentUserId} />
                                ))}
                            </div>
                        )}

                        {/* ========== RANKING LIST #4-20 ========== */}
                        {rest.length > 0 && (
                            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                {rest.map((entry, index) => {
                                    const rank = index + 4;
                                    const isMe = entry.user_id === currentUserId;

                                    return (
                                        <div
                                            key={entry.user_id}
                                            className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 transition-colors"
                                            style={{
                                                borderBottom: index < rest.length - 1 ? '1px solid var(--gray-100)' : 'none',
                                                background: isMe ? 'rgba(249, 115, 22, 0.04)' : 'transparent',
                                                borderLeft: isMe ? '3px solid var(--orange-500)' : '3px solid transparent',
                                            }}
                                        >
                                            {/* Rank Number */}
                                            <div className="w-8 text-center shrink-0">
                                                <span className="text-sm font-bold" style={{ color: 'var(--gray-400)' }}>{rank}</span>
                                            </div>

                                            {/* Avatar + Name - Linked to Profile */}
                                            <Link
                                                href={isMe ? "/dashboard/profile" : `/dashboard/profile/${entry.user_id}`}
                                                className="flex flex-1 items-center gap-3 sm:gap-4 min-w-0 group"
                                            >
                                                <div
                                                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-transform group-hover:scale-105"
                                                    style={{ background: 'var(--gray-900)', color: 'var(--white)' }}
                                                >
                                                    {entry.display_name.charAt(0).toUpperCase()}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <p className="text-sm font-bold truncate group-hover:text-orange-500 transition-colors" style={{ color: 'var(--gray-900)' }}>
                                                            {entry.display_name}
                                                        </p>
                                                        {isMe && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-600">คุณ</span>}
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {entry.achievements?.map((ach: any, i) => {
                                                                let colorCls = 'bg-emerald-50 text-emerald-600';
                                                                if (ach.name === 'ชนะติดต่อกัน 3 เกม') colorCls = 'bg-orange-50 text-orange-600';
                                                                else if (ach.name === 'เล่นครบ 100 เกม') colorCls = 'bg-blue-50 text-blue-600';
                                                                else if (ach.type === 'troll') colorCls = 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-sm border border-red-400';

                                                                return (
                                                                    <span key={i} title={ach.name} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase ${colorCls}`}>
                                                                        <Icon icon={ach.icon} width={10} />
                                                                        <span>{ach.name}</span>
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                    {entry.skill_level && (
                                                        <span className="text-[11px] font-semibold" style={{ color: skillColors[entry.skill_level] || 'var(--gray-500)' }}>
                                                            {entry.skill_level}
                                                        </span>
                                                    )}
                                                </div>
                                            </Link>

                                            {/* Rank Badge in List */}
                                            <div className="shrink-0">
                                                <RankBadge mmr={entry.mmr || 1000} size="sm" showName={false} />
                                            </div>

                                            {/* Stats */}
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-bold" style={{ color: 'var(--gray-900)' }}>{getStatValue(entry)}</p>
                                                <p className="text-[11px]" style={{ color: 'var(--gray-500)' }}>{currentFilter.unit}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

            </div>

            {/* Rank Legend Modal - Moved outside of the container for full-screen effect */}
            {
                showRankLegend && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => setShowRankLegend(false)} />
                        <div className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-black/5">
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white/50 backdrop-blur-md">
                                <h3 className="text-lg font-black text-gray-900">เกณฑ์ระดับแรงค์</h3>
                                <button onClick={() => setShowRankLegend(false)} className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors">
                                    <Icon icon="solar:close-circle-bold" width={20} />
                                </button>
                            </div>
                            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
                                {RANK_TIERS.map((rt, i) => (
                                    <div key={i} className={`flex items-center justify-between p-4 rounded-2xl border transition-all hover:scale-[1.02] ${rt.bg} ${rt.border} ${rt.text}`}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center" style={{ color: rt.color }}>
                                                <Icon icon={rt.icon} width={24} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black">{rt.name}</p>
                                                <p className="text-[10px] opacity-70 uppercase tracking-widest font-bold">MIN MMR: {rt.minMMR}</p>
                                            </div>
                                        </div>
                                        {myPersonalData && myPersonalData.mmr >= rt.minMMR && (
                                            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/10 text-green-600">
                                                <Icon icon="solar:check-circle-bold" width={16} />
                                                <span className="text-[9px] font-black uppercase">Unlocked</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="p-6 bg-gray-50/50 text-center border-t border-gray-100">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-relaxed">
                                    สะสมเเต้มจากการเล่นเพื่อเลื่อนระดับ <br />
                                    ยิ่งชนะคนเก่ง ยิ่งได้เเต้มเยอะ!
                                </p>
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
}

/* ========== PODIUM CARD COMPONENT ========== */
interface PodiumCardProps {
    entry: LeaderboardEntry;
    rank: 1 | 2 | 3;
    statValue: string;
    unit: string;
    isMe: boolean;
}

const podiumConfig = {
    1: {
        height: 'min-h-[240px] sm:min-h-[280px]',
        avatarSize: 'w-24 h-24 sm:w-28 sm:h-28',
        textSize: 'text-xl sm:text-2xl',
        statSize: 'text-3xl sm:text-4xl',
        bg: 'linear-gradient(180deg, rgba(251, 191, 36, 0.2) 0%, rgba(251, 191, 36, 0.05) 100%)',
        border: '2px solid #fbbf24',
        crownColor: '#f59e0b',
        badgeBg: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
        badgeColor: '#fff',
        label: '🥇',
        rankTitle: 'อันดับ 1',
        rankColor: 'text-amber-600',
        shadow: '0 10px 40px rgba(251, 191, 36, 0.3)',
    },
    2: {
        height: 'min-h-[210px] sm:min-h-[240px]',
        avatarSize: 'w-20 h-20 sm:w-24 sm:h-24',
        textSize: 'text-lg sm:text-xl',
        statSize: 'text-2xl sm:text-3xl',
        bg: 'linear-gradient(180deg, rgba(148, 163, 184, 0.2) 0%, rgba(148, 163, 184, 0.05) 100%)',
        border: '2px solid #94a3b8',
        crownColor: '#64748b',
        badgeBg: 'linear-gradient(135deg, #cbd5e1, #94a3b8)',
        badgeColor: '#fff',
        label: '🥈',
        rankTitle: 'อันดับ 2',
        rankColor: 'text-slate-600',
        shadow: '0 8px 30px rgba(148, 163, 184, 0.25)',
    },
    3: {
        height: 'min-h-[200px] sm:min-h-[230px]',
        avatarSize: 'w-20 h-20 sm:w-24 sm:h-24',
        textSize: 'text-lg sm:text-xl',
        statSize: 'text-2xl sm:text-3xl',
        bg: 'linear-gradient(180deg, rgba(217, 119, 6, 0.2) 0%, rgba(217, 119, 6, 0.05) 100%)',
        border: '2px solid #d97706',
        crownColor: '#92400e',
        badgeBg: 'linear-gradient(135deg, #fbbf24, #d97706)',
        badgeColor: '#fff',
        label: '🥉',
        rankTitle: 'อันดับ 3',
        rankColor: 'text-orange-700',
        shadow: '0 8px 30px rgba(217, 119, 6, 0.2)',
    },
};

function PodiumCard({ entry, rank, statValue, unit, isMe }: PodiumCardProps) {
    const config = podiumConfig[rank];

    return (
        <Link
            href={isMe ? "/dashboard/profile" : `/dashboard/profile/${entry.user_id}`}
            className={`${config.height} card flex flex-col items-center justify-center text-center relative overflow-hidden transition-all duration-300 hover:scale-[1.02] shadow-2xl group`}
            style={{
                background: config.bg,
                border: config.border,
                boxShadow: config.shadow,
                padding: '2rem 1rem 1.5rem 1rem',
            }}
        >
            {/* Rank Badge */}
            <div
                className="px-3 py-1 rounded-full text-[10px] font-black uppercase absolute -top-0 left-1/2 -translate-x-1/2 -translate-y-[-12px] shadow-sm z-10"
                style={{ background: config.badgeBg, color: config.badgeColor }}
            >
                {config.rankTitle}
            </div>

            {/* Medal Icon Overlay */}
            <div className="absolute top-2 right-2 opacity-20 transform rotate-12">
                <Icon icon={rank === 1 ? 'solar:crown-minimalistic-bold-duotone' : rank === 2 ? 'solar:medal-star-bold-duotone' : 'solar:cup-star-bold-duotone'} width={48} style={{ color: config.crownColor }} />
            </div>

            {/* Avatar Section */}
            <div className="relative mb-4">
                <div
                    className={`${config.avatarSize} rounded-full flex items-center justify-center font-black shadow-2xl border-4 border-white relative z-0 group-hover:scale-105 transition-transform`}
                    style={{
                        background: rank === 1 ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : rank === 2 ? 'linear-gradient(135deg, #94a3b8, #64748b)' : 'linear-gradient(135deg, #d97706, #92400e)',
                        color: 'var(--white)',
                        fontSize: rank === 1 ? '2.5rem' : '1.8rem',
                    }}
                >
                    {entry.display_name.charAt(0).toUpperCase()}
                </div>
                {/* Float Rank Badge on Avatar */}
                <div className="absolute -bottom-2 -right-2 transform scale-110">
                    <RankBadge mmr={entry.mmr || 1000} size="sm" showMMR={false} />
                </div>
            </div>

            {/* User Info */}
            <div className="flex flex-col items-center gap-1 w-full max-w-full">
                <p className={`${config.textSize} font-black truncate w-full tracking-tight px-1 group-hover:text-orange-500 transition-colors`} style={{ color: 'var(--gray-900)' }}>
                    {entry.display_name}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
                    {entry.achievements?.map((ach: any, i) => {
                        let colorCls = 'bg-emerald-500 text-white border-emerald-400';
                        if (ach.name === 'ชนะติดต่อกัน 3 เกม') colorCls = 'bg-orange-500 text-white border-orange-400';
                        else if (ach.name === 'เล่นครบ 100 เกม') colorCls = 'bg-blue-500 text-white border-blue-400';
                        else if (ach.type === 'troll') colorCls = 'bg-gradient-to-r from-red-500 to-rose-600 text-white border-red-400 shadow-md transform hover:scale-105 transition-transform';

                        return (
                            <span key={i} title={ach.name} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase shadow-sm border ${colorCls}`}>
                                <Icon icon={ach.icon} width={10} />
                                <span>{ach.name}</span>
                            </span>
                        );
                    })}
                </div>
            </div>

            {isMe && (
                <div className="mt-2 bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full text-[10px] font-black uppercase">
                    คุณเอง
                </div>
            )}

            {/* Stats */}
            <div className="mt-4 pt-3 border-t border-black/5 w-full">
                <p className={`${config.statSize} font-black leading-none`} style={{ color: 'var(--gray-900)' }}>
                    {statValue}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-50" style={{ color: 'var(--gray-600)' }}>
                    {unit}
                </p>
            </div>
        </Link>
    );
}
