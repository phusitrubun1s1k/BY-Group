import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import Navbar from '@/src/components/Navbar';
import type { Profile } from '@/src/types';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

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
