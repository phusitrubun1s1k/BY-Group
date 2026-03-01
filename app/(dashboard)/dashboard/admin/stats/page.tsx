'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { Icon } from '@iconify/react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: string;
    color: string;
    description?: string;
}

const StatCard = ({ title, value, icon, color, description }: StatCardProps) => (
    <div className="card p-6 flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${color}15`, color }}>
            <Icon icon={icon} width={24} />
        </div>
        <div>
            <p className="text-sm font-bold text-gray-500 mb-1">{title}</p>
            <h3 className="text-2xl font-black text-gray-900">{value}</h3>
            {description && <p className="text-[11px] font-semibold text-gray-400 mt-1">{description}</p>}
        </div>
    </div>
);

export default function AdminStatsPage() {
    const [stats, setStats] = useState({
        totalRevenue: 0,
        totalExpense: 0,
        totalProfit: 0,
        eventCount: 0
    });
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        setLoading(true);
        const supabase = createClient();

        // 1. Load all events with their players and costs
        const { data: eventData } = await supabase
            .from('events')
            .select('*, event_players(amount, payment_status)')
            .order('event_date', { ascending: false });

        if (eventData) {
            let rev = 0;
            let exp = 0;

            const processedEvents = eventData.map(ev => {
                const eventRevenue = ev.event_players
                    ?.filter((p: any) => p.payment_status === 'paid')
                    .reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0;

                const eventExpense = (ev.actual_court_fee || 0) +
                    ((ev.actual_shuttle_box_price || 0) * (ev.actual_shuttle_boxes_used || 0));

                rev += eventRevenue;
                exp += eventExpense;

                return {
                    ...ev,
                    revenue: eventRevenue,
                    expense: eventExpense,
                    profit: eventRevenue - eventExpense
                };
            });

            setEvents(processedEvents);
            setStats({
                totalRevenue: rev,
                totalExpense: exp,
                totalProfit: rev - exp,
                eventCount: processedEvents.length
            });
        }
        setLoading(false);
    };

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" /></div>;

    return (
        <div className="animate-in pb-20">
            <header className="mb-8">
                <h1 className="text-3xl font-black text-gray-900 mb-2">สถิติก๊วน</h1>
                <p className="text-gray-500 font-medium">สรุปรายรับ-รายจ่าย และกำไรสะสมของก๊วน</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <StatCard
                    title="รายรับทั้งหมด"
                    value={`฿${stats.totalRevenue.toLocaleString()}`}
                    icon="solar:wallet-money-bold-duotone"
                    color="#10b981"
                    description="เฉพาะยอดที่ยืนยันการชำระเงินแล้ว"
                />
                <StatCard
                    title="รายจ่ายทั้งหมด"
                    value={`฿${stats.totalExpense.toLocaleString()}`}
                    icon="solar:bill-list-bold-duotone"
                    color="#ef4444"
                    description="ค่าสนาม + ค่าลูกแบด (ต้นทุน)"
                />
                <StatCard
                    title="เงินกองกลางสะสม"
                    value={`฿${stats.totalProfit.toLocaleString()}`}
                    icon="solar:wad-of-money-bold-duotone"
                    color="#f59e0b"
                    description={stats.totalProfit >= 0 ? "ก๊วนมีกำไร" : "ก๊วนเข้าเนื้อ"}
                />
            </div>

            <section>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Icon icon="solar:history-bold-duotone" className="text-orange-500" />
                        ประวัติรายรับ-รายจ่ายแต่ละครั้ง
                    </h2>
                </div>

                <div className="card overflow-hidden" style={{ padding: 0 }}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-bottom border-gray-100">
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-wider">วันที่</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-wider">รายการ</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-wider">รายรับ</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-wider">รายจ่าย</th>
                                    <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-wider">กำไร/ขาดทุน</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {events.map((ev) => (
                                    <tr key={ev.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-bold text-gray-900">
                                                {format(new Date(ev.event_date), 'dd MMM yyyy', { locale: th })}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-semibold text-gray-600">{ev.event_name || 'กิจกรรมแบดมินตัน'}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-bold text-emerald-600">฿{ev.revenue.toLocaleString()}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-bold text-red-500">฿{ev.expense.toLocaleString()}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${ev.profit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                {ev.profit >= 0 ? '+' : ''}{ev.profit.toLocaleString()}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
}
