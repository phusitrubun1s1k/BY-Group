'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { Icon } from '@iconify/react';
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

type FilterKey = 'total_games' | 'total_wins' | 'total_points' | 'total_spent';

const filters: { key: FilterKey; label: string; icon: string; emoji: string; unit: string }[] = [
    { key: 'mmr' as any, label: 'อันดับ Rank', icon: 'solar:crown-star-bold', emoji: '⭐', unit: 'คะแนน' },
    { key: 'total_wins', label: 'ชนะเยอะสุด', icon: 'solar:cup-star-linear', emoji: '🏆', unit: 'ชนะ' },
    { key: 'total_games', label: 'เล่นบ่อยสุด', icon: 'solar:shuttlecock-linear', emoji: '🏸', unit: 'เกม' },
    { key: 'total_points', label: 'แต้มรวมสูงสุด', icon: 'solar:fire-linear', emoji: '🔥', unit: 'แต้ม' },
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
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState<FilterKey>('mmr' as any);
    const [selectedMonth, setSelectedMonth] = useState<string>('all'); // 'all' or 'YYYY-MM'
    const [availableMonths, setAvailableMonths] = useState<string[]>([]);
    const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
    const [showRankLegend, setShowRankLegend] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        loadRankings();
    }, [selectedMonth]);

    const loadInitialData = async () => {
        const supabase = createClient();
        const { data: events } = await supabase.from('events').select('event_date').order('event_date', { ascending: true });
        if (events) {
            // Sort ascending to determine Season 1, 2, 3...
            const months = Array.from(new Set(events.map(e => e.event_date.substring(0, 7))));
            setAvailableMonths(months);
        }
    };

    const loadRankings = async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setCurrentUserId(user.id);

        let query = supabase.from(selectedMonth === 'all' ? 'view_leaderboard' : 'view_monthly_leaderboard').select('*');

        if (selectedMonth !== 'all') {
            query = query.eq('month_key', selectedMonth);
        }

        const { data: rows, error } = await query;

        if (error) {
            console.error('Leaderboard error:', error.message, error.details, error.hint);
            setLoading(false);
            return;
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

        const dataWithAchievements = (rows || []).map(r => ({
            ...r,
            achievements: achievementsMap[r.user_id] || []
        }));

        setData(dataWithAchievements as LeaderboardEntry[]);
        setLoading(false);
    };

    // Sort data by active filter
    const sorted = [...data]
        .sort((a, b) => (b[activeFilter] as number) - (a[activeFilter] as number));

    const currentFilter = filters.find((f) => f.key === activeFilter)!;

    // My rank
    const myRank = sorted.findIndex((p) => p.user_id === currentUserId) + 1;
    const myData = sorted.find((p) => p.user_id === currentUserId);
    // If I'm not in top 20, find me in full sorted data
    const fullSorted = [...data].sort((a, b) => (b[activeFilter] as number) - (a[activeFilter] as number));
    const myFullRank = fullSorted.findIndex((p) => p.user_id === currentUserId) + 1;
    const myFullData = fullSorted.find((p) => p.user_id === currentUserId);

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
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2" style={{ color: 'var(--gray-900)' }}>
                        🏆 เลเวลบอร์ดจัดอันดับ
                    </h1>
                    <p className="text-sm font-medium mb-6" style={{ color: 'var(--gray-500)' }}>
                        ลานประลองฝีมือของคนในก๊วนเราทั้งหมด
                    </p>

                    {/* Personal Rank Progress */}
                    {myFullData && (
                        <div className="mb-8 p-6 rounded-[32px] bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-xl relative overflow-hidden ring-1 ring-white/10">
                            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-bl-full pointer-events-none" />
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center text-2xl font-black shadow-lg border border-orange-500/20 text-orange-500">
                                        {myFullData.display_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black leading-none mb-1.5">{myFullData.display_name}</h2>
                                        <div className="flex items-center gap-2">
                                            <RankBadge mmr={myFullData.mmr || 1000} size="sm" showName={true} className="bg-white/10 border-white/10 text-white" />
                                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                                อันดับของคุณ: {myFullRank > 0 ? `#${myFullRank}` : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 max-w-sm">
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{currentFilter.label} ของคุณ</span>
                                        <span className="text-sm font-black text-orange-400">{getStatValue(myFullData)} <span className="text-[10px] font-bold text-white/40">{currentFilter.unit}</span></span>
                                    </div>
                                    {(() => {
                                        const { rank: nextRank, pointsNeeded, progress } = getNextRank(myFullData.mmr || 1000);
                                        return (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-end">
                                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Rank Progression</span>
                                                    {nextRank && (
                                                        <span className="text-[10px] font-bold text-white/60">อีก {pointsNeeded} แต้มจะถึง {nextRank.name}</span>
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

                                <button
                                    onClick={() => setShowRankLegend(true)}
                                    className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-widest transition-all"
                                >
                                    ดูระดับทั้งหมด
                                </button>
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
                                onClick={() => setMonthDropdownOpen(!monthDropdownOpen)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:border-orange-500 transition-all min-w-[160px] justify-between"
                            >
                                <div className="flex items-center gap-2">
                                    <Icon icon="solar:medal-bold-duotone" width={18} className="text-orange-500" />
                                    <span>
                                        {selectedMonth === 'all'
                                            ? 'ตลอดกาล'
                                            : `Season ${availableMonths.indexOf(selectedMonth) + 1} (${new Date(selectedMonth + '-01').toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })})`
                                        }
                                    </span>
                                </div>
                                <Icon icon="solar:alt-arrow-down-linear" className={`transition-transform ${monthDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {monthDropdownOpen && (
                                <div className="absolute right-0 mt-2 w-full min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    <button
                                        onClick={() => { setSelectedMonth('all'); setMonthDropdownOpen(false); }}
                                        className={`w-full text-left px-4 py-3 text-sm font-semibold hover:bg-gray-50 flex items-center justify-between ${selectedMonth === 'all' ? 'text-orange-500 bg-orange-50' : 'text-gray-700'}`}
                                    >
                                        ตลอดกาล {selectedMonth === 'all' && <Icon icon="solar:check-circle-bold" />}
                                    </button>
                                    {[...availableMonths].reverse().map((m, idx) => {
                                        const seasonNum = availableMonths.indexOf(m) + 1;
                                        return (
                                            <button
                                                key={m}
                                                onClick={() => { setSelectedMonth(m); setMonthDropdownOpen(false); }}
                                                className={`w-full text-left px-4 py-3 text-sm font-semibold hover:bg-gray-50 flex items-center justify-between ${selectedMonth === m ? 'text-orange-500 bg-orange-50' : 'text-gray-700'}`}
                                            >
                                                <div className="flex flex-col leading-tight">
                                                    <span>Season {seasonNum}</span>
                                                    <span className="text-[10px] font-medium opacity-50">
                                                        {new Date(m + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                                                    </span>
                                                </div>
                                                {selectedMonth === m && <Icon icon="solar:check-circle-bold" />}
                                            </button>
                                        );
                                    })}
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

                                            {/* Avatar */}
                                            <div
                                                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                                                style={{ background: 'var(--gray-900)', color: 'var(--white)' }}
                                            >
                                                {entry.display_name.charAt(0).toUpperCase()}
                                            </div>

                                            {/* Name + Skill */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <p className="text-sm font-bold truncate" style={{ color: 'var(--gray-900)' }}>
                                                        {entry.display_name}
                                                    </p>
                                                    {isMe && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-600">คุณ</span>}
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {entry.achievements?.map((ach, i) => (
                                                            <span key={i} title={ach.name} className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase ${ach.name === 'ชนะติดต่อกัน 3 เกม' ? 'bg-orange-50 text-orange-600' : ach.name === 'เล่นครบ 100 เกม' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                                <Icon
                                                                    icon={ach.icon}
                                                                    width={12}
                                                                />
                                                                <span>{ach.name}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                {entry.skill_level && (
                                                    <span className="text-[11px] font-semibold" style={{ color: skillColors[entry.skill_level] || 'var(--gray-500)' }}>
                                                        {entry.skill_level}
                                                    </span>
                                                )}
                                            </div>

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
                                        {myFullData && myFullData.mmr >= rt.minMMR && (
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
        <div
            className={`${config.height} card flex flex-col items-center justify-center text-center relative overflow-hidden transition-all duration-300 hover:scale-[1.02] shadow-2xl`}
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
                    className={`${config.avatarSize} rounded-full flex items-center justify-center font-black shadow-2xl border-4 border-white relative z-0`}
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
                <p className={`${config.textSize} font-black truncate w-full tracking-tight px-1`} style={{ color: 'var(--gray-900)' }}>
                    {entry.display_name}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
                    {entry.achievements?.map((ach, i) => (
                        <span key={i} title={ach.name} className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase shadow-sm border ${ach.name === 'ชนะติดต่อกัน 3 เกม' ? 'bg-orange-500 text-white border-orange-400' : ach.name === 'เล่นครบ 100 เกม' ? 'bg-blue-500 text-white border-blue-400' : 'bg-emerald-500 text-white border-emerald-400'}`}>
                            <Icon icon={ach.icon} width={10} />
                            <span>{ach.name}</span>
                        </span>
                    ))}
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
        </div>
    );
}
