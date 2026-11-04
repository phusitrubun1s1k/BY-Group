import { redirect } from 'next/navigation';
import { getCurrentUser, getCurrentProfile } from '@/src/lib/supabase/auth';
import Navbar from '@/src/components/Navbar';
import type { Profile } from '@/src/types';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();
    if (!user) {
        redirect('/login');
    }

    const profile = await getCurrentProfile();
    if (!profile) {
        redirect('/login');
    }

    return (
        <div className="min-h-screen" style={{ background: 'var(--background)' }}>
            <Navbar profile={profile as Profile} />

            {/* Main Content */}
            <main className="lg:ml-[260px] pt-16 lg:pt-0">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
                    {children}
                </div>
            </main>
        </div>
    );
}
