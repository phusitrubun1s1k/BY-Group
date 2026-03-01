'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';
import type { Event } from '@/src/types';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Icon } from '@iconify/react';

const AVAILABLE_COURTS = ['1', '2', '3', '4'];

export default function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [eventId, setEventId] = useState('');
    const [form, setForm] = useState({
        event_date: '',
        shuttlecock_brand: '', shuttlecock_price: '', entry_fee: '',
        start_time: '19:00', end_time: '23:00',
    });
    const [selectedCourts, setSelectedCourts] = useState<string[]>([]);

    useEffect(() => {
        params.then((p) => { setEventId(p.id); loadData(p.id); });
    }, [params]);

    const loadData = async (id: string) => {
        const supabase = createClient();
        const { data, error } = await supabase.from('events').select('*').eq('id', id).single();
        if (error || !data) {
            toast.error('ไม่พบข้อมูลก๊วน');
            router.push('/dashboard/admin/events');
            return;
        }

        const ev = data as Event;
        if (ev.status !== 'open') {
            toast.error('ก๊วนนี้ปิดรับสมัครแล้ว ไม่สามารถแก้ไขได้');
            router.push(`/dashboard/admin/events/${id}`);
            return;
        }

        setForm({
            event_date: ev.event_date,
            shuttlecock_brand: ev.shuttlecock_brand,
            shuttlecock_price: ev.shuttlecock_price.toString(),
            entry_fee: ev.entry_fee.toString(),
            start_time: ev.start_time || '19:00',
            end_time: ev.end_time || '23:00',
        });
        setSelectedCourts(ev.courts || []);
        setLoading(false);
    };

    const updateField = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

    const toggleCourt = (court: string) => {
        setSelectedCourts(prev =>
            prev.includes(court) ? prev.filter(c => c !== court) : [...prev, court].sort()
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.shuttlecock_brand || !form.shuttlecock_price || !form.entry_fee) {
            toast.error('กรุณากรอกข้อมูลให้ครบถ้วน'); return;
        }
        if (selectedCourts.length === 0) {
            toast.error('กรุณาเลือกคอร์ทอย่างน้อย 1 คอร์ท'); return;
        }
        setSaving(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.from('events').update({
                event_date: form.event_date, shuttlecock_brand: form.shuttlecock_brand,
                shuttlecock_price: parseFloat(form.shuttlecock_price), entry_fee: parseFloat(form.entry_fee),
                courts: selectedCourts, start_time: form.start_time, end_time: form.end_time,
            }).eq('id', eventId);

            if (error) { toast.error(error.message); return; }
            toast.success('บันทึกการแก้ไขสำเร็จ!');
            router.push(`/dashboard/admin/events/${eventId}`);
        } catch { toast.error('เกิดข้อผิดพลาด'); }
        finally { setSaving(false); }
    };

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" style={{ width: 28, height: 28 }} /></div>;

    return (
        <div className="animate-in max-w-xl mx-auto">
            <div className="mb-6">
                <Link href={`/dashboard/admin/events/${eventId}`} className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:text-gray-900" style={{ color: 'var(--gray-500)' }}>
                    <Icon icon="solar:arrow-left-linear" width={18} /> กลับไประบุรายละเอียก๊กวน
                </Link>
            </div>

            <div className="card shadow-md" style={{ padding: '40px 32px' }}>
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-sm" style={{ background: 'rgba(59,130,246,0.1)' }}>
                        <Icon icon="solar:pen-linear" width={28} style={{ color: '#3b82f6' }} />
                    </div>
                    <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--gray-900)' }}>แก้ไขก๊วน</h1>
                    <p className="text-sm mt-2 font-medium" style={{ color: 'var(--gray-500)' }}>อัปเดตข้อมูลรายละเอียดของก๊วน</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">วันที่</label>
                        <input type="date" className="form-input form-input-plain" value={form.event_date} onChange={(e) => updateField('event_date', e.target.value)} required />
                    </div>

                    {/* เวลาเริ่ม — สิ้นสุด */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-group">
                            <label className="form-label">เวลาเริ่ม</label>
                            <input type="time" className="form-input form-input-plain" value={form.start_time} onChange={(e) => updateField('start_time', e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">เวลาสิ้นสุด</label>
                            <input type="time" className="form-input form-input-plain" value={form.end_time} onChange={(e) => updateField('end_time', e.target.value)} />
                        </div>
                    </div>

                    {/* คอร์ท */}
                    <div className="form-group">
                        <label className="form-label">เลือกคอร์ท *</label>
                        <div className="flex flex-wrap gap-2">
                            {AVAILABLE_COURTS.map(court => {
                                const isSelected = selectedCourts.includes(court);
                                return (
                                    <button key={court} type="button" onClick={() => toggleCourt(court)}
                                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                                        style={{
                                            background: isSelected ? '#3b82f6' : 'var(--gray-50)',
                                            color: isSelected ? 'var(--white)' : 'var(--gray-600)',
                                            border: `1.5px solid ${isSelected ? '#3b82f6' : 'var(--gray-200)'}`,
                                            boxShadow: isSelected ? '0 2px 8px rgba(59,130,246,0.25)' : 'none',
                                        }}
                                    >
                                        {isSelected && <Icon icon="solar:check-circle-bold" width={16} />}
                                        คอร์ท {court}
                                    </button>
                                );
                            })}
                        </div>
                        {selectedCourts.length > 0 && (
                            <p className="text-xs mt-2" style={{ color: 'var(--gray-500)' }}>
                                เลือกแล้ว {selectedCourts.length} คอร์ท: {selectedCourts.join(', ')}
                            </p>
                        )}
                    </div>

                    <div className="form-group">
                        <label className="form-label">ยี่ห้อลูกแบด *</label>
                        <input className="form-input form-input-plain" placeholder="เช่น Yonex, RSL, Victor" value={form.shuttlecock_brand} onChange={(e) => updateField('shuttlecock_brand', e.target.value)} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="form-group">
                            <label className="form-label">ราคาลูก (บาท) *</label>
                            <input type="number" className="form-input form-input-plain" placeholder="0" min="0" step="0.01" value={form.shuttlecock_price} onChange={(e) => updateField('shuttlecock_price', e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">ค่าลงสนาม (บาท) *</label>
                            <input type="number" className="form-input form-input-plain" placeholder="0" min="0" step="0.01" value={form.entry_fee} onChange={(e) => updateField('entry_fee', e.target.value)} required />
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary w-full mt-4" style={{ padding: '14px', fontSize: '15px' }} disabled={saving}>
                        {saving ? <><div className="spinner" /> กำลังบันทึก...</> : 'บันทึกการแก้ไข'}
                    </button>
                </form>
            </div>
        </div>
    );
}
