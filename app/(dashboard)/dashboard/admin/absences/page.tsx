'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/src/lib/supabase/client';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import type { Profile } from '@/src/types';
import RankBadge from '@/src/components/RankBadge';
import { truncateName } from '@/src/lib/string-utils';

interface ClosedEvent {
    id: string;
    event_date: string;
}

interface UserAbsenceStat {
    user: Profile;
    absencesSinceReset: number;
    totalAttended: number;
    attendanceRate: number;
}

const TH_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export default function AdminAbsencesPage() {
    const [users, setUsers] = useState<Profile[]>([]);
    const [events, setEvents] = useState<ClosedEvent[]>([]);
    const [registrations, setRegistrations] = useState<Set<string>>(new Set());
    const [latestResetDate, setLatestResetDate] = useState<string>('1970-01-01T00:00:00Z');
    
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [mounted, setMounted] = useState(false);
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;
    
    // Calendar Modal State
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [calendarDate, setCalendarDate] = useState<Date>(new Date());

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);
    
    const fetchAbsenceData = useCallback(async () => {
        setLoading(true);
        const supabase = createClient();

        // 1. Admin Verification
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
            window.location.href = '/login';
            return;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', authUser.id)
            .single();

        if (profile?.role !== 'admin') {
            toast.error('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
            window.location.href = '/dashboard';
            return;
        }

        try {
            // 2. Fetch profiles (excluding guests)
            const { data: usersData } = await supabase
                .from('profiles')
                .select('*')
                .order('display_name', { ascending: true });
            
            const activeUsers = (usersData || []).filter((u: Profile) => !u.is_guest);
            setUsers(activeUsers);

            // 3. Fetch latest executed reset date
            const { data: resets } = await supabase
                .from('rank_reset_schedule')
                .select('reset_at')
                .eq('status', 'executed')
                .order('reset_at', { ascending: false })
                .limit(1);
            const resetDateStr = resets && resets[0] ? resets[0].reset_at : '1970-01-01T00:00:00Z';
            setLatestResetDate(resetDateStr);

            // 4. Fetch all closed events
            const { data: eventsData } = await supabase
                .from('events')
                .select('id, event_date')
                .eq('status', 'closed')
                .order('event_date', { ascending: true });
            setEvents((eventsData || []) as ClosedEvent[]);

            // 5. Fetch all event players (registrations)
            const { data: regData } = await supabase
                .from('event_players')
                .select('user_id, event_id');
            
            const regSet = new Set((regData || []).map((r: any) => `${r.user_id}_${r.event_id}`));
            setRegistrations(regSet);

        } catch (err) {
            console.error('Error fetching attendance data:', err);
            toast.error('ไม่สามารถโหลดข้อมูลประวัติการเข้าก๊วนได้');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAbsenceData();
    }, [fetchAbsenceData]);

    // Calculate detailed stats for rendering
    const statsList: UserAbsenceStat[] = users.map(user => {
        // Filter events post latest reset
        const eventsPostReset = events.filter(e => e.event_date > latestResetDate);
        
        // Count absences since reset (where registration does not exist)
        let absencesSinceReset = 0;
        
        // Logic: หลังรีแรงค์ล่าสุด ถ้าไม่เคยมาเล่นเลย -> นับขาดก๊วนทั้งหมด
        // แต่ถ้าเคยมาเล่นอย่างน้อย 1 ครั้ง -> การขาดในซีซันนี้เป็น 0 (ถือว่า safe)
        const hasPlayedSinceReset = eventsPostReset.some(e => registrations.has(`${user.id}_${e.id}`));
        
        if (hasPlayedSinceReset) {
            absencesSinceReset = 0;
        } else {
            // นับขาดสะสมย้อนกลับจาก event ล่าสุด
            for (let i = events.length - 1; i >= 0; i--) {
                if (!registrations.has(`${user.id}_${events[i].id}`)) {
                    absencesSinceReset++;
                } else {
                    break;
                }
            }
        }

        // Total attended closed events
        const totalAttended = events.filter(e => registrations.has(`${user.id}_${e.id}`)).length;
        const attendanceRate = events.length > 0 ? (totalAttended / events.length) * 100 : 100;

        return {
            user,
            absencesSinceReset,
            totalAttended,
            attendanceRate
        };
    });

    // Filtered stats based on search query
    const filteredStats = statsList.filter(item => 
        item.user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.user.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Calculate aggregated stats
    const totalClosedDays = events.length;
    const mostAbsencesUser = [...statsList].sort((a, b) => b.absencesSinceReset - a.absencesSinceReset)[0];
    const perfectAttendanceCount = statsList.filter(item => item.totalAttended === totalClosedDays && totalClosedDays > 0).length;

    // Pagination Calculations
    const totalPages = Math.ceil(filteredStats.length / ITEMS_PER_PAGE);
    const paginatedStats = filteredStats.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    // Helper to parse dates without timezone shift
    const parseEventDate = (dateStr: string) => {
        if (!dateStr) return { year: 0, month: 0, day: 0 };
        const cleanStr = dateStr.split('T')[0]; // "YYYY-MM-DD"
        const parts = cleanStr.split('-');
        return {
            year: parseInt(parts[0], 10),
            month: parseInt(parts[1], 10) - 1, // 0-indexed
            day: parseInt(parts[2], 10)
        };
    };

    // Calendar Calculations
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const currentYear = calendarDate.getFullYear();
    const currentMonth = calendarDate.getMonth();
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDayIndex = getFirstDayOfMonth(currentYear, currentMonth);

    // Month navigation
    const prevMonth = () => {
        setCalendarDate(new Date(currentYear, currentMonth - 1, 1));
    };

    const nextMonth = () => {
        setCalendarDate(new Date(currentYear, currentMonth + 1, 1));
    };

    const handleOpenCalendar = (user: Profile) => {
        setSelectedUser(user);
        if (events.length > 0) {
            // Default to the month of the latest closed event to ensure there's data visible immediately
            const latestEvent = events[events.length - 1];
            const { year, month } = parseEventDate(latestEvent.event_date);
            setCalendarDate(new Date(year, month, 1));
        } else {
            setCalendarDate(new Date());
        }
    };

    // Render calendar cell helpers
    const renderCalendarCells = () => {
        const cells = [];
        
        // Blank cells before first day of month
        for (let i = 0; i < firstDayIndex; i++) {
            cells.push(<div key={`empty-${i}`} className="h-9 sm:h-12 w-full bg-gray-50/20" />);
        }

        // Actual day cells
        for (let day = 1; day <= daysInMonth; day++) {
            // Check if there was an event on this day (comparing parsed date parts to prevent format & timezone offset issues)
            const dayEvent = events.find(e => {
                const { year, month, day: evDay } = parseEventDate(e.event_date);
                return year === currentYear && month === currentMonth && evDay === day;
            });
            
            let cellStyle = "bg-white text-gray-700 hover:bg-gray-50";
            let statusIcon = null;
            let title = `${day} ${TH_MONTHS[currentMonth]}`;

            if (dayEvent) {
                const attended = selectedUser ? registrations.has(`${selectedUser.id}_${dayEvent.id}`) : false;
                if (attended) {
                    cellStyle = "bg-emerald-50 text-emerald-700 border-2 border-emerald-500 font-bold shadow-sm shadow-emerald-100";
                    statusIcon = <Icon icon="solar:check-circle-bold" className="text-emerald-500 absolute top-1 right-1 text-[10px] sm:text-xs" />;
                    title += ` (เข้าร่วมก๊วน)`;
                } else {
                    cellStyle = "bg-rose-50 text-rose-700 border-2 border-rose-500 font-bold shadow-sm shadow-rose-100";
                    statusIcon = <Icon icon="solar:close-circle-bold" className="text-rose-500 absolute top-1 right-1 text-[10px] sm:text-xs" />;
                    title += ` (ขาดก๊วน)`;
                }
            }

            cells.push(
                <div 
                    key={`day-${day}`} 
                    className={`h-9 sm:h-12 w-full rounded-xl flex flex-col items-center justify-center relative border transition-all text-[11px] sm:text-sm select-none cursor-help ${cellStyle}`}
                    title={title}
                >
                    <span>{day}</span>
                    {statusIcon}
                </div>
            );
        }

        return cells;
    };

    // Filter events of the currently viewed month
    const monthEvents = events.filter(e => {
        const { year, month } = parseEventDate(e.event_date);
        return year === currentYear && month === currentMonth;
    });

    if (loading && users.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="spinner" />
            </div>
        );
    }

    return (
        <div className="animate-in pb-10">
            {/* Header Area */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm border border-gray-100 shrink-0">
                            <img src="/images/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">ประวัติการเข้าก๊วนสมาชิก</h1>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">ดูสถิติการมาเล่นก๊วน การขาดก๊วน และปฏิทินความถี่ในการเข้าร่วมของสมาชิก</p>
                </div>
 
                {/* Aggregated Stats Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
                    <div className="bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 group hover:border-blue-100 transition-colors">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                            <Icon icon="solar:calendar-date-bold-duotone" width={22} />
                        </div>
                        <div className="pr-2">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">ก๊วนปิดแล้ว</p>
                            <p className="text-xl font-black text-gray-900 leading-none">{totalClosedDays} ครั้ง</p>
                        </div>
                    </div>
 
                    <div className="bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 group hover:border-rose-100 transition-colors">
                        <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                            <Icon icon="solar:user-block-bold-duotone" width={22} />
                        </div>
                        <div className="pr-2">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">ขาดสะสมเยอะสุด</p>
                            <p className="text-sm font-bold text-gray-900 leading-none truncate max-w-[120px]">
                                {mostAbsencesUser ? `${mostAbsencesUser.user.display_name} (${mostAbsencesUser.absencesSinceReset})` : '-'}
                            </p>
                        </div>
                    </div>
 
                    <div className="bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 group hover:border-emerald-100 transition-colors">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                            <Icon icon="solar:medal-bold-duotone" width={22} />
                        </div>
                        <div className="pr-2">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">เข้าเล่นครบ 100%</p>
                            <p className="text-xl font-black text-gray-900 leading-none">{perfectAttendanceCount} คน</p>
                        </div>
                    </div>
                </div>
            </div>
 
            {/* Filter and Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
                        ระบบคำนวณการขาดตั้งแต่วันที่รีแรงค์ล่าสุด: <span className="text-orange-500 font-extrabold">{new Date(latestResetDate).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</span>
                    </span>
                </div>
 
                <div className="relative flex-1 max-w-md">
                    <Icon icon="solar:magnifer-linear" className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" width={18} />
                    <input
                        type="text"
                        placeholder="ค้นหาสมาชิก..."
                        className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-gray-100 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all shadow-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>
 
            {/* User List Table */}
            <div className="card shadow-sm overflow-hidden p-0 border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-50">
                                <th className="hidden sm:table-cell px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400">รูปภาพ</th>
                                <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">สมาชิก</th>
                                <th className="hidden md:table-cell px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">ระดับ Rank</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">ขาดก๊วนล่าสุด</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-center">การเข้าเล่นก๊วนทั้งหมด</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">ปฏิทินก๊วน</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {paginatedStats.length > 0 ? paginatedStats.map((item) => (
                                <tr key={item.user.id} className="hover:bg-gray-50/30 transition-colors">
                                    <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap">
                                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0 border-2 border-white shadow-sm overflow-hidden">
                                            {item.user.avatar_url ? (
                                                <img src={item.user.avatar_url} alt={item.user.display_name} className="w-full h-full object-cover" />
                                            ) : (
                                                item.user.display_name?.charAt(0).toUpperCase() || 'U'
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-col gap-0.5 min-w-[120px]">
                                            <p className="text-sm font-bold text-gray-900">{truncateName(item.user.display_name, 16)}</p>
                                            <p className="text-[10px] font-medium text-gray-400 truncate max-w-[150px]">{item.user.email}</p>
                                            {/* Rank Badge for Small screens (< md) */}
                                            <div className="md:hidden mt-1">
                                                <RankBadge mmr={item.user.mmr || 1000} size="sm" />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap">
                                        <RankBadge mmr={item.user.mmr || 1000} size="sm" />
                                    </td>
                                    <td className="px-6 py-4 text-center whitespace-nowrap">
                                        {item.absencesSinceReset > 0 ? (
                                            <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 border border-rose-100 inline-flex items-center gap-1">
                                                <Icon icon="solar:danger-bold" width={14} /> ขาด {item.absencesSinceReset} ครั้ง
                                            </span>
                                        ) : (
                                            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 inline-flex items-center gap-1">
                                                <Icon icon="solar:check-circle-bold" width={14} /> ไม่มีประวัติขาด
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center whitespace-nowrap">
                                        <div className="flex flex-col items-center justify-center">
                                            <span className="text-xs font-bold text-gray-800">
                                                มา {item.totalAttended} / {totalClosedDays} ครั้ง
                                            </span>
                                            <div className="w-20 bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
                                                <div 
                                                    className={`h-1.5 rounded-full ${item.attendanceRate > 70 ? 'bg-emerald-500' : item.attendanceRate > 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                    style={{ width: `${item.attendanceRate}%` }}
                                                />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right whitespace-nowrap">
                                        <button
                                            onClick={() => handleOpenCalendar(item.user)}
                                            className="px-3 py-2 sm:px-4 sm:py-2 text-xs font-bold bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 rounded-xl shadow-sm inline-flex items-center gap-1.5 transition-all"
                                        >
                                            <Icon icon="solar:calendar-bold-duotone" width={16} className="text-blue-500" />
                                            <span className="hidden sm:inline">ดูปฏิทิน</span>
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center gap-2">
                                            <Icon icon="solar:users-group-rounded-linear" className="text-gray-200" width={48} />
                                            <p className="text-sm font-bold text-gray-400">ไม่พบสมาชิกตามชื่อที่ค้นหา</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                        <span className="text-xs font-semibold text-gray-500">
                            หน้า {currentPage} จาก {totalPages}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border border-gray-200 bg-white hover:bg-gray-50"
                                style={currentPage === 1 ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                            >
                                ก่อนหน้า
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border border-gray-200 bg-white hover:bg-gray-50"
                                style={currentPage === totalPages ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                            >
                                ถัดไป
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Calendar Modal Overlay */}
            {selectedUser && mounted && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-lg" onClick={() => setSelectedUser(null)} />
                    <div className="relative w-full max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 z-10 my-4 sm:my-8">
                        {/* Modal Header */}
                        <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-4 sm:p-6 text-white relative">
                            <button
                                onClick={() => setSelectedUser(null)}
                                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-all z-20"
                            >
                                <Icon icon="solar:close-circle-bold" width={24} />
                            </button>

                            <div className="flex items-center gap-4 pt-2">
                                <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center text-xl font-black shadow-lg overflow-hidden shrink-0 border border-white/20">
                                    {selectedUser.avatar_url ? (
                                        <img src={selectedUser.avatar_url} alt={selectedUser.display_name} className="w-full h-full object-cover" />
                                    ) : (
                                        selectedUser.display_name.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-lg font-black leading-tight truncate">{selectedUser.display_name}</h2>
                                    <p className="text-gray-400 text-xs font-semibold mt-0.5">ประวัติเช็คอินและขาดก๊วนรายวัน</p>
                                </div>
                            </div>
                        </div>

                        {/* Calendar Section */}
                        <div className="p-4 sm:p-6">
                            {/* Month Selector */}
                            <div className="flex items-center justify-between mb-6">
                                <button 
                                    onClick={prevMonth}
                                    className="p-2 rounded-xl border border-gray-100 hover:bg-gray-50 text-gray-600 transition-colors"
                                >
                                    <Icon icon="solar:alt-arrow-left-bold" width={18} />
                                </button>
                                <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">
                                    {TH_MONTHS[currentMonth]} {currentYear + 543}
                                </h3>
                                <button 
                                    onClick={nextMonth}
                                    className="p-2 rounded-xl border border-gray-100 hover:bg-gray-50 text-gray-600 transition-colors"
                                >
                                    <Icon icon="solar:alt-arrow-right-bold" width={18} />
                                </button>
                            </div>

                            {/* Calendar Table Grid */}
                            <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-gray-400 mb-2">
                                <div>อา</div>
                                <div>จ</div>
                                <div>อ</div>
                                <div>พ</div>
                                <div>พฤ</div>
                                <div>ศ</div>
                                <div>ส</div>
                            </div>

                            <div className="grid grid-cols-7 gap-1 text-center">
                                {renderCalendarCells()}
                            </div>

                            {/* Calendar Legend */}
                            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-4 sm:mt-6 pt-4 border-t border-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <div className="flex items-center gap-1">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                    <span>มาเล่นก๊วน</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                                    <span>ขาดก๊วน</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                                    <span>ไม่มีก๊วน</span>
                                </div>
                            </div>
                        </div>

                        {/* List of events of viewed month */}
                        <div className="bg-gray-50/50 px-4 py-3 sm:px-6 sm:py-4 max-h-[160px] overflow-y-auto border-t border-gray-50">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">สรุปก๊วนประจำเดือนนี้</h4>
                            {monthEvents.length > 0 ? (
                                <div className="space-y-2">
                                    {monthEvents.map(e => {
                                        const attended = registrations.has(`${selectedUser.id}_${e.id}`);
                                        return (
                                            <div key={e.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-gray-100 text-xs shadow-sm">
                                                <div className="min-w-0">
                                                    <p className="font-bold text-gray-800 truncate">ก๊วนแบดมินตัน</p>
                                                    <p className="text-[10px] text-gray-400 font-semibold">{new Date(e.event_date).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</p>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${attended ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                    {attended ? 'เข้าร่วม' : 'ขาดเล่น'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-[10px] font-bold text-gray-400 text-center py-4">ไม่มีก๊วนที่ปิดในเดือนนี้</p>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
