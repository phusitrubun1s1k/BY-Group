'use client';

import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { EventPlayer, Profile } from '@/src/types';
import { Icon } from '@iconify/react';
import RankBadge from '@/src/components/RankBadge';
import { truncateName } from '@/src/lib/string-utils';
import { getSkillColor } from './shared';

export interface PlayerSelectionSidebarProps {
    sidebarTeam: "A" | "B" | null;
    setSidebarTeam: Dispatch<SetStateAction<"A" | "B" | null>>;
    setSearchQuery: Dispatch<SetStateAction<string>>;
    teamA: string[];
    teamB: string[];
    searchQuery: string;
    players: EventPlayer[];
    playerStats: Record<string, { total: number; playing: boolean; matchNums: number[]; }>;
    togglePlayer: (userId: string, team: "A" | "B") => void;
}

export default function PlayerSelectionSidebar({ sidebarTeam, setSidebarTeam, setSearchQuery, teamA, teamB, searchQuery, players, playerStats, togglePlayer }: PlayerSelectionSidebarProps) {
    return (
        <>
            {sidebarTeam && typeof document !== 'undefined' && createPortal(
                            <>
                                <style>{`
                        @keyframes sidebarSlideIn {
                            from { transform: translateX(100%); }
                            to { transform: translateX(0); }
                        }
                        @keyframes sidebarFadeIn {
                            from { opacity: 0; }
                            to { opacity: 1; }
                        }
                    `}</style>
                                <div className="fixed inset-0 z-[100] flex justify-end" style={{ animation: 'sidebarFadeIn 0.2s ease-out' }}>
                                    {/* Backdrop */}
                                    <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                                        onClick={() => { setSidebarTeam(null); setSearchQuery(''); }} />
                                    {/* Right Panel */}
                                    <div className="relative h-full w-full max-w-md flex flex-col bg-white shadow-2xl"
                                        style={{ animation: 'sidebarSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
                                    >
                                        {/* Sidebar Header */}
                                        <div className="flex flex-col gap-3 px-5 py-4 shrink-0 border-b border-gray-100">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{
                                                        background: sidebarTeam === 'A' ? 'rgba(249,115,22,0.1)' : 'rgba(59,130,246,0.1)',
                                                    }}>
                                                        <Icon icon="solar:users-group-rounded-bold" width={22} style={{
                                                            color: sidebarTeam === 'A' ? 'var(--orange-500)' : '#3b82f6',
                                                        }} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-base font-bold text-gray-900">เลือกผู้เล่น — ทีม {sidebarTeam}</h3>
                                                        <p className="text-xs text-gray-500 font-medium">
                                                            เลือกแล้ว {(sidebarTeam === 'A' ? teamA : teamB).length}/2 คน
                                                        </p>
                                                    </div>
                                                </div>
                                                <button onClick={() => { setSidebarTeam(null); setSearchQuery(''); }} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                                                    <Icon icon="solar:close-circle-linear" width={24} />
                                                </button>
                                            </div>

                                            {/* Search Box */}
                                            <div className="relative">
                                                <Icon icon="solar:magnifer-linear" width={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="text"
                                                    placeholder="ค้นหาชื่อผู้เล่น..."
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                                                    style={{ '--tw-ring-color': sidebarTeam === 'A' ? 'var(--orange-500)' : '#3b82f6' } as React.CSSProperties}
                                                    autoFocus
                                                />
                                                {searchQuery && (
                                                    <button
                                                        onClick={() => setSearchQuery('')}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                                    >
                                                        <Icon icon="solar:close-circle-bold" width={16} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Team Toggle */}
                                            <div className="flex bg-gray-100 p-1 rounded-xl">
                                                <button
                                                    onClick={() => setSidebarTeam('A')}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${sidebarTeam === 'A' ? 'bg-white shadow-sm text-orange-500' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    ทีม A
                                                </button>
                                                <button
                                                    onClick={() => setSidebarTeam('B')}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${sidebarTeam === 'B' ? 'bg-white shadow-sm text-blue-500' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    ทีม B
                                                </button>
                                            </div>
                                        </div>

                                        {/* Player List */}
                                        <div className="flex-1 overflow-y-auto px-4 py-3 bg-gray-50/50">
                                            <div className="space-y-4">
                                                {/* Regular Players Section */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">สมาชิก ({players.filter(p => p.is_checked_in && !p.is_substitute).length})</p>
                                                    <div className="space-y-2">
                                                        {players
                                                            .filter(ep => {
                                                                const prof = ep.profiles as unknown as Profile;
                                                                const matchesSearch = !searchQuery || prof.display_name.toLowerCase().includes(searchQuery.toLowerCase());
                                                                return ep.is_checked_in && !ep.is_substitute && !prof?.is_guest && matchesSearch;
                                                            })
                                                            .sort((a, b) => (playerStats[a.user_id]?.total || 0) - (playerStats[b.user_id]?.total || 0))
                                                            .map((ep) => {
                                                                const prof = ep.profiles as unknown as Profile;
                                                                const team = sidebarTeam;
                                                                const selected = team === 'A' ? teamA : teamB;
                                                                const clr = team === 'A' ? 'var(--orange-500)' : '#3b82f6';
                                                                const inThis = selected.includes(ep.user_id);
                                                                const inOther = (team === 'A' ? teamB : teamA).includes(ep.user_id);
                                                                const pstat = playerStats[ep.user_id];
                                                                const isPaid = ep.payment_status === 'paid';
                                                                const isDisabled = isPaid && !inThis;

                                                                const skillColor = getSkillColor(prof.skill_level);

                                                                return (
                                                                    <button key={ep.user_id} onClick={() => !isDisabled && togglePlayer(ep.user_id, team)}
                                                                        className="w-full flex items-center justify-between p-3.5 rounded-xl border-2 text-left text-sm transition-all"
                                                                        disabled={isDisabled}
                                                                        style={{
                                                                            background: isDisabled ? 'white' : inThis ? (team === 'A' ? 'rgba(249,115,22,0.04)' : 'rgba(59,130,246,0.04)') : 'white',
                                                                            borderColor: inThis ? clr : 'transparent',
                                                                            boxShadow: inThis ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                                                                            opacity: isDisabled ? 0.6 : inOther ? 0.5 : 1,
                                                                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                                        }}>
                                                                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-sm"
                                                                                style={{
                                                                                    background: inThis ? clr : 'var(--gray-900)',
                                                                                    color: 'var(--white)'
                                                                                }}>
                                                                                {inThis ? <Icon icon="solar:check-read-linear" width={20} /> : prof?.display_name?.charAt(0)?.toUpperCase()}
                                                                            </div>
                                                                            <div className="min-w-0 pr-2">
                                                                                <p className="font-bold text-gray-900 truncate tracking-tight leading-tight mb-1">
                                                                                    {truncateName(prof?.display_name, 20)}
                                                                                </p>
                                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                                    <RankBadge mmr={prof?.mmr ?? 1000} size="sm" showName={false} showMMR={false} />
                                                                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                        มือ {prof?.skill_level || 'N/A'}
                                                                                    </span>
                                                                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                        {pstat?.total || 0} เกม
                                                                                    </span>
                                                                                    {inOther && <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded">อยู่ทีม {team === 'A' ? 'B' : 'A'}</span>}
                                                                                    {pstat?.playing && (
                                                                                        <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                                                                                            ติดคิว
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Right Side */}
                                                                        {isPaid && !inThis ? (
                                                                            <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full shrink-0 shadow-sm border border-green-100" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                                                                <Icon icon="solar:check-circle-bold" width={14} />
                                                                                จ่ายแล้ว
                                                                            </span>
                                                                        ) : inThis ? (
                                                                            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: clr, color: 'white' }}>
                                                                                <Icon icon="solar:check-bold" width={14} />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                    </div>
                                                </div>

                                                {/* Substitute Players Section */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest px-2 mb-2">ตัวสำรอง ({players.filter(p => p.is_checked_in && p.is_substitute).length})</p>
                                                    <div className="space-y-2">
                                                        {players
                                                            .filter(ep => {
                                                                const prof = ep.profiles as unknown as Profile;
                                                                const matchesSearch = !searchQuery || prof.display_name.toLowerCase().includes(searchQuery.toLowerCase());
                                                                return ep.is_checked_in && ep.is_substitute && !prof?.is_guest && matchesSearch;
                                                            })
                                                            .sort((a, b) => (playerStats[a.user_id]?.total || 0) - (playerStats[b.user_id]?.total || 0))
                                                            .map((ep) => {
                                                                const prof = ep.profiles as unknown as Profile;
                                                                const team = sidebarTeam;
                                                                const selected = team === 'A' ? teamA : teamB;
                                                                const clr = team === 'A' ? 'var(--orange-500)' : '#3b82f6';
                                                                const inThis = selected.includes(ep.user_id);
                                                                const inOther = (team === 'A' ? teamB : teamA).includes(ep.user_id);
                                                                const pstat = playerStats[ep.user_id];
                                                                const isPaid = ep.payment_status === 'paid';
                                                                const isDisabled = isPaid && !inThis;

                                                                const skillColor = getSkillColor(prof.skill_level);

                                                                return (
                                                                    <button key={ep.user_id} onClick={() => !isDisabled && togglePlayer(ep.user_id, team)}
                                                                        className="w-full flex items-center justify-between p-3.5 rounded-xl border-2 text-left text-sm transition-all"
                                                                        disabled={isDisabled}
                                                                        style={{
                                                                            background: isDisabled ? 'white' : inThis ? (team === 'A' ? 'rgba(249,115,22,0.04)' : 'rgba(59,130,246,0.04)') : 'white',
                                                                            borderColor: inThis ? clr : 'transparent',
                                                                            boxShadow: inThis ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                                                                            opacity: isDisabled ? 0.6 : inOther ? 0.5 : 1,
                                                                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                                        }}>
                                                                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-sm"
                                                                                style={{
                                                                                    background: inThis ? clr : 'rgba(59,130,246,0.1)',
                                                                                    color: inThis ? 'var(--white)' : '#3b82f6'
                                                                                }}>
                                                                                {inThis ? <Icon icon="solar:check-read-linear" width={20} /> : prof?.display_name?.charAt(0)?.toUpperCase()}
                                                                            </div>
                                                                            <div className="min-w-0 pr-2">
                                                                                <p className="font-bold text-gray-900 truncate tracking-tight leading-tight mb-1">
                                                                                    {truncateName(prof?.display_name, 20)}
                                                                                </p>
                                                                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                                                    <RankBadge mmr={prof?.mmr ?? 1000} size="sm" showName={false} showMMR={false} />
                                                                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                        มือ {prof?.skill_level || 'N/A'}
                                                                                    </span>
                                                                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                        {pstat?.total || 0} เกม
                                                                                    </span>
                                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 border border-blue-100">สำรอง</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Right Side */}
                                                                        {isPaid && !inThis ? (
                                                                            <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full shrink-0 shadow-sm border border-green-100" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                                                                <Icon icon="solar:check-circle-bold" width={14} />
                                                                                จ่ายแล้ว
                                                                            </span>
                                                                        ) : inThis ? (
                                                                            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: clr, color: 'white' }}>
                                                                                <Icon icon="solar:check-bold" width={14} />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                    </div>
                                                </div>

                                                {/* Guest Players Section */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest px-2 mb-2">ขาจร ({players.filter(p => p.is_checked_in && (p.profiles as unknown as Profile)?.is_guest).length})</p>
                                                    <div className="space-y-2">
                                                        {players
                                                            .filter(ep => {
                                                                const prof = ep.profiles as unknown as Profile;
                                                                const matchesSearch = !searchQuery || prof.display_name.toLowerCase().includes(searchQuery.toLowerCase());
                                                                return ep.is_checked_in && prof?.is_guest && matchesSearch;
                                                            })
                                                            .sort((a, b) => (playerStats[a.user_id]?.total || 0) - (playerStats[b.user_id]?.total || 0))
                                                            .map((ep) => {
                                                                const prof = ep.profiles as unknown as Profile;
                                                                const team = sidebarTeam;
                                                                const selected = team === 'A' ? teamA : teamB;
                                                                const clr = team === 'A' ? 'var(--orange-500)' : '#3b82f6';
                                                                const inThis = selected.includes(ep.user_id);
                                                                const inOther = (team === 'A' ? teamB : teamA).includes(ep.user_id);
                                                                const pstat = playerStats[ep.user_id];
                                                                const isPaid = ep.payment_status === 'paid';
                                                                const isDisabled = isPaid && !inThis;

                                                                return (
                                                                    <button key={ep.user_id} onClick={() => !isDisabled && togglePlayer(ep.user_id, team)}
                                                                        className="w-full flex items-center justify-between p-3.5 rounded-xl border-2 text-left text-sm transition-all"
                                                                        disabled={isDisabled}
                                                                        style={{
                                                                            background: isDisabled ? 'white' : inThis ? (team === 'A' ? 'rgba(249,115,22,0.04)' : 'rgba(59,130,246,0.04)') : 'white',
                                                                            borderColor: inThis ? clr : 'transparent',
                                                                            boxShadow: inThis ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                                                                            opacity: isDisabled ? 0.6 : inOther ? 0.5 : 1,
                                                                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                                        }}>
                                                                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-sm"
                                                                                style={{
                                                                                    background: inThis ? clr : 'var(--purple-600)',
                                                                                    color: 'var(--white)'
                                                                                }}>
                                                                                {inThis ? <Icon icon="solar:check-read-linear" width={20} /> : <Icon icon="solar:ghost-bold" width={20} />}
                                                                            </div>
                                                                            <div className="min-w-0 pr-2">
                                                                                <p className="font-bold text-gray-900 truncate tracking-tight leading-tight mb-1">
                                                                                    {truncateName(prof?.display_name, 20)}
                                                                                    {prof?.is_guest && <span className="text-[10px] font-bold text-orange-500 ml-1 bg-orange-50 px-1 py-0.5 rounded">ขาจร</span>}
                                                                                </p>
                                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                                    <RankBadge mmr={prof?.mmr ?? 1000} size="sm" showName={false} showMMR={false} />
                                                                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                        มือ {prof?.skill_level || 'N/A'}
                                                                                    </span>
                                                                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                        {pstat?.total || 0} เกม
                                                                                    </span>
                                                                                    {inOther && <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded">อยู่ทีม {team === 'A' ? 'B' : 'A'}</span>}
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Right Side */}
                                                                        {isPaid && !inThis ? (
                                                                            <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full shrink-0 shadow-sm border border-green-100" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                                                                <Icon icon="solar:check-circle-bold" width={14} />
                                                                                จ่ายแล้ว
                                                                            </span>
                                                                        ) : inThis ? (
                                                                            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: clr, color: 'white' }}>
                                                                                <Icon icon="solar:check-bold" width={14} />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                    </div>
                                                </div>

                                                {players.filter(ep => {
                                                    const prof = ep.profiles as unknown as Profile;
                                                    return ep.is_checked_in && (!searchQuery || prof.display_name.toLowerCase().includes(searchQuery.toLowerCase()));
                                                }).length === 0 && (
                                                        <div className="text-center py-10">
                                                            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                                                <Icon icon="solar:user-cross-linear" width={24} className="text-gray-400" />
                                                            </div>
                                                            <p className="text-sm font-medium text-gray-900">ไม่พบผู้เล่น</p>
                                                            <p className="text-xs text-gray-500 mt-1">ลองค้นหาด้วยชื่ออื่น</p>
                                                        </div>
                                                    )}
                                            </div>
                                        </div>

                                        {/* Sidebar Footer */}
                                        <div className="px-5 py-4 shrink-0 bg-white border-t border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                                            <button
                                                onClick={() => { setSidebarTeam(null); setSearchQuery(''); }}
                                                className="btn w-full shadow-sm text-white"
                                                style={{ background: sidebarTeam === 'A' ? 'var(--orange-500)' : '#3b82f6', border: 'none' }}
                                            >
                                                <Icon icon="solar:check-circle-bold" width={18} />
                                                เสร็จสิ้น ({(sidebarTeam === 'A' ? teamA : teamB).length}/2)
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>,
                            document.body
                        )}
        </>
    );
}
