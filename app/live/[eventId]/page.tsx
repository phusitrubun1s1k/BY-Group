'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import type { Event, EventPlayer, Match, Profile } from '@/src/types';
import { Icon } from '@iconify/react';
import { useParams } from 'next/navigation';
import { truncateName } from '@/src/lib/string-utils';


export default function PublicLiveBoardPage() {
    const params = useParams();
    const eventId = params.eventId as string;
    const [event, setEvent] = useState<Event | null>(null);
    const [players, setPlayers] = useState<EventPlayer[]>([]);
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async (id: string) => {
        const supabase = createClient();
        const [eventRes, playersRes, matchesRes] = await Promise.all([
            supabase.from('events').select('*').eq('id', id).single(),
            supabase.from('event_players').select('*, profiles(*)').eq('event_id', id).order('created_at'),
            supabase.from('matches').select('*, match_players(*, profiles(*))').eq('event_id', id).order('created_at', { ascending: true }),
        ]);

        if (eventRes.data) setEvent(eventRes.data as Event);
        if (playersRes.data) setPlayers(playersRes.data as EventPlayer[]);
        if (matchesRes.data) setMatches(matchesRes.data as Match[]);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (eventId) {
            loadData(eventId);

            const supabase = createClient();
            const matchChannel = supabase.channel(`public-matches-${eventId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `event_id=eq.${eventId}` }, () => loadData(eventId))
                .subscribe();

            const playerChannel = supabase.channel(`public-players-${eventId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'event_players', filter: `event_id=eq.${eventId}` }, () => loadData(eventId))
                .subscribe();

            return () => {
                supabase.removeChannel(matchChannel);
                supabase.removeChannel(playerChannel);
            };
        }
    }, [eventId, loadData]);

    const playerStats = useMemo(() => {
        const stats: Record<string, { total: number, matchNums: number[] }> = {};
        players.forEach(p => { stats[p.user_id] = { total: 0, matchNums: [] }; });
        matches.forEach((m, idx) => {
            const mNum = m.match_number || (idx + 1);
            m.match_players?.forEach(mp => {
                if (stats[mp.user_id]) {
                    if (m.status === 'playing' || m.status === 'finished') {
                        stats[mp.user_id].total++;
                        stats[mp.user_id].matchNums.push(mNum);
                    }
                }
            });
        });
        return stats;
    }, [players, matches]);

    const statusCfg: any = {
        waiting: { label: 'รอกดเริ่ม', badge: 'badge-muted' },
        playing: { label: 'กำลังแข่ง', badge: 'badge-warning' },
        finished: { label: 'จบแล้ว', badge: 'badge-success' },
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-center">
                <div className="space-y-4">
                    <div className="spinner mx-auto" />
                    <p className="text-sm font-bold text-gray-500 animate-pulse">กำลังโหลดบอร์ดสด...</p>
                </div>
            </div>
        );
    }

    if (!event) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-center">
                <div className="card max-w-sm p-8 shadow-xl">
                    <Icon icon="solar:shield-warning-bold-duotone" width={64} className="mx-auto text-orange-400 mb-4" />
                    <h1 className="text-2xl font-black text-gray-900 mb-2">ไม่พบงานนี้</h1>
                    <p className="text-sm font-medium text-gray-500">ก๊วนที่คุณพยายามเข้าถึงอาจถูกลบหรือไม่มีอยู่จริง</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white shadow-sm overflow-hidden border border-gray-100">
                            <img src="/images/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight text-gray-900 leading-tight">ก๊วนวันที่ {new Date(event.event_date).toLocaleDateString('th-TH')}</h1>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="flex items-center gap-1 text-[10px] font-black text-green-600 uppercase tracking-widest">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    Live Board
                                </span>
                                <span className="text-[10px] font-bold text-gray-400">•</span>
                                <span className="text-[10px] font-bold text-gray-400">{players.filter(p => p.is_checked_in).length} ผู้เล่นมาแล้ว</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
                {/* Active Matches */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-2 h-5 rounded-full bg-orange-500" />
                        <h2 className="text-sm font-black uppercase tracking-wider text-gray-900">คิวสนาม</h2>
                    </div>

                    {matches.length === 0 ? (
                        <div className="card text-center py-12 bg-white/50 border-dashed">
                            <Icon icon="solar:sort-horizontal-linear" width={40} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-sm font-bold text-gray-400">ยังไม่มีการเพิ่มแมตช์</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-6">
                            {matches.filter(m => m.status !== 'finished').map((match, i) => (
                                <MatchCard key={match.id} match={match} index={i} statusCfg={statusCfg} playerStats={playerStats} />
                            ))}
                            {/* If no active matches, show a placeholder if we have finished matches */}
                            {matches.filter(m => m.status !== 'finished').length === 0 && matches.length > 0 && (
                                <div className="col-span-full card text-center py-10 bg-white/50 border-dashed">
                                    <Icon icon="solar:sleeping-circle-linear" width={40} className="mx-auto text-gray-300 mb-3" />
                                    <p className="text-sm font-bold text-gray-400">แมตช์ที่จัดไว้จบหมดแล้ว</p>
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* Finished Matches (Simplified) */}
                {matches.filter(m => m.status === 'finished').length > 0 && (
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-2 h-5 rounded-full bg-gray-400" />
                            <h2 className="text-sm font-black uppercase tracking-wider text-gray-400">จบไปแล้ว</h2>
                        </div>
                        <div className="space-y-3 opacity-80">
                            {matches.filter(m => m.status === 'finished').reverse().slice(0, 10).map((match, i) => (
                                <MatchCard key={match.id} match={match} statusCfg={statusCfg} simplified playerStats={playerStats} />
                            ))}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}

function MatchCard({ match, index, statusCfg, simplified = false, playerStats }: { match: Match, index?: number, statusCfg: any, simplified?: boolean, playerStats: any }) {
    const tA = match.match_players?.filter(mp => mp.team === 'A') || [];
    const tB = match.match_players?.filter(mp => mp.team === 'B') || [];
    const aWon = match.status === 'finished' && match.team_a_score > match.team_b_score;
    const bWon = match.status === 'finished' && match.team_b_score > match.team_a_score;

    if (simplified) {
        return (
            <div className="card p-3 shadow-sm flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black p-1 rounded bg-gray-100 text-gray-500">คอร์ท {match.court_number}</span>
                        <div className="flex items-center gap-1 min-w-0 truncate">
                            <span className={`text-[11px] font-bold truncate ${aWon ? 'text-orange-600' : 'text-gray-600'}`}>
                                {tA.map(mp => {
                                    const name = truncateName((mp.profiles as unknown as Profile).display_name, 12);
                                    const stats = playerStats[mp.user_id];
                                    const suffix = stats?.matchNums.length > 0 ? ` (#${stats.matchNums.join(', #')})` : '';
                                    return name + suffix;
                                }).join(' + ')}
                            </span>
                            <span className="text-[9px] font-bold text-gray-300 italic">vs</span>
                            <span className={`text-[11px] font-bold truncate ${bWon ? 'text-blue-600' : 'text-gray-600'}`}>
                                {tB.map(mp => {
                                    const name = truncateName((mp.profiles as unknown as Profile).display_name, 12);
                                    const stats = playerStats[mp.user_id];
                                    const suffix = stats?.matchNums.length > 0 ? ` (#${stats.matchNums.join(', #')})` : '';
                                    return name + suffix;
                                }).join(' + ')}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                    <div className="px-2 py-0.5 rounded-lg bg-gray-50 border border-gray-100 font-bold text-xs text-gray-700">
                        {match.team_a_score} - {match.team_b_score}
                    </div>
                </div>
            </div>
        );
    }

    const cfg = statusCfg[match.status];

    return (
        <div className={`card overflow-hidden shadow-md border-0 transition-transform ${match.status === 'playing' ? 'ring-2 ring-orange-500 scale-[1.02]' : ''}`}>
            {match.status === 'playing' && (
                <div className="bg-orange-500 text-white text-[9px] font-black uppercase tracking-[0.2em] py-1 text-center animate-pulse">
                    กำลังแข่ง
                </div>
            )}
            <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black bg-gray-900 text-white px-2 py-0.5 rounded shadow-sm">คอร์ท {match.court_number}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cfg.badge}`}>
                            {cfg.label}
                        </span>
                    </div>
                    {match.shuttlecock_numbers && match.shuttlecock_numbers.length > 0 && (
                        <div className="flex items-center gap-1">
                            {match.shuttlecock_numbers.map((num, idx) => (
                                <span key={idx} className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-100">
                                    {num}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    {/* Team A */}
                    <div className={`space-y-1 ${aWon ? 'bg-orange-50 p-2 rounded-xl border border-orange-100' : ''}`}>
                        {tA.map((mp, idx) => {
                            const prof = mp.profiles as unknown as Profile;
                            return (
                                <div key={idx} className="flex flex-col">
                                    <span className={`text-base font-black truncate ${aWon ? 'text-orange-900' : 'text-gray-900'}`}>
                                        {truncateName(prof.display_name, 20)}
                                        {playerStats[mp.user_id]?.matchNums.length > 0 && (
                                            <span className="text-[11px] font-bold text-orange-500 ml-1.5 opacity-80">
                                                (#{playerStats[mp.user_id].matchNums.join(', #')})
                                            </span>
                                        )}
                                    </span>
                                    {prof.skill_level && (
                                        <span className={`text-[9px] font-bold ${aWon ? 'text-orange-500' : 'text-gray-400'}`}>{prof.skill_level}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Result / VS */}
                    <div className="text-center px-2 py-1 bg-gray-50 rounded-full border border-gray-100">
                        {match.status === 'finished' ? (
                            <span className="text-sm font-black text-gray-900">{match.team_a_score}-{match.team_b_score}</span>
                        ) : (
                            <span className="text-[10px] font-black text-gray-300 italic">VS</span>
                        )}
                    </div>

                    {/* Team B */}
                    <div className={`space-y-1 text-right ${bWon ? 'bg-blue-50 p-2 rounded-xl border border-blue-100' : ''}`}>
                        {tB.map((mp, idx) => {
                            const prof = mp.profiles as unknown as Profile;
                            return (
                                <div key={idx} className="flex flex-col items-end">
                                    <span className={`text-base font-black truncate ${bWon ? 'text-blue-900' : 'text-gray-900'}`}>
                                        {playerStats[mp.user_id]?.matchNums.length > 0 && (
                                            <span className="text-[11px] font-bold text-blue-500 mr-1.5 opacity-80">
                                                (#{playerStats[mp.user_id].matchNums.join(', #')})
                                            </span>
                                        )}
                                        {truncateName(prof.display_name, 20)}
                                    </span>
                                    {prof.skill_level && (
                                        <span className={`text-[10px] font-bold ${bWon ? 'text-blue-500' : 'text-gray-400'}`}>{prof.skill_level}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
