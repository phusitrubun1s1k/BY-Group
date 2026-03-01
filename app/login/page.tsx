'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import toast from 'react-hot-toast';
import { Icon } from '@iconify/react';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                if (error.message === 'Invalid login credentials') {
                    toast.error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
                } else {
                    toast.error(error.message);
                }
                return;
            }
            toast.success('เข้าสู่ระบบสำเร็จ');
            router.push('/dashboard');
            router.refresh();
        } catch { toast.error('เกิดข้อผิดพลาด'); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 relative bg-white">
            {/* Background Pattern */}
            <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0,0,0,0.03) 1px, transparent 0)',
                backgroundSize: '24px 24px'
            }} />

            <div className="w-full max-w-md animate-in relative z-10">
                <div className="card" style={{ padding: '48px 40px' }}>
                    {/* Header */}
                    <div className="text-center mb-8">
                        <Image src="/images/logo.jpg" alt="Backyard Logo" width={80} height={80} className="rounded-2xl shadow-sm mx-auto mb-4" />
                        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--gray-900)' }}>ยินดีต้อนรับกลับ</h1>
                        <p className="text-sm mt-2 font-medium" style={{ color: 'var(--gray-500)' }}>เข้าสู่ระบบเพื่อจัดการก๊วนแบดมินตันของคุณ</p>
                    </div>

                    <form onSubmit={handleLogin}>
                        <div className="form-group">
                            <label className="form-label">อีเมล</label>
                            <div className="relative">
                                <Icon icon="solar:letter-linear" width={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-500)' }} />
                                <input type="email" className="form-input" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </div>
                        </div>

                        <div className="form-group">
                            {/* <div className="flex items-center justify-between mb-1.5">
                                <label className="form-label" style={{ margin: 0 }}>รหัสผ่าน</label>
                                <Link href="/forgot-password" className="text-xs font-medium" style={{ color: 'var(--orange-500)' }}>ลืมรหัสผ่าน?</Link>
                            </div> */}
                            <div className="relative">
                                <Icon icon="solar:lock-linear" width={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-500)' }} />
                                <input type={showPw ? 'text' : 'password'} className="form-input" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--gray-500)' }}>
                                    <Icon icon={showPw ? 'solar:eye-closed-linear' : 'solar:eye-linear'} width={18} />
                                </button>
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary w-full mt-2" style={{ padding: '14px', fontSize: '15px' }} disabled={loading}>
                            {loading ? <><div className="spinner" /> กำลังเข้าสู่ระบบ...</> : 'เข้าสู่ระบบ'}
                        </button>
                    </form>

                    <p className="text-center text-sm mt-6 font-medium" style={{ color: 'var(--gray-500)' }}>
                        ยังไม่มีบัญชี? <Link href="/register" className="font-bold transition-colors" style={{ color: 'var(--orange-500)' }}>สมัครสมาชิกฟรี</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
