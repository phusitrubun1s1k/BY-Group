'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';
import { Icon } from '@iconify/react';
import type { Notification } from '@/src/types';
import toast from 'react-hot-toast';
import { useConfirm } from '@/src/components/ConfirmProvider';

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
    const [userId, setUserId] = useState<string>('');
    const router = useRouter();
    const confirm = useConfirm();
    const supabase = createClient();

    useEffect(() => {
        const getSession = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserId(user.id);
                await loadNotifications(user.id);
            }
        };
        getSession();
    }, []);

    useEffect(() => {
        if (!userId) return;

        // Subscribe to realtime changes
        const channel = supabase.channel(`notifications:page_user_id=eq.${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    const newNotif = payload.new as Notification;
                    setNotifications(prev => [newNotif, ...prev]);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    const updatedNotif = payload.new as Notification;
                    setNotifications(prev => prev.map(n => n.id === updatedNotif.id ? updatedNotif : n));
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    const deletedId = payload.old.id;
                    setNotifications(prev => prev.filter(n => n.id !== deletedId));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId]);

    const loadNotifications = async (uid: string) => {
        setLoading(true);
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', uid)
            .order('created_at', { ascending: false });

        if (!error && data) {
            setNotifications(data as Notification[]);
        } else if (error) {
            console.error('Error fetching notifications:', error);
            toast.error('ไม่สามารถโหลดข้อมูลการแจ้งเตือนได้');
        }
        setLoading(false);
    };

    const handleNotificationClick = async (notif: Notification) => {
        if (!notif.is_read) {
            // Optimistic update
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
            await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
        }
        if (notif.link_url) {
            router.push(notif.link_url);
        }
    };

    const markAllAsRead = async () => {
        const unreadList = notifications.filter(n => !n.is_read);
        if (unreadList.length === 0) return;

        // Optimistic update
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        toast.success('อ่านการแจ้งเตือนทั้งหมดแล้ว');

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) {
            console.error(error);
        }
    };

    const deleteNotification = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const ok = await confirm({
            title: 'ลบการแจ้งเตือน?',
            message: 'ต้องการลบการแจ้งเตือนนี้หรือไม่?',
            type: 'danger',
            confirmText: 'ลบออก'
        });
        if (!ok) return;

        // Save original notifications list to restore if deletion fails
        const originalNotifs = [...notifications];
        
        // Optimistic update
        setNotifications(prev => prev.filter(n => n.id !== id));

        const { error } = await supabase.from('notifications').delete().eq('id', id);
        
        if (error) {
            console.error('Error deleting notification:', error);
            toast.error('ไม่สามารถลบการแจ้งเตือนได้: ' + error.message);
            // Restore original list
            setNotifications(originalNotifs);
        } else {
            toast.success('ลบการแจ้งเตือนแล้ว');
        }
    };

    const clearAll = async () => {
        if (notifications.length === 0) return;
        const ok = await confirm({
            title: 'ลบการแจ้งเตือนทั้งหมด?',
            message: 'ต้องการลบการแจ้งเตือนทั้งหมดใช่หรือไม่? เมื่อลบแล้วจะไม่สามารถย้อนคืนได้',
            type: 'danger',
            confirmText: 'ลบทั้งหมด'
        });
        if (!ok) return;

        const originalNotifs = [...notifications];
        setNotifications([]);

        const { error } = await supabase.from('notifications').delete().eq('user_id', userId);
        
        if (error) {
            console.error('Error clearing notifications:', error);
            toast.error('ไม่สามารถลบการแจ้งเตือนทั้งหมดได้: ' + error.message);
            setNotifications(originalNotifs);
        } else {
            toast.success('ลบการแจ้งเตือนทั้งหมดแล้ว');
        }
    };

    const getIconForType = (type: string) => {
        switch (type) {
            case 'match_start': return { icon: 'solar:whistle-bold-duotone', color: 'var(--orange-500)', bg: 'rgba(249, 115, 22, 0.08)' };
            case 'payment_reminder': return { icon: 'solar:wallet-money-bold-duotone', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.08)' };
            case 'achievement': return { icon: 'solar:medal-star-bold-duotone', color: '#eab308', bg: 'rgba(234, 179, 8, 0.08)' };
            default: return { icon: 'solar:bell-bing-bold-duotone', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.08)' };
        }
    };

    const filtered = notifications.filter(n => {
        if (activeTab === 'unread') return !n.is_read;
        return true;
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="spinner" style={{ width: 28, height: 28 }} />
            </div>
        );
    }

    return (
        <div className="animate-in max-w-3xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2" style={{ color: 'var(--gray-900)' }}>
                        🔔 การแจ้งเตือนทั้งหมด
                    </h1>
                    <p className="text-sm font-medium" style={{ color: 'var(--gray-500)' }}>
                        ติดตามข่าวสาร แมตช์การตี และสถิติต่างๆ ในก๊วนของคุณ
                    </p>
                </div>
                <div className="flex gap-2">
                    {notifications.some(n => !n.is_read) && (
                        <button
                            onClick={markAllAsRead}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 hover:bg-orange-100 text-xs font-bold transition-all shadow-sm"
                        >
                            <Icon icon="solar:double-alt-arrow-right-bold-duotone" width={16} />
                            อ่านทั้งหมด
                        </button>
                    )}
                    {notifications.length > 0 && (
                        <button
                            onClick={clearAll}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 text-xs font-bold transition-all shadow-sm"
                        >
                            <Icon icon="solar:trash-bin-trash-bold-duotone" width={16} />
                            ลบทั้งหมด
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b pb-3" style={{ borderColor: 'var(--gray-200)' }}>
                {[
                    { key: 'all', label: 'ทั้งหมด', count: notifications.length },
                    { key: 'unread', label: 'ยังไม่ได้อ่าน', count: notifications.filter(n => !n.is_read).length }
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key as any)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                        style={{
                            background: activeTab === t.key ? 'var(--gray-900)' : 'transparent',
                            color: activeTab === t.key ? 'var(--white)' : 'var(--gray-500)',
                        }}
                    >
                        <span>{t.label}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            activeTab === t.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>
                            {t.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div className="card text-center" style={{ padding: '64px 24px' }}>
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-gray-50">
                        <Icon icon="solar:ghost-linear" width={32} style={{ color: 'var(--gray-400)' }} />
                    </div>
                    <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--gray-900)' }}>
                        {activeTab === 'unread' ? 'ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน' : 'ไม่มีการแจ้งเตือน'}
                    </h2>
                    <p className="text-sm" style={{ color: 'var(--gray-500)' }}>
                        ระบบจะทำการส่งการแจ้งเตือนต่างๆ ให้คุณทราบที่นี่
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {filtered.map(notif => {
                        const style = getIconForType(notif.type);
                        return (
                            <div
                                key={notif.id}
                                onClick={() => handleNotificationClick(notif)}
                                className={`card flex items-start gap-4 p-4 transition-all duration-200 hover:scale-[1.01] hover:shadow-md cursor-pointer ${
                                    !notif.is_read ? 'bg-orange-50/10 ring-1 ring-orange-500/20' : 'bg-white'
                                }`}
                                style={{ padding: '16px 20px', border: '1px solid var(--gray-200)' }}
                            >
                                <div
                                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                                    style={{ background: style.bg, color: style.color }}
                                >
                                    <Icon icon={style.icon} width={24} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-4 mb-1">
                                        <h3 className={`text-base tracking-tight ${
                                            !notif.is_read ? 'font-black text-gray-950' : 'font-bold text-gray-800'
                                        }`}>
                                            {notif.title}
                                        </h3>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {!notif.is_read && (
                                                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                                            )}
                                            <button
                                                onClick={(e) => deleteNotification(notif.id, e)}
                                                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
                                                title="ลบออก"
                                            >
                                                <Icon icon="solar:close-circle-bold" width={18} />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-sm font-medium leading-relaxed text-gray-500 mb-2">
                                        {notif.body}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
                                        <Icon icon="solar:clock-circle-bold" width={14} />
                                        <span>{new Date(notif.created_at).toLocaleString('th-TH', {
                                            dateStyle: 'medium',
                                            timeStyle: 'short'
                                        })}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
