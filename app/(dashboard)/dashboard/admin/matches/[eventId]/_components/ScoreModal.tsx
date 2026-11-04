'use client';

import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { Match, Profile } from '@/src/types';
import { Icon } from '@iconify/react';

export interface ScoreModalProps {
    scoreMatch: Match | null;
    setScoreMatch: Dispatch<SetStateAction<Match | null>>;
    winner: "A" | "B" | "Draw" | "None" | null;
    setWinner: Dispatch<SetStateAction<"A" | "B" | "Draw" | "None" | null>>;
    scoreTeamPlayers: (team: "A" | "B") => Profile[];
    submitScore: () => Promise<void>;
}

export default function ScoreModal({ scoreMatch, setScoreMatch, winner, setWinner, scoreTeamPlayers, submitScore }: ScoreModalProps) {
    return (
        <>
            {scoreMatch && typeof document !== 'undefined' && createPortal(
                            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={() => setScoreMatch(null)}>
                                <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" />
                                <div className="card w-full max-w-xl max-h-[92vh] overflow-y-auto animate-in shadow-2xl relative z-10" style={{ padding: '32px 36px' }} onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-start justify-between gap-4 mb-7 p-4 rounded-2xl bg-orange-50 border border-orange-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-sm shrink-0">
                                                <Icon icon="solar:cup-star-bold-duotone" width={27} />
                                            </div>
                                            <div>
                                                <h3 className="font-black text-xl text-gray-950">บันทึกผลการแข่งขัน</h3>
                                                <p className="text-xs font-semibold text-orange-700 mt-1">แมตช์ #{scoreMatch.match_number || '-'} · คอร์ท {scoreMatch.court_number || '-'}</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setScoreMatch(null)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white text-gray-500 hover:text-orange-600 hover:bg-orange-100 transition-colors shadow-sm shrink-0" aria-label="ปิดหน้าต่างบันทึกผล">
                                            <Icon icon="solar:close-circle-linear" width={20} />
                                        </button>
                                    </div>

                                    {/* Result Selector */}
                                    <div className="flex flex-col gap-4 mb-8">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-black text-gray-900">เลือกผลการแข่งขัน</p>
                                                <p className="text-xs text-gray-500 mt-0.5">ตรวจสอบรายชื่อให้ถูกต้องก่อนเลือกทีมชนะ</p>
                                            </div>
                                            {winner && <span className="badge badge-warning">เลือกแล้ว</span>}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                onClick={() => setWinner(winner === 'A' ? null : 'A')}
                                                aria-pressed={winner === 'A'}
                                                className="p-5 sm:p-6 rounded-2xl flex flex-col items-center gap-3 transition-all duration-200 border-2 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:ring-4 hover:ring-orange-100 active:translate-y-0 active:scale-[0.99] cursor-pointer group min-w-0"
                                                style={{
                                                    background: winner === 'A' ? 'var(--orange-500)' : 'white',
                                                    color: winner === 'A' ? 'white' : 'var(--orange-500)',
                                                    borderColor: 'var(--orange-500)',
                                                    transform: winner === 'A' ? 'scale(1.02)' : 'none',
                                                }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-2 rounded-full transition-colors ${winner === 'A' ? 'bg-white/20' : 'bg-orange-50'}`}>
                                                        <Icon icon={winner === 'A' ? 'solar:cup-star-bold' : 'solar:cup-star-linear'} width={24} />
                                                    </div>
                                                    <span className="font-extrabold text-sm uppercase tracking-tight">ทีม A</span>
                                                </div>
                                                <div className="w-full space-y-2">
                                                    {scoreTeamPlayers('A').map(player => (
                                                        <div key={player.id} className={`w-full p-2.5 rounded-xl flex items-center gap-2 text-left ${winner === 'A' ? 'bg-white/15 text-white' : 'bg-orange-50 text-gray-800'}`}>
                                                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${winner === 'A' ? 'bg-white/20' : 'bg-white text-orange-600 shadow-sm'}`}>{player.display_name?.charAt(0)?.toUpperCase()}</span>
                                                            <span className="min-w-0 flex-1">
                                                                <strong className="block text-xs font-black truncate">{player.display_name}</strong>
                                                                <small className={`block text-[10px] mt-0.5 ${winner === 'A' ? 'text-white/80' : 'text-gray-500'}`}>มือ {player.skill_level || 'ไม่ระบุ'}</small>
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <span className={`text-[11px] font-bold ${winner === 'A' ? 'text-white' : 'text-orange-600'}`}>เลือกทีม A ชนะ</span>
                                            </button>

                                            <button
                                                onClick={() => setWinner(winner === 'B' ? null : 'B')}
                                                aria-pressed={winner === 'B'}
                                                className="p-5 sm:p-6 rounded-2xl flex flex-col items-center gap-3 transition-all duration-200 border-2 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:ring-4 hover:ring-blue-100 active:translate-y-0 active:scale-[0.99] cursor-pointer group min-w-0"
                                                style={{
                                                    background: winner === 'B' ? '#3b82f6' : 'white',
                                                    color: winner === 'B' ? 'white' : '#3b82f6',
                                                    borderColor: '#3b82f6',
                                                    transform: winner === 'B' ? 'scale(1.02)' : 'none',
                                                }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-2 rounded-full transition-colors ${winner === 'B' ? 'bg-white/20' : 'bg-blue-50'}`}>
                                                        <Icon icon={winner === 'B' ? 'solar:cup-star-bold' : 'solar:cup-star-linear'} width={24} />
                                                    </div>
                                                    <span className="font-extrabold text-sm uppercase tracking-tight">ทีม B</span>
                                                </div>
                                                <div className="w-full space-y-2">
                                                    {scoreTeamPlayers('B').map(player => (
                                                        <div key={player.id} className={`w-full p-2.5 rounded-xl flex items-center gap-2 text-left ${winner === 'B' ? 'bg-white/15 text-white' : 'bg-blue-50 text-gray-800'}`}>
                                                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${winner === 'B' ? 'bg-white/20' : 'bg-white text-blue-600 shadow-sm'}`}>{player.display_name?.charAt(0)?.toUpperCase()}</span>
                                                            <span className="min-w-0 flex-1">
                                                                <strong className="block text-xs font-black truncate">{player.display_name}</strong>
                                                                <small className={`block text-[10px] mt-0.5 ${winner === 'B' ? 'text-white/80' : 'text-gray-500'}`}>มือ {player.skill_level || 'ไม่ระบุ'}</small>
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <span className={`text-[11px] font-bold ${winner === 'B' ? 'text-white' : 'text-blue-600'}`}>เลือกทีม B ชนะ</span>
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                onClick={() => setWinner(winner === 'Draw' ? null : 'Draw')}
                                                aria-pressed={winner === 'Draw'}
                                                className="p-4 rounded-xl flex items-center justify-center gap-3 transition-all duration-200 border-2 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:ring-4 hover:ring-purple-100 active:translate-y-0 active:scale-[0.99] cursor-pointer"
                                                style={{
                                                    background: winner === 'Draw' ? '#9333ea' : 'white',
                                                    color: winner === 'Draw' ? 'white' : '#9333ea',
                                                    borderColor: '#9333ea',
                                                    transform: winner === 'Draw' ? 'scale(1.01)' : 'none',
                                                }}
                                            >
                                                <div className={`p-2 rounded-full ${winner === 'Draw' ? 'bg-white/20' : 'bg-purple-50'}`}>
                                                    <Icon icon={winner === 'Draw' ? 'solar:hand-shake-bold' : 'solar:hand-shake-linear'} width={20} />
                                                </div>
                                                <span className="font-bold text-sm">เสมอ</span>
                                            </button>

                                            <button
                                                onClick={() => setWinner(winner === 'None' ? null : 'None')}
                                                aria-pressed={winner === 'None'}
                                                className="p-4 rounded-xl flex items-center justify-center gap-3 transition-all duration-200 border-2 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:ring-4 hover:ring-gray-200 active:translate-y-0 active:scale-[0.99] cursor-pointer"
                                                style={{
                                                    background: winner === 'None' ? 'var(--gray-600)' : 'white',
                                                    color: winner === 'None' ? 'white' : 'var(--gray-600)',
                                                    borderColor: 'var(--gray-600)',
                                                    transform: winner === 'None' ? 'scale(1.01)' : 'none',
                                                }}
                                            >
                                                <div className={`p-2 rounded-full ${winner === 'None' ? 'bg-white/20' : 'bg-gray-50'}`}>
                                                    <Icon icon={winner === 'None' ? 'solar:close-circle-bold' : 'solar:close-circle-linear'} width={20} />
                                                </div>
                                                <span className="font-bold text-sm">ไม่แจ้งผล</span>
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={submitScore}
                                        disabled={!winner}
                                        className={`btn w-full min-h-14 rounded-xl text-base sm:text-lg font-black shadow-lg transition-all ${winner
                                            ? 'btn-primary shadow-orange-200 active:scale-95'
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            }`}
                                    >
                                        <Icon icon="solar:check-circle-linear" width={22} />
                                        บันทึกผลการแข่งขัน
                                    </button>
                                </div>
                            </div>,
                            document.body
                        )}
        </>
    );
}
