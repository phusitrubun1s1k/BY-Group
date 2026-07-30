'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { Icon } from '@iconify/react';
import { RANK_TIERS, getRankFromMMR } from '@/src/lib/rank-utils';
import RankBadge from '@/src/components/RankBadge';
import toast from 'react-hot-toast';
import { logActivity } from '@/src/lib/activity-log';

interface ResetSchedule {
    id: string;
    reset_at: string;
    season_label: string;
    status: 'pending' | 'executed' | 'cancelled';
    created_at: string;
}

interface SeasonRecord {
    id: string;
    season_label: string;
    user_id: string;
    final_mmr: number;
    final_rank_name: string;
    total_games: number;
    total_wins: number;
    profiles?: { display_name: string };
}

export default function AdminRankResetPage() {
    const [schedules, setSchedules] = useState<ResetSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [resetDate, setResetDate] = useState('');
    const [resetTime, setResetTime] = useState('00:00');
    const [seasonLabel, setSeasonLabel] = useState('');
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [pendingAction, setPendingAction] = useState<'schedule' | 'execute' | 'cancel' | null>(null);
    const [executeTargetId, setExecuteTargetId] = useState<string | null>(null);
    const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
    const [seasonRecords, setSeasonRecords] = useState<SeasonRecord[]>([]);
    const [loadingSeason, setLoadingSeason] = useState(false);

    useEffect(() => { loadSchedules(); }, []);

    const loadSchedules = async () => {
        setLoading(true);
        const supabase = createClient();
        const { data } = await supabase
            .from('rank_reset_schedule')
            .select('*')
            .order('created_at', { ascending: false });
        setSchedules((data || []) as ResetSchedule[]);
        setLoading(false);
    };

    const loadSeasonHistory = async (seasonLabel: string) => {
        setLoadingSeason(true);
        setSelectedSeason(seasonLabel);
        const supabase = createClient();
        const { data } = await supabase
            .from('season_history')
            .select('*, profiles:user_id(display_name, is_guest)')
            .eq('season_label', seasonLabel)
            .order('final_mmr', { ascending: false });
        setSeasonRecords(((data || []) as any[]).filter((r: any) => !r.profiles?.is_guest) as SeasonRecord[]);
        setLoadingSeason(false);
    };

    const handleSchedule = () => {
        if (!resetDate || !seasonLabel) {
            toast.error('กรุณากรอกวันที่และชื่อซีซัน');
            return;
        }
        setPendingAction('schedule');
        setShowPasswordModal(true);
    };

    const handleExecuteNow = (scheduleId: string) => {
        setPendingAction('execute');
        setExecuteTargetId(scheduleId);
        setShowPasswordModal(true);
    };

    const handleCancel = (scheduleId: string) => {
        setPendingAction('cancel');
        setExecuteTargetId(scheduleId);
        setShowPasswordModal(true);
    };

    const confirmWithPassword = async () => {
        setSubmitting(true);
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) { toast.error('ไม่พบอีเมลผู้ใช้'); setSubmitting(false); return; }

        const { error: authErr } = await supabase.auth.signInWithPassword({
            email: user.email,
            password
        });
        if (authErr) {
            toast.error('รหัสผ่านไม่ถูกต้อง');
            setSubmitting(false);
            return;
        }

        if (pendingAction === 'schedule') {
            const resetAt = new Date(`${resetDate}T${resetTime}:00`).toISOString();
            const { error } = await supabase.from('rank_reset_schedule').insert({
                reset_at: resetAt,
                created_by: user.id,
                season_label: seasonLabel,
                status: 'pending'
            });
            if (error) {
                toast.error('ไม่สามารถตั้งเวลาได้: ' + error.message);
            } else {
                await logActivity({
                    category: 'rank', action: 'rank.schedule',
                    description: `ตั้งเวลารีแรงค์ซีซัน "${seasonLabel}" วันที่ ${new Date(resetAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`,
                    metadata: { seasonLabel, resetAt },
                });
                toast.success('ตั้งเวลารีแรงค์สำเร็จ!');
                setResetDate('');
                setResetTime('00:00');
                setSeasonLabel('');
            }
        } else if (pendingAction === 'execute' && executeTargetId) {
            await executeReset(executeTargetId, user.id);
        } else if (pendingAction === 'cancel' && executeTargetId) {
            await runCancel(executeTargetId);
        }

        setShowPasswordModal(false);
        setPassword('');
        setPendingAction(null);
        setExecuteTargetId(null);
        setSubmitting(false);
        loadSchedules();
    };

    const executeReset = async (scheduleId: string, userId: string) => {
        const supabase = createClient();

        // 1. Get the schedule
        const { data: schedule } = await supabase
            .from('rank_reset_schedule')
            .select('*')
            .eq('id', scheduleId)
            .single();
        if (!schedule) { toast.error('ไม่พบรายการ'); return; }

        // 2. Get all profiles
        const { data: profiles } = await supabase.from('profiles').select('id, mmr, display_name').eq('is_guest', false);
        if (!profiles) { toast.error('ไม่พบข้อมูลผู้เล่น'); return; }

        // 3. Get leaderboard stats for snapshot
        const { data: leaderboard } = await supabase.from('view_leaderboard').select('*');
        const statsMap: Record<string, { total_games: number; total_wins: number }> = {};
        leaderboard?.forEach((r: any) => {
            statsMap[r.user_id] = { total_games: r.total_games || 0, total_wins: r.total_wins || 0 };
        });

        // 4. Snapshot into season_history
        const snapshots = profiles.map(p => ({
            reset_id: scheduleId,
            user_id: p.id,
            season_label: schedule.season_label,
            final_mmr: p.mmr || 1000,
            final_rank_name: getRankFromMMR(p.mmr || 1000).name,
            total_games: statsMap[p.id]?.total_games || 0,
            total_wins: statsMap[p.id]?.total_wins || 0
        }));

        const { error: snapErr } = await supabase.from('season_history').insert(snapshots);
        if (snapErr) { toast.error('บันทึกประวัติซีซันล้มเหลว: ' + snapErr.message); return; }

        // 5. Apply soft reset: new_mmr = 1000 + (current_mmr - 1000) / 2
        const BASE_MMR = 1000;
        for (const p of profiles) {
            const oldMmr = p.mmr || BASE_MMR;
            const newMmr = Math.round(BASE_MMR + (oldMmr - BASE_MMR) / 2);

            await supabase.from('profiles').update({ mmr: newMmr }).eq('id', p.id);
            await supabase.from('mmr_history').insert({
                user_id: p.id,
                old_mmr: oldMmr,
                new_mmr: newMmr,
                change: newMmr - oldMmr,
                reason: `season_reset:${schedule.season_label}`
            });
        }

        // 6. Mark schedule as executed
        await supabase.from('rank_reset_schedule').update({ status: 'executed' }).eq('id', scheduleId);
        await logActivity({
            category: 'rank', action: 'rank.reset_execute',
            description: `รีแรงค์ซีซัน "${schedule.season_label}" สำเร็จ (รีเซ็ต MMR ผู้เล่น ${profiles.length} คน)`,
            targetType: 'rank_reset', targetId: scheduleId,
            metadata: { seasonLabel: schedule.season_label, playerCount: profiles.length },
        });
        toast.success(`รีแรงค์ ${schedule.season_label} สำเร็จ!`);
    };

    const runCancel = async (scheduleId: string) => {
        const supabase = createClient();
        await supabase.from('rank_reset_schedule').update({ status: 'cancelled' }).eq('id', scheduleId);
        await logActivity({
            category: 'rank', action: 'rank.reset_cancel',
            description: 'ยกเลิกการตั้งเวลารีแรงค์',
            targetType: 'rank_reset', targetId: scheduleId,
        });
        toast.success('ยกเลิกการตั้งเวลาแล้ว');
    };

    const pendingSchedule = schedules.find(s => s.status === 'pending');
    const pastSchedules = schedules.filter(s => s.status !== 'pending');

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" /></div>;

    return (
        <>
            <div className="animate-in pb-20 max-w-2xl mx-auto">
                <header className="mb-8">
                <h1 className="text-2xl font-black text-gray-900 mb-2 flex items-center gap-3">
                    <Icon icon="solar:restart-bold-duotone" width={28} className="text-orange-500" />
                    ตั้งเวลารีแรงค์
                </h1>
                <p className="text-sm text-gray-500 font-medium">ตั้งเวลารีเซ็ตแรงค์ทั้งหมด พร้อมเก็บประวัติซีซันเดิม</p>
            </header>

            {/* Current Pending Schedule */}
            {pendingSchedule && (
                <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-200 shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center">
                            <Icon icon="solar:clock-circle-bold" width={22} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-orange-700">กำลังรอรีแรงค์</h3>
                            <p className="text-xs font-bold text-orange-500">{pendingSchedule.season_label}</p>
                        </div>
                    </div>
                    <p className="text-sm font-bold text-gray-700 mb-4">
                        📅 {new Date(pendingSchedule.reset_at).toLocaleString('th-TH', { dateStyle: 'full', timeStyle: 'short' })}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleExecuteNow(pendingSchedule.id)}
                            className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-black hover:bg-orange-600 transition-colors shadow-md flex items-center justify-center gap-2"
                        >
                            <Icon icon="solar:play-bold" width={16} />
                            รีเดี๋ยวนี้เลย
                        </button>
                        <button
                            onClick={() => handleCancel(pendingSchedule.id)}
                            className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                            ยกเลิก
                        </button>
                    </div>
                </div>
            )}

            {/* Schedule Form - only if no pending */}
            {!pendingSchedule && (
                <div className="card mb-8" style={{ padding: '24px' }}>
                    <h3 className="text-sm font-black text-gray-900 mb-4 flex items-center gap-2">
                        <Icon icon="solar:calendar-add-bold-duotone" width={20} className="text-orange-500" />
                        ตั้งเวลารีแรงค์ใหม่
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">ชื่อซีซัน</label>
                            <input
                                type="text"
                                value={seasonLabel}
                                onChange={e => setSeasonLabel(e.target.value)}
                                placeholder="เช่น Season 1"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">วันที่รี</label>
                                <input
                                    type="date"
                                    value={resetDate}
                                    onChange={e => setResetDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">เวลา</label>
                                <input
                                    type="time"
                                    value={resetTime}
                                    onChange={e => setResetTime(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                                />
                            </div>
                        </div>

                        {/* Soft Reset Preview */}
                        <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">ตัวอย่างการรี (Soft Reset)</p>
                            <p className="text-[11px] text-gray-500 mb-3">สูตร: new = 1000 + (old - 1000) / 2</p>
                            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-bold">
                                {[800, 1000, 1300, 1650, 2000, 3000].map(v => (
                                    <div key={v} className="flex justify-between bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                                        <span className="text-gray-400">{v}</span>
                                        <span className="text-gray-300">→</span>
                                        <span className="text-orange-500">{Math.round(1000 + (v - 1000) / 2)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleSchedule}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-sm shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
                        >
                            <Icon icon="solar:lock-password-bold" width={18} />
                            ตั้งเวลารีแรงค์ (ยืนยันรหัสผ่าน)
                        </button>
                    </div>
                </div>
            )}

            {/* Past Schedules */}
            {pastSchedules.length > 0 && (
                <div className="card" style={{ padding: '24px' }}>
                    <h3 className="text-sm font-black text-gray-900 mb-4 flex items-center gap-2">
                        <Icon icon="solar:history-bold-duotone" width={20} className="text-gray-400" />
                        ประวัติการรีแรงค์
                    </h3>
                    <div className="space-y-3">
                        {pastSchedules.map(s => (
                            <div key={s.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.status === 'executed' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                        <Icon icon={s.status === 'executed' ? 'solar:check-circle-bold' : 'solar:close-circle-bold'} width={18} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">{s.season_label}</p>
                                        <p className="text-[10px] font-bold text-gray-400">
                                            {new Date(s.reset_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                                            <span className={s.status === 'executed' ? 'text-green-500' : 'text-gray-400'}>
                                                {s.status === 'executed' ? 'รีแล้ว' : 'ยกเลิก'}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                                {s.status === 'executed' && (
                                    <button
                                        onClick={() => loadSeasonHistory(s.season_label)}
                                        className="text-[10px] font-black text-orange-500 uppercase tracking-wider hover:text-orange-600 transition-colors"
                                    >
                                        ดูอันดับ
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            </div>

            {/* Season History Modal */}
            {selectedSeason && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => setSelectedSeason(null)} />
                    <div className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-black/5">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-gray-900">🏆 {selectedSeason}</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">อันดับสุดท้ายก่อนรีแรงค์</p>
                            </div>
                            <button onClick={() => setSelectedSeason(null)} className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors">
                                <Icon icon="solar:close-circle-bold" width={20} />
                            </button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-4 space-y-2">
                            {loadingSeason ? (
                                <div className="flex items-center justify-center py-10"><div className="spinner" /></div>
                            ) : seasonRecords.length === 0 ? (
                                <p className="text-center text-sm text-gray-400 py-8">ไม่มีข้อมูล</p>
                            ) : (
                                seasonRecords.map((r, idx) => (
                                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                                        <span className="text-sm font-black text-gray-300 w-6 text-center">{idx + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">{r.profiles?.display_name || 'Unknown'}</p>
                                            <p className="text-[10px] text-gray-400 font-bold">{r.total_games} เกม · {r.total_wins} ชนะ</p>
                                        </div>
                                        <RankBadge mmr={r.final_mmr} size="sm" />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Password Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => { setShowPasswordModal(false); setPassword(''); }} />
                    <div className="relative w-full max-w-sm bg-white rounded-[28px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 ring-1 ring-black/5 p-8">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-4">
                                <Icon icon="solar:lock-password-bold-duotone" width={32} className="text-orange-500" />
                            </div>
                            <h3 className="text-lg font-black text-gray-900 mb-1">ยืนยันรหัสผ่าน</h3>
                            <p className="text-xs text-gray-400 font-medium">กรุณากรอกรหัสผ่านของคุณเพื่อดำเนินการ</p>
                        </div>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && confirmWithPassword()}
                            placeholder="รหัสผ่าน"
                            autoFocus
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-center focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all mb-4"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setShowPasswordModal(false); setPassword(''); }}
                                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition-colors"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={confirmWithPassword}
                                disabled={submitting || !password}
                                className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-black text-sm hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {submitting ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <Icon icon="solar:check-circle-bold" width={16} />}
                                ยืนยัน
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
