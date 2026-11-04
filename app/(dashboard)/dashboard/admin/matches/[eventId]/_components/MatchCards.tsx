'use client';

import type { EventPlayer, Match, MatchPlayer, Profile } from '@/src/types';
import { Icon } from '@iconify/react';
import RankBadge from '@/src/components/RankBadge';
import { truncateName } from '@/src/lib/string-utils';

export interface MatchCardsProps {
    matches: Match[];
    sortedMatches: { originalIndex: number; updated_at?: string; id: string; event_id: string; court_number: string; status: "waiting" | "playing" | "finished"; team_a_score: number; team_b_score: number; shuttlecock_numbers: string[]; match_number?: number; created_at: string; match_players?: MatchPlayer[]; }[];
    statusCfg: Record<string, { label: string; badge: string; }>;
    removeShuttlecock: (matchId: string, idx: number, num: string, currentNumbers: string[]) => Promise<void>;
    addShuttlecock: (matchId: string, currentNumbers: string[]) => void;
    updateMatchStatus: (matchId: string, status: "playing" | "finished") => Promise<void>;
    handleDeleteMatch: (matchId: string) => Promise<void>;
    editMatch: (match: Match) => void;
    handleCancelMatch: (matchId: string) => Promise<void>;
    currentUserId: string | null;
    players: EventPlayer[];
}

export default function MatchCards({ matches, sortedMatches, statusCfg, removeShuttlecock, addShuttlecock, updateMatchStatus, handleDeleteMatch, editMatch, handleCancelMatch, currentUserId, players }: MatchCardsProps) {
    return (
        <>
            {matches.length === 0 ? (
                            <div className="card text-center shadow-sm" style={{ padding: '64px 32px' }}>
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm" style={{ background: 'var(--gray-100)' }}>
                                    <Icon icon="solar:sort-horizontal-linear" width={28} style={{ color: 'var(--gray-500)' }} />
                                </div>
                                <h2 className="text-xl font-bold mb-2 tracking-tight" style={{ color: 'var(--gray-900)' }}>ยังไม่มีแมตช์</h2>
                                <p className="text-sm font-medium mb-8" style={{ color: 'var(--gray-500)' }}>กดปุ่ม "สร้างแมตช์ใหม่" เพื่อเริ่มต้นความสนุก</p>
                            </div>
                        ) : sortedMatches.length === 0 ? (
                            <div className="card text-center shadow-sm" style={{ padding: '48px 32px' }}>
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 bg-gray-50 border">
                                    <Icon icon="solar:box-minimalistic-linear" width={24} className="text-gray-400" />
                                </div>
                                <p className="text-sm font-bold text-gray-900">ไม่มีแมตช์ในหมวดหมู่นี้</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {sortedMatches.map((match) => {
                                    const cfg = statusCfg[match.status];
                                    const tA = match.match_players?.filter((mp) => mp.team === 'A') || [];
                                    const tB = match.match_players?.filter((mp) => mp.team === 'B') || [];
                                    const aWon = match.status === 'finished' && match.team_a_score > match.team_b_score;
                                    const bWon = match.status === 'finished' && match.team_b_score > match.team_a_score;
                                    return (
                                        <div key={match.id} className="card shadow-sm" style={{ padding: '20px 24px' }}>
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="badge badge-muted shrink-0">#{match.match_number || match.originalIndex}</span>
                                                    <span className={`badge shrink-0 ${cfg.badge}`}>{cfg.label}</span>
                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded shadow-sm bg-gray-900 text-white shrink-0">
                                                        คอร์ท {match.court_number}
                                                    </span>
                                                    {match.shuttlecock_numbers && match.shuttlecock_numbers.length > 0 && (
                                                        <div className="flex items-center gap-1.5">
                                                            {match.shuttlecock_numbers.map((num, idx) => {
                                                                // ลบได้เฉพาะแมตช์ที่กำลังตี/จบแล้ว และต้องเหลือลูกเบสอย่างน้อย 1 ลูก
                                                                const canDelete = (match.status === 'playing' || match.status === 'finished') && (match.shuttlecock_numbers?.length || 0) > 1;
                                                                return (
                                                                    <span key={idx} className="relative inline-flex items-center shrink-0">
                                                                        <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-orange-100 text-orange-600 border border-orange-200">
                                                                            {num}
                                                                        </span>
                                                                        {canDelete && (
                                                                            <button
                                                                                onClick={() => removeShuttlecock(match.id, idx, num, match.shuttlecock_numbers || [])}
                                                                                className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-sm border border-white transition-colors"
                                                                                title={`ลบลูกแบดหมายเลข ${num}`}
                                                                            >
                                                                                <Icon icon="solar:close-bold" width={8} />
                                                                            </button>
                                                                        )}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    {/* Add Shuttlecock Button — รองรับทั้งแมตช์ที่กำลังตีและจบแล้ว
                                                        เพื่อเติมหมายเลขลูกที่ตกหล่นได้โดยไม่ต้องย้อนสถานะ (ซึ่งจะรีเซ็ตสกอร์) */}
                                                    {(match.status === 'playing' || match.status === 'finished') && (
                                                        <button onClick={() => addShuttlecock(match.id, match.shuttlecock_numbers || [])} className="w-6 h-6 rounded flex items-center justify-center bg-gray-50 border border-gray-200 text-gray-500 hover:text-orange-500 hover:border-orange-200 hover:bg-orange-50 transition-colors shrink-0" title={match.shuttlecock_numbers && match.shuttlecock_numbers.length > 0 ? 'เบิกลูกแบดเพิ่ม' : 'เพิ่มหมายเลขลูกที่ตกหล่น'}>
                                                            <Icon icon="solar:add-circle-linear" width={16} />
                                                        </button>
                                                    )}
                                                </div>
                                                    <div className="flex gap-1.5">
                                                        {match.status === 'finished' && (
                                                            <>
                                                                <button onClick={() => updateMatchStatus(match.id, 'playing')} className="btn btn-sm" style={{ background: 'rgba(59,130,246,0.06)', color: '#3b82f6' }} title="ย้ายกลับไปแก้ไขผลแข่ง">
                                                                    <Icon icon="solar:refresh-linear" width={14} /> เล่นต่อ/แก้ไข
                                                                </button>
                                                                <button onClick={() => handleDeleteMatch(match.id)} className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.06)', color: 'var(--error)' }} title="ลบแมตช์ที่จบแล้วนี้">
                                                                    <Icon icon="solar:trash-bin-trash-bold" width={14} /> ลบ
                                                                </button>
                                                            </>
                                                        )}
                                                        {match.status !== 'finished' && (
                                                            <>
                                                                <button onClick={() => editMatch(match)} className="btn btn-sm" style={{ background: 'rgba(59,130,246,0.06)', color: '#3b82f6' }}>
                                                                    <Icon icon="solar:pen-linear" width={14} /> แก้ไข
                                                                </button>
                                                                {match.status === 'waiting' && (
                                                                    <div className="flex gap-1.5">
                                                                        <button onClick={() => updateMatchStatus(match.id, 'playing')} className="btn btn-sm" style={{ background: 'rgba(22,163,74,0.06)', color: 'var(--success)' }}>
                                                                            <Icon icon="solar:play-linear" width={14} /> เริ่ม
                                                                        </button>
                                                                        <button onClick={() => handleDeleteMatch(match.id)} className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.06)', color: 'var(--error)' }} title="ลบแมตช์ที่รอคิวนี้">
                                                                            <Icon icon="solar:trash-bin-trash-bold" width={14} /> ลบ
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {match.status === 'playing' && (
                                                                    <div className="flex gap-1.5">
                                                                        <button onClick={() => handleCancelMatch(match.id)} className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.06)', color: 'var(--error)' }}>
                                                                            <Icon icon="solar:trash-bin-trash-bold" width={14} /> ยกเลิก
                                                                        </button>
                                                                        <button onClick={() => updateMatchStatus(match.id, 'finished')} className="btn btn-sm" style={{ background: 'rgba(249,115,22,0.06)', color: 'var(--orange-500)' }}>
                                                                            <Icon icon="solar:check-circle-linear" width={14} /> จบ
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 p-3 rounded-xl min-w-0" style={{
                                                    background: aWon ? 'rgba(249,115,22,0.06)' : 'rgba(249,115,22,0.03)',
                                                    border: `1.5px solid ${aWon ? 'var(--orange-500)' : 'rgba(249,115,22,0.1)'}`,
                                                }}>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <p className="text-xs font-semibold" style={{ color: 'var(--orange-500)' }}>ทีม A</p>
                                                        {aWon && <Icon icon="solar:cup-star-bold" width={14} style={{ color: 'var(--orange-500)' }} />}
                                                        {!aWon && !bWon && match.status === 'finished' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100">เสมอ</span>}
                                                    </div>
                                                    {tA.map((mp) => {
                                                        const isMe = mp.user_id === currentUserId;
                                                        const ep = players.find(p => p.user_id === mp.user_id);
                                                        const isPaid = ep?.payment_status === 'paid';
                                                        return (
                                                            <div key={mp.id} className="py-2 border-b border-orange-100 last:border-0 min-w-0">
                                                                <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                                                                    <p className="text-sm font-bold truncate" style={{
                                                                        color: isMe ? 'var(--orange-600)' : 'var(--gray-900)',
                                                                    }}>
                                                                        {truncateName((mp.profiles as unknown as Profile)?.display_name, 14)} {isMe && '(คุณ)'}
                                                                        {(mp.profiles as unknown as Profile)?.is_guest && <span className="text-[10px] font-bold text-orange-500 mx-1 bg-orange-50 px-1 py-0.5 rounded">ขาจร</span>}
                                                                        (#{match.match_number || match.originalIndex})
                                                                    </p>
                                                                    {isPaid && (
                                                                        <span title="จ่ายแล้ว" className="flex shrink-0">
                                                                            <Icon icon="solar:check-circle-bold" width={14} className="text-emerald-500" />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <RankBadge mmr={(mp.profiles as unknown as Profile)?.mmr ?? 1000} size="sm" showName={false} showMMR={false} />
                                                            </div>
                                                        );
                                                    })}
                                                    {Array.from({ length: Math.max(0, 2 - tA.length) }).map((_, idx) => (
                                                        <div key={`empty-A-${idx}`} className="py-2 border-b border-orange-100 last:border-0 min-w-0 flex items-center">
                                                            <p className="text-sm font-bold truncate italic text-gray-400 opacity-70">
                                                                (ผู้เล่นขาจร)
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="shrink-0 text-center px-1.5 py-0.5 rounded-full bg-slate-50 border border-slate-100">
                                                    {match.status === 'finished' ? (
                                                        <p className="text-lg font-bold" style={{ color: 'var(--gray-900)' }}>{match.team_a_score} - {match.team_b_score}</p>
                                                    ) : (
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[9px] font-black tracking-tighter text-indigo-300 uppercase leading-none mb-0.5 italic">VS</span>
                                                            <div className="text-[14px] font-black text-indigo-600 leading-none">
                                                                {match.court_number}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 p-3 rounded-xl min-w-0" style={{
                                                    background: bWon ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.03)',
                                                    border: `1.5px solid ${bWon ? '#3b82f6' : 'rgba(59,130,246,0.1)'}`,
                                                }}>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <p className="text-xs font-semibold" style={{ color: '#3b82f6' }}>ทีม B</p>
                                                        {bWon && <Icon icon="solar:cup-star-bold" width={14} style={{ color: '#3b82f6' }} />}
                                                        {!aWon && !bWon && match.status === 'finished' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100">เสมอ</span>}
                                                    </div>
                                                    {tB.map((mp) => {
                                                        const isMe = mp.user_id === currentUserId;
                                                        const ep = players.find(p => p.user_id === mp.user_id);
                                                        const isPaid = ep?.payment_status === 'paid';
                                                        return (
                                                            <div key={mp.id} className="py-2 border-b border-blue-100 last:border-0 min-w-0">
                                                                <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                                                                    <p className="text-sm font-bold truncate" style={{
                                                                        color: isMe ? '#2563eb' : 'var(--gray-900)',
                                                                    }}>
                                                                        {truncateName((mp.profiles as unknown as Profile)?.display_name, 14)} {isMe && '(คุณ)'}
                                                                        {(mp.profiles as unknown as Profile)?.is_guest && <span className="text-[10px] font-bold text-blue-500 mx-1 bg-blue-50 px-1 py-0.5 rounded">ขาจร</span>}
                                                                        (#{match.match_number || match.originalIndex})
                                                                    </p>
                                                                    {isPaid && (
                                                                        <span title="จ่ายแล้ว" className="flex shrink-0">
                                                                            <Icon icon="solar:check-circle-bold" width={14} className="text-emerald-500" />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <RankBadge mmr={(mp.profiles as unknown as Profile)?.mmr ?? 1000} size="sm" showName={false} showMMR={false} />
                                                            </div>
                                                        );
                                                    })}
                                                    {Array.from({ length: Math.max(0, 2 - tB.length) }).map((_, idx) => (
                                                        <div key={`empty-B-${idx}`} className="py-2 border-b border-blue-100 last:border-0 min-w-0 flex items-center">
                                                            <p className="text-sm font-bold truncate italic text-gray-400 opacity-70">
                                                                (ผู้เล่นขาจร)
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
        </>
    );
}
