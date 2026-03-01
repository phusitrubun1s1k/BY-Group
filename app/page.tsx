import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { Icon } from '@iconify/react';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  const { data: leaderboard } = await supabase
    .from('view_leaderboard')
    .select('display_name, total_wins, skill_level')
    .order('total_wins', { ascending: false })
    .limit(10);

  const topPlayers = leaderboard || [];
  const top3 = topPlayers.slice(0, 3);
  const others = topPlayers.slice(3);

  const skillColors: Record<string, string> = {
    'เปาะแปะ': '#16a34a', 'BG': '#16a34a', 'N': '#16a34a', 'S': '#16a34a',
    'P-': '#2563eb', 'P': '#2563eb', 'P+': '#2563eb',
    'C': '#9333ea', 'B': '#9333ea', 'A': '#9333ea',
    Beginner: '#16a34a', Intermediate: '#2563eb', Advanced: '#9333ea',
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-white">
      {/* Background Pattern */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0,0,0,0.03) 1px, transparent 0)',
        backgroundSize: '24px 24px'
      }} />

      {/* Soft Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none opacity-20" style={{
        background: 'radial-gradient(circle, var(--orange-500) 0%, transparent 70%)',
        filter: 'blur(80px)'
      }} />

      {/* Navigation */}
      <nav className="relative z-10 border-b border-gray-100 bg-white/80 backdrop-blur-md w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-3">
              <Image src="/images/logo.jpg" alt="Backyard Logo" width={44} height={44} className="rounded-xl shadow-sm" />
              <span className="font-extrabold text-xl tracking-tight text-gray-900">
                Badminton<span style={{ color: 'var(--orange-500)' }}>Group</span>
              </span>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <Link href="/login" className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
                เข้าสู่ระบบ
              </Link>
              <Link href="/register" className="btn btn-primary" style={{ padding: '10px 20px', borderRadius: '12px' }}>
                สมัครใช้งานฟรี
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 w-full relative z-10 py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          {/* Hero Content */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-in">
            <div className="col-span-1 md:col-span-10 md:col-start-2 lg:col-span-8 lg:col-start-3 text-center">

              <div className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-orange-50 mb-8 border border-orange-100 shadow-sm" style={{ background: 'rgba(249, 115, 22, 0.05)', borderColor: 'rgba(249, 115, 22, 0.1)' }}>
                <span className="flex h-2 w-2 rounded-full" style={{ background: 'var(--orange-500)' }}></span>
                <span className="text-sm font-semibold" style={{ color: 'var(--orange-600)' }}>ระบบจัดการก๊วนแบดมินตัน</span>
              </div>

              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-gray-900 mb-6 leading-[1.1]">
                จัดก๊วน<span style={{ color: 'var(--orange-500)' }}>แบดมินตัน</span><br />
                อย่างมืออาชีพ
              </h1>

              <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
                จัดการระบบคิว จับคู่ บันทึกผลแมตช์ และคำนวณค่าใช้จ่ายอัตโนมัติ
                ลืมการจดด้วยมือแบบเดิมๆ ไปได้เลย
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-20 mt-10 px-4 sm:px-0">
                <Link href="/register" className="btn btn-primary w-full sm:w-auto justify-center" style={{ padding: '14px 32px', fontSize: '16px', borderRadius: '12px' }}>
                  เริ่มต้นใช้งานฟรี
                  <Icon icon="solar:arrow-right-linear" width={20} />
                </Link>
                <Link href="/login" className="btn btn-outline bg-white w-full sm:w-auto justify-center shadow-sm" style={{ padding: '14px 32px', fontSize: '16px', borderRadius: '12px', border: '1.5px solid var(--gray-200)' }}>
                  เข้าสู่ระบบ
                </Link>
              </div>
            </div>
          </div>

          {/* Leaderboard Sneak Peek - MOVED TOP */}
          {topPlayers.length > 0 && (
            <div className="mt-24 relative z-10 text-center">
              <div className="mb-12">
                <h2 className="text-3xl font-bold mb-4 text-gray-900">👑 อันดับนักตบยอดเยี่ยม</h2>
                <p className="text-gray-500 font-medium">Top 10 กีฬาประจำสโมสร</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-end mb-12">
                {/* 2nd Place */}
                {top3[1] && (
                  <div className="order-2 md:order-1 card relative flex flex-col items-center p-6 bg-white border border-gray-100 shadow-sm md:min-h-[200px]" style={{ background: 'linear-gradient(180deg, rgba(156, 163, 175, 0.05) 0%, white 100%)' }}>
                    <div className="absolute -top-3 w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-md bg-gray-400 text-white font-bold">2</div>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold mb-3 shadow-inner bg-gray-900 text-white">
                      {top3[1].display_name.charAt(0).toUpperCase()}
                    </div>
                    <h4 className="text-sm font-bold text-gray-900 truncate max-w-full px-2">{top3[1].display_name}</h4>
                    <p className="text-xl font-bold mt-2">{top3[1].total_wins} ชนะ</p>
                  </div>
                )}

                {/* 1st Place */}
                {top3[0] && (
                  <div className="order-1 md:order-2 card relative flex flex-col items-center p-8 bg-white border-2 border-orange-500 shadow-xl md:min-h-[250px]" style={{ background: 'linear-gradient(180deg, rgba(249, 115, 22, 0.1) 0%, white 100%)' }}>
                    <div className="absolute -top-4 w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-lg bg-orange-500 text-white font-bold">🥇</div>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold mb-3 shadow-lg bg-orange-500 text-white ring-4 ring-orange-50">
                      {top3[0].display_name.charAt(0).toUpperCase()}
                    </div>
                    <h4 className="text-lg font-bold text-gray-900 truncate max-w-full px-2">{top3[0].display_name}</h4>
                    <p className="text-3xl font-black mt-2 text-orange-500">{top3[0].total_wins} ชนะ</p>
                  </div>
                )}

                {/* 3rd Place */}
                {top3[2] && (
                  <div className="order-3 md:order-3 card relative flex flex-col items-center p-6 bg-white border border-gray-100 shadow-sm md:min-h-[190px]" style={{ background: 'linear-gradient(180deg, rgba(234, 88, 12, 0.05) 0%, white 100%)' }}>
                    <div className="absolute -top-3 w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-md bg-orange-600 text-white font-bold">3</div>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold mb-3 shadow-inner bg-gray-900 text-white">
                      {top3[2].display_name.charAt(0).toUpperCase()}
                    </div>
                    <h4 className="text-sm font-bold text-gray-900 truncate max-w-full px-2">{top3[2].display_name}</h4>
                    <p className="text-xl font-bold mt-2">{top3[2].total_wins} ชนะ</p>
                  </div>
                )}
              </div>

              {/* Ranks 4-10 */}
              {others.length > 0 && (
                <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                  {others.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-4 px-6 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                      <span className="w-6 text-sm font-bold text-gray-400">#{idx + 4}</span>
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                        {entry.display_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm font-bold text-left text-gray-900 truncate">{entry.display_name}</span>
                      <span className="text-sm font-bold text-gray-900">{entry.total_wins} ชนะ</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-12">
                <Link
                  href="/login"
                  className="btn btn-outline inline-flex items-center gap-2 text-sm font-bold"
                  style={{ borderRadius: '12px', padding: '10px 24px' }}
                >
                  เข้าดู Leaderboard ทั้งหมด
                  <Icon icon="solar:round-alt-arrow-right-bold" width={20} className="text-orange-500" />
                </Link>
              </div>
            </div>
          )}

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mt-32 mb-10 relative z-10">
            {[
              { icon: 'solar:monitor-smartphone-linear', title: 'จัดคิว Real-time', desc: 'ระบบบอร์ดสด ดึงข้อมูลและอัปเดตแบบเรียลไทม์ ผู้เล่นทุกคนเห็นข้อมูลตรงกัน' },
              { icon: 'solar:cup-star-linear', title: 'สถิติ & Leaderboard', desc: 'บันทึกประวัติการแข่งขัน ชนะ/แพ้ และจัดอันดับผู้เล่นเพื่อเพิ่มความสนุก' },
              { icon: 'solar:wallet-linear', title: 'คำนวณเงินอัจฉริยะ', desc: 'ระบบจัดการบิลหารค่าสนามและค่าลูกแบดอัตโนมัติ พร้อมอัปโหลดสลิปง่ายๆ' },
            ].map((feature, i) => (
              <div key={i} className="col-span-1 md:col-span-4 card bg-white h-full relative overflow-hidden group border border-gray-100 flex flex-col items-center text-center sm:items-start sm:text-left hover:border-orange-200" style={{ animationDelay: `${i * 0.15}s` }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 shrink-0" style={{ background: 'var(--gray-50)' }}>
                  <Icon icon={feature.icon} width={24} style={{ color: 'var(--orange-500)' }} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-100 bg-white py-8 text-center text-sm text-gray-400">
        <p>&copy; {new Date().getFullYear()} Badminton Group Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}
