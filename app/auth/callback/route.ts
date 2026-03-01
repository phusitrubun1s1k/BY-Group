import { NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const type = searchParams.get('type');
    const next = searchParams.get('next') ?? '/';

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            // If password recovery, redirect to reset-password page
            if (type === 'recovery') {
                return NextResponse.redirect(`${origin}/reset-password`);
            }

            // For email confirmation or other types, redirect to the specified page
            const forwardedHost = request.headers.get('x-forwarded-host');
            const isLocalEnv = process.env.NODE_ENV === 'development';

            if (isLocalEnv) {
                return NextResponse.redirect(`${origin}${next}`);
            } else if (forwardedHost) {
                return NextResponse.redirect(`https://${forwardedHost}${next}`);
            } else {
                return NextResponse.redirect(`${origin}${next}`);
            }
        }
    }

    // Return to login with error if code exchange failed
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
