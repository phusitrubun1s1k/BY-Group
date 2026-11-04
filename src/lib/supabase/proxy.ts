import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // getClaims ตรวจ JWT ในเครื่อง (ไม่ต้องยิงไป Supabase Auth ทุก request แบบ getUser)
    // และยังรีเฟรช session ให้อัตโนมัติเมื่อ token หมดอายุ
    const { data: claimsData } = await supabase.auth.getClaims();
    const user = claimsData?.claims ?? null;

    // Define public routes that don't require authentication
    const publicRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/auth/callback'];
    const isPublicRoute = publicRoutes.some((route) => request.nextUrl.pathname.startsWith(route));

    // If user is not signed in and route is protected, redirect to login
    if (!user && !isPublicRoute && request.nextUrl.pathname !== '/') {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    // If user is signed in and trying to access auth pages, redirect to home
    if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/register')) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}
