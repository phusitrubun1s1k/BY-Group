'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { Icon } from '@iconify/react';
import RankBadge from '@/src/components/RankBadge';

interface HallOfFameEntry {
    month_key: string;
    user_id: string;
    display_name: string;
    skill_level: string;
    mmr: number;
    total_games: number;
    total_wins: number;
    total_points: number;
    total_spent: number;
    rank_position: number;
}

interface SeasonGroup {
    seasonNumber: number;
    monthKey: string;
    monthLabel: string;
    winners: HallOfFameEntry[];
}

const MOCKUP_SEASONS: SeasonGroup[] = [
    {
        seasonNumber: 1,
        monthKey: '2026-03',
        monthLabel: 'มีนาคม 2026 (Mockup)',
        winners: [
            {
                month_key: '2026-03',
                user_id: 'mock-1',
                display_name: 'Legendary Player',
                skill_level: 'A',
                mmr: 3850,
                total_games: 45,
                total_wins: 38,
                total_points: 920,
                total_spent: 1500,
                rank_position: 1
            },
            {
                month_key: '2026-03',
                user_id: 'mock-2',
                display_name: 'Pro Smasher',
                skill_level: 'B',
                mmr: 3400,
                total_games: 50,
                total_wins: 32,
                total_points: 850,
                total_spent: 1200,
                rank_position: 2
            },
            {
                month_key: '2026-03',
                user_id: 'mock-3',
                display_name: 'Net King',
                skill_level: 'B',
                mmr: 2950,
                total_games: 38,
                total_wins: 25,
                total_points: 710,
                total_spent: 980,
                rank_position: 3
            }
        ]
    }
];

export default function HallOfFamePage() {
    const [entries, setEntries] = useState<HallOfFameEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        const supabase = createClient();

        const { data, error } = await supabase
            .from('view_hall_of_fame')
            .select('*')
            .order('month_key', { ascending: true }); // Get all to calculate season numbers correctly

        if (error) {
            console.error('Error loading Hall of Fame:', error);
        } else {
            setEntries(data as HallOfFameEntry[]);
        }
        setLoading(false);
    };

    const seasons = useMemo(() => {
        if (entries.length === 0) return MOCKUP_SEASONS;

        const groups: Record<string, HallOfFameEntry[]> = {};
        entries.forEach(entry => {
            if (!groups[entry.month_key]) groups[entry.month_key] = [];
            groups[entry.month_key].push(entry);
        });

        // Sort months ascending to assign season numbers
        const sortedMonthKeys = Object.keys(groups).sort();

        const seasonGroups: SeasonGroup[] = sortedMonthKeys.map((key, index) => {
            const date = new Date(key + '-01');
            const monthLabel = date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
            return {
                seasonNumber: index + 1,
                monthKey: key,
                monthLabel,
                winners: groups[key].sort((a, b) => a.rank_position - b.rank_position)
            };
        });

        // Return descending for display (newest first)
        return seasonGroups.reverse();
    }, [entries]);

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" /></div>;

    return (
        <div className="animate-in max-w-4xl mx-auto space-y-12 pb-20">
            <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-[2rem] bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 shadow-2xl shadow-amber-500/20 mb-2 rotate-3 hover:rotate-0 transition-transform duration-500">
                    <Icon icon="solar:crown-minimalistic-bold" className="text-white" width={44} />
                </div>
                <h1 className="text-4xl font-black tracking-tight text-gray-900">Hall of Fame</h1>
                <p className="text-gray-500 font-medium max-w-lg mx-auto">
                    เกียรติยศแด่เหล่าผู้เล่นระดับตำนานที่ครองอันดับสูงสุดในแต่ละซีซัน
                </p>
            </div>

            {seasons.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-100">
                    <Icon icon="solar:history-linear" width={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-400 font-bold">ยังไม่จบซีซันแรก... มาร่วมสร้างตำนานกัน!</p>
                </div>
            ) : (
                <div className="space-y-20">
                    {seasons.map((season) => (
                        <section key={season.monthKey} className="relative">
                            {/* Season Header */}
                            <div className="flex items-center gap-4 mb-10 px-4">
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                                <div className="text-center">
                                    <h2 className="text-2xl font-black text-gray-900 uppercase tracking-widest">Season {season.seasonNumber}</h2>
                                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.3em]">{season.monthLabel}</p>
                                </div>
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                            </div>

                            {/* Podium Display */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end px-4">
                                {/* Rank 2 */}
                                <WinnerCard
                                    entry={season.winners.find(w => w.rank_position === 2)}
                                    rank={2}
                                    color="from-slate-300 to-slate-500"
                                    accent="text-slate-600"
                                    shadow="shadow-slate-200"
                                    order="order-2 md:order-1"
                                />

                                {/* Rank 1 - Center & Tallest */}
                                <WinnerCard
                                    entry={season.winners.find(w => w.rank_position === 1)}
                                    rank={1}
                                    color="from-amber-300 via-yellow-400 to-amber-500"
                                    accent="text-amber-700"
                                    shadow="shadow-amber-200"
                                    isMain
                                    order="order-1 md:order-2"
                                />

                                {/* Rank 3 */}
                                <WinnerCard
                                    entry={season.winners.find(w => w.rank_position === 3)}
                                    rank={3}
                                    color="from-orange-300 to-orange-700"
                                    accent="text-orange-900"
                                    shadow="shadow-orange-200"
                                    order="order-3 md:order-3"
                                />
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}

function WinnerCard({ entry, rank, color, accent, shadow, isMain = false, order }: {
    entry?: HallOfFameEntry,
    rank: number,
    color: string,
    accent: string,
    shadow: string,
    isMain?: boolean,
    order: string
}) {
    if (!entry) return <div className={`${order} hidden md:block`} />;

    const initials = entry.display_name.charAt(0).toUpperCase();

    return (
        <div className={`flex flex-col items-center ${order} transition-all duration-500 hover:-translate-y-2`}>
            {/* Crown / Rank Icon */}
            <div className={`mb-4 ${isMain ? 'animate-bounce' : ''}`}>
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg transform rotate-12`}>
                    <span className="text-white font-black text-xl">#{rank}</span>
                </div>
            </div>

            {/* Profile Avatar Container */}
            <div className={`relative mb-4`}>
                <div className={`w-24 h-24 rounded-[2rem] bg-white p-1.5 shadow-2xl ${shadow}`}>
                    <div className={`w-full h-full rounded-[1.6rem] bg-gray-100 flex items-center justify-center text-3xl font-black text-gray-400 overflow-hidden`}>
                        {initials}
                    </div>
                </div>
                <div className="absolute -bottom-2 -right-2">
                    <RankBadge mmr={entry.mmr} size="sm" />
                </div>
            </div>

            {/* Name & Stats */}
            <div className="text-center space-y-1 mb-6">
                <h3 className="font-black text-gray-900 text-lg leading-tight">{entry.display_name}</h3>
                <div className="flex items-center justify-center gap-2">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-500`}>
                        {entry.skill_level}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-orange-50 text-orange-600`}>
                        MMR {entry.mmr}
                    </span>
                </div>
            </div>

            {/* Podium Base */}
            <div className={`w-full rounded-t-[2.5rem] bg-gradient-to-b ${color} shadow-2xl ${isMain ? 'h-48' : 'h-32'} relative overflow-hidden group`}>
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Season Stats</p>
                    <div className="flex gap-6 mt-3">
                        <div className="text-center">
                            <p className="text-lg font-black">{entry.total_wins}</p>
                            <p className="text-[8px] font-bold uppercase">Wins</p>
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-black">{entry.total_games}</p>
                            <p className="text-[8px] font-bold uppercase">Games</p>
                        </div>
                    </div>
                </div>

                {/* Decorative rank number behind */}
                <span className="absolute -bottom-8 -right-4 text-[120px] font-black text-black/5 select-none italic">
                    {rank}
                </span>
            </div>
        </div>
    );
}
