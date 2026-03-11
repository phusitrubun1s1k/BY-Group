'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/src/lib/supabase/client';
import type { Event, EventPlayer, Match, Profile } from '@/src/types';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useConfirm } from '@/src/components/ConfirmProvider';
import RankBadge from '@/src/components/RankBadge';
import { getRankFromMMR } from '@/src/lib/rank-utils';
import CustomSelect, { SelectOption } from '@/src/components/CustomSelect';
import { truncateName } from '@/src/lib/string-utils';

const GUEST_SKILL_OPTIONS: SelectOption[] = [
    { value: '', label: '-- เลือกระดับ --', icon: 'solar:question-circle-linear' },
    { value: 'เปาะแปะ', label: 'เปาะแปะ', icon: 'solar:user-linear' },
    { value: 'BG', label: 'BG', icon: 'solar:user-bold' },
    { value: 'N', label: 'N', icon: 'solar:user-bold-duotone' },
    { value: 'S', label: 'S', icon: 'solar:medal-star-linear' },
    { value: 'P-', label: 'P-', icon: 'solar:medal-star-bold' },
    { value: 'P', label: 'P', icon: 'solar:cup-star-linear' },
    { value: 'P+', label: 'P+', icon: 'solar:cup-star-bold' },
    { value: 'C', label: 'C', icon: 'solar:crown-minimalistic-linear' },
    { value: 'B', label: 'B', icon: 'solar:crown-bold' },
    { value: 'A', label: 'A', icon: 'solar:crown-star-bold' },
];

// Get skill color from the function matching index.ts
const getSkillColor = (level: string | null | undefined) => {
    if (['เปาะแปะ', 'BG', 'N', 'S'].includes(level || '')) return '#16a34a';
    if (['P-', 'P', 'P+'].includes(level || '')) return '#2563eb';
    if (['C', 'B', 'A'].includes(level || '')) return '#9333ea';
    return '#6b7280'; // fallback
};


export default function MatchMakerPage({ params }: { params: Promise<{ eventId: string }> }) {
    const [eventId, setEventId] = useState('');
    const [event, setEvent] = useState<Event | null>(null);
    const [players, setPlayers] = useState<EventPlayer[]>([]);
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [teamA, setTeamA] = useState<string[]>([]);
    const [teamB, setTeamB] = useState<string[]>([]);
    const [courtNumber, setCourtNumber] = useState('');
    const [shuttlecockNumber, setShuttlecockNumber] = useState('');
    const [creating, setCreating] = useState(false);
    const [scoreMatch, setScoreMatch] = useState<Match | null>(null);
    const [winner, setWinner] = useState<'A' | 'B' | 'Draw' | 'None' | null>(null);
    const [matchSeq, setMatchSeq] = useState<string>('');

    // Reset winner when score modal opens/closes
    useEffect(() => {
        if (scoreMatch) setWinner(null);
    }, [scoreMatch]);

    const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
    const [updatingPayment, setUpdatingPayment] = useState<string | null>(null);
    const [showPaymentSection, setShowPaymentSection] = useState(true);
    const [sidebarTeam, setSidebarTeam] = useState<'A' | 'B' | null>(null);
    const [showPlayersSidebar, setShowPlayersSidebar] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [paymentSearchQuery, setPaymentSearchQuery] = useState('');
    // Add shuttlecock modal state
    const [addingShuttlecockMatch, setAddingShuttlecockMatch] = useState<{ id: string, currentNumbers: string[] } | null>(null);
    const [newShuttlecockNumber, setNewShuttlecockNumber] = useState('');

    // Add Substitute Player State
    const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
    const [newPlayerSearch, setNewPlayerSearch] = useState('');
    const [unjoinedPlayers, setUnjoinedPlayers] = useState<Profile[]>([]);
    const [searchingPlayers, setSearchingPlayers] = useState(false);
    const [addingPlayer, setAddingPlayer] = useState<string | null>(null);
    const [showAddGuestModal, setShowAddGuestModal] = useState(false);
    const [guestName, setGuestName] = useState('');
    const [guestSkill, setGuestSkill] = useState<string | null>(null);

    const confirm = useConfirm();

    // Player stats for match making
    const playerStats = useMemo(() => {
        const stats: Record<string, { total: number, playing: boolean, matchNums: number[] }> = {};
        players.forEach(p => { stats[p.user_id] = { total: 0, playing: false, matchNums: [] }; });
        matches.forEach((m, idx) => {
            const mNum = m.match_number || (idx + 1);
            m.match_players?.forEach(mp => {
                if (stats[mp.user_id]) {
                    if (m.status === 'playing' || m.status === 'finished') {
                        stats[mp.user_id].total++;
                        stats[mp.user_id].matchNums.push(mNum);
                    }
                    if (m.status === 'playing' || m.status === 'waiting') {
                        stats[mp.user_id].playing = true;
                    }
                }
            });
        });
        return stats;
    }, [players, matches]);

    // Real-time calculation of current bills per user
    const userBills = useMemo(() => {
        if (!event) return {};
        const bills: Record<string, number> = {};

        players.forEach(p => {
            let totalShuttleCost = 0;
            const myMatches = matches.filter(m =>
                (m.status === 'finished' || m.status === 'playing') &&
                m.match_players?.some(mp => mp.user_id === p.user_id)
            );

            myMatches.forEach(m => {
                if (m.shuttlecock_numbers && m.shuttlecock_numbers.length > 0) {
                    totalShuttleCost += m.shuttlecock_numbers.length * (event.shuttlecock_price || 0);
                }
            });

            const amount = (event.entry_fee || 0) + totalShuttleCost + (p.additional_cost || 0) - (p.discount || 0);
            bills[p.user_id] = Math.max(0, amount);
        });
        return bills;
    }, [players, matches, event]);


    // Gather all used shuttlecocks in the current event to prevent duplicates
    const allUsedShuttlecocks = useMemo(() => {
        const used = new Set<string>();
        matches.forEach(m => {
            // Ignore the one we are currently editing
            if (m.id === editingMatchId) return;
            m.shuttlecock_numbers?.forEach(num => used.add(num.trim()));
        });
        return used;
    }, [matches, editingMatchId]);

    // Active courts list for summary (from event.courts)
    const eventCourts = useMemo(() => {
        return event?.courts || [];
    }, [event]);

    const activeCourtsSet = useMemo(() => {
        const active = new Set<string>();
        matches.forEach(m => {
            if (m.status === 'playing' || m.status === 'waiting') {
                if (m.court_number) active.add(m.court_number);
            }
        });
        return active;
    }, [matches]);
    // Cleanup guest profiles from PREVIOUS events (preserve billing data)
    const cleanupOldGuests = useCallback(async (currentEventId: string) => {
        const supabase = createClient();

        // 1. Find all guest profiles
        const { data: allGuests, error: fetchErr } = await supabase
            .from('profiles')
            .select('id')
            .eq('is_guest', true);

        if (fetchErr || !allGuests || allGuests.length === 0) return;

        // 2. Find which guests are in the CURRENT event
        const { data: currentEventPlayers } = await supabase
            .from('event_players')
            .select('user_id')
            .eq('event_id', currentEventId);

        const currentEventUserIds = new Set((currentEventPlayers || []).map(ep => ep.user_id));

        // 3. Filter to only guests NOT in the current event
        const oldGuestIds = allGuests
            .filter(g => !currentEventUserIds.has(g.id))
            .map(g => g.id);

        if (oldGuestIds.length === 0) return;

        // 4. Delete ONLY profiles (keep event_players & match_players for billing history)
        const { error: delErr } = await supabase
            .from('profiles')
            .delete()
            .in('id', oldGuestIds);

        if (!delErr) {
            console.log(`[Cleanup] ลบขาจรจากก๊วนเก่า ${oldGuestIds.length} คน (เก็บบิลไว้)`);
        }
    }, []);

    useEffect(() => {
        params.then((p) => {
            setEventId(p.eventId);
            cleanupOldGuests(p.eventId).then(() => loadData(p.eventId));
        });
    }, [params]);

    const loadData = useCallback(async (id: string) => {
        const supabase = createClient();
        const [eventRes, playersRes, matchesRes, userRes] = await Promise.all([
            supabase.from('events').select('*').eq('id', id).single(),
            supabase.from('event_players').select('*, profiles(*)').eq('event_id', id).order('created_at'),
            supabase.from('matches').select('*, match_players(*, profiles(*))').eq('event_id', id).order('created_at', { ascending: true }),
            supabase.auth.getUser()
        ]);
        if (eventRes.data) setEvent(eventRes.data as Event);
        if (playersRes.data) setPlayers(playersRes.data as EventPlayer[]);
        if (matchesRes.data) setMatches(matchesRes.data as Match[]);
        if (userRes.data.user) setCurrentUserId(userRes.data.user.id);
        setLoading(false);
    }, [event]);

    const handleAddGuest = async () => {
        if (!guestName.trim()) return toast.error('กรุณาระบุชื่อ');
        setCreating(true);
        const supabase = createClient();
        try {
            const guestId = crypto.randomUUID();
            // 1. Create Profile
            const { error: pErr } = await supabase.from('profiles').insert({
                id: guestId,
                display_name: guestName,
                full_name: guestName,
                is_guest: true,
                skill_level: guestSkill,
                role: 'user'
            });
            if (pErr) throw pErr;

            // 2. Add to Event
            const { error: eErr } = await supabase.from('event_players').insert({
                event_id: eventId,
                user_id: guestId,
                is_checked_in: true
            });
            if (eErr) throw eErr;

            toast.success('เพิ่มขาจรเรียบร้อย');
            setShowAddGuestModal(false);
            setGuestName('');
            setGuestSkill(null);
            loadData(eventId);
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setCreating(false);
        }
    };

    useEffect(() => {
        if (!eventId) return;
        const supabase = createClient();

        // Subscription for matches
        const matchChannel = supabase.channel('matches-rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `event_id=eq.${eventId}` }, () => loadData(eventId))
            .subscribe();

        // Subscription for event players (for real-time payment status)
        const playerChannel = supabase.channel('players-rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'event_players', filter: `event_id=eq.${eventId}` }, () => loadData(eventId))
            .subscribe();

        return () => {
            supabase.removeChannel(matchChannel);
            supabase.removeChannel(playerChannel);
        };
    }, [eventId, loadData]);

    const togglePlayer = (userId: string, team: 'A' | 'B') => {
        if (team === 'A') {
            if (teamA.includes(userId)) setTeamA(teamA.filter((id) => id !== userId));
            else if (teamA.length < 2) { setTeamB(teamB.filter((id) => id !== userId)); setTeamA([...teamA, userId]); }
        } else {
            if (teamB.includes(userId)) setTeamB(teamB.filter((id) => id !== userId));
            else if (teamB.length < 2) { setTeamA(teamA.filter((id) => id !== userId)); setTeamB([...teamB, userId]); }
        }
    };

    const toggleCheckIn = async (ep: EventPlayer) => {
        if (!eventId) return;
        const newStatus = !ep.is_checked_in;

        // Optimistic update
        setPlayers(prev => prev.map(p => p.id === ep.id ? { ...p, is_checked_in: newStatus } : p));

        const supabase = createClient();
        const { error } = await supabase.from('event_players').update({ is_checked_in: newStatus }).eq('id', ep.id);

        if (error) {
            toast.error('เกิดข้อผิดพลาดในการอัปเดตสถานะ');
            // Rollback on error
            setPlayers(prev => prev.map(p => p.id === ep.id ? { ...p, is_checked_in: !newStatus } : p));
            return;
        }
        // No manual loadData call needed as the real-time subscription will trigger it if necessary,
        // and we've already updated the state optimistically.
    };

    const addShuttlecock = (matchId: string, currentNumbers: string[]) => {
        setAddingShuttlecockMatch({ id: matchId, currentNumbers });
        setNewShuttlecockNumber('');
    };

    const submitAddShuttlecock = async () => {
        if (!addingShuttlecockMatch) return;

        const num = newShuttlecockNumber.trim();
        if (!num) { toast.error('กรุณาระบุหมายเลขลูกแบด'); return; }

        // Duplication check across ALL matches except the current one (handled above by the Set logic, but we must check all matches here too)
        const isDuplicate = matches.some(m =>
            // In case they are somehow adding it again to the SAME match we don't care, but a different match we do
            m.id !== addingShuttlecockMatch.id && m.shuttlecock_numbers?.includes(num)
        ) || addingShuttlecockMatch.currentNumbers.includes(num);

        if (isDuplicate) {
            toast.error(`ลูกแบดหมายเลข ${num} ถูกใช้ไปแล้วในก๊วนนี้`);
            return;
        }

        setCreating(true);
        const supabase = createClient();
        const newNumbers = [...(addingShuttlecockMatch.currentNumbers || []), newShuttlecockNumber];

        const { error } = await supabase.from('matches').update({ shuttlecock_numbers: newNumbers }).eq('id', addingShuttlecockMatch.id);

        setCreating(false);
        setAddingShuttlecockMatch(null);

        if (error) { toast.error('เกิดข้อผิดพลาดในการเบิกลูกแบด'); return; }

        toast.success(`เพิ่มลูกแบดหมายเลข ${newShuttlecockNumber.trim()} สำเร็จ`);
        loadData(eventId);
    };

    const searchUnjoinedPlayers = async (query: string = '') => {
        setNewPlayerSearch(query);
        setSearchingPlayers(true);
        const supabase = createClient();

        // Find users matching query
        let queryBuilder = supabase.from('profiles').select('*').eq('is_guest', false).limit(50);
        if (query.trim().length > 0) {
            queryBuilder = queryBuilder.ilike('display_name', `%${query}%`);
        }
        const { data } = await queryBuilder;

        if (data) {
            // Filter out existing players
            const existingIds = new Set(players.map(p => p.user_id));
            setUnjoinedPlayers(data.filter(p => !existingIds.has(p.id)) as Profile[]);
        }
        setSearchingPlayers(false);
    };

    const addSubstitutePlayer = async (userId: string) => {
        if (!eventId) return;
        setAddingPlayer(userId);
        const supabase = createClient();
        const { error } = await supabase.from('event_players').insert({
            event_id: eventId,
            user_id: userId,
            payment_status: 'pending',
            is_checked_in: false,
            is_substitute: true,
        });
        setAddingPlayer(null);
        if (error) { toast.error('ไม่สามารถเพิ่มผู้เล่นได้: ' + error.message); return; }

        toast.success('เพิ่มผู้เล่นเข้าสู่ก๊วนสำเร็จ');
        setNewPlayerSearch('');
        setUnjoinedPlayers([]);
        setShowAddPlayerModal(false);
        loadData(eventId);
    };

    const handleRemovePlayer = async (epId: string, playerName: string) => {
        const ok = await confirm({
            title: 'ลบผู้เล่น?',
            message: `ยืนยันการลบ ${playerName} ออกจากก๊วน? ข้อมูลการเข้าร่วมจะถูกลบถาวร`,
            type: 'danger',
            confirmText: 'ลบผู้เล่น'
        });
        if (!ok) return;

        const supabase = createClient();
        setPlayers(prev => prev.filter(p => p.id !== epId)); // Optimistic UI
        const { error } = await supabase.from('event_players').delete().eq('id', epId);

        if (error) {
            toast.error('ไม่สามารถลบผู้เล่นได้: ' + error.message);
            loadData(eventId); // Rollback
            return;
        }

        toast.success(`ลบ ${playerName} ออกจากก๊วนแล้ว`);
    };

    const editMatch = (match: Match) => {
        const tA = match.match_players?.filter((mp) => mp.team === 'A').map((mp) => mp.user_id) || [];
        const tB = match.match_players?.filter((mp) => mp.team === 'B').map((mp) => mp.user_id) || [];
        setTeamA(tA);
        setTeamB(tB);
        setCourtNumber(match.court_number || '');
        setShuttlecockNumber(match.shuttlecock_numbers?.[0] || '');
        setMatchSeq(match.match_number ? String(match.match_number) : '');
        setEditingMatchId(match.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const saveMatch = async () => {
        if (teamA.length !== 2 || teamB.length !== 2) { toast.error('เลือกผู้เล่นทีมละ 2 คน'); return; }
        if (!courtNumber) { toast.error('ระบุหมายเลขคอร์ท'); return; }

        const title = editingMatchId ? 'บันทึกการแก้ไข?' : 'สร้างแมตช์?';
        const msg = editingMatchId ? 'ยืนยันการแก้ไขข้อมูลแมตช์ที่ยังไม่เริ่มนี้?' : `ยืนยันการสร้างแมตช์ที่คอร์ท ${courtNumber}?`;

        const shuttleVal = shuttlecockNumber.trim();
        if (shuttleVal && allUsedShuttlecocks.has(shuttleVal)) {
            toast.error(`ลูกแบดหมายเลข ${shuttleVal} ถูกใช้ไปแล้วในก๊วนนี้`);
            return;
        }

        const ok = await confirm({
            title,
            message: msg,
            type: 'info',
            confirmText: editingMatchId ? 'บันทึก' : 'ยืนยันสร้าง'
        });
        if (!ok) return;

        setCreating(true);
        try {
            const supabase = createClient();
            const shuttles = shuttleVal ? [shuttleVal] : [];

            if (editingMatchId) {
                const { error: matchErr } = await supabase.from('matches').update({
                    court_number: courtNumber,
                    shuttlecock_numbers: shuttles,
                    match_number: matchSeq ? parseInt(matchSeq) : null
                }).eq('id', editingMatchId);
                if (matchErr) throw matchErr;

                await supabase.from('match_players').delete().eq('match_id', editingMatchId);
                await supabase.from('match_players').insert([
                    ...teamA.map((uid) => ({ match_id: editingMatchId, user_id: uid, team: 'A' as const })),
                    ...teamB.map((uid) => ({ match_id: editingMatchId, user_id: uid, team: 'B' as const })),
                ]);
                toast.success('แก้ไขข้อมูลแมตช์สำเร็จ');
            } else {
                const { data: match, error } = await supabase.from('matches').insert({
                    event_id: eventId,
                    court_number: courtNumber,
                    shuttlecock_numbers: shuttles,
                    status: 'waiting',
                    match_number: matchSeq ? parseInt(matchSeq) : null
                }).select().single();
                if (error) { toast.error(error.message); return; }
                await supabase.from('match_players').insert([
                    ...teamA.map((uid) => ({ match_id: match.id, user_id: uid, team: 'A' as const })),
                    ...teamB.map((uid) => ({ match_id: match.id, user_id: uid, team: 'B' as const })),
                ]);
                toast.success('สร้างแมตช์สำเร็จ');
            }
            setShowForm(false); setTeamA([]); setTeamB([]); setCourtNumber(''); setShuttlecockNumber(''); setMatchSeq(''); setEditingMatchId(null);
            loadData(eventId);
        } catch { toast.error('เกิดข้อผิดพลาดในการบันทึกข้อมูล'); }
        finally { setCreating(false); }
    };

    const updateMatchStatus = async (matchId: string, status: 'playing' | 'finished') => {
        const m = matches.find((x) => x.id === matchId);
        if (status === 'finished') {
            if (m) { setScoreMatch(m); setWinner(null); }
            return;
        }
        if (status === 'playing') {
            const isReverting = m?.status === 'finished';
            const ok = await confirm({
                title: isReverting ? 'แก้ไขผลแข่ง?' : 'เริ่มเกม?',
                message: isReverting ? 'ย้ายแมตช์ที่จบแล้วกลับมา "กำลังตี" เพื่อบันทึกผลใหม่?' : 'ยืนยันการเริ่มแมตช์นี้?',
                type: 'info',
                confirmText: isReverting ? 'ยืนยัน' : 'เริ่มเกม'
            });
            if (!ok) return;
        }

        const supabase = createClient();
        const updateData: any = { status };
        if (status === 'playing' && m?.status === 'finished') {
            updateData.team_a_score = 0;
            updateData.team_b_score = 0;
        }

        const { error } = await supabase.from('matches').update(updateData).eq('id', matchId);
        if (error) {
            toast.error('เกิดข้อผิดพลาด: ' + error.message);
            return;
        }

        toast.success(status === 'playing' ? (m?.status === 'finished' ? 'ย้ายกลับมาแก้ไขแล้ว' : 'เริ่มเกม!') : 'บันทึกสำเร็จ');
        loadData(eventId);
    };

    const handleDeleteMatch = async (matchId: string) => {
        const ok = await confirm({
            title: 'ลบแมตช์?',
            message: 'ยืนยันการลบแมตช์ที่จบแล้วนี้อย่างถาวร? ข้อมูลคะแนนและการใช้ลูกแบดในแมตช์นี้จะหายไป',
            type: 'danger',
            confirmText: 'ลบแมตช์นี้'
        });
        if (!ok) return;

        const supabase = createClient();
        const { error } = await supabase.from('matches').delete().eq('id', matchId);

        if (error) {
            toast.error('ไม่สามารถลบแมตช์ได้: ' + error.message);
            return;
        }

        toast.success('ลบแมตช์เรียบร้อยแล้ว');
        loadData(eventId);
    };

    const handleCancelMatch = async (matchId: string) => {
        const ok = await confirm({
            title: 'ยกเลิกแมตช์?',
            message: 'ยืนยันการยกเลิกแมตช์นี้? ระบบจะย้ายกลับไป "รอคิว" และยกเลิกการคิดเงินสำหรับแมตช์นี้',
            type: 'warning',
            confirmText: 'ยืนยันยกเลิก'
        });
        if (!ok) return;

        const supabase = createClient();
        const { error } = await supabase.from('matches').update({
            status: 'waiting',
            shuttlecock_numbers: [] // Clear shuttlecocks to reverse billing
        }).eq('id', matchId);

        if (error) {
            toast.error('ไม่สามารถยกเลิกแมตช์ได้: ' + error.message);
            return;
        }

        toast.success('ยกเลิกแมตช์แล้ว');
        loadData(eventId);
    };


    const submitScore = async () => {
        if (!scoreMatch) return;
        if (!winner) { toast.error('กรุณาเลือกผลการแข่งขัน'); return; }

        const isDraw = winner === 'Draw';
        const isNone = winner === 'None';
        const totalA = isNone ? 0 : (isDraw ? 1 : (winner === 'A' ? 1 : 0));
        const totalB = isNone ? 0 : (isDraw ? 1 : (winner === 'B' ? 1 : 0));

        const ok = await confirm({
            title: 'บันทึกคะแนน?',
            message: isNone ? 'ยืนยันการจบแมตช์โดยไม่แจ้งผลการแข่งขัน?' : (isDraw ? 'ยืนยันผลการแข่งขัน เสมอ?' : `ยืนยันผลการแข่งขัน ทีม ${winner} ชนะ?`),
            type: isNone ? 'warning' : 'info',
            confirmText: 'บันทึกคะแนน'
        });
        if (!ok) return;

        const supabase = createClient();
        await supabase.from('matches').update({
            status: 'finished',
            team_a_score: totalA,
            team_b_score: totalB,
        }).eq('id', scoreMatch.id);

        toast.success(isNone ? 'บันทึกสำเร็จ! (ไม่แจ้งผลแข่ง)' : (isDraw ? 'บันทึกสำเร็จ! เสมอ 🤝' : `บันทึกสำเร็จ! ทีม ${winner} ชนะ 🏆`));
        setScoreMatch(null);
        loadData(eventId);
    };

    const togglePayment = async (ep: EventPlayer) => {
        const prof = ep.profiles as unknown as Profile;
        const newStatus = ep.payment_status === 'paid' ? 'pending' : 'paid';
        const ok = await confirm({
            title: newStatus === 'paid' ? 'ยืนยันการชำระเงิน?' : 'ยกเลิกการชำระเงิน?',
            message: newStatus === 'paid'
                ? `บันทึกว่า ${prof?.display_name} ชำระเงินแล้วใช่หรือไม่?`
                : `เปลี่ยนสถานะ ${prof?.display_name} เป็นยังไม่จ่ายใช่หรือไม่?`,
            type: newStatus === 'paid' ? 'info' : 'warning',
            confirmText: newStatus === 'paid' ? 'ยืนยันชำระเงิน' : 'ยืนยันยกเลิก'
        });
        if (!ok) return;

        setUpdatingPayment(ep.user_id);
        const supabase = createClient();
        const { error } = await supabase.from('event_players').update({ payment_status: newStatus }).eq('id', ep.id);
        setUpdatingPayment(null);

        if (error) { toast.error('อัปเดตไม่สำเร็จ'); return; }
        toast.success(newStatus === 'paid' ? 'บันทึกว่าจ่ายแล้ว ✅' : 'เปลี่ยนสถานะเป็นยังไม่จ่าย');
        loadData(eventId);
    };

    const updateDiscount = async (ep: EventPlayer, discountValue: number) => {
        // Optimistic update
        setPlayers(prev => prev.map(p => p.id === ep.id ? { ...p, discount: discountValue } : p));

        const supabase = createClient();
        const { error } = await supabase
            .from('event_players')
            .update({ discount: discountValue })
            .eq('id', ep.id);

        if (error) {
            toast.error('บันทึกส่วนลดไม่สำเร็จ');
            // Revert
            setPlayers(prev => prev.map(p => p.id === ep.id ? { ...p, discount: ep.discount } : p));
        }
    };

    const updateAdditionalCost = async (ep: EventPlayer, additionalCostValue: number) => {
        setPlayers(prev => prev.map(p => p.id === ep.id ? { ...p, additional_cost: additionalCostValue } : p));

        const supabase = createClient();
        const { error } = await supabase
            .from('event_players')
            .update({ additional_cost: additionalCostValue })
            .eq('id', ep.id);

        if (error) {
            toast.error('บันทึกค่าใช้จ่ายเพิ่มเติมไม่สำเร็จ');
            setPlayers(prev => prev.map(p => p.id === ep.id ? { ...p, additional_cost: ep.additional_cost } : p));
        }
    };

    const handleAutoMatch = () => {
        // 1. Filter available players (Checked-in AND not currently playing/waiting)
        const availablePlayers = players.filter(p => {
            const stats = playerStats[p.user_id];
            return p.is_checked_in && stats && !stats.playing;
        });

        if (availablePlayers.length < 4) {
            toast.error('มีผู้เล่นว่างไม่เพียงพอ (ต้องการอย่างน้อย 4 คน)');
            return;
        }

        // 2. Sort by games played (prioritize those waiting)
        const sortedPlayers = [...availablePlayers].sort((a, b) => {
            const countA = playerStats[a.user_id]?.total || 0;
            const countB = playerStats[b.user_id]?.total || 0;
            return countA - countB;
        });

        // 3. Pick top 4
        const candidates = sortedPlayers.slice(0, 4);

        // 4. MMR-based weights (direct MMR values)
        const getWeight = (prof: Profile | null) => {
            return prof?.mmr || 1000;
        };

        // 5. Find best 2v2 combination using MMR balance
        const combos = [
            { tA: [candidates[0], candidates[1]], tB: [candidates[2], candidates[3]] },
            { tA: [candidates[0], candidates[2]], tB: [candidates[1], candidates[3]] },
            { tA: [candidates[0], candidates[3]], tB: [candidates[1], candidates[2]] },
        ];

        let bestCombo = combos[0];
        let minDiff = Infinity;

        combos.forEach(c => {
            const sumA = getWeight(c.tA[0].profiles as any) + getWeight(c.tA[1].profiles as any);
            const sumB = getWeight(c.tB[0].profiles as any) + getWeight(c.tB[1].profiles as any);
            const diff = Math.abs(sumA - sumB);
            if (diff < minDiff) {
                minDiff = diff;
                bestCombo = c;
            }
        });

        // 6. Set state and open form
        setTeamA(bestCombo.tA.map(p => p.user_id));
        setTeamB(bestCombo.tB.map(p => p.user_id));
        setEditingMatchId(null);
        setMatchSeq('');
        setShowForm(true);
        toast.success('สุ่มจับคู่ให้แล้ว! กรุณาระบุคอร์ทและกดสร้าง');
    };

    const statusCfg: Record<string, { label: string; badge: string }> = {
        waiting: { label: 'รอคิว', badge: 'badge-warning' },
        playing: { label: 'กำลังตี', badge: 'badge-success' },
        finished: { label: 'จบแล้ว', badge: 'badge-muted' },
    };

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" style={{ width: 28, height: 28 }} /></div>;

    return (
        <>
            <div className="animate-in">
                <Link href={`/dashboard/admin/events/${eventId}`} className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: 'var(--gray-500)' }}>
                    <Icon icon="solar:arrow-left-linear" width={16} /> กลับหน้าก๊วน
                </Link>

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sticky z-[30] bg-gray-50/95 backdrop-blur-sm pb-4 pt-2 -mx-4 px-4 border-b border-gray-200 shadow-sm top-16 lg:top-0" style={{ marginTop: '-16px' }}>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm border border-gray-100 shrink-0">
                                <img src="/images/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
                            </div>
                            <h1 className="text-2xl font-bold" style={{ color: 'var(--gray-900)' }}>จัดแมตช์</h1>
                        </div>

                        {/* Event Summary Box */}
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                                <Icon icon="solar:users-group-rounded-linear" width={16} className="text-blue-500" />
                                <span className="text-xs font-semibold text-gray-700">{players.length} ผู้เล่น</span>
                            </div>

                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
                                <Icon icon="solar:sort-horizontal-linear" width={16} className="text-purple-500" />
                                <span className="text-xs font-semibold text-gray-700">{matches.length} แมตช์</span>
                            </div>

                            {Array.from(allUsedShuttlecocks).length > 0 && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-50 border border-orange-100">
                                    <Icon icon="solar:shuttlecock-linear" width={16} className="text-orange-500" />
                                    <span className="text-xs font-semibold text-orange-700">ใช้ {Array.from(allUsedShuttlecocks).length} ลูก</span>
                                    <div className="flex items-center gap-1 ml-1 border-l border-orange-200 pl-2">
                                        {Array.from(allUsedShuttlecocks).slice(0, 5).map(num => (
                                            <span key={num} className="text-[10px] font-bold bg-white text-orange-600 px-1 py-0.5 rounded shadow-sm">
                                                {num}
                                            </span>
                                        ))}
                                        {Array.from(allUsedShuttlecocks).length > 5 && (
                                            <span className="text-[10px] font-bold text-orange-500">+{Array.from(allUsedShuttlecocks).length - 5}</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-50 border border-green-100">
                                <Icon icon="solar:wallet-money-linear" width={16} className="text-green-500" />
                                <span className="text-xs font-semibold text-green-700">
                                    ยอดเก็บแล้ว ฿{players.reduce((sum, p) => sum + (p.payment_status === 'paid' ? (userBills[p.user_id] || 0) : 0), 0).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-100">
                                <Icon icon="solar:calculator-linear" width={16} className="text-blue-500" />
                                <span className="text-xs font-semibold text-blue-700">
                                    ยอดทั้งหมด ฿{players.reduce((sum, p) => sum + (userBills[p.user_id] || 0), 0).toLocaleString()}
                                </span>
                            </div>

                            {eventCourts.length > 0 && (
                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100">
                                    <Icon icon="solar:clapperboard-edit-linear" width={16} className="text-indigo-500" />
                                    <span className="text-xs font-semibold text-indigo-700">คอร์ท:</span>
                                    <div className="flex items-center gap-1 ml-0.5">
                                        {eventCourts.map(num => (
                                            <span key={num} className={`text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm transition-colors ${activeCourtsSet.has(num) ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                                {num}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => setShowPlayersSidebar(true)} className="btn btn-secondary">
                            <Icon icon="solar:users-group-rounded-linear" width={18} />
                            ผู้เล่นเช็คอิน
                            <span className="badge badge-muted" style={{ marginLeft: '4px' }}>{players.filter(p => p.is_checked_in).length}</span>
                        </button>
                        {event?.status === 'open' && (
                            <>
                                <button onClick={handleAutoMatch} className="btn btn-secondary" style={{ background: 'rgba(59,130,246,0.06)', color: '#3b82f6', border: '1.5px solid rgba(59,130,246,0.3)' }}>
                                    <Icon icon="solar:magic-stick-3-linear" width={18} /> สุ่มแมตช์
                                </button>
                                <button onClick={() => { setShowForm(!showForm); setEditingMatchId(null); setTeamA([]); setTeamB([]); setCourtNumber(''); setShuttlecockNumber(''); setMatchSeq(''); }} className="btn btn-primary">
                                    <Icon icon="solar:add-circle-linear" width={18} /> สร้างแมตช์ใหม่
                                </button>
                            </>
                        )}
                    </div>
                </div>


                <div className={`flex gap-6 ${showPlayersSidebar ? 'flex-col lg:flex-row' : ''}`}>
                    {/* Main Content */}
                    <div className={showPlayersSidebar ? 'flex-1 min-w-0' : 'w-full'}>

                        {/* Create Form */}
                        {showForm && (
                            <div className="card mb-6 animate-in shadow-md sticky z-[40] border border-gray-200 top-[170px] lg:top-[120px] 2xl:top-[88px]" style={{ padding: '24px 32px' }}>
                                <h3 className="font-bold mb-5 text-lg" style={{ color: 'var(--gray-900)' }}>{editingMatchId ? 'แก้ไขแมตช์' : 'สร้างแมตช์ใหม่'}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    {(['A', 'B'] as const).map((team) => {
                                        const selected = team === 'A' ? teamA : teamB;
                                        const clr = team === 'A' ? 'var(--orange-500)' : '#3b82f6';
                                        const selectedProfiles = selected.map(uid => {
                                            const ep = players.find(p => p.user_id === uid);
                                            return ep ? (ep.profiles as unknown as Profile) : null;
                                        }).filter(Boolean) as Profile[];

                                        return (
                                            <div key={team}>
                                                <p className="text-sm font-semibold mb-2" style={{ color: clr }}>ทีม {team} ({selected.length}/2)</p>

                                                {/* Selected players chips */}
                                                <div className="space-y-1.5 mb-3">
                                                    {selectedProfiles.length > 0 ? selectedProfiles.map((prof) => (
                                                        <div key={prof.id} className="flex flex-col gap-1 p-3 rounded-xl" style={{
                                                            background: team === 'A' ? 'rgba(249,115,22,0.06)' : 'rgba(59,130,246,0.06)',
                                                            border: `1px solid ${clr}`,
                                                        }}>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                                                    style={{ background: clr, color: 'var(--white)' }}>
                                                                    <Icon icon="solar:check-read-linear" width={14} />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="text-sm font-bold truncate block" style={{ color: clr }}>{prof.display_name}</span>
                                                                </div>
                                                                <button onClick={() => togglePlayer(prof.id, team)} className="shrink-0 p-1 rounded-full transition-colors hover:bg-red-100" style={{ color: 'var(--gray-400)' }}>
                                                                    <Icon icon="solar:close-circle-linear" width={16} />
                                                                </button>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <RankBadge mmr={prof.mmr || 1000} size="sm" showMMR={false} />
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-900 text-white shadow-sm">
                                                                    {playerStats[prof.id]?.total || 0} เกม
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )) : (
                                                        <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--gray-400)', background: 'var(--gray-50)', border: '1px dashed var(--gray-200)' }}>ยังไม่ได้เลือกผู้เล่น</p>
                                                    )}
                                                </div>

                                                {/* Open sidebar button */}
                                                <button
                                                    onClick={() => setSidebarTeam(team)}
                                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                                                    style={{
                                                        border: `1.5px dashed ${clr}`,
                                                        color: clr,
                                                        background: 'transparent',
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = team === 'A' ? 'rgba(249,115,22,0.04)' : 'rgba(59,130,246,0.04)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <Icon icon="solar:users-group-rounded-linear" width={16} />
                                                    เลือกผู้เล่น
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <CustomSelect
                                            label="คอร์ท *"
                                            value={courtNumber}
                                            onChangeAction={(val) => setCourtNumber(val || '')}
                                            options={(event?.courts || []).map(c => ({
                                                value: c,
                                                label: `คอร์ท ${c}`,
                                                icon: 'solar:clapperboard-edit-linear'
                                            }))}
                                            icon="solar:clapperboard-edit-bold"
                                        />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">ลำดับแมตช์</label>
                                        <input type="number" className="form-input form-input-plain h-[42px]" placeholder="เช่น 1, 2..." value={matchSeq} onChange={(e) => setMatchSeq(e.target.value)} />
                                    </div>
                                    <div className="form-group md:col-span-1 col-span-2" style={{ marginBottom: 0 }}>
                                        <label className="form-label text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">หมายเลขลูก</label>
                                        <input className="form-input form-input-plain h-[42px]" placeholder="ระบุเบอร์ลูก..." value={shuttlecockNumber} onChange={(e) => setShuttlecockNumber(e.target.value)} />
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={saveMatch} disabled={creating} className="btn btn-primary btn-sm">
                                        {creating ? <><div className="spinner" /> {editingMatchId ? 'กำลังบันทึก...' : 'สร้าง...'}</> : (editingMatchId ? 'บันทึกการแก้ไข' : 'สร้างแมตช์')}
                                    </button>
                                    <button onClick={() => { setShowForm(false); setTeamA([]); setTeamB([]); setEditingMatchId(null); setCourtNumber(''); setShuttlecockNumber(''); setMatchSeq(''); }} className="btn btn-secondary btn-sm">ยกเลิก</button>
                                </div>
                            </div>
                        )}

                        {/* Player Selection Sidebar */}
                        {sidebarTeam && typeof document !== 'undefined' && createPortal(
                            <>
                                <style>{`
                        @keyframes sidebarSlideIn {
                            from { transform: translateX(100%); }
                            to { transform: translateX(0); }
                        }
                        @keyframes sidebarFadeIn {
                            from { opacity: 0; }
                            to { opacity: 1; }
                        }
                    `}</style>
                                <div className="fixed inset-0 z-[100] flex justify-end" style={{ animation: 'sidebarFadeIn 0.2s ease-out' }}>
                                    {/* Backdrop */}
                                    <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
                                        onClick={() => { setSidebarTeam(null); setSearchQuery(''); }} />
                                    {/* Right Panel */}
                                    <div className="relative h-full w-full max-w-md flex flex-col bg-white shadow-2xl"
                                        style={{ animation: 'sidebarSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
                                    >
                                        {/* Sidebar Header */}
                                        <div className="flex flex-col gap-3 px-5 py-4 shrink-0 border-b border-gray-100">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{
                                                        background: sidebarTeam === 'A' ? 'rgba(249,115,22,0.1)' : 'rgba(59,130,246,0.1)',
                                                    }}>
                                                        <Icon icon="solar:users-group-rounded-bold" width={22} style={{
                                                            color: sidebarTeam === 'A' ? 'var(--orange-500)' : '#3b82f6',
                                                        }} />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-base font-bold text-gray-900">เลือกผู้เล่น — ทีม {sidebarTeam}</h3>
                                                        <p className="text-xs text-gray-500 font-medium">
                                                            เลือกแล้ว {(sidebarTeam === 'A' ? teamA : teamB).length}/2 คน
                                                        </p>
                                                    </div>
                                                </div>
                                                <button onClick={() => { setSidebarTeam(null); setSearchQuery(''); }} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                                                    <Icon icon="solar:close-circle-linear" width={24} />
                                                </button>
                                            </div>

                                            {/* Search Box */}
                                            <div className="relative">
                                                <Icon icon="solar:magnifer-linear" width={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="text"
                                                    placeholder="ค้นหาชื่อผู้เล่น..."
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                                                    style={{ '--tw-ring-color': sidebarTeam === 'A' ? 'var(--orange-500)' : '#3b82f6' } as React.CSSProperties}
                                                    autoFocus
                                                />
                                                {searchQuery && (
                                                    <button
                                                        onClick={() => setSearchQuery('')}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                                    >
                                                        <Icon icon="solar:close-circle-bold" width={16} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Team Toggle */}
                                            <div className="flex bg-gray-100 p-1 rounded-xl">
                                                <button
                                                    onClick={() => setSidebarTeam('A')}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${sidebarTeam === 'A' ? 'bg-white shadow-sm text-orange-500' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    ทีม A
                                                </button>
                                                <button
                                                    onClick={() => setSidebarTeam('B')}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${sidebarTeam === 'B' ? 'bg-white shadow-sm text-blue-500' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    ทีม B
                                                </button>
                                            </div>
                                        </div>

                                        {/* Player List */}
                                        <div className="flex-1 overflow-y-auto px-4 py-3 bg-gray-50/50">
                                            <div className="space-y-4">
                                                {/* Regular Players Section */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-2">สมาชิก ({players.filter(p => p.is_checked_in && !p.is_substitute).length})</p>
                                                    <div className="space-y-2">
                                                        {players
                                                            .filter(ep => {
                                                                const prof = ep.profiles as unknown as Profile;
                                                                const matchesSearch = !searchQuery || prof.display_name.toLowerCase().includes(searchQuery.toLowerCase());
                                                                return ep.is_checked_in && !ep.is_substitute && !prof?.is_guest && matchesSearch;
                                                            })
                                                            .sort((a, b) => (playerStats[a.user_id]?.total || 0) - (playerStats[b.user_id]?.total || 0))
                                                            .map((ep) => {
                                                                const prof = ep.profiles as unknown as Profile;
                                                                const team = sidebarTeam;
                                                                const selected = team === 'A' ? teamA : teamB;
                                                                const clr = team === 'A' ? 'var(--orange-500)' : '#3b82f6';
                                                                const inThis = selected.includes(ep.user_id);
                                                                const inOther = (team === 'A' ? teamB : teamA).includes(ep.user_id);
                                                                const pstat = playerStats[ep.user_id];
                                                                const isPaid = ep.payment_status === 'paid';
                                                                const isDisabled = isPaid && !inThis;

                                                                const skillColor = getSkillColor(prof.skill_level);

                                                                return (
                                                                    <button key={ep.user_id} onClick={() => !isDisabled && togglePlayer(ep.user_id, team)}
                                                                        className="w-full flex items-center justify-between p-3.5 rounded-xl border-2 text-left text-sm transition-all"
                                                                        disabled={isDisabled}
                                                                        style={{
                                                                            background: isDisabled ? 'white' : inThis ? (team === 'A' ? 'rgba(249,115,22,0.04)' : 'rgba(59,130,246,0.04)') : 'white',
                                                                            borderColor: inThis ? clr : 'transparent',
                                                                            boxShadow: inThis ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                                                                            opacity: isDisabled ? 0.6 : inOther ? 0.5 : 1,
                                                                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                                        }}>
                                                                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-sm"
                                                                                style={{
                                                                                    background: inThis ? clr : 'var(--gray-900)',
                                                                                    color: 'var(--white)'
                                                                                }}>
                                                                                {inThis ? <Icon icon="solar:check-read-linear" width={20} /> : prof?.display_name?.charAt(0)?.toUpperCase()}
                                                                            </div>
                                                                            <div className="min-w-0 pr-2">
                                                                                <p className="font-bold text-gray-900 truncate tracking-tight leading-tight mb-1">
                                                                                    {truncateName(prof?.display_name, 20)}
                                                                                </p>
                                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                                    <RankBadge mmr={prof?.mmr || 1000} size="sm" showName={false} showMMR={false} />
                                                                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                        มือ {prof?.skill_level || 'N/A'}
                                                                                    </span>
                                                                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                        {pstat?.total || 0} เกม
                                                                                    </span>
                                                                                    {inOther && <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded">อยู่ทีม {team === 'A' ? 'B' : 'A'}</span>}
                                                                                    {pstat?.playing && (
                                                                                        <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                                                                                            ติดคิว
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Right Side */}
                                                                        {isPaid && !inThis ? (
                                                                            <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full shrink-0 shadow-sm border border-green-100" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                                                                <Icon icon="solar:check-circle-bold" width={14} />
                                                                                จ่ายแล้ว
                                                                            </span>
                                                                        ) : inThis ? (
                                                                            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: clr, color: 'white' }}>
                                                                                <Icon icon="solar:check-bold" width={14} />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                    </div>
                                                </div>

                                                {/* Substitute Players Section */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest px-2 mb-2">ตัวสำรอง ({players.filter(p => p.is_checked_in && p.is_substitute).length})</p>
                                                    <div className="space-y-2">
                                                        {players
                                                            .filter(ep => {
                                                                const prof = ep.profiles as unknown as Profile;
                                                                const matchesSearch = !searchQuery || prof.display_name.toLowerCase().includes(searchQuery.toLowerCase());
                                                                return ep.is_checked_in && ep.is_substitute && !prof?.is_guest && matchesSearch;
                                                            })
                                                            .sort((a, b) => (playerStats[a.user_id]?.total || 0) - (playerStats[b.user_id]?.total || 0))
                                                            .map((ep) => {
                                                                const prof = ep.profiles as unknown as Profile;
                                                                const team = sidebarTeam;
                                                                const selected = team === 'A' ? teamA : teamB;
                                                                const clr = team === 'A' ? 'var(--orange-500)' : '#3b82f6';
                                                                const inThis = selected.includes(ep.user_id);
                                                                const inOther = (team === 'A' ? teamB : teamA).includes(ep.user_id);
                                                                const pstat = playerStats[ep.user_id];
                                                                const isPaid = ep.payment_status === 'paid';
                                                                const isDisabled = isPaid && !inThis;

                                                                const skillColor = getSkillColor(prof.skill_level);

                                                                return (
                                                                    <button key={ep.user_id} onClick={() => !isDisabled && togglePlayer(ep.user_id, team)}
                                                                        className="w-full flex items-center justify-between p-3.5 rounded-xl border-2 text-left text-sm transition-all"
                                                                        disabled={isDisabled}
                                                                        style={{
                                                                            background: isDisabled ? 'white' : inThis ? (team === 'A' ? 'rgba(249,115,22,0.04)' : 'rgba(59,130,246,0.04)') : 'white',
                                                                            borderColor: inThis ? clr : 'transparent',
                                                                            boxShadow: inThis ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                                                                            opacity: isDisabled ? 0.6 : inOther ? 0.5 : 1,
                                                                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                                        }}>
                                                                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-sm"
                                                                                style={{
                                                                                    background: inThis ? clr : 'rgba(59,130,246,0.1)',
                                                                                    color: inThis ? 'var(--white)' : '#3b82f6'
                                                                                }}>
                                                                                {inThis ? <Icon icon="solar:check-read-linear" width={20} /> : prof?.display_name?.charAt(0)?.toUpperCase()}
                                                                            </div>
                                                                            <div className="min-w-0 pr-2">
                                                                                <p className="font-bold text-gray-900 truncate tracking-tight leading-tight mb-1">
                                                                                    {truncateName(prof?.display_name, 20)}
                                                                                </p>
                                                                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                                                    <RankBadge mmr={prof?.mmr || 1000} size="sm" showName={false} showMMR={false} />
                                                                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                        มือ {prof?.skill_level || 'N/A'}
                                                                                    </span>
                                                                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                        {pstat?.total || 0} เกม
                                                                                    </span>
                                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-500 border border-blue-100">สำรอง</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Right Side */}
                                                                        {isPaid && !inThis ? (
                                                                            <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full shrink-0 shadow-sm border border-green-100" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                                                                <Icon icon="solar:check-circle-bold" width={14} />
                                                                                จ่ายแล้ว
                                                                            </span>
                                                                        ) : inThis ? (
                                                                            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: clr, color: 'white' }}>
                                                                                <Icon icon="solar:check-bold" width={14} />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                    </div>
                                                </div>

                                                {/* Guest Players Section */}
                                                <div>
                                                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest px-2 mb-2">ขาจร ({players.filter(p => p.is_checked_in && (p.profiles as unknown as Profile)?.is_guest).length})</p>
                                                    <div className="space-y-2">
                                                        {players
                                                            .filter(ep => {
                                                                const prof = ep.profiles as unknown as Profile;
                                                                const matchesSearch = !searchQuery || prof.display_name.toLowerCase().includes(searchQuery.toLowerCase());
                                                                return ep.is_checked_in && prof?.is_guest && matchesSearch;
                                                            })
                                                            .sort((a, b) => (playerStats[a.user_id]?.total || 0) - (playerStats[b.user_id]?.total || 0))
                                                            .map((ep) => {
                                                                const prof = ep.profiles as unknown as Profile;
                                                                const team = sidebarTeam;
                                                                const selected = team === 'A' ? teamA : teamB;
                                                                const clr = team === 'A' ? 'var(--orange-500)' : '#3b82f6';
                                                                const inThis = selected.includes(ep.user_id);
                                                                const inOther = (team === 'A' ? teamB : teamA).includes(ep.user_id);
                                                                const pstat = playerStats[ep.user_id];
                                                                const isPaid = ep.payment_status === 'paid';
                                                                const isDisabled = isPaid && !inThis;

                                                                return (
                                                                    <button key={ep.user_id} onClick={() => !isDisabled && togglePlayer(ep.user_id, team)}
                                                                        className="w-full flex items-center justify-between p-3.5 rounded-xl border-2 text-left text-sm transition-all"
                                                                        disabled={isDisabled}
                                                                        style={{
                                                                            background: isDisabled ? 'white' : inThis ? (team === 'A' ? 'rgba(249,115,22,0.04)' : 'rgba(59,130,246,0.04)') : 'white',
                                                                            borderColor: inThis ? clr : 'transparent',
                                                                            boxShadow: inThis ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                                                                            opacity: isDisabled ? 0.6 : inOther ? 0.5 : 1,
                                                                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                                        }}>
                                                                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-sm"
                                                                                style={{
                                                                                    background: inThis ? clr : 'var(--purple-600)',
                                                                                    color: 'var(--white)'
                                                                                }}>
                                                                                {inThis ? <Icon icon="solar:check-read-linear" width={20} /> : <Icon icon="solar:ghost-bold" width={20} />}
                                                                            </div>
                                                                            <div className="min-w-0 pr-2">
                                                                                <p className="font-bold text-gray-900 truncate tracking-tight leading-tight mb-1">
                                                                                    {truncateName(prof?.display_name, 20)}
                                                                                </p>
                                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                                    <RankBadge mmr={prof?.mmr || 1000} size="sm" showName={false} showMMR={false} />
                                                                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                        มือ {prof?.skill_level || 'N/A'}
                                                                                    </span>
                                                                                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                                                                        {pstat?.total || 0} เกม
                                                                                    </span>
                                                                                    {inOther && <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1.5 py-0.5 rounded">อยู่ทีม {team === 'A' ? 'B' : 'A'}</span>}
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Right Side */}
                                                                        {isPaid && !inThis ? (
                                                                            <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full shrink-0 shadow-sm border border-green-100" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                                                                                <Icon icon="solar:check-circle-bold" width={14} />
                                                                                จ่ายแล้ว
                                                                            </span>
                                                                        ) : inThis ? (
                                                                            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: clr, color: 'white' }}>
                                                                                <Icon icon="solar:check-bold" width={14} />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                    </div>
                                                </div>

                                                {players.filter(ep => {
                                                    const prof = ep.profiles as unknown as Profile;
                                                    return ep.is_checked_in && (!searchQuery || prof.display_name.toLowerCase().includes(searchQuery.toLowerCase()));
                                                }).length === 0 && (
                                                        <div className="text-center py-10">
                                                            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                                                <Icon icon="solar:user-cross-linear" width={24} className="text-gray-400" />
                                                            </div>
                                                            <p className="text-sm font-medium text-gray-900">ไม่พบผู้เล่น</p>
                                                            <p className="text-xs text-gray-500 mt-1">ลองค้นหาด้วยชื่ออื่น</p>
                                                        </div>
                                                    )}
                                            </div>
                                        </div>

                                        {/* Sidebar Footer */}
                                        <div className="px-5 py-4 shrink-0 bg-white border-t border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                                            <button
                                                onClick={() => { setSidebarTeam(null); setSearchQuery(''); }}
                                                className="btn w-full shadow-sm text-white"
                                                style={{ background: sidebarTeam === 'A' ? 'var(--orange-500)' : '#3b82f6', border: 'none' }}
                                            >
                                                <Icon icon="solar:check-circle-bold" width={18} />
                                                เสร็จสิ้น ({(sidebarTeam === 'A' ? teamA : teamB).length}/2)
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>,
                            document.body
                        )}

                        {/* Matches */}
                        {matches.length === 0 ? (
                            <div className="card text-center shadow-sm" style={{ padding: '64px 32px' }}>
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm" style={{ background: 'var(--gray-100)' }}>
                                    <Icon icon="solar:sort-horizontal-linear" width={28} style={{ color: 'var(--gray-500)' }} />
                                </div>
                                <h2 className="text-xl font-bold mb-2 tracking-tight" style={{ color: 'var(--gray-900)' }}>ยังไม่มีแมตช์</h2>
                                <p className="text-sm font-medium mb-8" style={{ color: 'var(--gray-500)' }}>กดปุ่ม "สร้างแมตช์ใหม่" เพื่อเริ่มต้นความสนุก</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {matches.map((match, i) => {
                                    const cfg = statusCfg[match.status];
                                    const tA = match.match_players?.filter((mp) => mp.team === 'A') || [];
                                    const tB = match.match_players?.filter((mp) => mp.team === 'B') || [];
                                    const aWon = match.status === 'finished' && match.team_a_score > match.team_b_score;
                                    const bWon = match.status === 'finished' && match.team_b_score > match.team_a_score;
                                    return (
                                        <div key={match.id} className="card shadow-sm" style={{ padding: '20px 24px' }}>
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="badge badge-muted shrink-0">#{match.match_number || i + 1}</span>
                                                    <span className={`badge shrink-0 ${cfg.badge}`}>{cfg.label}</span>
                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded shadow-sm bg-gray-900 text-white shrink-0">
                                                        คอร์ท {match.court_number}
                                                    </span>
                                                    {match.shuttlecock_numbers && match.shuttlecock_numbers.length > 0 && (
                                                        <div className="flex items-center gap-1">
                                                            {match.shuttlecock_numbers.map((num, idx) => (
                                                                <span key={idx} className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold bg-orange-100 text-orange-600 border border-orange-200">
                                                                    {num}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {/* Add Shuttlecock Button */}
                                                    {match.status === 'playing' && (
                                                        <button onClick={() => addShuttlecock(match.id, match.shuttlecock_numbers || [])} className="w-6 h-6 rounded flex items-center justify-center bg-gray-50 border border-gray-200 text-gray-500 hover:text-orange-500 hover:border-orange-200 hover:bg-orange-50 transition-colors shrink-0" title="เบิกลูกแบดเพิ่ม">
                                                            <Icon icon="solar:add-circle-linear" width={16} />
                                                        </button>
                                                    )}
                                                </div>
                                                {event?.status === 'open' && (
                                                    <div className="flex gap-1.5">
                                                        {match.status === 'finished' && (
                                                            <>
                                                                <button onClick={() => updateMatchStatus(match.id, 'playing')} className="btn btn-sm" style={{ background: 'rgba(59,130,246,0.06)', color: '#3b82f6' }} title="ย้ายกลับไปแก้ไขผลแข่ง">
                                                                    <Icon icon="solar:refresh-linear" width={14} /> เล่นต่อ/แก้ไข
                                                                </button>
                                                                <button onClick={() => handleDeleteMatch(match.id)} className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.06)', color: 'var(--error)' }} title="ลบแมตช์ที่จบแล้วนี้">
                                                                    <Icon icon="solar:trash-bin-trash-bold" width={14} /> ลบ
                                                                </button>
                                                            </>
                                                        )}
                                                        {match.status !== 'finished' && (
                                                            <>
                                                                <button onClick={() => editMatch(match)} className="btn btn-sm" style={{ background: 'rgba(59,130,246,0.06)', color: '#3b82f6' }}>
                                                                    <Icon icon="solar:pen-linear" width={14} /> แก้ไข
                                                                </button>
                                                                {match.status === 'waiting' && (
                                                                    <button onClick={() => updateMatchStatus(match.id, 'playing')} className="btn btn-sm" style={{ background: 'rgba(22,163,74,0.06)', color: 'var(--success)' }}>
                                                                        <Icon icon="solar:play-linear" width={14} /> เริ่ม
                                                                    </button>
                                                                )}
                                                                {match.status === 'playing' && (
                                                                    <div className="flex gap-1.5">
                                                                        <button onClick={() => handleCancelMatch(match.id)} className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.06)', color: 'var(--error)' }}>
                                                                            <Icon icon="solar:trash-bin-trash-bold" width={14} /> ยกเลิก
                                                                        </button>
                                                                        <button onClick={() => updateMatchStatus(match.id, 'finished')} className="btn btn-sm" style={{ background: 'rgba(249,115,22,0.06)', color: 'var(--orange-500)' }}>
                                                                            <Icon icon="solar:check-circle-linear" width={14} /> จบ
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 p-3 rounded-xl min-w-0" style={{
                                                    background: aWon ? 'rgba(249,115,22,0.06)' : 'rgba(249,115,22,0.03)',
                                                    border: `1.5px solid ${aWon ? 'var(--orange-500)' : 'rgba(249,115,22,0.1)'}`,
                                                }}>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <p className="text-xs font-semibold" style={{ color: 'var(--orange-500)' }}>ทีม A</p>
                                                        {aWon && <Icon icon="solar:cup-star-bold" width={14} style={{ color: 'var(--orange-500)' }} />}
                                                        {!aWon && !bWon && match.status === 'finished' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100">เสมอ</span>}
                                                    </div>
                                                    {tA.map((mp) => {
                                                        const isMe = mp.user_id === currentUserId;
                                                        const ep = players.find(p => p.user_id === mp.user_id);
                                                        const isPaid = ep?.payment_status === 'paid';
                                                        return (
                                                            <div key={mp.id} className="py-2 border-b border-orange-100 last:border-0 min-w-0">
                                                                <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                                                                    <p className="text-sm font-bold truncate" style={{
                                                                        color: isMe ? 'var(--orange-600)' : 'var(--gray-900)',
                                                                    }}>
                                                                        {truncateName((mp.profiles as unknown as Profile)?.display_name, 14)} {isMe && '(คุณ)'} (#{match.match_number || i + 1})
                                                                    </p>
                                                                    {isPaid && (
                                                                        <span title="จ่ายแล้ว" className="flex shrink-0">
                                                                            <Icon icon="solar:check-circle-bold" width={14} className="text-emerald-500" />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <RankBadge mmr={(mp.profiles as unknown as Profile)?.mmr || 1000} size="sm" showName={false} showMMR={false} />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div className="shrink-0 text-center px-1.5 py-0.5 rounded-full bg-slate-50 border border-slate-100">
                                                    {match.status === 'finished' ? (
                                                        <p className="text-lg font-bold" style={{ color: 'var(--gray-900)' }}>{match.team_a_score} - {match.team_b_score}</p>
                                                    ) : (
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[9px] font-black tracking-tighter text-indigo-300 uppercase leading-none mb-0.5 italic">VS</span>
                                                            <div className="text-[14px] font-black text-indigo-600 leading-none">
                                                                {match.court_number}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 p-3 rounded-xl min-w-0" style={{
                                                    background: bWon ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.03)',
                                                    border: `1.5px solid ${bWon ? '#3b82f6' : 'rgba(59,130,246,0.1)'}`,
                                                }}>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <p className="text-xs font-semibold" style={{ color: '#3b82f6' }}>ทีม B</p>
                                                        {bWon && <Icon icon="solar:cup-star-bold" width={14} style={{ color: '#3b82f6' }} />}
                                                        {!aWon && !bWon && match.status === 'finished' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-100">เสมอ</span>}
                                                    </div>
                                                    {tB.map((mp) => {
                                                        const isMe = mp.user_id === currentUserId;
                                                        const ep = players.find(p => p.user_id === mp.user_id);
                                                        const isPaid = ep?.payment_status === 'paid';
                                                        return (
                                                            <div key={mp.id} className="py-2 border-b border-blue-100 last:border-0 min-w-0">
                                                                <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                                                                    <p className="text-sm font-bold truncate" style={{
                                                                        color: isMe ? '#2563eb' : 'var(--gray-900)',
                                                                    }}>
                                                                        {truncateName((mp.profiles as unknown as Profile)?.display_name, 14)} {isMe && '(คุณ)'} (#{match.match_number || i + 1})
                                                                    </p>
                                                                    {isPaid && (
                                                                        <span title="จ่ายแล้ว" className="flex shrink-0">
                                                                            <Icon icon="solar:check-circle-bold" width={14} className="text-emerald-500" />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <RankBadge mmr={(mp.profiles as unknown as Profile)?.mmr || 1000} size="sm" showName={false} showMMR={false} />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Payment Status Section */}
                        {players.length > 0 && (
                            <div className="card shadow-sm mt-6" style={{ padding: 0, overflow: 'hidden' }}>
                                <button
                                    onClick={() => setShowPaymentSection(!showPaymentSection)}
                                    className="w-full flex items-center justify-between px-5 py-4 transition-colors hover:bg-gray-50"
                                    style={{ borderBottom: showPaymentSection ? '1px solid var(--gray-200)' : 'none' }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(22,163,74,0.06)' }}>
                                            <Icon icon="solar:wallet-money-linear" width={20} style={{ color: 'var(--success)' }} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-bold" style={{ color: 'var(--gray-900)' }}>สถานะการจ่ายเงิน</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <p className="text-xs" style={{ color: 'var(--gray-500)' }}>
                                                    จ่ายแล้ว {players.filter(p => p.payment_status === 'paid').length}/{players.length} คน
                                                </p>
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--success)' }}>
                                                    ยอดเก็บแล้ว ฿{players.reduce((sum, p) => sum + (p.payment_status === 'paid' ? (userBills[p.user_id] || 0) : 0), 0).toLocaleString()}
                                                </span>
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                                                    ยอดทั้งหมด ฿{players.reduce((sum, p) => sum + (userBills[p.user_id] || 0), 0).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {players.filter(p => p.payment_status === 'pending').length > 0 && (
                                            <span className="badge badge-warning">
                                                ค้าง {players.filter(p => p.payment_status === 'pending').length}
                                            </span>
                                        )}
                                        <Icon icon={showPaymentSection ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'} width={18} style={{ color: 'var(--gray-400)' }} />
                                    </div>
                                </button>

                                {showPaymentSection && (
                                    <div className="flex flex-col">
                                        {/* Payment Search Box */}
                                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                                            <div className="relative">
                                                <Icon icon="solar:magnifer-linear" width={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                <input
                                                    type="text"
                                                    placeholder="ค้นหาชื่อผู้เล่นเพื่อชำระเงิน..."
                                                    value={paymentSearchQuery}
                                                    onChange={(e) => setPaymentSearchQuery(e.target.value)}
                                                    className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-gray-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
                                                />
                                                {paymentSearchQuery && (
                                                    <button
                                                        onClick={() => setPaymentSearchQuery('')}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                                    >
                                                        <Icon icon="solar:close-circle-bold" width={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Sort: pending first, then paid */}
                                        {[...players]
                                            .filter(ep => {
                                                if (!paymentSearchQuery) return true;
                                                const prof = ep.profiles as unknown as Profile;
                                                return prof?.display_name?.toLowerCase().includes(paymentSearchQuery.toLowerCase());
                                            })
                                            .sort((a, b) => {
                                                if (a.payment_status !== b.payment_status) return a.payment_status === 'pending' ? -1 : 1;
                                                return 0;
                                            })
                                            .map((ep, index) => {
                                                const prof = ep.profiles as unknown as Profile;
                                                const isPaid = ep.payment_status === 'paid';
                                                const isUpdating = updatingPayment === ep.user_id;
                                                const originalBill = (() => {
                                                    if (!event) return 0;
                                                    let totalShuttleCost = 0;
                                                    matches.filter(m =>
                                                        (m.status === 'finished' || m.status === 'playing') &&
                                                        m.match_players?.some(mp => mp.user_id === ep.user_id)
                                                    ).forEach(m => {
                                                        if (m.shuttlecock_numbers && m.shuttlecock_numbers.length > 0) {
                                                            totalShuttleCost += m.shuttlecock_numbers.length * (event.shuttlecock_price || 0);
                                                        }
                                                    });
                                                    return (event.entry_fee || 0) + totalShuttleCost + (ep.additional_cost || 0);
                                                })();
                                                const hasDiscount = (ep.discount || 0) > 0;
                                                return (
                                                    <div
                                                        key={ep.id}
                                                        className="flex items-center justify-between px-5 py-3 transition-colors"
                                                        style={{
                                                            borderBottom: index < players.length - 1 ? '1px solid var(--gray-100)' : 'none',
                                                            background: isPaid ? 'rgba(22, 163, 74, 0.02)' : 'transparent',
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div
                                                                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                                                style={{ background: 'var(--gray-900)', color: 'var(--white)' }}
                                                            >
                                                                {prof?.display_name?.charAt(0)?.toUpperCase()}
                                                            </div>
                                                            <p className="text-sm font-medium truncate" style={{ color: 'var(--gray-900)' }}>
                                                                {truncateName(prof?.display_name, 20)}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                                            {/* Additional Cost Input */}
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    placeholder="0"
                                                                    defaultValue={ep.additional_cost || ''}
                                                                    onBlur={(e) => {
                                                                        const val = parseInt(e.target.value) || 0;
                                                                        if (val !== (ep.additional_cost || 0)) updateAdditionalCost(ep, val);
                                                                    }}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                                    className="w-16 text-right text-xs font-semibold px-2 py-1 rounded-lg border border-gray-200 focus:border-red-400 focus:ring-1 focus:ring-red-200 focus:outline-none transition-all"
                                                                    style={{ background: (ep.additional_cost || 0) > 0 ? 'rgba(239,68,68,0.04)' : 'white', color: (ep.additional_cost || 0) > 0 ? '#ef4444' : 'var(--gray-600)' }}
                                                                    title="ค่าใช้จ่ายเพิ่มเติม (บาท)"
                                                                />
                                                                <span className="text-[10px] text-gray-400 font-medium">+เพิ่ม</span>
                                                            </div>

                                                            {/* Discount Input */}
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    placeholder="0"
                                                                    defaultValue={ep.discount || ''}
                                                                    onBlur={(e) => {
                                                                        const val = parseInt(e.target.value) || 0;
                                                                        if (val !== (ep.discount || 0)) updateDiscount(ep, val);
                                                                    }}
                                                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                                    className="w-16 text-right text-xs font-semibold px-2 py-1 rounded-lg border border-gray-200 focus:border-purple-400 focus:ring-1 focus:ring-purple-200 focus:outline-none transition-all"
                                                                    style={{ background: hasDiscount ? 'rgba(147,51,234,0.04)' : 'white', color: hasDiscount ? '#7c3aed' : 'var(--gray-600)' }}
                                                                    title="ส่วนลด (บาท)"
                                                                />
                                                                <span className="text-[10px] text-gray-400 font-medium">ลด</span>
                                                            </div>

                                                            {/* Bill Amount */}
                                                            <div className="text-right min-w-[60px]">
                                                                {hasDiscount && (
                                                                    <p className="text-[10px] line-through text-gray-400">฿{originalBill.toLocaleString()}</p>
                                                                )}
                                                                <span className="text-sm font-bold" style={{ color: hasDiscount ? '#7c3aed' : 'var(--gray-700)' }}>
                                                                    ฿{(userBills[ep.user_id] || 0).toLocaleString()}
                                                                </span>
                                                            </div>

                                                            <span className={`badge ${isPaid ? 'badge-success' : 'badge-warning'}`}>
                                                                {isPaid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย'}
                                                            </span>
                                                            <button
                                                                onClick={() => togglePayment(ep)}
                                                                disabled={isUpdating}
                                                                className={`btn btn-sm ${isPaid ? 'btn-outline' : 'btn-primary'}`}
                                                                style={{ minWidth: '36px', padding: '6px 10px' }}
                                                            >
                                                                {isUpdating ? (
                                                                    <div className="spinner" style={{ width: 14, height: 14 }} />
                                                                ) : (
                                                                    <Icon icon={isPaid ? 'solar:undo-left-linear' : 'solar:check-circle-linear'} width={16} />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                        {players.filter(ep => {
                                            if (!paymentSearchQuery) return true;
                                            const prof = ep.profiles as unknown as Profile;
                                            return prof?.display_name?.toLowerCase().includes(paymentSearchQuery.toLowerCase());
                                        }).length === 0 && (
                                                <div className="text-center py-10 bg-gray-50/30">
                                                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                                        <Icon icon="solar:magnifer-zoom-out-linear" width={24} className="text-gray-400" />
                                                    </div>
                                                    <p className="text-sm font-bold text-gray-500">ไม่พบรายชื่อผู้เล่นที่ค้นหา</p>
                                                    <p className="text-[10px] text-gray-400 mt-1">ลองเปลี่ยนคำค้นหาใหม่อีกครั้ง</p>
                                                </div>
                                            )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Score Modal — 2-Set + Winner */}
                        {scoreMatch && typeof document !== 'undefined' && createPortal(
                            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={() => setScoreMatch(null)}>
                                <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" />
                                <div className="card w-full max-w-md animate-in shadow-xl relative z-10" style={{ padding: '28px 32px' }} onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-between mb-5">
                                        <h3 className="font-bold text-lg" style={{ color: 'var(--gray-900)' }}>บันทึกคะแนน</h3>
                                        <button onClick={() => setScoreMatch(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                                            <Icon icon="solar:close-circle-linear" width={20} />
                                        </button>
                                    </div>

                                    {/* Result Selector */}
                                    <div className="flex flex-col gap-4 mb-8">
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setWinner(winner === 'A' ? null : 'A')}
                                                className="flex-1 p-5 rounded-2xl flex flex-col items-center gap-2 transition-all duration-200 border-2 shadow-sm hover:shadow-md group"
                                                style={{
                                                    background: winner === 'A' ? 'var(--orange-500)' : 'white',
                                                    color: winner === 'A' ? 'white' : 'var(--orange-500)',
                                                    borderColor: 'var(--orange-500)',
                                                    transform: winner === 'A' ? 'scale(1.02)' : 'none',
                                                }}
                                            >
                                                <div className={`p-3 rounded-full transition-colors ${winner === 'A' ? 'bg-white/20' : 'bg-orange-50'}`}>
                                                    <Icon icon={winner === 'A' ? 'solar:cup-star-bold' : 'solar:cup-star-linear'} width={32} />
                                                </div>
                                                <span className="font-extrabold text-sm uppercase tracking-tight">ทีม A ชนะ</span>
                                            </button>

                                            <button
                                                onClick={() => setWinner(winner === 'B' ? null : 'B')}
                                                className="flex-1 p-5 rounded-2xl flex flex-col items-center gap-2 transition-all duration-200 border-2 shadow-sm hover:shadow-md group"
                                                style={{
                                                    background: winner === 'B' ? '#3b82f6' : 'white',
                                                    color: winner === 'B' ? 'white' : '#3b82f6',
                                                    borderColor: '#3b82f6',
                                                    transform: winner === 'B' ? 'scale(1.02)' : 'none',
                                                }}
                                            >
                                                <div className={`p-3 rounded-full transition-colors ${winner === 'B' ? 'bg-white/20' : 'bg-blue-50'}`}>
                                                    <Icon icon={winner === 'B' ? 'solar:cup-star-bold' : 'solar:cup-star-linear'} width={32} />
                                                </div>
                                                <span className="font-extrabold text-sm uppercase tracking-tight">ทีม B ชนะ</span>
                                            </button>
                                        </div>

                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setWinner(winner === 'Draw' ? null : 'Draw')}
                                                className="flex-1 p-4 rounded-xl flex items-center justify-center gap-3 transition-all duration-200 border-2 shadow-sm hover:shadow-md"
                                                style={{
                                                    background: winner === 'Draw' ? '#9333ea' : 'white',
                                                    color: winner === 'Draw' ? 'white' : '#9333ea',
                                                    borderColor: '#9333ea',
                                                    transform: winner === 'Draw' ? 'scale(1.01)' : 'none',
                                                }}
                                            >
                                                <div className={`p-2 rounded-full ${winner === 'Draw' ? 'bg-white/20' : 'bg-purple-50'}`}>
                                                    <Icon icon={winner === 'Draw' ? 'solar:hand-shake-bold' : 'solar:hand-shake-linear'} width={20} />
                                                </div>
                                                <span className="font-bold text-sm">เสมอ</span>
                                            </button>

                                            <button
                                                onClick={() => setWinner(winner === 'None' ? null : 'None')}
                                                className="flex-1 p-4 rounded-xl flex items-center justify-center gap-3 transition-all duration-200 border-2 shadow-sm hover:shadow-md"
                                                style={{
                                                    background: winner === 'None' ? 'var(--gray-600)' : 'white',
                                                    color: winner === 'None' ? 'white' : 'var(--gray-600)',
                                                    borderColor: 'var(--gray-600)',
                                                    transform: winner === 'None' ? 'scale(1.01)' : 'none',
                                                }}
                                            >
                                                <div className={`p-2 rounded-full ${winner === 'None' ? 'bg-white/20' : 'bg-gray-50'}`}>
                                                    <Icon icon={winner === 'None' ? 'solar:close-circle-bold' : 'solar:close-circle-linear'} width={20} />
                                                </div>
                                                <span className="font-bold text-sm">ไม่แจ้งผล</span>
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={submitScore}
                                        disabled={!winner}
                                        className={`btn w-full py-4 rounded-xl text-lg font-bold shadow-lg transition-all ${winner
                                            ? 'btn-primary shadow-orange-200 active:scale-95'
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            }`}
                                    >
                                        <Icon icon="solar:check-circle-linear" width={22} />
                                        บันทึกผลการแข่งขัน
                                    </button>
                                </div>
                            </div>,
                            document.body
                        )}
                        {/* Add Shuttlecock Modal */}
                        {addingShuttlecockMatch && typeof document !== 'undefined' && createPortal(
                            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                                <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => !creating && setAddingShuttlecockMatch(null)} />
                                <div className="card w-full max-w-sm relative z-10 animate-in fade-in zoom-in-95 duration-200" style={{ padding: '24px' }}>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.1)' }}>
                                            <Icon icon="solar:shuttlecock-linear" width={20} style={{ color: 'var(--orange-500)' }} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg" style={{ color: 'var(--gray-900)' }}>เบิกลูกแบดเพิ่ม</h3>
                                            <p className="text-sm" style={{ color: 'var(--gray-500)' }}>ระบุหมายเลขลูกที่เบิก</p>
                                        </div>
                                    </div>

                                    <div className="form-group mb-6">
                                        <input
                                            autoFocus
                                            className="form-input"
                                            placeholder="ตัวอย่าง: 12"
                                            value={newShuttlecockNumber}
                                            onChange={(e) => setNewShuttlecockNumber(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && submitAddShuttlecock()}
                                        />
                                    </div>

                                    <div className="flex gap-2">
                                        <button onClick={() => setAddingShuttlecockMatch(null)} disabled={creating} className="btn btn-secondary flex-1">ยกเลิก</button>
                                        <button onClick={submitAddShuttlecock} disabled={creating} className="btn btn-primary flex-1 bg-orange-500 hover:bg-orange-600 border-none text-white">
                                            {creating ? <div className="spinner" /> : 'ยืนยัน'}
                                        </button>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}

                        {/* Add Guest Modal */}
                        {showAddGuestModal && typeof document !== 'undefined' && createPortal(
                            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                                <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => !creating && setShowAddGuestModal(false)} />
                                <div className="card w-full max-w-sm relative z-10 animate-in fade-in zoom-in-95 duration-200" style={{ padding: '24px' }}>

                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(147,51,234,0.1)' }}>
                                            <Icon icon="solar:user-plus-bold" width={20} style={{ color: 'var(--purple-600)' }} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg" style={{ color: 'var(--gray-900)' }}>เพิ่มขาจร (Guest)</h3>
                                            <p className="text-sm" style={{ color: 'var(--gray-500)' }}>สำหรับผู้เล่นที่ยังไม่มีบัญชีในระบบ</p>
                                        </div>
                                    </div>

                                    <div className="form-group mb-4">
                                        <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--gray-700)' }}>ชื่อแสดงผล <span className="text-red-500">*</span></label>
                                        <input
                                            autoFocus
                                            className="form-input"
                                            placeholder="กรอกชื่อขาจร..."
                                            value={guestName}
                                            onChange={(e) => setGuestName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddGuest()}
                                        />
                                    </div>

                                    <div className="form-group mb-6">
                                        <CustomSelect
                                            label="ระดับฝีมือ (ไม่บังคับ)"
                                            value={guestSkill || ''}
                                            onChangeAction={(val) => setGuestSkill(val || null)}
                                            options={GUEST_SKILL_OPTIONS}
                                            icon="solar:medal-star-bold"
                                        />
                                    </div>

                                    <div className="flex gap-2">
                                        <button onClick={() => setShowAddGuestModal(false)} disabled={creating} className="btn btn-secondary flex-1">ยกเลิก</button>
                                        <button onClick={handleAddGuest} disabled={creating} className="btn flex-1 bg-purple-600 hover:bg-purple-700 border-none text-white">
                                            {creating ? <div className="spinner" /> : 'เพิ่มผู้เล่นขาจร'}
                                        </button>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}

                        {/* Add Player Modal */}
                        {showAddPlayerModal && typeof document !== 'undefined' && createPortal(
                            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                                <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => setShowAddPlayerModal(false)} />
                                <div className="card w-full max-w-sm relative z-10 animate-in fade-in zoom-in-95 duration-200" style={{ padding: '24px' }}>

                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.1)' }}>
                                            <Icon icon="solar:users-group-rounded-bold" width={20} style={{ color: 'var(--orange-500)' }} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg" style={{ color: 'var(--gray-900)' }}>เพิ่มผู้เล่น</h3>
                                            <p className="text-sm" style={{ color: 'var(--gray-500)' }}>เพิ่มผู้เล่นที่มีบัญชีในระบบลงในก๊วนนี้</p>
                                        </div>
                                    </div>

                                    <div className="form-group mb-4">
                                        <div className="relative">
                                            <Icon icon="solar:magnifer-linear" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width={16} />
                                            <input
                                                autoFocus
                                                type="text"
                                                className="form-input pl-9"
                                                placeholder="ค้นหาชื่อผู้เล่น..."
                                                value={newPlayerSearch}
                                                onChange={(e) => {
                                                    setNewPlayerSearch(e.target.value);
                                                    searchUnjoinedPlayers(e.target.value);
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="max-h-60 overflow-y-auto mb-4 border border-gray-100 rounded-xl">
                                        {searchingPlayers ? (
                                            <div className="flex justify-center p-4"><div className="spinner border-orange-500 border-t-transparent" /></div>
                                        ) : unjoinedPlayers.length > 0 ? (
                                            <div className="divide-y divide-gray-50">
                                                {unjoinedPlayers.map(p => (
                                                    <div key={p.id} className="flex items-center justify-between p-3 hover:bg-orange-50/50 transition-colors">
                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                            <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0 overflow-hidden flex items-center justify-center border border-gray-200">
                                                                {p.avatar_url ? (
                                                                    <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <Icon icon="solar:user-bold" className="text-gray-400" width={16} />
                                                                )}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                                    {truncateName(p.display_name, 20)}
                                                                </p>
                                                                {p.skill_level && (
                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-gray-500 bg-gray-100 border border-gray-200">{p.skill_level}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <button
                                                            disabled={addingPlayer === p.id}
                                                            onClick={() => addSubstitutePlayer(p.id)} // <--- เปลี่ยนเป็นชื่อนี้ครับ
                                                            className="btn btn-sm bg-orange-500 hover:bg-orange-600 border-none text-white whitespace-nowrap shrink-0 ml-2"
                                                        >
                                                            {addingPlayer === p.id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : 'เพิ่ม'}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-4 text-center text-sm text-gray-500 bg-gray-50">ไม่พบผู้เล่น</div>
                                        )}
                                    </div>

                                    <button onClick={() => setShowAddPlayerModal(false)} className="btn btn-secondary w-full">ปิด</button>
                                </div>
                            </div>,
                            document.body
                        )}
                    </div > {/* end main content */}

                    {/* Check-in Side Panel (inline) Add back the inactive sections as requested */}
                    {showPlayersSidebar && (
                        <div className="w-full lg:w-80 xl:w-96 shrink-0">
                            <div className="card shadow-sm sticky top-4 overflow-hidden" style={{ maxHeight: 'calc(100vh - 100px)' }}>
                                {/* Header */}
                                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)' }}>
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(249,115,22,0.08)' }}>
                                            <Icon icon="solar:users-group-rounded-bold" width={18} style={{ color: 'var(--orange-500)' }} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold" style={{ color: 'var(--gray-900)' }}>รายชื่อผู้เล่น</p>
                                            <p className="text-[10px]" style={{ color: 'var(--gray-500)' }}>เช็คอินแล้ว {players.filter(p => p.is_checked_in).length}/{players.length} คน</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => setShowAddGuestModal(true)} className="px-2 py-1.5 rounded-lg transition-colors bg-white hover:bg-purple-50/50 border border-gray-200 text-[10px] font-black flex items-center gap-1" style={{ color: 'var(--purple-600)' }}>
                                            <Icon icon="solar:user-plus-bold" width={14} />
                                            แอดขาจร
                                        </button>
                                        <button onClick={() => { setShowAddPlayerModal(true); searchUnjoinedPlayers(''); }} className="px-2 py-1.5 rounded-lg transition-colors bg-white hover:bg-orange-50/50 border border-gray-200 text-[10px] font-black flex items-center gap-1" style={{ color: 'var(--orange-500)' }}>
                                            <Icon icon="solar:users-group-rounded-bold" width={14} />
                                            เพิ่ม
                                        </button>
                                        <button onClick={() => setShowPlayersSidebar(false)} className="p-1.5 rounded-lg transition-colors hover:bg-gray-100">
                                            <Icon icon="solar:close-circle-linear" width={20} style={{ color: 'var(--gray-400)' }} />
                                        </button>
                                    </div>
                                </div>

                                {/* Summary badges */}
                                <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--gray-100)' }}>
                                    <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(249,115,22,0.08)', color: 'var(--orange-500)' }}>
                                        <Icon icon="solar:check-read-linear" width={10} />
                                        เช็คอิน {players.filter(p => p.is_checked_in).length}
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(22,163,74,0.08)', color: 'var(--success)' }}>
                                        <Icon icon="solar:check-circle-bold" width={10} />
                                        จ่าย {players.filter(p => p.payment_status === 'paid').length}
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(234,88,12,0.08)', color: 'var(--warning)' }}>
                                        <Icon icon="solar:clock-circle-linear" width={10} />
                                        ค้าง {players.filter(p => p.payment_status === 'pending').length}
                                    </div>
                                </div>

                                {/* Player list scroll area */}
                                <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>

                                    {/* 1. Checked-in Friends (Regular) */}
                                    {players.filter(p => p.is_checked_in && !p.is_substitute && !(p.profiles as unknown as Profile)?.is_guest).length > 0 && (
                                        <div className="px-3 py-1.5" style={{ background: 'rgba(249,115,22,0.03)' }}>
                                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--orange-500)' }}>เช็คอินแล้ว</p>
                                        </div>
                                    )}
                                    {players.filter(p => p.is_checked_in && !p.is_substitute && !(p.profiles as unknown as Profile)?.is_guest).map(ep => {
                                        const prof = ep.profiles as unknown as Profile;
                                        const pstat = playerStats[ep.user_id];
                                        const isPaid = ep.payment_status === 'paid';
                                        const isSelected = sidebarTeam === 'A' ? teamA.includes(ep.user_id) : sidebarTeam === 'B' ? teamB.includes(ep.user_id) : false;
                                        const inOther = (sidebarTeam === 'A' ? teamB : sidebarTeam === 'B' ? teamA : []).includes(ep.user_id);
                                        const isDisabledSelection = isPaid && !isSelected;

                                        return (
                                            <div key={ep.id}
                                                className={`flex items-center gap-2.5 px-3 py-2 transition-all group cursor-pointer ${sidebarTeam ? 'hover:bg-opacity-80' : 'hover:bg-gray-50'}`}
                                                style={{
                                                    borderBottom: '1px solid var(--gray-50)',
                                                    background: isSelected ? (sidebarTeam === 'A' ? 'rgba(249,115,22,0.08)' : 'rgba(59,130,246,0.08)') : 'transparent',
                                                    borderLeft: isSelected ? `3px solid ${sidebarTeam === 'A' ? 'var(--orange-500)' : '#3b82f6'}` : '3px solid transparent'
                                                }}
                                                onClick={() => {
                                                    if (sidebarTeam) {
                                                        if (!isDisabledSelection) togglePlayer(ep.user_id, sidebarTeam);
                                                    } else {
                                                        toggleCheckIn(ep);
                                                    }
                                                }}
                                            >
                                                <button onClick={(e) => { e.stopPropagation(); toggleCheckIn(ep); }} className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors"
                                                    style={{ background: 'var(--orange-500)', color: 'var(--white)' }}>
                                                    <Icon icon="solar:check-read-linear" width={14} />
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className={`text-xs font-bold truncate ${isSelected ? 'text-gray-900' : 'text-gray-900 group-hover:text-orange-600'}`}>
                                                            {prof?.display_name}
                                                        </p>
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
                                                            มือ {prof?.skill_level || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <RankBadge mmr={prof?.mmr || 1000} size="sm" showName={false} showMMR={false} />
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">
                                                            {pstat?.total || 0} เกม
                                                        </span>
                                                        {pstat && pstat.playing && (
                                                            <span className="text-[9px] font-bold text-orange-500 px-1.5 py-0.5 rounded-md bg-orange-50">กำลังตี</span>
                                                        )}
                                                        {inOther && <span className="text-[9px] font-bold text-red-500">อยู่ทีม {sidebarTeam === 'A' ? 'B' : 'A'}</span>}
                                                    </div>
                                                </div>
                                                {isSelected ? (
                                                    <Icon icon="solar:check-circle-bold" width={16} className={sidebarTeam === 'A' ? 'text-orange-500' : 'text-blue-500'} />
                                                ) : isPaid ? (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(22,163,74,0.08)', color: 'var(--success)' }}>จ่ายแล้ว</span>
                                                ) : (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(234,88,12,0.08)', color: 'var(--warning)' }}>ค้าง</span>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* 2. Checked-in Substitutes */}
                                    {players.filter(p => p.is_checked_in && p.is_substitute && !(p.profiles as unknown as Profile)?.is_guest).length > 0 && (
                                        <div className="px-3 py-1.5" style={{ background: 'rgba(59,130,246,0.03)' }}>
                                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#3b82f6' }}>ตัวสำรอง (เช็คอิน)</p>
                                        </div>
                                    )}
                                    {players.filter(p => p.is_checked_in && p.is_substitute && !(p.profiles as unknown as Profile)?.is_guest).map(ep => {
                                        const prof = ep.profiles as unknown as Profile;
                                        const pstat = playerStats[ep.user_id];
                                        const isPaid = ep.payment_status === 'paid';
                                        const isSelected = sidebarTeam === 'A' ? teamA.includes(ep.user_id) : sidebarTeam === 'B' ? teamB.includes(ep.user_id) : false;
                                        const inOther = (sidebarTeam === 'A' ? teamB : sidebarTeam === 'B' ? teamA : []).includes(ep.user_id);
                                        const isDisabledSelection = isPaid && !isSelected;

                                        return (
                                            <div key={ep.id}
                                                className={`flex items-center gap-2.5 px-3 py-2 transition-all group cursor-pointer ${sidebarTeam ? 'hover:bg-opacity-80' : 'hover:bg-blue-50/30'}`}
                                                style={{
                                                    borderBottom: '1px solid var(--gray-50)',
                                                    background: isSelected ? (sidebarTeam === 'A' ? 'rgba(249,115,22,0.08)' : 'rgba(59,130,246,0.08)') : 'transparent',
                                                    borderLeft: isSelected ? `3px solid ${sidebarTeam === 'A' ? 'var(--orange-500)' : '#3b82f6'}` : '3px solid transparent'
                                                }}
                                                onClick={() => {
                                                    if (sidebarTeam) {
                                                        if (!isDisabledSelection) togglePlayer(ep.user_id, sidebarTeam);
                                                    } else {
                                                        toggleCheckIn(ep);
                                                    }
                                                }}
                                            >
                                                <button onClick={(e) => { e.stopPropagation(); toggleCheckIn(ep); }} className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors"
                                                    style={{ background: 'var(--orange-500)', color: 'var(--white)' }}>
                                                    <Icon icon="solar:check-read-linear" width={14} />
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className={`text-xs font-bold truncate ${isSelected ? 'text-gray-900' : 'text-gray-900 group-hover:text-blue-600'}`}>
                                                            {prof?.display_name}
                                                        </p>
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: '#3b82f620', color: '#3b82f6' }}>สำรอง</span>
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
                                                            มือ {prof?.skill_level || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <RankBadge mmr={prof?.mmr || 1000} size="sm" showName={false} showMMR={false} />
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">
                                                            {pstat?.total || 0} เกม
                                                        </span>
                                                        {pstat && pstat.playing && (
                                                            <span className="text-[9px] font-bold text-orange-500 px-1.5 py-0.5 rounded-md bg-orange-50">กำลังตี</span>
                                                        )}
                                                        {inOther && <span className="text-[9px] font-bold text-red-500">อยู่ทีม {sidebarTeam === 'A' ? 'B' : 'A'}</span>}
                                                    </div>
                                                </div>
                                                {isSelected ? (
                                                    <Icon icon="solar:check-circle-bold" width={16} className={sidebarTeam === 'A' ? 'text-orange-500' : 'text-blue-500'} />
                                                ) : isPaid ? (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(22,163,74,0.08)', color: 'var(--success)' }}>จ่ายแล้ว</span>
                                                ) : sidebarTeam ? (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(234,88,12,0.08)', color: 'var(--warning)' }}>ค้าง</span>
                                                ) : (
                                                    <button onClick={(e) => { e.stopPropagation(); handleRemovePlayer(ep.id, prof.display_name); }} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50 text-gray-400 hover:text-red-500 ml-1">
                                                        <Icon icon="solar:trash-bin-trash-bold" width={16} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* 3. Guest Players */}
                                    {players.filter(p => p.is_checked_in && (p.profiles as unknown as Profile)?.is_guest).length > 0 && (
                                        <div className="px-3 py-1.5" style={{ background: 'rgba(147,51,234,0.03)' }}>
                                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--purple-600)' }}>ขาจร (แขก)</p>
                                        </div>
                                    )}
                                    {players.filter(p => p.is_checked_in && (p.profiles as unknown as Profile)?.is_guest).map(ep => {
                                        const prof = ep.profiles as unknown as Profile;
                                        const pstat = playerStats[ep.user_id];
                                        const isPaid = ep.payment_status === 'paid';
                                        const isSelected = sidebarTeam === 'A' ? teamA.includes(ep.user_id) : sidebarTeam === 'B' ? teamB.includes(ep.user_id) : false;
                                        const inOther = (sidebarTeam === 'A' ? teamB : sidebarTeam === 'B' ? teamA : []).includes(ep.user_id);
                                        const isDisabledSelection = isPaid && !isSelected;

                                        return (
                                            <div key={ep.id}
                                                className={`flex items-center gap-2.5 px-3 py-2 transition-all group cursor-pointer ${sidebarTeam ? 'hover:bg-opacity-80' : 'hover:bg-purple-50/30'}`}
                                                style={{
                                                    borderBottom: '1px solid var(--gray-50)',
                                                    background: isSelected ? (sidebarTeam === 'A' ? 'rgba(249,115,22,0.08)' : 'rgba(59,130,246,0.08)') : 'transparent',
                                                    borderLeft: isSelected ? `3px solid ${sidebarTeam === 'A' ? 'var(--orange-500)' : '#3b82f6'}` : '3px solid transparent'
                                                }}
                                                onClick={() => {
                                                    if (sidebarTeam) {
                                                        if (!isDisabledSelection) togglePlayer(ep.user_id, sidebarTeam);
                                                    } else {
                                                        toggleCheckIn(ep);
                                                    }
                                                }}
                                            >
                                                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-purple-100 text-purple-600">
                                                    <Icon icon="solar:ghost-bold" width={14} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className={`text-xs font-bold truncate ${isSelected ? 'text-gray-900' : 'text-gray-900 group-hover:text-purple-600'}`}>
                                                            {prof?.display_name}
                                                        </p>
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
                                                            มือ {prof?.skill_level || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <RankBadge mmr={prof?.mmr || 1000} size="sm" showName={false} showMMR={false} />
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">
                                                            {pstat?.total || 0} เกม
                                                        </span>
                                                        {pstat && pstat.playing && (
                                                            <span className="text-[9px] font-bold text-orange-500 px-1.5 py-0.5 rounded-md bg-orange-50">กำลังตี</span>
                                                        )}
                                                        {inOther && <span className="text-[9px] font-bold text-red-500">อยู่ทีม {sidebarTeam === 'A' ? 'B' : 'A'}</span>}
                                                    </div>
                                                </div>
                                                {isSelected ? (
                                                    <Icon icon="solar:check-circle-bold" width={16} className={sidebarTeam === 'A' ? 'text-orange-500' : 'text-blue-500'} />
                                                ) : isPaid ? (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(22,163,74,0.08)', color: 'var(--success)' }}>จ่ายแล้ว</span>
                                                ) : sidebarTeam ? (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(234,88,12,0.08)', color: 'var(--warning)' }}>ค้าง</span>
                                                ) : (
                                                    <button onClick={(e) => { e.stopPropagation(); handleRemovePlayer(ep.id, prof.display_name); }} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50 text-gray-400 hover:text-red-500 ml-1">
                                                        <Icon icon="solar:trash-bin-trash-bold" width={16} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* 3. Not checked-in Friends (Regular) */}
                                    {players.filter(p => !p.is_checked_in && !p.is_substitute && !(p.profiles as unknown as Profile)?.is_guest).length > 0 && (
                                        <div className="px-3 py-1.5" style={{ background: 'var(--gray-50)' }}>
                                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--gray-400)' }}>ยังไม่มา ({players.filter(p => !p.is_checked_in && !p.is_substitute && !(p.profiles as unknown as Profile)?.is_guest).length})</p>
                                        </div>
                                    )}
                                    {players.filter(p => !p.is_checked_in && !p.is_substitute && !(p.profiles as unknown as Profile)?.is_guest).map(ep => {
                                        const prof = ep.profiles as unknown as Profile;
                                        return (
                                            <div key={ep.id} onClick={() => toggleCheckIn(ep)} className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-gray-50 cursor-pointer" style={{ borderBottom: '1px solid var(--gray-50)', opacity: 0.6 }}>
                                                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors"
                                                    style={{ background: 'var(--gray-100)', border: '1px solid var(--gray-200)', color: 'var(--gray-400)' }}>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="text-xs font-medium truncate" style={{ color: 'var(--gray-500)' }}>{prof?.display_name}</p>
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
                                                            มือ {prof?.skill_level || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <RankBadge mmr={prof?.mmr || 1000} size="sm" showName={false} showMMR={false} className="opacity-60" />
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* 4. Not checked-in Substitutes */}
                                    {players.filter(p => !p.is_checked_in && p.is_substitute && !(p.profiles as unknown as Profile)?.is_guest).length > 0 && (
                                        <div className="px-3 py-1.5" style={{ background: 'rgba(59,130,246,0.03)' }}>
                                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#3b82f6', opacity: 0.5 }}>ตัวสำรอง ({players.filter(p => !p.is_checked_in && p.is_substitute && !(p.profiles as unknown as Profile)?.is_guest).length})</p>
                                        </div>
                                    )}
                                    {players.filter(p => !p.is_checked_in && p.is_substitute && !(p.profiles as unknown as Profile)?.is_guest).map(ep => {
                                        const prof = ep.profiles as unknown as Profile;
                                        return (
                                            <div key={ep.id} onClick={() => toggleCheckIn(ep)} className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-gray-50 cursor-pointer" style={{ borderBottom: '1px solid var(--gray-50)', opacity: 0.6 }}>
                                                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors"
                                                    style={{ background: 'var(--gray-100)', border: '1px solid var(--gray-200)', color: 'var(--gray-400)' }}>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="text-xs font-medium truncate" style={{ color: 'var(--gray-500)' }}>{prof?.display_name}</p>
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: '#3b82f610', color: '#3b82f6' }}>สำรอง</span>
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
                                                            มือ {prof?.skill_level || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <RankBadge mmr={prof?.mmr || 1000} size="sm" showName={false} showMMR={false} className="opacity-60" />
                                                </div>
                                                <button onClick={(e) => { e.stopPropagation(); handleRemovePlayer(ep.id, prof.display_name); }} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50 text-gray-400 hover:text-red-500 ml-1">
                                                    <Icon icon="solar:trash-bin-trash-bold" width={16} />
                                                </button>
                                            </div>
                                        );
                                    })}

                                    {/* 5. Not checked-in Guests */}
                                    {players.filter(p => !p.is_checked_in && (p.profiles as unknown as Profile)?.is_guest).length > 0 && (
                                        <div className="px-3 py-1.5" style={{ background: 'rgba(147,51,234,0.03)' }}>
                                            <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--purple-600)', opacity: 0.5 }}>ขาจร (แขก) ({players.filter(p => !p.is_checked_in && (p.profiles as unknown as Profile)?.is_guest).length})</p>
                                        </div>
                                    )}
                                    {players.filter(p => !p.is_checked_in && (p.profiles as unknown as Profile)?.is_guest).map(ep => {
                                        const prof = ep.profiles as unknown as Profile;
                                        return (
                                            <div key={ep.id} onClick={() => toggleCheckIn(ep)} className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-gray-50 cursor-pointer" style={{ borderBottom: '1px solid var(--gray-50)', opacity: 0.6 }}>
                                                <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors"
                                                    style={{ background: 'var(--gray-100)', border: '1px solid var(--gray-200)', color: 'var(--gray-400)' }}>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="text-xs font-medium truncate" style={{ color: 'var(--gray-500)' }}>{prof?.display_name}</p>
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
                                                            มือ {prof?.skill_level || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <RankBadge mmr={prof?.mmr || 1000} size="sm" showName={false} showMMR={false} className="opacity-60" />
                                                </div>
                                                <button onClick={(e) => { e.stopPropagation(); handleRemovePlayer(ep.id, prof.display_name); }} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50 text-gray-400 hover:text-red-500 ml-1">
                                                    <Icon icon="solar:trash-bin-trash-bold" width={16} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
