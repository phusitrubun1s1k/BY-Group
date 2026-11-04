'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { Event, EventPlayer, Profile } from '@/src/types';
import { Icon } from '@iconify/react';
import RankBadge from '@/src/components/RankBadge';
import CustomSelect from '@/src/components/CustomSelect';

export interface CreateMatchFormProps {
    showForm: boolean;
    editingMatchId: string | null;
    teamA: string[];
    teamB: string[];
    players: EventPlayer[];
    togglePlayer: (userId: string, team: "A" | "B") => void;
    playerStats: Record<string, { total: number; playing: boolean; matchNums: number[]; }>;
    setSidebarTeam: Dispatch<SetStateAction<"A" | "B" | null>>;
    courtNumber: string;
    setCourtNumber: Dispatch<SetStateAction<string>>;
    event: Event | null;
    matchSeq: string;
    setMatchSeq: Dispatch<SetStateAction<string>>;
    shuttlecockNumber: string;
    setShuttlecockNumber: Dispatch<SetStateAction<string>>;
    matchErrors: string[];
    saveMatch: () => Promise<void>;
    creating: boolean;
    setShowForm: Dispatch<SetStateAction<boolean>>;
    setTeamA: Dispatch<SetStateAction<string[]>>;
    setTeamB: Dispatch<SetStateAction<string[]>>;
    setEditingMatchId: Dispatch<SetStateAction<string | null>>;
}

export default function CreateMatchForm({ showForm, editingMatchId, teamA, teamB, players, togglePlayer, playerStats, setSidebarTeam, courtNumber, setCourtNumber, event, matchSeq, setMatchSeq, shuttlecockNumber, setShuttlecockNumber, matchErrors, saveMatch, creating, setShowForm, setTeamA, setTeamB, setEditingMatchId }: CreateMatchFormProps) {
    return (
        <>
            {showForm && (
                            <div className="card mb-6 animate-in shadow-md sticky z-[40] border border-gray-200 top-[170px] lg:top-[120px] 2xl:top-[88px]" style={{ padding: '24px 32px' }}>
                                <h3 className="font-bold mb-5 text-lg" style={{ color: 'var(--gray-900)' }}>{editingMatchId ? 'แก้ไขแมตช์' : 'สร้างแมตช์ใหม่'}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    {(['A', 'B'] as const).map((team) => {
                                        const selected = team === 'A' ? teamA : teamB;
                                        const clr = team === 'A' ? 'var(--orange-500)' : '#3b82f6';
                                        const selectedProfiles = selected.map(uid => {
                                            const ep = players.find(p => p.user_id === uid);
                                            return ep ? (ep.profiles as unknown as Profile) : null;
                                        }).filter(Boolean) as Profile[];

                                        return (
                                            <div key={team}>
                                                <p className="text-sm font-semibold mb-2" style={{ color: clr }}>ทีม {team} ({selected.length}/2)</p>

                                                {/* Selected players chips */}
                                                <div className="space-y-1.5 mb-3">
                                                    {selectedProfiles.length > 0 ? selectedProfiles.map((prof) => (
                                                        <div key={prof.id} className="flex flex-col gap-1 p-3 rounded-xl" style={{
                                                            background: team === 'A' ? 'rgba(249,115,22,0.06)' : 'rgba(59,130,246,0.06)',
                                                            border: `1px solid ${clr}`,
                                                        }}>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                                                    style={{ background: clr, color: 'var(--white)' }}>
                                                                    <Icon icon="solar:check-read-linear" width={14} />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="text-sm font-bold truncate block" style={{ color: clr }}>{prof.display_name}</span>
                                                                </div>
                                                                <button onClick={() => togglePlayer(prof.id, team)} className="shrink-0 p-1 rounded-full transition-colors hover:bg-red-100" style={{ color: 'var(--gray-400)' }}>
                                                                    <Icon icon="solar:close-circle-linear" width={16} />
                                                                </button>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <RankBadge mmr={prof.mmr ?? 1000} size="sm" showMMR={false} />
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-900 text-white shadow-sm">
                                                                    {playerStats[prof.id]?.total || 0} เกม
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )) : (
                                                        <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--gray-400)', background: 'var(--gray-50)', border: '1px dashed var(--gray-200)' }}>ยังไม่ได้เลือกผู้เล่น</p>
                                                    )}
                                                </div>

                                                {/* Open sidebar button */}
                                                <button
                                                    onClick={() => setSidebarTeam(team)}
                                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                                                    style={{
                                                        border: `1.5px dashed ${clr}`,
                                                        color: clr,
                                                        background: 'transparent',
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = team === 'A' ? 'rgba(249,115,22,0.04)' : 'rgba(59,130,246,0.04)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <Icon icon="solar:users-group-rounded-linear" width={16} />
                                                    เลือกผู้เล่น
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <CustomSelect
                                            label="คอร์ท *"
                                            value={courtNumber}
                                            onChangeAction={(val) => setCourtNumber(val || '')}
                                            options={(event?.courts || []).map(c => ({
                                                value: c,
                                                label: `คอร์ท ${c}`,
                                                icon: 'solar:clapperboard-edit-linear'
                                            }))}
                                            icon="solar:clapperboard-edit-bold"
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                                            ลำดับแมตช์ *
                                            {!matchSeq.trim() && (
                                                <span className="normal-case font-semibold ml-1" style={{ color: 'var(--warning)' }}>• ยังไม่ได้กรอก</span>
                                            )}
                                        </label>
                                        <input
                                            type="number"
                                            className="form-input form-input-plain h-[42px]"
                                            placeholder="เช่น 1, 2..."
                                            min={1} step={1} required aria-label="ลำดับแมตช์" value={matchSeq}
                                            onChange={(e) => setMatchSeq(e.target.value)}
                                            style={!matchSeq.trim() ? { borderColor: 'var(--warning)', background: 'rgba(245,158,11,0.05)' } : undefined}
                                        />
                                    </div>
                                    <div className="form-group md:col-span-1 col-span-2" style={{ marginBottom: 0 }}>
                                        <label className="form-label text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">
                                            หมายเลขลูก *
                                            {!shuttlecockNumber.trim() && (
                                                <span className="normal-case font-semibold ml-1" style={{ color: 'var(--warning)' }}>• ยังไม่ได้กรอก</span>
                                            )}
                                        </label>
                                        <input
                                            className="form-input form-input-plain h-[42px]"
                                            placeholder="ระบุเบอร์ลูก..."
                                            required aria-label="หมายเลขลูก" value={shuttlecockNumber}
                                            onChange={(e) => setShuttlecockNumber(e.target.value)}
                                            style={!shuttlecockNumber.trim() ? { borderColor: 'var(--warning)', background: 'rgba(245,158,11,0.05)' } : undefined}
                                        />
                                        {!shuttlecockNumber.trim() && (
                                            <p className="text-[10px] mt-1" style={{ color: 'var(--warning)' }}>มีผลต่อการคิดค่าลูก</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {matchErrors.length > 0 && <div role="alert" className="w-full rounded-lg bg-red-50 p-3 text-sm text-red-700"><p className="font-bold">กรุณาตรวจข้อมูลก่อนบันทึก</p><ul className="list-disc pl-5">{matchErrors.map(message => <li key={message}>{message}</li>)}</ul></div>}
                                    <button onClick={saveMatch} disabled={creating} className="btn btn-primary btn-sm">
                                        {creating ? <><div className="spinner" /> {editingMatchId ? 'กำลังบันทึก...' : 'สร้าง...'}</> : (editingMatchId ? 'บันทึกการแก้ไข' : 'สร้างแมตช์')}
                                    </button>
                                    <button onClick={() => { setShowForm(false); setTeamA([]); setTeamB([]); setEditingMatchId(null); setCourtNumber(''); setShuttlecockNumber(''); setMatchSeq(''); }} className="btn btn-secondary btn-sm">ยกเลิก</button>
                                </div>
                            </div>
                        )}
        </>
    );
}
