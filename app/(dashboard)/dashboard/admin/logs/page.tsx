'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import { CATEGORY_LABEL, type LogCategory } from '@/src/lib/activity-log';
import CustomSelect, { type SelectOption } from '@/src/components/CustomSelect';

interface ActivityLog {
    id: string;
    actor_id: string | null;
    actor_name: string | null;
    category: LogCategory;
    action: string;
    description: string;
    target_type: string | null;
    target_id: string | null;
    event_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

type TabKey = 'all' | LogCategory;

const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'all', label: 'ทั้งหมด', icon: 'solar:list-bold-duotone' },
    { key: 'match', label: CATEGORY_LABEL.match, icon: 'solar:sort-horizontal-bold-duotone' },
    { key: 'payment', label: CATEGORY_LABEL.payment, icon: 'solar:wallet-money-bold-duotone' },
    { key: 'player', label: CATEGORY_LABEL.player, icon: 'solar:users-group-rounded-bold-duotone' },
    { key: 'rank', label: CATEGORY_LABEL.rank, icon: 'solar:ranking-bold-duotone' },
];

const CATEGORY_STYLE: Record<LogCategory, { bg: string; text: string; icon: string }> = {
    match: { bg: 'bg-purple-50 border-purple-100', text: 'text-purple-600', icon: 'solar:sort-horizontal-bold' },
    payment: { bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-600', icon: 'solar:wallet-money-bold' },
    player: { bg: 'bg-blue-50 border-blue-100', text: 'text-blue-600', icon: 'solar:users-group-rounded-bold' },
    rank: { bg: 'bg-orange-50 border-orange-100', text: 'text-orange-600', icon: 'solar:ranking-bold' },
};

const DATE_OPTIONS: SelectOption[] = [
    { value: 'all', label: 'ทุกวัน', icon: 'solar:calendar-linear' },
    { value: 'today', label: 'วันนี้', icon: 'solar:calendar-date-bold' },
    { value: '7d', label: '7 วันล่าสุด', icon: 'solar:calendar-mark-linear' },
    { value: '30d', label: '30 วันล่าสุด', icon: 'solar:calendar-minimalistic-linear' },
];

const TIME_OPTIONS: SelectOption[] = [
    { value: 'all', label: 'ทั้งวัน', icon: 'solar:clock-circle-linear' },
    { value: 'morning', label: 'เช้า (06:00–12:00)', icon: 'solar:sunrise-linear' },
    { value: 'afternoon', label: 'บ่าย (12:00–18:00)', icon: 'solar:sun-linear' },
    { value: 'evening', label: 'เย็น–ค่ำ (18:00–24:00)', icon: 'solar:sunset-linear' },
    { value: 'night', label: 'กลางคืน (00:00–06:00)', icon: 'solar:moon-linear' },
];

// คืนช่วง [start, end) ของ time-of-day (ชั่วโมงเริ่ม, ชั่วโมงจบ)
const TIME_RANGES: Record<string, [number, number]> = {
    morning: [6, 12], afternoon: [12, 18], evening: [18, 24], night: [0, 6],
};

const PAGE_SIZE = 30;

export default function AdminLogsPage() {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [live, setLive] = useState(false);
    const [dateRange, setDateRange] = useState('all');
    const [timeOfDay, setTimeOfDay] = useState('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // ref สำหรับให้ handler ของ realtime อ่านค่าล่าสุดได้ โดยไม่ต้อง re-subscribe
    const tabRef = useRef<TabKey>(activeTab);
    const pageRef = useRef<number>(page);
    useEffect(() => { tabRef.current = activeTab; }, [activeTab]);
    useEffect(() => { pageRef.current = page; }, [page]);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        const supabase = createClient();

        // ตรวจสิทธิ์ admin
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.location.href = '/login'; return; }
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'admin') {
            toast.error('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
            window.location.href = '/dashboard';
            return;
        }

        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .range(from, to);

        if (activeTab !== 'all') query = query.eq('category', activeTab);

        // กรองวันที่ฝั่ง server (แม่นยำกับการแบ่งหน้า)
        if (dateRange !== 'all') {
            const now = new Date();
            let since: Date;
            if (dateRange === 'today') {
                since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            } else if (dateRange === '7d') {
                since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            } else {
                since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            }
            query = query.gte('created_at', since.toISOString());
        }

        const { data, error } = await query;
        if (error) {
            console.error('load logs error:', error.message);
            toast.error('ไม่สามารถโหลดบันทึกกิจกรรมได้');
            setLoading(false);
            return;
        }

        setLogs((data || []) as ActivityLog[]);
        setHasMore((data || []).length === PAGE_SIZE);
        setLoading(false);
    }, [activeTab, page, dateRange]);

    useEffect(() => { void (async () => { await loadLogs(); })(); }, [loadLogs]);

    // ===== Realtime: log ใหม่เด้งขึ้นบนสุดอัตโนมัติ (subscribe ครั้งเดียวตลอดอายุหน้า) =====
    useEffect(() => {
        const supabase = createClient();
        const channel = supabase
            .channel('activity_logs_stream')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, (payload) => {
                const newLog = payload.new as ActivityLog;
                // แสดงสดเฉพาะตอนอยู่หน้าแรก และตรงกับแถบที่เลือกอยู่
                if (pageRef.current !== 1) return;
                if (tabRef.current !== 'all' && newLog.category !== tabRef.current) return;
                setLogs(prev => {
                    if (prev.some(l => l.id === newLog.id)) return prev; // กันซ้ำ
                    return [newLog, ...prev].slice(0, PAGE_SIZE);
                });
            })
            .subscribe((status) => setLive(status === 'SUBSCRIBED'));

        return () => { supabase.removeChannel(channel); };
    }, []);

    const filtered = logs.filter(l => {
        // ค้นหาข้อความ/ผู้ทำรายการ
        const matchSearch = !search.trim() ||
            l.description.toLowerCase().includes(search.toLowerCase()) ||
            (l.actor_name || '').toLowerCase().includes(search.toLowerCase());
        if (!matchSearch) return false;

        // ช่วงเวลา (ตามเวลาท้องถิ่น)
        if (timeOfDay !== 'all') {
            const [start, end] = TIME_RANGES[timeOfDay];
            const hour = new Date(l.created_at).getHours();
            if (hour < start || hour >= end) return false;
        }
        return true;
    });

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) +
            ' · ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="animate-in pb-12">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: 'var(--gray-900)' }}>
                    <Icon icon="solar:clipboard-list-bold-duotone" width={24} className="text-white" />
                </div>
                <div>
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--gray-900)' }}>บันทึกกิจกรรม</h1>
                        <span
                            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border"
                            style={live
                                ? { background: 'rgba(22,163,74,0.08)', color: 'var(--success)', borderColor: 'rgba(22,163,74,0.2)' }
                                : { background: 'var(--gray-100)', color: 'var(--gray-400)', borderColor: 'var(--gray-200)' }}
                            title={live ? 'กำลังอัปเดตสด' : 'กำลังเชื่อมต่อ...'}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${live ? 'animate-pulse' : ''}`} style={{ background: live ? 'var(--success)' : 'var(--gray-400)' }} />
                            {live ? 'สด' : 'ออฟไลน์'}
                        </span>
                    </div>
                    <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--gray-500)' }}>ประวัติการทำรายการในระบบ — ใครทำอะไร เมื่อไหร่ (อัปเดตอัตโนมัติ)</p>
                </div>
            </div>

            {/* Tabs + Search */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-5">
                <div className="flex flex-wrap gap-2">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => { setActiveTab(t.key); setPage(1); }}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all"
                            style={{
                                background: activeTab === t.key ? 'var(--gray-900)' : 'var(--white)',
                                color: activeTab === t.key ? 'var(--white)' : 'var(--gray-600)',
                                border: `1.5px solid ${activeTab === t.key ? 'var(--gray-900)' : 'var(--gray-200)'}`,
                            }}
                        >
                            <Icon icon={t.icon} width={16} />
                            <span>{t.label}</span>
                        </button>
                    ))}
                </div>

                <div className="relative flex-1 max-w-xs">
                    <Icon icon="solar:magnifer-linear" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" width={16} />
                    <input
                        type="text"
                        placeholder="ค้นหาข้อความ / ผู้ทำรายการ..."
                        className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all shadow-sm"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Date + Time-of-day filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <CustomSelect
                    className="w-full sm:w-56"
                    icon="solar:calendar-linear"
                    value={dateRange}
                    onChangeAction={(v) => { setDateRange(v); setPage(1); }}
                    options={DATE_OPTIONS}
                />
                <CustomSelect
                    className="w-full sm:w-56"
                    icon="solar:clock-circle-linear"
                    value={timeOfDay}
                    onChangeAction={(v) => setTimeOfDay(v)}
                    options={TIME_OPTIONS}
                />
            </div>

            {/* List */}
            {loading ? (
                <div className="flex items-center justify-center py-20"><div className="spinner" style={{ width: 28, height: 28 }} /></div>
            ) : filtered.length === 0 ? (
                <div className="card text-center" style={{ padding: '64px 24px' }}>
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--gray-100)' }}>
                        <Icon icon="solar:clipboard-remove-linear" width={32} style={{ color: 'var(--gray-400)' }} />
                    </div>
                    <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--gray-900)' }}>ยังไม่มีบันทึกกิจกรรม</h2>
                    <p className="text-sm" style={{ color: 'var(--gray-500)' }}>เมื่อมีการทำรายการในระบบ จะแสดงที่นี่</p>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {filtered.map((log, i) => {
                        const style = CATEGORY_STYLE[log.category];
                        return (
                            <div
                                key={log.id}
                                style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--gray-100)' : 'none' }}
                            >
                                <div className="flex items-start gap-3 px-4 sm:px-5 py-3.5">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${style.bg} ${style.text}`}>
                                        <Icon icon={style.icon} width={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--gray-900)' }}>
                                            {log.description}
                                        </p>
                                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1">
                                            <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
                                                {CATEGORY_LABEL[log.category]}
                                            </span>
                                            <span className="text-[11px] font-medium" style={{ color: 'var(--gray-500)' }}>
                                                โดย {log.actor_name || 'ไม่ทราบ'}
                                            </span>
                                            <span className="text-[11px]" style={{ color: 'var(--gray-400)' }}>· {formatTime(log.created_at)}</span>
                                        </div>
                                    </div>
                                    {/* ปุ่มดูรายละเอียดแบบโค้ด (JSON) — ไว้ debug ตอน error */}
                                    <button
                                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                                        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors"
                                        style={expandedId === log.id
                                            ? { background: 'var(--gray-900)', color: 'var(--white)', borderColor: 'var(--gray-900)' }
                                            : { background: 'var(--white)', color: 'var(--gray-500)', borderColor: 'var(--gray-200)' }}
                                        title="ดูรายละเอียดแบบโค้ด (JSON)"
                                    >
                                        <Icon icon="solar:code-square-linear" width={14} />
                                        <span className="hidden sm:inline">โค้ด</span>
                                        <Icon icon="solar:alt-arrow-down-linear" width={12} className={`transition-transform ${expandedId === log.id ? 'rotate-180' : ''}`} />
                                    </button>
                                </div>
                                {expandedId === log.id && (
                                    <div className="px-4 sm:px-5 pb-4">
                                        <pre className="text-[11px] leading-relaxed rounded-xl p-3 overflow-x-auto" style={{ background: '#0f172a', color: '#e2e8f0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
{JSON.stringify({
    id: log.id,
    action: log.action,
    category: log.category,
    actor_id: log.actor_id,
    actor_name: log.actor_name,
    target_type: log.target_type,
    target_id: log.target_id,
    event_id: log.event_id,
    created_at: log.created_at,
    metadata: log.metadata ?? {},
}, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Pagination */}
            {!loading && (page > 1 || hasMore) && (
                <div className="flex items-center justify-between px-1 mt-5">
                    <span className="text-xs font-semibold text-gray-500">หน้า {page}</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-gray-200 bg-white hover:bg-gray-50 transition-all"
                            style={page === 1 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                        >
                            ก่อนหน้า
                        </button>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={!hasMore}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-gray-200 bg-white hover:bg-gray-50 transition-all"
                            style={!hasMore ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                        >
                            ถัดไป
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
