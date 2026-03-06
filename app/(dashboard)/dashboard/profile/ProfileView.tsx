'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import type { Profile, MatchPlayer } from '@/src/types';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import imageCompression from 'browser-image-compression';
import QRCode from 'react-qr-code';
import CustomSelect, { SelectOption } from '@/src/components/CustomSelect';
import RankBadge from '@/src/components/RankBadge';
import { getNextRank } from '@/src/lib/rank-utils';
import { fetchPlayerStats, calculateAchievementProgress, AchievementProgress } from '@/src/lib/utils/achievement-utils';

const SKILL_OPTIONS: SelectOption[] = [
    { value: null as any, label: 'ไม่ระบุ', icon: 'solar:question-circle-linear' },
    { value: 'เปาะแปะ', label: 'เปาะแปะ (ผู้เริ่มต้น)', icon: 'solar:user-linear', description: 'เพิ่งเริ่มหัดเล่น ยังไม่คุ้นชินกติกา' },
    { value: 'BG', label: 'BG (ตีพอได้)', icon: 'solar:user-bold', description: 'ตีโต้ได้บ้าง เริ่มเข้าใจพื้นฐาน' },
    { value: 'N', label: 'N (ตีได้/รับลูกกระเจิง)', icon: 'solar:user-bold-duotone', description: 'เริ่มตีได้แรงขึ้น วิ่งรับลูกได้' },
    { value: 'S', label: 'S (หัดลงเกมส์)', icon: 'solar:medal-star-linear', description: 'เริ่มลงทีม มีทักษะการวางลูก' },
    { value: 'P-', label: 'P- (ลงเกมส์บ่อย/รู้กติกา)', icon: 'solar:medal-star-bold', description: 'ลงเกมส์ประจำ เข้าใจตำแหน่ง' },
    { value: 'P', label: 'P (ตีประจำ/บุกรับได้หนืดๆ)', icon: 'solar:cup-star-linear', description: 'ฝีมือมาตรฐาน รับลูกได้ดี บุกได้' },
    { value: 'P+', label: 'P+ (ฝีมือดี/ร่างกายแข็งแรง)', icon: 'solar:cup-star-bold', description: 'บุกโหด รับเหนียว มีพละกำลัง' },
    { value: 'C', label: 'C (เก่งมาก/แข่งขันระดับคลับ)', icon: 'solar:crown-minimalistic-linear', description: 'ระดับนักกีฬาคลับ แข่งขันบ่อย' },
    { value: 'B', label: 'B (นักกีฬาเกรด B)', icon: 'solar:crown-bold', description: 'นักกีฬาเกรด B ฝีมือสูง' },
    { value: 'A', label: 'A (นักกีฬาเกรด A/อาชีพ)', icon: 'solar:crown-star-bold', description: 'นักกีฬาอาชีพ หรือเกรด A' },
];

interface BillingHistory {
    user_id: string;
    event_id: string;
    event_name: string;
    event_date: string;
    entry_fee: number;
    shuttlecock_price: number;
    shuttlecock_count: number;
    games_played: number;
    payment_status: string;
    total_amount: number;
}

interface MMRHistory {
    history_id: string;
    user_id: string;
    match_id: string;
    old_mmr: number;
    new_mmr: number;
    change: number;
    reason: string;
    change_date: string;
    team_a_score: number;
    team_b_score: number;
    event_name: string;
    event_date: string;
    result: 'Win' | 'Loss' | 'Draw';
}

const generatePayload = (id: string, amount: number) => {
    const f = (id: string, val: string) => {
        const len = val.length.toString().padStart(2, '0');
        return `${id}${len}${val}`;
    };
    const isPhone = id.length === 10 && id.startsWith('0');
    let formattedId = id;
    if (isPhone) formattedId = '0066' + id.substring(1);
    const merchantInfo = f('00', 'A000000677010111') + f(isPhone ? '01' : '02', formattedId);
    const payload = [f('00', '01'), f('01', amount > 0 ? '12' : '11'), f('29', merchantInfo), f('53', '764'), ...(amount > 0 ? [f('54', amount.toFixed(2))] : []), f('58', 'TH')].join('') + '6304';
    const crc = crc16(payload).toString(16).toUpperCase().padStart(4, '0');
    return payload + crc;
};

const crc16 = (data: string) => {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) > 0) crc = (crc << 1) ^ 0x1021;
            else crc <<= 1;
        }
    }
    return crc & 0xFFFF;
};

interface ProfileViewProps {
    targetUserId: string;
}

export default function ProfileView({ targetUserId }: ProfileViewProps) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<{
        display_name: string;
        full_name: string;
        skill_level: Profile['skill_level'];
    }>({ display_name: '', full_name: '', skill_level: null });
    const [saving, setSaving] = useState(false);
    const [stats, setStats] = useState({ totalGames: 0, wins: 0, losses: 0, totalPoints: 0 });
    const [todayBill, setTodayBill] = useState<{
        amount: number;
        paid: boolean;
        eventPlayerId: string | null;
        totalGames: number;
        totalShuttlecocks: number;
        slipUrl: string | null;
    }>({ amount: 0, paid: false, eventPlayerId: null, totalGames: 0, totalShuttlecocks: 0, slipUrl: null });
    const [billingHistory, setBillingHistory] = useState<BillingHistory[]>([]);
    const [achievements, setAchievements] = useState<AchievementProgress[]>([]);
    const [mmrHistory, setMmrHistory] = useState<MMRHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showQR, setShowQR] = useState(false);

    const isOwnProfile = currentUserId === targetUserId;

    useEffect(() => {
        loadData();
    }, [targetUserId]);

    const loadData = async () => {
        setLoading(true);
        const supabase = createClient();
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        setCurrentUserId(currentUser?.id || null);

        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', targetUserId).single();
        if (profileData) {
            setProfile(profileData as Profile);
            setEditForm({
                display_name: profileData.display_name || '',
                full_name: profileData.full_name || '',
                skill_level: profileData.skill_level
            });
        }

        const { data: matches } = await supabase.from('match_players').select('*, matches(*)').eq('user_id', targetUserId);
        if (matches) {
            const finished = matches.filter((mp: any) => mp.matches?.status === 'finished');
            const wins = finished.filter((mp: any) =>
                mp.team === 'A' ? mp.matches.team_a_score > mp.matches.team_b_score : mp.matches.team_b_score > mp.matches.team_a_score
            );
            const totalPoints = finished.reduce((sum: number, mp: any) =>
                sum + (mp.team === 'A' ? mp.matches.team_a_score : mp.matches.team_b_score), 0
            );
            setStats({ totalGames: finished.length, wins: wins.length, losses: finished.length - wins.length, totalPoints });
        }

        // Fetch achievements
        const achStats = await fetchPlayerStats(targetUserId);
        const achResults = calculateAchievementProgress(achStats);
        setAchievements(achResults);

        // Fetch MMR history
        const { data: mmrData } = await supabase.from('view_mmr_history').select('*').eq('user_id', targetUserId).order('change_date', { ascending: false }).limit(20);
        if (mmrData) {
            setMmrHistory(mmrData as MMRHistory[]);
        }

        // Only fetch billing for own profile
        if (currentUser?.id === targetUserId) {
            const { data: historyData } = await supabase.from('view_user_billing_history').select('*').eq('user_id', targetUserId).order('event_date', { ascending: false });
            if (historyData) setBillingHistory(historyData as BillingHistory[]);

            const today = new Date().toLocaleDateString('en-CA');
            try {
                const { data: summary } = await supabase.from('view_billing_summary').select('*').eq('event_date', today).eq('user_id', targetUserId).maybeSingle();
                if (summary) {
                    setTodayBill({
                        amount: summary.total_cost || summary.total_amount || 0,
                        paid: summary.payment_status === 'paid',
                        eventPlayerId: summary.event_player_id || summary.id,
                        totalGames: summary.total_games || 0,
                        totalShuttlecocks: summary.total_shuttlecocks || 0,
                        slipUrl: summary.slip_url || null
                    });
                }
            } catch (e) { }
        }

        setLoading(false);
    };

    const saveProfile = async () => {
        if (!isOwnProfile) return;
        setSaving(true);
        const supabase = createClient();
        const { error } = await supabase.from('profiles').update(editForm).eq('id', targetUserId);
        if (error) toast.error('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        else {
            toast.success('บันทึกข้อมูลสำเร็จ');
            setProfile(p => p ? { ...p, ...editForm } : null);
            setIsEditing(false);
        }
        setSaving(false);
    };

    const uploadSlip = async (file: File) => {
        if (!isOwnProfile || !todayBill.eventPlayerId) return;
        setUploading(true);
        try {
            const compressed = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1200 });
            const supabase = createClient();
            const fileName = `${todayBill.eventPlayerId}_${Date.now()}.jpg`;
            const { error: uploadError } = await supabase.storage.from('slips').upload(fileName, compressed);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('slips').getPublicUrl(fileName);
            const { error: updateError } = await supabase.from('event_players').update({ slip_url: publicUrl, payment_status: 'pending' }).eq('id', todayBill.eventPlayerId);
            if (updateError) throw updateError;

            setTodayBill(prev => ({ ...prev, slipUrl: publicUrl }));
            toast.success('อัปโหลดสลิปเรียบร้อยแล้ว รอผู้จัดตรวจสอบ');
        } catch (e) {
            toast.error('อัปโหลดไม่สำเร็จ');
        }
        setUploading(false);
    };

    const groupedHistory = useMemo(() => {
        const groups: Record<string, { monthYear: string, items: BillingHistory[], totalPaid: number }> = {};
        billingHistory.forEach(item => {
            const date = new Date(item.event_date);
            const monthYear = date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
            if (!groups[monthYear]) groups[monthYear] = { monthYear, items: [], totalPaid: 0 };
            groups[monthYear].items.push(item);
            if (item.payment_status === 'paid') groups[monthYear].totalPaid += Number(item.total_amount);
        });
        return Object.values(groups).sort((a, b) => new Date(b.items[0].event_date).getTime() - new Date(a.items[0].event_date).getTime());
    }, [billingHistory]);

    const winRate = useMemo(() => stats.totalGames === 0 ? 0 : Math.round((stats.wins / stats.totalGames) * 100), [stats]);
    const mmrPoints = useMemo(() => mmrHistory.length === 0 ? [] : [...mmrHistory].slice(0, 15).reverse().map(h => h.new_mmr), [mmrHistory]);

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" style={{ width: 28, height: 28 }} /></div>;
    if (!profile) return <div className="text-center py-20"><p className="text-gray-500">ไม่พบข้อมูลผู้เล่น</p></div>;

    return (
        <div className="animate-in max-w-xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-black tracking-tight" style={{ color: 'var(--gray-900)' }}>
                        {isOwnProfile ? 'โปรไฟล์ของฉัน' : `โปรไฟล์ของ ${profile.display_name}`}
                    </h1>
                    <p className="text-sm text-gray-500">{isOwnProfile ? 'จัดการข้อมูลส่วนตัวและดูสถิติของคุณ' : 'ดูสถิติและผลงานการเล่น'}</p>
                </div>
                {isOwnProfile && !isEditing && (
                    <button onClick={() => setIsEditing(true)} className="btn btn-secondary btn-sm flex items-center gap-1.5 rounded-xl font-bold">
                        <Icon icon="solar:pen-bold" width={16} /> แก้ไข
                    </button>
                )}
            </div>

            {/* Profile Card */}
            <div className="card overflow-hidden border-none shadow-xl" style={{ padding: 0 }}>
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6 relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full pointer-events-none" />
                    <div className="flex items-start gap-5 relative z-10">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg bg-orange-500 text-white border-2 border-white/20 shrink-0">
                            {profile.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            {isEditing && isOwnProfile ? (
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">ชื่อที่ใช้แสดง (Display Name)</label>
                                        <input value={editForm.display_name} onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))} className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none placeholder:text-gray-500" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">ชื่อ-นามสกุลจริง (สำหรับใบเสร็จ)</label>
                                        <input value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none placeholder:text-gray-500" />
                                    </div>
                                    <CustomSelect label="ระดับมือ" value={editForm.skill_level || ''} onChangeAction={(val) => setEditForm(f => ({ ...f, skill_level: (val || null) as Profile['skill_level'] }))} options={SKILL_OPTIONS} icon="solar:medal-star-bold" />
                                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
                                        <button onClick={() => setIsEditing(false)} className="btn btn-sm bg-white/10 text-white border-white/20 flex-1">ยกเลิก</button>
                                        <button onClick={saveProfile} disabled={saving} className="btn btn-sm bg-orange-500 text-white flex-1">{saving ? <div className="spinner spinner-sm" /> : 'บันทึก'}</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <h2 className="text-xl font-black text-white">{profile.display_name}</h2>
                                    {isOwnProfile && <p className="text-sm font-medium text-gray-400">{profile.full_name}</p>}
                                    <div className="flex items-center gap-2 mt-3">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/10 text-white border border-white/10">
                                            {profile.role === 'admin' ? 'ผู้จัดก๊วน' : 'ผู้เล่น'}
                                        </span>
                                        {profile.skill_level && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-300 border border-orange-500/20">
                                                ระดับมือ {profile.skill_level}
                                            </span>
                                        )}
                                        <RankBadge mmr={profile.mmr || 1000} size="sm" />
                                    </div>
                                    <div className="mt-4 max-w-[200px]">
                                        {(() => {
                                            const { rank: nextRank, progress } = getNextRank(profile.mmr || 1000);
                                            return (
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between items-end">
                                                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Rank Progress</span>
                                                        {nextRank && <span className="text-[9px] font-bold text-white/60">Next: {nextRank.name}</span>}
                                                    </div>
                                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-[1px]">
                                                        <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 shadow-[0_0_8px_rgba(249,115,22,0.5)]" style={{ width: `${progress}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {achievements.filter(a => a.currentTier > 0).slice(0, 4).map(a => {
                                            const tier = a.achievement.tiers[a.currentTier - 1];
                                            return (
                                                <div key={a.achievement.id} className="group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white shadow-lg border border-white/20" style={{ background: tier.color }}>
                                                    <span className="text-xs">{tier.badge}</span>
                                                    <Icon icon={tier.icon || a.achievement.icon} width={14} />
                                                    <span className="text-[10px] font-black uppercase tracking-wider">{tier.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 sm:p-6 bg-white">
                    <div className="grid grid-cols-4 gap-2 sm:gap-4">
                        {[
                            { label: 'เกม', value: stats.totalGames, icon: 'solar:gamepad-bold-duotone', color: 'text-blue-500', bg: 'bg-blue-50' },
                            { label: 'ชนะ', value: stats.wins, icon: 'solar:cup-star-bold-duotone', color: 'text-emerald-500', bg: 'bg-emerald-50' },
                            { label: 'Win Rate', value: `${winRate}%`, icon: 'solar:graph-up-bold-duotone', color: 'text-purple-500', bg: 'bg-purple-50' },
                            { label: 'แต้ม', value: stats.totalPoints, icon: 'solar:star-bold-duotone', color: 'text-amber-500', bg: 'bg-amber-50' },
                        ].map((stat, i) => (
                            <div key={i} className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border border-gray-100 bg-gray-50/50">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${stat.bg} ${stat.color}`}><Icon icon={stat.icon} width={18} /></div>
                                <p className="text-lg font-black text-gray-900 leading-none mb-1">{stat.value}</p>
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {isOwnProfile && (
                <div className="card border-none shadow-md" style={{ padding: '20px' }}>
                    <h2 className="text-sm font-black mb-4 uppercase text-gray-400">การตั้งค่า</h2>
                    <Link href="/reset-password" className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors group">
                        <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-gray-500 group-hover:text-orange-500 transition-colors"><Icon icon="solar:key-bold-duotone" width={20} /></div>
                        <div><p className="text-sm font-bold text-gray-900">เปลี่ยนรหัสผ่าน</p><p className="text-xs text-gray-500">อัปเดตรหัสผ่านใหม่เพื่อความปลอดภัย</p></div>
                        <Icon icon="solar:alt-arrow-right-linear" width={20} className="ml-auto text-gray-400 group-hover:text-orange-500" />
                    </Link>
                </div>
            )}

            {/* MMR Growth Chart */}
            <div className="card border-none shadow-md p-6 overflow-hidden relative">
                <div className="flex items-center justify-between mb-8 z-10 relative">
                    <div>
                        <h2 className="text-sm font-black tracking-tight uppercase text-gray-400 flex items-center gap-2"><Icon icon="solar:chart-2-bold" width={16} /> Rating Progress</h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">อ้างอิงจากแมตช์ล่าสุด</p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-black text-gray-900 leading-none">{profile.mmr || 1000}</p>
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-1">Current Rating</p>
                    </div>
                </div>
                <div className="h-40 w-full z-10 relative">
                    {mmrPoints.length > 1 ? <Sparkline data={mmrPoints} color="var(--orange-500)" /> : <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-300"><Icon icon="solar:chart-square-linear" width={40} /><p className="text-xs font-bold">ยังมีการแข่งไม่เพียงพอสำหรับการสร้างกราฟ</p></div>}
                </div>
            </div>

            {/* MMR History */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1"><Icon icon="solar:history-bold" width={18} className="text-gray-400" /><h2 className="text-sm font-black uppercase text-gray-400">Rating History</h2></div>
                <div className="card border-none shadow-md overflow-hidden" style={{ padding: 0 }}>
                    <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
                        {mmrHistory.map((h, i) => (
                            <div key={i} className="p-4 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${h.change > 0 ? 'bg-emerald-50 text-emerald-600' : h.change < 0 ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-gray-400'}`}><Icon icon={h.change > 0 ? 'solar:trending-up-bold' : h.change < 0 ? 'solar:trending-down-bold' : 'solar:minus-circle-bold'} width={20} /></div>
                                    <div>
                                        <div className="flex items-center gap-2"><p className="text-xs font-black text-gray-900">{h.change > 0 ? '+' : ''}{h.change} แต้ม</p><span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${h.change > 0 ? 'bg-emerald-500 text-white' : h.change < 0 ? 'bg-rose-500 text-white' : 'bg-gray-400 text-white'}`}>{h.result}</span></div>
                                        <p className="text-[10px] font-medium text-gray-400">{h.event_name || 'Match'} • {new Date(h.change_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</p>
                                    </div>
                                </div>
                                <div className="text-right"><p className="text-sm font-black text-gray-900">{h.new_mmr}</p><p className="text-[9px] font-bold text-gray-400 uppercase">Rating</p></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {isOwnProfile && billingHistory.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1"><Icon icon="solar:history-bold-duotone" width={20} className="text-gray-400" /><h2 className="text-sm font-black uppercase text-gray-400">ประวัติบิลรายเดือน</h2></div>
                    {groupedHistory.map((group, idx) => (
                        <div key={idx} className="card border-none shadow-md overflow-hidden" style={{ padding: 0 }}>
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between"><h3 className="text-sm font-black text-gray-900">{group.monthYear}</h3><p className="text-sm font-black text-emerald-600">฿{group.totalPaid.toLocaleString()}</p></div>
                            <div className="divide-y divide-gray-50">
                                {group.items.map((item, i) => (
                                    <div key={i} className="p-4 flex items-center justify-between hover:bg-gray-50">
                                        <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1"><p className="text-xs font-bold text-gray-900 truncate">{item.event_name}</p><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${item.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>{item.payment_status}</span></div><p className="text-[10px] font-medium text-gray-400">{new Date(item.event_date).toLocaleDateString()} • {item.games_played} เกม</p></div>
                                        <div className="text-right pl-4"><p className="text-sm font-black text-gray-900">฿{Number(item.total_amount).toLocaleString()}</p></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div >
    );
}

function Sparkline({ data, color }: { data: number[], color: string }) {
    const min = Math.min(...data) - 10;
    const max = Math.max(...data) + 10;
    const range = max - min;
    const width = 500;
    const height = 160;
    const points = data.map((val, i) => ({ x: (i / (data.length - 1)) * width, y: height - ((val - min) / range) * height }));
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const area = `${path} L ${width} ${height} L 0 ${height} Z`;
    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full preserve-3d overflow-visible">
            <defs><linearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
            <path d={area} fill="url(#glow)" />
            <path d={path} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="5" fill="white" stroke={color} strokeWidth="3">
                    <title>Rating: {data[i]}</title>
                </circle>
            ))}
        </svg>
    );
}
