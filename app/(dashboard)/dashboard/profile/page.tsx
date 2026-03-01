'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import type { Profile, MatchPlayer } from '@/src/types';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import imageCompression from 'browser-image-compression';
import QRCode from 'react-qr-code';

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

// Helper to generate PromptPay QR Payload (EMVCo Standard)
const generatePayload = (id: string, amount: number) => {
    const f = (id: string, val: string) => {
        const len = val.length.toString().padStart(2, '0');
        return `${id}${len}${val}`;
    };

    // Check if ID is phone (10 digits starting with 0) or ID card (13 digits)
    const isPhone = id.length === 10 && id.startsWith('0');
    let formattedId = id;
    if (isPhone) {
        // Phone PromptPay format: 0066 + phone number without leading 0
        formattedId = '0066' + id.substring(1);
    }

    const merchantInfo = f('00', 'A000000677010111') + f(isPhone ? '01' : '02', formattedId);

    const payload = [
        f('00', '01'), // Payload Format Indicator
        f('01', amount > 0 ? '12' : '11'), // 12 = dynamic (with amount), 11 = static
        f('29', merchantInfo), // Merchant Account Information (PromptPay)
        f('53', '764'), // Currency (THB = 764)
        ...(amount > 0 ? [f('54', amount.toFixed(2))] : []), // Amount (only if > 0)
        f('58', 'TH'), // Country Code
    ].join('') + '6304'; // CRC tag=63, length=04 (literal, NOT through f())

    const crc = crc16(payload).toString(16).toUpperCase().padStart(4, '0');
    return payload + crc;
};

// CRC16 Implementation for PromptPay Standard
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

export default function ProfilePage() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ display_name: '', full_name: '', skill_level: '' });
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
    const [badges, setBadges] = useState<{
        badge_win_streak: boolean;
        badge_marathon: boolean;
        badge_patron: boolean;
    }>({ badge_win_streak: false, badge_marathon: false, badge_patron: false });
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showQR, setShowQR] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (profileData) {
            setProfile(profileData as Profile);
            setEditForm({
                display_name: profileData.display_name || '',
                full_name: profileData.full_name || '',
                skill_level: profileData.skill_level || ''
            });
        }

        const { data: myMatches } = await supabase.from('match_players').select('*, matches(*)').eq('user_id', user.id);
        if (myMatches) {
            const finished = myMatches.filter((mp: any) => mp.matches?.status === 'finished');
            const wins = finished.filter((mp: any) =>
                mp.team === 'A' ? mp.matches.team_a_score > mp.matches.team_b_score : mp.matches.team_b_score > mp.matches.team_a_score
            );
            const totalPoints = finished.reduce((sum: number, mp: any) =>
                sum + (mp.team === 'A' ? mp.matches.team_a_score : mp.matches.team_b_score), 0
            );
            setStats({ totalGames: finished.length, wins: wins.length, losses: finished.length - wins.length, totalPoints });
        }

        // Fetch billing history
        const { data: historyData } = await supabase.from('view_user_billing_history').select('*').eq('user_id', user.id).order('event_date', { ascending: false });
        if (historyData) {
            setBillingHistory(historyData as BillingHistory[]);
        }

        // Fetch badges
        const { data: badgeData } = await supabase.from('view_user_badges').select('*').eq('user_id', user.id).maybeSingle();
        if (badgeData) {
            setBadges(badgeData);
        }

        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone

        // Try fetching from view_billing_summary first
        try {
            const { data: summary, error } = await supabase.from('view_billing_summary')
                .select('*')
                .eq('event_date', today)
                .eq('user_id', user.id)
                .maybeSingle();

            if (summary) {
                setTodayBill({
                    amount: summary.total_cost || summary.total_amount || summary.amount || summary.cost || 0,
                    paid: summary.payment_status === 'paid',
                    eventPlayerId: summary.event_player_id || summary.id,
                    totalGames: summary.total_games || 0,
                    totalShuttlecocks: summary.total_shuttlecocks || 0,
                    slipUrl: summary.slip_url || null
                });
                setLoading(false);
                return;
            }
        } catch (e) {
            console.error("View view_billing_summary not found or error", e);
        }

        // Fallback if view doesn't exist
        const { data: todayEvent } = await supabase.from('events').select('*').eq('event_date', today).maybeSingle();
        if (todayEvent) {
            const { data: eventPlayer } = await supabase.from('event_players').select('*').eq('event_id', todayEvent.id).eq('user_id', user.id).maybeSingle();
            if (eventPlayer) {
                const { data: todayMatches } = await supabase.from('match_players').select('*, matches!inner(*)').eq('user_id', user.id).eq('matches.event_id', todayEvent.id).eq('matches.status', 'finished');
                const gamesPlayed = todayMatches?.length || 0;

                let totalShuttles = 0;
                todayMatches?.forEach((mp: any) => {
                    const m = mp.matches;
                    if (m && m.shuttlecock_numbers) {
                        totalShuttles += m.shuttlecock_numbers.length;
                    }
                });

                const amount = todayEvent.entry_fee + (todayEvent.shuttlecock_price * totalShuttles);
                setTodayBill({
                    amount,
                    paid: eventPlayer.payment_status === 'paid',
                    eventPlayerId: eventPlayer.id,
                    totalGames: gamesPlayed,
                    totalShuttlecocks: totalShuttles,
                    slipUrl: eventPlayer.slip_url
                });
            } else {
                // Not checked in yet, or no event today
                setTodayBill({ amount: 0, paid: false, eventPlayerId: null, totalGames: 0, totalShuttlecocks: 0, slipUrl: null });
            }
        } else {
            setTodayBill({ amount: 0, paid: false, eventPlayerId: null, totalGames: 0, totalShuttlecocks: 0, slipUrl: null });
        }
        setLoading(false);
    };

    const groupedHistory = useMemo(() => {
        const groups: Record<string, { monthYear: string, items: BillingHistory[], totalPaid: number }> = {};
        billingHistory.forEach(item => {
            const date = new Date(item.event_date);
            const monthYear = date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
            if (!groups[monthYear]) {
                groups[monthYear] = { monthYear, items: [], totalPaid: 0 };
            }
            groups[monthYear].items.push(item);
            if (item.payment_status === 'paid') {
                groups[monthYear].totalPaid += Number(item.total_amount);
            }
        });
        return Object.values(groups).sort((a, b) => {
            const dateA = new Date(a.items[0].event_date);
            const dateB = new Date(b.items[0].event_date);
            return dateB.getTime() - dateA.getTime();
        });
    }, [billingHistory]);

    const saveProfile = async () => {
        if (!profile) return;
        setSaving(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.from('profiles').update({
                display_name: editForm.display_name,
                full_name: editForm.full_name,
                skill_level: editForm.skill_level || null
            }).eq('id', profile.id);

            if (error) throw error;

            setProfile({ ...profile, ...editForm } as Profile);
            setIsEditing(false);
            toast.success('อัปเดตโปรไฟล์สำเร็จ');
        } catch (error: any) {
            toast.error('ไม่สามารถอัปเดตโปรไฟล์ได้: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const uploadSlip = async (file: File) => {
        if (!todayBill.eventPlayerId) return;
        setUploading(true);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            // 1. Compress the image before uploading
            const options = {
                maxSizeMB: 0.5, // 500KB max
                maxWidthOrHeight: 1024,
                useWebWorker: true
            };
            const compressedFile = await imageCompression(file, options);

            // 2. Upload the compressed image
            const fileName = `slips/${user!.id}/${Date.now()}_${compressedFile.name}`;
            const { error: uploadError } = await supabase.storage.from('slips').upload(fileName, compressedFile);
            if (uploadError) { toast.error('อัปโหลดไม่สำเร็จ: ' + uploadError.message); return; }

            const { data: urlData } = supabase.storage.from('slips').getPublicUrl(fileName);
            await supabase.from('event_players').update({ slip_url: urlData.publicUrl }).eq('id', todayBill.eventPlayerId);
            toast.success('อัปโหลดสลิปสำเร็จ (ลดขนาดไฟล์แล้ว)');
            loadData();
        } catch { toast.error('เกิดข้อผิดพลาดในการอัปโหลดสลิป'); }
        finally { setUploading(false); }
    };

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" style={{ width: 28, height: 28 }} /></div>;

    return (
        <div className="animate-in max-w-xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-black tracking-tight" style={{ color: 'var(--gray-900)' }}>โปรไฟล์ของฉัน</h1>
                    <p className="text-sm text-gray-500">จัดการข้อมูลส่วนตัวและดูสถิติการเล่นของคุณ</p>
                </div>
                {!isEditing && (
                    <button onClick={() => setIsEditing(true)} className="btn btn-secondary btn-sm flex items-center gap-1.5 rounded-xl font-bold">
                        <Icon icon="solar:pen-bold" width={16} />
                        แก้ไข
                    </button>
                )}
            </div>

            {/* Profile Card */}
            <div className="card overflow-hidden border-none shadow-xl" style={{ padding: 0 }}>
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6 relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-bl-full pointer-events-none" />
                    <div className="flex items-start gap-5 relative z-10">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg bg-orange-500 text-white border-2 border-white/20 shrink-0">
                            {profile?.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            {isEditing ? (
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">ชื่อที่ใช้แสดง (Display Name)</label>
                                        <input
                                            value={editForm.display_name}
                                            onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                                            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-white/40 placeholder:text-gray-500"
                                            placeholder="ชื่อเล่น หรือชื่อที่คนอื่นเห็น"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">ชื่อ-นามสกุลจริง (สำหรับใบเสร็จ)</label>
                                        <input
                                            value={editForm.full_name}
                                            onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                                            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-white/40 placeholder:text-gray-500"
                                            placeholder="ชื่อ-นามสกุลจริง"
                                        />
                                    </div>
                                    <div className="flex items-center gap-3 pt-2">
                                        <div className="flex-1">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">ระดับมือ</label>
                                            <select
                                                value={editForm.skill_level}
                                                onChange={e => setEditForm(f => ({ ...f, skill_level: e.target.value }))}
                                                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-white/40"
                                            >
                                                <option value="" className="text-gray-900">ไม่ระบุ</option>
                                                <option value="เปาะแปะ" className="text-gray-900">เปาะแปะ (ผู้เริ่มต้น)</option>
                                                <option value="BG" className="text-gray-900">BG (ตีพอได้)</option>
                                                <option value="N" className="text-gray-900">N (ตีได้/รับลูกกระเจิง)</option>
                                                <option value="S" className="text-gray-900">S (หัดลงเกมส์)</option>
                                                <option value="P-" className="text-gray-900">P- (ลงเกมส์บ่อย/รู้กติกา)</option>
                                                <option value="P" className="text-gray-900">P (ตีประจำ/บุกรับได้หนืดๆ)</option>
                                                <option value="P+" className="text-gray-900">P+ (ฝีมือดี/ร่างกายแข็งแรง)</option>
                                                <option value="C" className="text-gray-900">C (เก่งมาก/แข่งขันระดับคลับ)</option>
                                                <option value="B" className="text-gray-900">B (นักกีฬาเกรด B)</option>
                                                <option value="A" className="text-gray-900">A (นักกีฬาเกรด A/อาชีพ)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
                                        <button onClick={() => {
                                            setIsEditing(false);
                                            // reset form
                                            setEditForm({
                                                display_name: profile?.display_name || '',
                                                full_name: profile?.full_name || '',
                                                skill_level: profile?.skill_level || ''
                                            });
                                        }} className="btn btn-sm bg-white/10 text-white border-white/20 hover:bg-white/20 flex-1">
                                            ยกเลิก
                                        </button>
                                        <button onClick={saveProfile} disabled={saving} className="btn btn-sm bg-orange-500 text-white border-none hover:bg-orange-600 flex-1">
                                            {saving ? <div className="spinner spinner-sm" /> : 'บันทึก'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <h2 className="text-xl font-black text-white">{profile?.display_name}</h2>
                                    <p className="text-sm font-medium text-gray-400">{profile?.full_name}</p>
                                    <div className="flex items-center gap-2 mt-3">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/10 text-white border border-white/10">
                                            {profile?.role === 'admin' ? 'ผู้จัดก๊วน' : 'ผู้เล่น'}
                                        </span>
                                        {profile?.skill_level && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-300 border border-orange-500/20">
                                                {profile.skill_level}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {badges.badge_win_streak && (
                                            <div className="group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500 text-white shadow-lg border border-white/20 hover-scale cursor-help">
                                                <Icon icon="solar:fire-bold" width={16} />
                                                <span className="text-[10px] font-black uppercase tracking-wider">ชนะติดต่อกัน 3 เกม</span>
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-[10px] text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 text-center shadow-xl">
                                                    ชนะติดต่อกัน 3 เกมสุดโหด! 🔥
                                                </div>
                                            </div>
                                        )}
                                        {badges.badge_marathon && (
                                            <div className="group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500 text-white shadow-lg border border-white/20 hover-scale cursor-help">
                                                <Icon icon="solar:shuttlecock-bold" width={16} />
                                                <span className="text-[10px] font-black uppercase tracking-wider">เล่นครบ 100 เกม</span>
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-[10px] text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 text-center shadow-xl">
                                                    เล่นสะสมครบ 100 เกม! 🏸
                                                </div>
                                            </div>
                                        )}
                                        {badges.badge_patron && (
                                            <div className="group relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 text-white shadow-lg border border-white/20 hover-scale cursor-help">
                                                <Icon icon="solar:wallet-money-bold" width={16} />
                                                <span className="text-[10px] font-black uppercase tracking-wider">สายเปย์ประจำสัปดาห์</span>
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-[10px] text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 text-center shadow-xl">
                                                    ยอดสายเปย์อันดับ 1 ของสัปดาห์! 💸
                                                </div>
                                            </div>
                                        )}
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
                            { label: 'แพ้', value: stats.losses, icon: 'solar:sad-circle-bold-duotone', color: 'text-rose-500', bg: 'bg-rose-50' },
                            { label: 'แต้ม', value: stats.totalPoints, icon: 'solar:star-bold-duotone', color: 'text-amber-500', bg: 'bg-amber-50' },
                        ].map((stat, i) => (
                            <div key={i} className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 hover-scale transition-all">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 shadow-sm ${stat.bg} ${stat.color}`}>
                                    <Icon icon={stat.icon} width={22} />
                                </div>
                                <p className="text-xl font-black text-gray-900 leading-none mb-1">{stat.value}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>


            {/* Settings */}
            <div className="card border-none shadow-md" style={{ padding: '20px' }}>
                <h2 className="text-sm font-black mb-4 tracking-tight uppercase text-gray-400">การตั้งค่า</h2>
                <Link href="/reset-password" className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors group">
                    <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-gray-500 group-hover:text-orange-500 transition-colors">
                        <Icon icon="solar:key-bold-duotone" width={20} />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-900">เปลี่ยนรหัสผ่าน</p>
                        <p className="text-xs text-gray-500">อัปเดตรหัสผ่านใหม่เพื่อความปลอดภัย</p>
                    </div>
                    <Icon icon="solar:alt-arrow-right-linear" width={20} className="ml-auto text-gray-400 group-hover:text-orange-500 transition-colors" />
                </Link>
            </div>

            {/* Billing History Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <Icon icon="solar:history-bold-duotone" width={20} className="text-gray-400" />
                    <h2 className="text-sm font-black tracking-tight uppercase text-gray-400">ประวัติบิลรายเดือน</h2>
                </div>

                {groupedHistory.map((group, idx) => (
                    <div key={idx} className="card border-none shadow-md overflow-hidden" style={{ padding: 0 }}>
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-sm font-black text-gray-900">{group.monthYear}</h3>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">ยอดจ่ายแล้ว</p>
                                <p className="text-sm font-black text-emerald-600">฿{group.totalPaid.toLocaleString()}</p>
                            </div>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {group.items.map((item, i) => (
                                <div key={i} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-xs font-bold text-gray-900 truncate">{item.event_name || 'ก๊วนทั่วไป'}</p>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${item.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                                                {item.payment_status === 'paid' ? 'จ่ายแล้ว' : 'ค้างชำระ'}
                                            </span>
                                        </div>
                                        <p className="text-[10px] font-medium text-gray-400">
                                            {new Date(item.event_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} • {item.games_played} เกม
                                        </p>
                                    </div>
                                    <div className="text-right pl-4">
                                        <p className="text-sm font-black text-gray-900">฿{Number(item.total_amount).toLocaleString()}</p>
                                        <p className="text-[9px] font-bold text-gray-400">ลูกแบด {item.shuttlecock_count} ลูก</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {billingHistory.length === 0 && (
                    <div className="text-center py-10 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                        <Icon icon="solar:history-linear" width={40} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-sm font-bold text-gray-400">ยังไม่มีประวัติการเข้าเล่น</p>
                    </div>
                )}
            </div>
        </div >
    );
}
