'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';
import { useConfirm } from './ConfirmProvider';
import type { Profile } from '@/src/types';
import { Icon } from '@iconify/react';

interface NavbarProps {
    profile: Profile;
}

const userMenuItems = [
    { href: '/dashboard', label: 'หน้าหลัก', icon: 'solar:home-2-linear' },
    { href: '/dashboard/live', label: 'กระดานคิว', icon: 'solar:monitor-smartphone-linear' },
    { href: '/dashboard/leaderboard', label: 'จัดอันดับ', icon: 'solar:cup-star-linear' },
    { href: '/dashboard/profile', label: 'โปรไฟล์', icon: 'solar:user-circle-linear' },
];

const adminMenuItems = [
    { href: '/dashboard/admin/events', label: 'จัดการก๊วน', icon: 'solar:calendar-linear' },
    { href: '/dashboard/admin/matches', label: 'จัดแมตช์', icon: 'solar:sort-horizontal-linear' },
    { href: '/dashboard/admin/billing', label: 'จัดการเงิน', icon: 'solar:wallet-linear' },
    { href: '/dashboard/admin/users', label: 'จัดการสมาชิก', icon: 'solar:users-group-rounded-linear' },
    { href: '/dashboard/history', label: 'ประวัติก๊วน', icon: 'solar:clock-circle-linear' },
];

export default function Navbar({ profile }: NavbarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const confirm = useConfirm();
    const [mobileOpen, setMobileOpen] = useState(false);
    const isAdmin = profile.role === 'admin';

    const handleLogout = async () => {
        const ok = await confirm({
            title: 'ออกจากระบบ?',
            message: 'คุณต้องการออกจากระบบใช่หรือไม่?',
            confirmText: 'ออกจากระบบ',
            type: 'danger'
        });

        if (!ok) return;

        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/');
        router.refresh();
    };

    const isActive = (href: string) => {
        if (href === '/dashboard') return pathname === '/dashboard';
        return pathname.startsWith(href);
    };

    const renderNavItems = (items: typeof userMenuItems, closeMobile = false) => (
        items.map((item) => {
            const active = isActive(item.href);
            return (
                <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobile ? () => setMobileOpen(false) : undefined}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-all mb-1"
                    style={{
                        color: active ? 'var(--orange-600)' : 'var(--gray-600)',
                        background: active ? 'rgba(249, 115, 22, 0.05)' : 'transparent',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--gray-50)'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                    <Icon icon={item.icon} width={22} className={active ? '' : 'opacity-70'} />
                    {item.label}
                </Link>
            );
        })
    );

    return (
        <>
            {/* Desktop Sidebar */}
            <aside
                className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-[260px] z-40 border-r"
                style={{ background: 'var(--white)', borderColor: 'var(--gray-200)' }}
            >
                {/* Logo */}
                <div className="flex items-center gap-3 px-8 h-20 border-b" style={{ borderColor: 'var(--gray-200)' }}>
                    <Image src="/images/logo.jpg" alt="Backyard Logo" width={40} height={40} className="rounded-xl shadow-sm" />
                    <span className="font-extrabold text-lg tracking-tight" style={{ color: 'var(--gray-900)' }}>
                        Badminton<span style={{ color: 'var(--orange-500)' }}>Group</span>
                    </span>
                </div>

                {/* Nav Items */}
                <nav className="flex-1 py-6 px-4 overflow-y-auto">
                    <p className="px-4 text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--gray-400)' }}>
                        เมนูหลัก
                    </p>
                    {renderNavItems(userMenuItems)}

                    {isAdmin && (
                        <>
                            <div className="my-5 mx-4 h-px" style={{ background: 'var(--gray-100)' }} />
                            <p className="px-4 text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--gray-400)' }}>
                                ผู้จัดก๊วน
                            </p>
                            {renderNavItems(adminMenuItems)}
                        </>
                    )}
                </nav>

                {/* User Info + Logout */}
                <div className="px-6 py-6 border-t bg-gray-50/50" style={{ borderColor: 'var(--gray-200)' }}>
                    <div className="flex items-center gap-3 mb-4">
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm"
                            style={{ background: 'var(--gray-900)', color: 'var(--white)' }}
                        >
                            {profile.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate" style={{ color: 'var(--gray-900)' }}>
                                {profile.display_name}
                            </p>
                            <p className="text-xs font-medium" style={{ color: 'var(--gray-500)' }}>
                                {isAdmin ? 'ผู้จัดก๊วน' : 'ผู้เล่น'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border border-gray-200 bg-white shadow-sm"
                        style={{ color: 'var(--gray-600)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--gray-50)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.2)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.color = 'var(--gray-600)'; e.currentTarget.style.borderColor = 'var(--gray-200)'; }}
                    >
                        <Icon icon="solar:logout-2-linear" width={18} />
                        ออกจากระบบ
                    </button>
                </div>
            </aside>

            {/* Mobile Top Bar */}
            <header
                className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-4 border-b bg-white/90 backdrop-blur-md"
                style={{ borderColor: 'var(--gray-200)' }}
            >
                <div className="flex items-center gap-3">
                    <Image src="/images/logo.jpg" alt="Backyard Logo" width={36} height={36} className="rounded-xl shadow-sm" />
                    <span className="font-extrabold text-lg tracking-tight" style={{ color: 'var(--gray-900)' }}>
                        Badminton<span style={{ color: 'var(--orange-500)' }}>Group</span>
                    </span>
                </div>
                <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl transition-colors bg-gray-50 border border-gray-100"
                    style={{ color: 'var(--gray-700)' }}
                >
                    <Icon icon={mobileOpen ? 'solar:close-circle-linear' : 'solar:hamburger-menu-linear'} width={24} />
                </button>
            </header>

            {/* Mobile Drawer */}
            {mobileOpen && (
                <div className="lg:hidden fixed inset-0 z-40" onClick={() => setMobileOpen(false)}>
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />
                    <div
                        className="absolute right-0 top-0 bottom-0 w-[300px] animate-in"
                        style={{ background: 'var(--white)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 h-16 border-b" style={{ borderColor: 'var(--gray-200)' }}>
                            <span className="text-[15px] font-bold" style={{ color: 'var(--gray-900)' }}>เมนูการใช้งาน</span>
                            <button onClick={() => setMobileOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                                <Icon icon="solar:close-circle-linear" width={20} />
                            </button>
                        </div>

                        <nav className="py-6 px-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
                            <p className="px-4 text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--gray-400)' }}>เมนูหลัก</p>
                            {renderNavItems(userMenuItems, true)}
                            {isAdmin && (
                                <>
                                    <div className="my-5 mx-4 h-px" style={{ background: 'var(--gray-100)' }} />
                                    <p className="px-4 text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--gray-400)' }}>
                                        ผู้จัดก๊วน
                                    </p>
                                    {renderNavItems(adminMenuItems, true)}
                                </>
                            )}
                        </nav>

                        <div className="absolute bottom-0 left-0 right-0 px-6 py-6 border-t bg-gray-50/50" style={{ borderColor: 'var(--gray-200)' }}>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm"
                                    style={{ background: 'var(--gray-900)', color: 'var(--white)' }}>
                                    {profile.display_name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold truncate" style={{ color: 'var(--gray-900)' }}>{profile.display_name}</p>
                                    <p className="text-xs font-medium" style={{ color: 'var(--gray-500)' }}>{isAdmin ? 'ผู้จัดก๊วน' : 'ผู้เล่น'}</p>
                                </div>
                            </div>
                            <button onClick={handleLogout} className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border border-gray-200 bg-white shadow-sm" style={{ color: 'var(--danger)' }}>
                                <Icon icon="solar:logout-2-linear" width={18} />
                                ออกจากระบบ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

