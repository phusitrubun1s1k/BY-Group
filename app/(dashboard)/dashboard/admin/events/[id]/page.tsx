'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import type { Event, EventPlayer, Profile } from '@/src/types';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useConfirm } from '@/src/components/ConfirmProvider';
import { Icon } from '@iconify/react';
import QRCode from 'react-qr-code';

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const [event, setEvent] = useState<Event | null>(null);
    const [eventPlayers, setEventPlayers] = useState<EventPlayer[]>([]);
    const [allUsers, setAllUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [closing, setClosing] = useState(false);
    const [eventId, setEventId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const confirm = useConfirm();

    // Generate public live link
    const publicLiveUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/live/${eventId}`
        : '';

    useEffect(() => {
        params.then((p) => { setEventId(p.id); loadData(p.id); });
    }, [params]);

    const loadData = async (id: string) => {
        const supabase = createClient();
        const [eventRes, playersRes, usersRes] = await Promise.all([
            supabase.from('events').select('*').eq('id', id).single(),
            supabase.from('event_players').select('*, profiles(*)').eq('event_id', id),
            supabase.from('profiles').select('*').eq('is_guest', false).order('display_name'),
        ]);
        if (eventRes.data) setEvent(eventRes.data as Event);
        if (playersRes.data) setEventPlayers(playersRes.data as EventPlayer[]);
        if (usersRes.data) setAllUsers(usersRes.data as Profile[]);
        setLoading(false);
    };

    const toggleCheckIn = async (userId: string) => {
        if (!eventId) return;
        const supabase = createClient();
        const isCheckedIn = eventPlayers.some((ep) => ep.user_id === userId);
        if (isCheckedIn) {
            const player = eventPlayers.find((ep) => ep.user_id === userId);
            if (player) {
                const ok = await confirm({
                    title: 'ลบผู้เล่น?',
                    message: `คุณต้องการลบ ${player.profiles?.display_name || 'ผู้เล่น'} ออกจากก๊วนใช่หรือไม่?`,
                    type: 'danger',
                    confirmText: 'ลบออก'
                });
                if (!ok) return;

                await supabase.from('event_players').delete().eq('id', player.id);
                toast.success('ลบผู้เล่นออกแล้ว');
            }
        } else {
            await supabase.from('event_players').insert({ event_id: eventId, user_id: userId, payment_status: 'pending' });
            toast.success('เช็คอินสำเร็จ');
        }
        loadData(eventId);
    };

    const closeEvent = async () => {
        if (!eventId) return;
        const ok = await confirm({
            title: 'ปิดก๊วน?',
            message: 'ต้องการปิดก๊วนหรือไม่? เมื่อปิดแล้วจะไม่สามารถเช็คอินเพิ่มได้',
            type: 'warning',
            confirmText: 'ยืนยันปิดก๊วน'
        });
        if (!ok) return;
        setClosing(true);
        const supabase = createClient();
        await supabase.from('events').update({ status: 'closed' }).eq('id', eventId);
        toast.success('ปิดก๊วนแล้ว');
        setClosing(false);
        loadData(eventId);
    };

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" style={{ width: 28, height: 28 }} /></div>;
    if (!event) return <div className="text-center py-20"><p style={{ color: 'var(--gray-500)' }}>ไม่พบข้อมูลก๊วน</p></div>;

    const checkedInIds = new Set(eventPlayers.map((ep) => ep.user_id));
    const skillIcon = (level: string | null) => {
        if (['เปาะแปะ', 'BG', 'N', 'S'].includes(level || '')) return { icon: 'solar:star-linear', color: '#16a34a' };
        if (['P-', 'P', 'P+'].includes(level || '')) return { icon: 'solar:star-bold', color: '#2563eb' };
        return { icon: 'solar:star-shine-bold', color: '#9333ea' };
    };

    return (
        <div className="animate-in">
            <Link href="/dashboard/admin/events" className="inline-flex items-center gap-1.5 text-sm mb-4" style={{ color: 'var(--gray-500)' }}>
                <Icon icon="solar:arrow-left-linear" width={16} /> กลับรายการก๊วน
            </Link>

            {/* Event Info & Public Link */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div className="lg:col-span-2 card shadow-sm" style={{ padding: '24px 32px' }}>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm border border-gray-100 shrink-0">
                                    <img src="/images/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
                                </div>
                                <h1 className="text-lg font-black tracking-tight text-gray-900 leading-tight">ก๊วนวันที่ {new Date(event.event_date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h1>
                                <span className={`badge ${event.status === 'open' ? 'badge-success' : 'badge-muted'}`}>
                                    {event.status === 'open' ? 'เปิด' : 'ปิด'}
                                </span>
                            </div>
                            <p className="text-sm" style={{ color: 'var(--gray-500)' }}>
                                {event.shuttlecock_brand} · ฿{event.shuttlecock_price}/ลูก · ค่าสนาม ฿{event.entry_fee} · {eventPlayers.length} ผู้เล่น
                                {event.courts && event.courts.length > 0 && ` · คอร์ท ${event.courts.join(', ')}`}
                                {event.start_time && event.end_time && ` · ${event.start_time} - ${event.end_time}`}
                            </p>

                            <div className="mt-6 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">ลิงก์บอร์ดสดสำหรับขาจร</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        readOnly
                                        className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[11px] font-bold text-blue-600 focus:outline-none"
                                        value={publicLiveUrl}
                                    />
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(publicLiveUrl);
                                            toast.success('คัดลอกลิงก์แล้ว');
                                        }}
                                        className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-blue-500 transition-colors"
                                        title="คัดลอกลิงก์"
                                    >
                                        <Icon icon="solar:copy-bold" width={18} />
                                    </button>
                                    <Link
                                        href={`/live/${eventId}`}
                                        target="_blank"
                                        className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-orange-500 transition-colors"
                                        title="เปิดดู"
                                    >
                                        <Icon icon="solar:eye-bold" width={18} />
                                    </Link>
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 mt-2 flex items-center gap-1">
                                    <Icon icon="solar:info-circle-bold" width={12} />
                                    ขาจรไม่ต้องล็อกอิน สามารถสแกน QR เพื่อดูบอร์ดได้ทันที
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                            {event.status === 'open' ? (
                                <>
                                    <div className="flex gap-2">
                                        <Link href={`/dashboard/admin/events/${eventId}/edit`} className="btn btn-sm flex-1" style={{ background: 'rgba(59,130,246,0.06)', color: '#3b82f6' }}>
                                            <Icon icon="solar:pen-linear" width={16} /> แก้ไข
                                        </Link>
                                        <Link href={`/dashboard/admin/matches/${eventId}`} className="btn btn-primary btn-sm flex-1">
                                            <Icon icon="solar:sort-horizontal-linear" width={16} /> จัดแมตช์
                                        </Link>
                                    </div>
                                    <button onClick={closeEvent} className="btn btn-secondary btn-sm w-full" disabled={closing}>
                                        <Icon icon="solar:lock-linear" width={16} /> ปิดก๊วน
                                    </button>
                                </>
                            ) : (
                                <Link href={`/dashboard/admin/matches/${eventId}`} className="btn btn-secondary btn-sm w-full">
                                    <Icon icon="solar:eye-bold" width={16} /> ดูบอร์ดจัดแมตช์
                                </Link>
                            )}
                        </div>
                    </div>
                </div>

                {/* QR Code Card */}
                <div className="card shadow-sm flex flex-col items-center justify-center p-6 text-center bg-white ring-1 ring-gray-100">
                    <div className="bg-white p-3 rounded-2xl shadow-inner border border-gray-50 mb-3">
                        <QRCode
                            value={publicLiveUrl}
                            size={120}
                            style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                            viewBox={`0 0 256 256`}
                        />
                    </div>
                    <p className="text-[11px] font-black text-gray-900 uppercase tracking-tight">สแกนดูบอร์ดคิวแบบสด</p>
                    <p className="text-[9px] font-bold text-gray-400">Scan to view Live Board</p>
                </div>
            </div>

            {/* Check-in */}
            <div className="card shadow-sm" style={{ padding: '24px 32px' }}>
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--orange-500)' }}>
                        <Icon icon="solar:user-check-bold" width={20} style={{ color: 'var(--white)' }} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: 'var(--gray-900)' }}>รายชื่อผู้เล่น</h2>
                        <p className="text-sm font-medium" style={{ color: 'var(--gray-500)' }}>
                            เช็คอินแล้ว <span style={{ color: 'var(--orange-600)' }}>{eventPlayers.length}</span> คน
                        </p>
                    </div>
                </div>

                {event.status === 'closed' && (
                    <div className="p-3 rounded-xl mb-4 text-sm" style={{ background: 'var(--gray-100)', color: 'var(--gray-500)' }}>
                        ก๊วนนี้ปิดแล้ว ไม่สามารถเช็คอินเพิ่มได้
                    </div>
                )}

                {/* Search Box */}
                <div className="relative mb-4">
                    <Icon icon="solar:magnifer-linear" width={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-400)' }} />
                    <input
                        type="text"
                        placeholder="ค้นหาผู้เล่น..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                        style={{ borderColor: 'var(--gray-200)', color: 'var(--gray-900)' }}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition-colors"
                        >
                            <Icon icon="solar:close-circle-bold" width={14} style={{ color: 'var(--gray-500)' }} />
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {allUsers.filter(u =>
                        u.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        u.full_name.toLowerCase().includes(searchQuery.toLowerCase())
                    ).map((user) => {
                        const isChecked = checkedInIds.has(user.id);
                        const skill = skillIcon(user.skill_level);
                        return (
                            <button key={user.id} onClick={() => event.status === 'open' && toggleCheckIn(user.id)}
                                disabled={event.status === 'closed'}
                                className="flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                                style={{
                                    background: isChecked ? 'rgba(249, 115, 22, 0.04)' : 'transparent',
                                    border: `1.5px solid ${isChecked ? 'var(--orange-400)' : 'var(--gray-200)'}`,
                                    opacity: event.status === 'closed' ? 0.6 : 1,
                                    cursor: event.status === 'closed' ? 'default' : 'pointer',
                                }}>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                    style={{
                                        background: isChecked ? 'var(--orange-500)' : 'var(--gray-100)',
                                        color: isChecked ? 'var(--white)' : 'var(--gray-500)',
                                    }}>
                                    {isChecked ? <Icon icon="solar:check-read-linear" width={16} /> : user.display_name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate" style={{ color: isChecked ? 'var(--orange-600)' : 'var(--gray-900)' }}>
                                        {user.display_name}
                                    </p>
                                    <div className="flex items-center gap-1">
                                        <Icon icon={skill.icon} width={12} style={{ color: skill.color }} />
                                        <span className="text-xs" style={{ color: 'var(--gray-500)' }}>
                                            {user.skill_level || 'ไม่ระบุ'}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
