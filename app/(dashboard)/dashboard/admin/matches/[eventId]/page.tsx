'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { billedShuttleCount, calculateBill } from '@/src/lib/utils/billing';
import { logActivity } from '@/src/lib/activity-log';
import { validateMatchInput, preserveShuttles } from '@/src/lib/utils/match-validation';
import { fetchBilling, savePayment, cancelPayment, type BillingRow } from '@/src/lib/utils/billing-data';
import CreateMatchForm from './_components/CreateMatchForm';
import MatchCards from './_components/MatchCards';
import ScoreModal from './_components/ScoreModal';
import PlayerBoardModal from './_components/PlayerBoardModal';
import AddShuttlecockModal from './_components/AddShuttlecockModal';
import AddGuestModal from './_components/AddGuestModal';
import AddPlayerModal from './_components/AddPlayerModal';
import FinanceSection from './_components/FinanceSection';
import PlayerSelectionSidebar from './_components/PlayerSelectionSidebar';
import CheckInPanel from './_components/CheckInPanel';
import { GUEST_SKILL_OPTIONS, getSkillColor } from './_components/shared';



// Get skill color from the function matching index.ts



export default function MatchMakerPage({ params }: { params: Promise<{ eventId: string }> }) {
    const [eventId, setEventId] = useState('');
    const [event, setEvent] = useState<Event | null>(null);
        const [players, setPlayers] = useState<EventPlayer[]>([]);
    const [paymentModalPlayer, setPaymentModalPlayer] = useState<EventPlayer | null>(null);
    const [activeSection, setActiveSection] = useState<'matches' | 'finance'>('matches');
    const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'paid'>('all');
    const [matchFilter, setMatchFilter] = useState<'all' | 'waiting' | 'playing' | 'finished'>('all');
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [showPlayerBoard, setShowPlayerBoard] = useState(false);
    const [teamA, setTeamA] = useState<string[]>([]);
    const [teamB, setTeamB] = useState<string[]>([]);
    const [courtNumber, setCourtNumber] = useState('');
    const [shuttlecockNumber, setShuttlecockNumber] = useState('');
    const [creating, setCreating] = useState(false);
    const savingMatchRef = useRef(false);
    const [matchErrors, setMatchErrors] = useState<string[]>([]);
    const [billingError, setBillingError] = useState('');
    const [billingRows, setBillingRows] = useState<BillingRow[]>([]);
    const [scoreMatch, setScoreMatch] = useState<Match | null>(null);
    const [winner, setWinner] = useState<'A' | 'B' | 'Draw' | 'None' | null>(null);
    const [matchSeq, setMatchSeq] = useState<string>('');

    // Reset winner when score modal opens/closes
    useEffect(() => {
        if (scoreMatch) setWinner(null);
    }, [scoreMatch]);

    const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
    const [updatingPayment, setUpdatingPayment] = useState<string | null>(null);
    const [sidebarTeam, setSidebarTeam] = useState<'A' | 'B' | null>(null);
    const [showPlayersSidebar, setShowPlayersSidebar] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [paymentSearchQuery, setPaymentSearchQuery] = useState('');
    const [paymentTimestamps, setPaymentTimestamps] = useState<Record<string, string>>({});
    const [paymentSortOrder, setPaymentSortOrder] = useState<'pending_first' | 'paid_first'>('pending_first');
    // Add shuttlecock modal state
    const [addingShuttlecockMatch, setAddingShuttlecockMatch] = useState<{ id: string; currentNumbers: string[]; updatedAt: string } | null>(null);
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

    // Court Management State
    const [showAddCourtModal, setShowAddCourtModal] = useState(false);
    const [newCourtInput, setNewCourtInput] = useState('');
    const [savingCourt, setSavingCourt] = useState(false);

    // Unfinished Matches Alert State
    const [unfinishedMatchesPlayer, setUnfinishedMatchesPlayer] = useState<{
        player: EventPlayer;
        matches: Match[];
    } | null>(null);

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
                // เกมที่เล่นแล้วนับอย่างน้อย 1 ลูก (เบิกเพิ่มนับตามจริง)
                totalShuttleCost += billedShuttleCount(m.shuttlecock_numbers) * (event.shuttlecock_price || 0);
            });

            bills[p.user_id] = calculateBill(event.entry_fee || 0, 1, totalShuttleCost, p.additional_cost || 0, p.discount || 0);
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
    const cleanupOldGuests = useCallback(async (currentEventId: string) => {
        // [REMOVED]
        // This function previously deleted guest profiles not in the current event.
        // However, because event_players and match_players have ON DELETE CASCADE
        // to profiles(id), deleting the profile was permanently wiping out
        // the guests from historical matches and billing records!
        // Guest profiles will now be retained indefinitely.
        return;
    }, []);

    useEffect(() => {
        params.then((p) => {
            setEventId(p.eventId);
            cleanupOldGuests(p.eventId).then(() => loadData(p.eventId));
        });
    }, [params]);

    useEffect(() => {
        let active = true;
        createClient().auth.getUser().then(({ data }) => {
            if (active) setCurrentUserId(data.user?.id || null);
        }).catch(error => {
            if (error?.name !== 'AbortError') console.error('Unable to load current user', error);
        });
        return () => { active = false; };
    }, []);

    const loadData = useCallback(async (id: string) => {
        const supabase = createClient();
        const [eventRes, playersRes, matchesRes, financialRows] = await Promise.all([
            supabase.from('events').select('*').eq('id', id).single(),
            supabase.from('event_players').select('*, profiles(*)').eq('event_id', id).order('created_at'),
            supabase.from('matches').select('*, match_players(*, profiles(*))').eq('event_id', id).order('created_at', { ascending: true }),
            fetchBilling(supabase, { eventId: id }).catch(error => { setBillingError(error.message); return null; })
        ]);
        if (financialRows) { setBillingRows(financialRows); setBillingError(''); }
        if (eventRes.data) setEvent(eventRes.data as Event);
        if (playersRes.data) {
            const playersData = playersRes.data as EventPlayer[];
            setPlayers(playersData);
            const playerIds = playersData.map(p => p.id);
            if (playerIds.length > 0) {
                try {
                    const { data: payRecords } = await supabase
                        .from('player_payments')
                        .select('event_player_id, created_at')
                        .in('event_player_id', playerIds)
                        .is('voided_at', null)
                        .order('created_at', { ascending: false });

                    const timeMap: Record<string, string> = {};
                    if (payRecords) {
                        payRecords.forEach((p: { event_player_id: string; created_at: string }) => {
                            if (!timeMap[p.event_player_id]) {
                                timeMap[p.event_player_id] = p.created_at;
                            }
                        });
                    }
                    playersData.forEach((p: any) => {
                        if (p.paid_at && !timeMap[p.id]) {
                            timeMap[p.id] = p.paid_at;
                        }
                    });
                    setPaymentTimestamps(prev => ({ ...prev, ...timeMap }));
                } catch (e) {
                    console.error('Failed to load payment timestamps:', e);
                }
            }
        }
        if (matchesRes.data) setMatches(matchesRes.data as Match[]);
        setLoading(false);
    }, []);

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

    const handleAddCourt = async (courtToAdd?: string) => {
        const val = (courtToAdd || newCourtInput).trim();
        if (!val) {
            toast.error('กรุณาระบุหมายเลขคอร์ท');
            return;
        }
        const currentCourts = event?.courts || [];
        if (currentCourts.includes(val)) {
            toast.error(`คอร์ท ${val} มีอยู่ในรายการแล้ว`);
            return;
        }

        const nextCourts = [...currentCourts, val].sort((a, b) => {
            const numA = Number(a);
            const numB = Number(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });

        setSavingCourt(true);
        const supabase = createClient();
        const { error } = await supabase
            .from('events')
            .update({ courts: nextCourts })
            .eq('id', eventId);
        setSavingCourt(false);

        if (error) {
            toast.error('เพิ่มคอร์ทไม่สำเร็จ: ' + error.message);
            return;
        }

        setEvent(prev => prev ? { ...prev, courts: nextCourts } : prev);
        setNewCourtInput('');
        toast.success(`เพิ่มคอร์ท ${val} เรียบร้อยแล้ว`);
        await logActivity({
            category: 'match',
            action: 'event.court_add',
            description: `เพิ่มคอร์ท ${val} ในก๊วน`,
            targetType: 'event',
            targetId: eventId,
            eventId,
            metadata: { addedCourt: val, courts: nextCourts },
        });
    };

    const handleRemoveCourt = async (courtToRemove: string) => {
        if (activeCourtsSet.has(courtToRemove)) {
            toast.error(`ไม่สามารถลบคอร์ท ${courtToRemove} ได้เนื่องจากมีแมตช์กำลังใช้งานอยู่`);
            return;
        }

        const ok = await confirm({
            title: 'ลบคอร์ท?',
            message: `ต้องการลบคอร์ท ${courtToRemove} ออกจากก๊วนนี้ใช่หรือไม่?`,
            type: 'warning',
            confirmText: 'ลบคอร์ท'
        });
        if (!ok) return;

        const currentCourts = event?.courts || [];
        const nextCourts = currentCourts.filter(c => c !== courtToRemove);

        setSavingCourt(true);
        const supabase = createClient();
        const { error } = await supabase
            .from('events')
            .update({ courts: nextCourts })
            .eq('id', eventId);
        setSavingCourt(false);

        if (error) {
            toast.error('ลบคอร์ทไม่สำเร็จ: ' + error.message);
            return;
        }

        setEvent(prev => prev ? { ...prev, courts: nextCourts } : prev);
        toast.success(`ลบคอร์ท ${courtToRemove} เรียบร้อยแล้ว`);
        await logActivity({
            category: 'match',
            action: 'event.court_remove',
            description: `ลบคอร์ท ${courtToRemove} ออกจากก๊วน`,
            targetType: 'event',
            targetId: eventId,
            eventId,
            metadata: { removedCourt: courtToRemove, courts: nextCourts },
        });
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

        // Subscription for player payments (for real-time payment timestamps)
        const paymentChannel = supabase.channel('payments-rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'player_payments' }, () => loadData(eventId))
            .subscribe();

        return () => {
            supabase.removeChannel(matchChannel);
            supabase.removeChannel(playerChannel);
            supabase.removeChannel(paymentChannel);
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
        const match = matches.find(item => item.id === matchId);
        if (!match?.updated_at) { toast.error('กรุณาโหลดข้อมูลแมตช์ใหม่'); return; }
        setAddingShuttlecockMatch({ id: matchId, currentNumbers, updatedAt: match.updated_at });
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
        const newNumbers = [...(addingShuttlecockMatch.currentNumbers || []), num];

        const { error } = await supabase.from('matches').update({ shuttlecock_numbers: newNumbers }).eq('id', addingShuttlecockMatch.id).eq('updated_at', addingShuttlecockMatch.updatedAt).select('id').single();

        setCreating(false);
        setAddingShuttlecockMatch(null);

        if (error) { toast.error('เพิ่มลูกไม่สำเร็จ กรุณาโหลดใหม่: ' + error.message); return; }

        await logActivity({
            category: 'match', action: 'match.shuttle_add',
            description: `เพิ่มลูกแบดหมายเลข ${num} ในแมตช์`,
            targetType: 'match', targetId: addingShuttlecockMatch.id, eventId,
            metadata: { number: num, before: addingShuttlecockMatch.currentNumbers, after: newNumbers },
        });
        toast.success(`เพิ่มลูกแบดหมายเลข ${num} สำเร็จ`);
        loadData(eventId);
    };

    // ลบหมายเลขลูกออกจากแมตช์ — แต่ต้องเหลือ "ลูกเบส" อย่างน้อย 1 ลูกเสมอ
    // (ทุกแมตช์ที่เล่นแล้วใช้ลูกขั้นต่ำ 1 ลูก ให้ตรงกับการคิดเงิน max(1, count)) → ลบลูกสุดท้ายไม่ได้
    const removeShuttlecock = async (matchId: string, idx: number, num: string, currentNumbers: string[]) => {
        if ((currentNumbers?.length || 0) <= 1) {
            toast.error('ต้องมีลูกอย่างน้อย 1 ลูก (ลูกเบส) — ลบลูกสุดท้ายไม่ได้');
            return;
        }

        const ok = await confirm({
            title: 'ลบหมายเลขลูก?',
            message: `ต้องการลบลูกแบดหมายเลข ${num} ออกจากแมตช์นี้ใช่หรือไม่? (มีผลต่อการคิดค่าลูก)`,
            type: 'warning',
            confirmText: 'ลบลูกนี้'
        });
        if (!ok) return;

        const supabase = createClient();
        const newNumbers = currentNumbers.filter((_, i) => i !== idx);
        const { error } = await supabase.from('matches').update({ shuttlecock_numbers: newNumbers }).eq('id', matchId).eq('updated_at', matches.find(match => match.id === matchId)?.updated_at || '').select('id').single();
        if (error) { toast.error('ลบลูกไม่สำเร็จ กรุณาโหลดใหม่: ' + error.message); return; }

        await logActivity({
            category: 'match', action: 'match.shuttle_remove',
            description: `ลบลูกแบดหมายเลข ${num} ออกจากแมตช์`,
            targetType: 'match', targetId: matchId, eventId,
            metadata: { number: num, before: currentNumbers, after: newNumbers },
        });
        toast.success(`ลบลูกแบดหมายเลข ${num} แล้ว`);
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

        const added = unjoinedPlayers.find(p => p.id === userId);
        await logActivity({
            category: 'player', action: 'player.add',
            description: `เพิ่มผู้เล่นสำรอง ${added?.display_name ?? ''} เข้าก๊วน`,
            targetType: 'user', targetId: userId, eventId,
        });
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

        await logActivity({
            category: 'player', action: 'player.remove',
            description: `ลบผู้เล่น ${playerName} ออกจากก๊วน`,
            targetType: 'event_player', targetId: epId, eventId,
        });
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
        setMatchErrors([]);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const saveMatch = async () => {
        if (savingMatchRef.current) return;
        const errors = validateMatchInput(teamA, teamB, courtNumber, matchSeq, shuttlecockNumber);
        const original = matches.find(match => match.id === editingMatchId);
        const shuttles = preserveShuttles(original?.shuttlecock_numbers || [], shuttlecockNumber);
        if (new Set(shuttles).size !== shuttles.length || shuttles.some(number => allUsedShuttlecocks.has(number))) errors.push('หมายเลขลูกซ้ำ กรุณาตรวจสอบอีกครั้ง');
        if (matches.some(match => match.id !== editingMatchId && match.match_number === Number(matchSeq))) errors.push('ลำดับแมตช์นี้มีแล้ว กรุณาใช้ลำดับอื่น');
        setMatchErrors(errors);
        if (errors.length) return;
        savingMatchRef.current = true;
        setCreating(true);
        try {
            const ok = await confirm({
                title: editingMatchId ? 'บันทึกการแก้ไข?' : 'สร้างแมตช์?',
                message: `แมตช์ #${Number(matchSeq)} · คอร์ท ${courtNumber.trim()} · ลูก ${shuttles.join(', ')} · ผู้เล่น 4 คน`,
                type: 'info',
                confirmText: editingMatchId ? 'บันทึก' : 'สร้างแมตช์'
            });
            if (!ok) return;
            const supabase = createClient();
            const { data: savedId, error } = await supabase.rpc('save_match', {
                p_match_id: editingMatchId,
                p_event_id: eventId,
                p_court: courtNumber.trim(),
                p_number: Number(matchSeq),
                p_shuttles: shuttles,
                p_team_a: teamA,
                p_team_b: teamB,
                p_expected_updated_at: original?.updated_at || null
            });
            if (error) throw error;
            await logActivity({
                category: 'match', action: editingMatchId ? 'match.edit' : 'match.create',
                description: `บันทึกแมตช์ #${matchSeq} คอร์ท ${courtNumber.trim()}`,
                targetType: 'match', targetId: savedId, eventId,
                metadata: { shuttles, matchNumber: Number(matchSeq) }
            });
            toast.success('บันทึกแมตช์สำเร็จ');
            setShowForm(false); setTeamA([]); setTeamB([]); setCourtNumber(''); setShuttlecockNumber(''); setMatchSeq(''); setEditingMatchId(null);
            await loadData(eventId);
        } catch (error) {
            setMatchErrors([error instanceof Error ? error.message : (error as { message?: string }).message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่']);
        } finally {
            setCreating(false);
            savingMatchRef.current = false;
        }
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

        const { error } = await supabase.from('matches').update(updateData).eq('id', matchId).eq('updated_at', m?.updated_at || '').select('id').single();
        if (error) {
            toast.error('เกิดข้อผิดพลาด: ' + error.message);
            return;
        }

        toast.success(status === 'playing' ? (m?.status === 'finished' ? 'ย้ายกลับมาแก้ไขแล้ว' : 'เริ่มเกม!') : 'บันทึกสำเร็จ');
        loadData(eventId);
    };

    const handleDeleteMatch = async (matchId: string) => {
        const m = matches.find(x => x.id === matchId);
        const isWaiting = m?.status === 'waiting';
        const ok = await confirm({
            title: isWaiting ? 'ลบแมตช์ที่รอคิว?' : 'ลบแมตช์?',
            message: isWaiting 
                ? 'ต้องการลบแมตช์ที่กำลังรอคิวนี้ใช่หรือไม่?' 
                : 'ยืนยันการลบแมตช์ที่จบแล้วนี้อย่างถาวร? ข้อมูลคะแนนและการใช้ลูกแบดในแมตช์นี้จะหายไป',
            type: 'danger',
            confirmText: 'ลบแมตช์นี้'
        });
        if (!ok) return;

        const supabase = createClient();
        const { error } = await supabase.from('matches').delete().eq('id', matchId).eq('updated_at', m?.updated_at || '').select('id').single();

        if (error) {
            toast.error('ไม่สามารถลบแมตช์ได้: ' + error.message);
            return;
        }

        await logActivity({
            category: 'match', action: 'match.delete',
            description: `ลบแมตช์ #${m?.match_number ?? '-'} คอร์ท ${m?.court_number ?? '-'}${m?.status === 'finished' ? ' (จบแล้ว)' : ''}`,
            targetType: 'match', targetId: matchId, eventId,
            metadata: { court: m?.court_number, matchNumber: m?.match_number, status: m?.status, shuttles: m?.shuttlecock_numbers },
        });
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

        const cancelling = matches.find(x => x.id === matchId);
        const supabase = createClient();
        const { error } = await supabase.from('matches').update({
            status: 'waiting',
            team_a_score: 0,
            team_b_score: 0
        }).eq('id', matchId).eq('updated_at', cancelling?.updated_at || '').select('id').single();

        if (error) {
            toast.error('ไม่สามารถยกเลิกแมตช์ได้: ' + error.message);
            return;
        }

        await logActivity({
            category: 'match', action: 'match.cancel',
            description: `ยกเลิกแมตช์ #${cancelling?.match_number ?? '-'} คอร์ท ${cancelling?.court_number ?? '-'} (ย้ายกลับรอคิว + ยกเลิกคิดเงิน)`,
            targetType: 'match', targetId: matchId, eventId,
            metadata: { court: cancelling?.court_number, matchNumber: cancelling?.match_number },
        });
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
        const { error } = await supabase.rpc('finish_match', { p_match_id: scoreMatch.id, p_score_a: totalA, p_score_b: totalB, p_expected_updated_at: scoreMatch.updated_at || null });
        if (error) { toast.error(error.message); return; }

        const resultText = isNone ? 'ไม่แจ้งผล' : (isDraw ? 'เสมอ' : `ทีม ${winner} ชนะ`);
        await logActivity({
            category: 'match', action: 'match.finish',
            description: `บันทึกผลแมตช์ #${scoreMatch.match_number ?? '-'} คอร์ท ${scoreMatch.court_number ?? '-'} — ${resultText}`,
            targetType: 'match', targetId: scoreMatch.id, eventId,
            metadata: { court: scoreMatch.court_number, matchNumber: scoreMatch.match_number, winner, scoreA: totalA, scoreB: totalB },
        });
        toast.success(isNone ? 'บันทึกสำเร็จ! (ไม่แจ้งผลแข่ง)' : (isDraw ? 'บันทึกสำเร็จ! เสมอ 🤝' : `บันทึกสำเร็จ! ทีม ${winner} ชนะ 🏆`));
        setScoreMatch(null);
        loadData(eventId);
    };

        const togglePayment = async (ep: EventPlayer) => {
        const prof = ep.profiles as unknown as Profile;
        if (ep.payment_status === 'paid') {
            const ok = await confirm({
                title: 'ยกเลิกการชำระเงิน?',
                message: `ยกเลิกรายการรับเงินทั้งหมด ฿${Number(userBills[ep.user_id] ?? ep.paid_amount ?? 0).toFixed(2)} ของ ${prof?.display_name}? การทำรายการนี้ไม่ได้คืนเงินจริง`,
                type: 'warning',
                confirmText: 'ยืนยันยกเลิก'
            });
            if (!ok) return;

            setUpdatingPayment(ep.user_id);
            const supabase = createClient();
            const { error } = await cancelPayment(supabase, ep.id);
            setUpdatingPayment(null);

            if (error) { toast.error(error.message || 'อัปเดตไม่สำเร็จ'); return; }
            setPaymentTimestamps(prev => {
                const next = { ...prev };
                delete next[ep.id];
                return next;
            });
            await logActivity({
                category: 'payment', action: 'payment.unpay',
                description: `ยกเลิกการชำระเงินของ ${prof?.display_name ?? 'ผู้เล่น'}`,
                targetType: 'user', targetId: ep.user_id, eventId,
            });
            toast.success('เปลี่ยนสถานะเป็นยังไม่จ่าย');
            loadData(eventId);
        } else {
            // ตรวจสอบว่าผู้เล่นยังมีแมตช์ที่ยังไม่กดจบหรือไม่ (playing หรือ waiting)
            const unfinished = matches.filter(m =>
                (m.status === 'playing' || m.status === 'waiting') &&
                m.match_players?.some(mp => mp.user_id === ep.user_id)
            );

            if (unfinished.length > 0) {
                setUnfinishedMatchesPlayer({
                    player: ep,
                    matches: unfinished
                });
                return;
            }

            setPaymentModalPlayer(ep);
        }
    };

    const handleConfirmPayment = async (ep: EventPlayer, method: 'cash' | 'transfer') => {
        // ตรวจสอบความปลอดภัยซ้ำก่อนบันทึก
        const unfinished = matches.filter(m =>
            (m.status === 'playing' || m.status === 'waiting') &&
            m.match_players?.some(mp => mp.user_id === ep.user_id)
        );
        if (unfinished.length > 0) {
            setPaymentModalPlayer(null);
            setUnfinishedMatchesPlayer({
                player: ep,
                matches: unfinished
            });
            return;
        }

        setPaymentModalPlayer(null);
        setUpdatingPayment(ep.user_id);
        const supabase = createClient();
        const row = billingRows.find(item => item.event_player_id === ep.id);
        const expectedDue = Number(
            row?.pending_amount ??
            Math.max(0, (userBills[ep.user_id] || 0) - Number(ep.paid_amount || 0))
        );
        const { error } = await savePayment(supabase, ep.id, method, expectedDue);
        setUpdatingPayment(null);

        if (error) {
            toast.error(error.message || 'อัปเดตไม่สำเร็จ');
        } else {
            const nowIso = new Date().toISOString();
            setPaymentTimestamps(prev => ({
                ...prev,
                [ep.id]: nowIso
            }));
            const prof = ep.profiles as unknown as Profile;
            await logActivity({
                category: 'payment', action: 'payment.confirm',
                description: `รับชำระเงินจาก ${prof?.display_name ?? 'ผู้เล่น'} ด้วย${method === 'cash' ? 'เงินสด' : 'การโอน'}`,
                targetType: 'user', targetId: ep.user_id, eventId,
                metadata: { method },
            });
            toast.success(`ชำระเงินเรียบร้อยด้วย ${method === 'cash' ? 'เงินสด 💵' : 'โอนเงิน 📱'}`);
            loadData(eventId);
        }
    };

    const confirmPaidBillAdjustment = async (
        ep: EventPlayer,
        label: string,
        previousValue: number,
        nextValue: number,
        totalDifference: number
    ) => {
        if (ep.payment_status !== 'paid') return true;
        const profile = ep.profiles as unknown as Profile;
        const billing = billingRows.find(row => row.event_player_id === ep.id);
        const currentTotal = Number(billing?.total_cost ?? userBills[ep.user_id] ?? 0);
        const nextTotal = Math.max(0, Math.round((currentTotal + totalDifference) * 100) / 100);
        const paidAmount = Number(billing?.total_paid ?? ep.paid_amount ?? 0);
        const paymentNotice = nextTotal > paidAmount
            ? `หลังบันทึกจะมียอดค้าง ฿${(nextTotal - paidAmount).toLocaleString()} และสถานะจะกลับเป็น “ค้างชำระ”`
            : nextTotal < paidAmount
                ? `หลังบันทึกจะมียอดชำระเกิน ฿${(paidAmount - nextTotal).toLocaleString()}`
                : 'ยอดชำระจะพอดีกับยอดบิลใหม่';

        return confirm({
            title: 'ยืนยันแก้ไขยอดที่ชำระแล้ว?',
            message: `${profile?.display_name || 'ผู้เล่น'} ชำระแล้ว ฿${paidAmount.toLocaleString()}\n${label}: ฿${previousValue.toLocaleString()} → ฿${nextValue.toLocaleString()}\nยอดบิลใหม่ ฿${nextTotal.toLocaleString()}\n${paymentNotice}`,
            type: 'warning',
            confirmText: 'บันทึกยอดใหม่'
        });
    };

    const updateDiscount = async (ep: EventPlayer, discountValue: number) => {
        const previousValue = Number(ep.discount || 0);
        const confirmed = await confirmPaidBillAdjustment(ep, 'ส่วนลด', previousValue, discountValue, previousValue - discountValue);
        if (!confirmed) return false;

        setUpdatingPayment(ep.user_id);
        const supabase = createClient();
        const { error } = await supabase
            .from('event_players')
            .update({ discount: discountValue })
            .eq('id', ep.id)
            .select('id')
            .single();
        setUpdatingPayment(null);

        if (error) {
            toast.error('บันทึกส่วนลดไม่สำเร็จ');
            return false;
        }
        await logActivity({
            category: 'payment', action: 'payment.discount_update',
            description: `แก้ส่วนลดจาก ฿${previousValue.toLocaleString()} เป็น ฿${discountValue.toLocaleString()}`,
            targetType: 'user', targetId: ep.user_id, eventId,
            metadata: { previousValue, nextValue: discountValue, wasPaid: ep.payment_status === 'paid' },
        });
        toast.success('บันทึกส่วนลดและคำนวณยอดใหม่แล้ว');
        await loadData(eventId);
        return true;
    };

    const updateAdditionalCost = async (ep: EventPlayer, additionalCostValue: number) => {
        const previousValue = Number(ep.additional_cost || 0);
        const confirmed = await confirmPaidBillAdjustment(ep, 'ค่าเพิ่ม', previousValue, additionalCostValue, additionalCostValue - previousValue);
        if (!confirmed) return false;

        setUpdatingPayment(ep.user_id);
        const supabase = createClient();
        const { error } = await supabase
            .from('event_players')
            .update({ additional_cost: additionalCostValue })
            .eq('id', ep.id)
            .select('id')
            .single();
        setUpdatingPayment(null);

        if (error) {
            toast.error('บันทึกค่าใช้จ่ายเพิ่มเติมไม่สำเร็จ');
            return false;
        }
        await logActivity({
            category: 'payment', action: 'payment.additional_cost_update',
            description: `แก้ค่าเพิ่มจาก ฿${previousValue.toLocaleString()} เป็น ฿${additionalCostValue.toLocaleString()}`,
            targetType: 'user', targetId: ep.user_id, eventId,
            metadata: { previousValue, nextValue: additionalCostValue, wasPaid: ep.payment_status === 'paid' },
        });
        toast.success('บันทึกค่าเพิ่มและคำนวณยอดใหม่แล้ว');
        await loadData(eventId);
        return true;
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
            return prof?.mmr ?? 1000;
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
        toast.success('สุ่มจับคู่ให้แล้ว! กรุณาระบุคอร์ท ลำดับแมตช์ และหมายเลขลูก แล้วกดสร้าง');
    };

    const statusCfg: Record<string, { label: string; badge: string }> = {
        waiting: { label: 'รอคิว', badge: 'badge-warning' },
        playing: { label: 'กำลังตี', badge: 'badge-success' },
        finished: { label: 'จบแล้ว', badge: 'badge-muted' },
    };

    // คำนวณยอดเงินจริงแบบเรียลไทม์ รวมค่าเพิ่มและหักส่วนลดของผู้เล่นทุกคน
    const {
        transferTotal,
        cashTotal,
        transferPlayerCount,
        cashPlayerCount,
        totalDiscount,
        totalAdditionalCost,
        discountedPlayerCount,
        additionalCostPlayerCount,
        totalBilled,
        totalCollected,
        totalOutstanding,
        paidPlayerCount,
        pendingPlayerCount,
    } = useMemo(() => {
        let transferSum = 0;
        let cashSum = 0;
        let transferCount = 0;
        let cashCount = 0;
        let discountSum = 0;
        let additionalCostSum = 0;
        let discountCount = 0;
        let additionalCostCount = 0;
        let billedSum = 0;
        let paidCount = 0;

        players.forEach(p => {
            const bill = userBills[p.user_id] ?? 0;
            billedSum += bill;

            const disc = Number(p.discount || 0);
            const addCost = Number(p.additional_cost || 0);

            if (disc > 0) {
                discountSum += disc;
                discountCount += 1;
            }
            if (addCost > 0) {
                additionalCostSum += addCost;
                additionalCostCount += 1;
            }

            const isPaid = p.payment_status === 'paid';
            if (isPaid) {
                paidCount += 1;
                const row = billingRows.find(r => r.event_player_id === p.id);
                // ระบุช่องทางการชำระ (อิงจากข้อมูลล่าสุดใน event_player หรือจากประวัติรับเงิน)
                const method = p.payment_method || row?.payment_method || (row?.cash_paid && row.cash_paid > 0 ? 'cash' : 'transfer');

                if (method === 'cash') {
                    cashSum += bill;
                    cashCount += 1;
                } else {
                    transferSum += bill;
                    transferCount += 1;
                }
            } else {
                // หากยังไม่จ่าย แต่มีบันทึกการชำระบางส่วนไว้ในประวัติ
                const row = billingRows.find(r => r.event_player_id === p.id);
                const rowTransfer = Number(row?.transfer_paid || 0);
                const rowCash = Number(row?.cash_paid || 0);
                if (rowTransfer > 0) transferSum += rowTransfer;
                if (rowCash > 0) cashSum += rowCash;
            }
        });

        const collectedSum = transferSum + cashSum;
        const outstandingSum = Math.max(0, billedSum - collectedSum);

        return {
            transferTotal: transferSum,
            cashTotal: cashSum,
            transferPlayerCount: transferCount,
            cashPlayerCount: cashCount,
            totalDiscount: discountSum,
            totalAdditionalCost: additionalCostSum,
            discountedPlayerCount: discountCount,
            additionalCostPlayerCount: additionalCostCount,
            totalBilled: billedSum,
            totalCollected: collectedSum,
            totalOutstanding: outstandingSum,
            paidPlayerCount: paidCount,
            pendingPlayerCount: players.length - paidCount,
        };
    }, [players, userBills, billingRows]);

    const matchesWithIndex = matches.map((m, idx) => ({ ...m, originalIndex: idx + 1 }));
    const filteredMatches = matchesWithIndex.filter(m => matchFilter === 'all' || m.status === matchFilter);
    const sortedMatches = [...filteredMatches].sort((a, b) => b.originalIndex - a.originalIndex);
    const formatPaymentTime = (isoString?: string | null) => {
        if (!isoString) return '';
        try {
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return '';
            const now = new Date();
            const isSameDay = d.toDateString() === now.toDateString();
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const timeStr = `${hours}:${minutes} น.`;
            if (isSameDay) {
                return timeStr;
            }
            const day = d.getDate();
            const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            const monthStr = monthNames[d.getMonth()] || '';
            return `${day} ${monthStr} ${timeStr}`;
        } catch {
            return '';
        }
    };

    const normalizedPaymentQuery = paymentSearchQuery.trim().toLocaleLowerCase('th-TH');
    const visiblePaymentPlayers = [...players]
        .filter(player => paymentFilter === 'all' || player.payment_status === paymentFilter)
        .filter(player => {
            if (!normalizedPaymentQuery) return true;
            const profile = player.profiles as unknown as Profile;
            const searchableText = [profile?.display_name, profile?.full_name, profile?.skill_level]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase('th-TH');
            return searchableText.includes(normalizedPaymentQuery);
        })
        .sort((first, second) => {
            const isPaidFirst = first.payment_status === 'paid';
            const isPaidSecond = second.payment_status === 'paid';

            // ถ้าจ่ายแล้วทั้งคู่: เรียงจากคนที่จ่ายล่าสุดอยู่บนสุด ดันคนที่จ่ายก่อนหน้าลงไปข้างล่าง
            if (isPaidFirst && isPaidSecond) {
                const timeFirst = paymentTimestamps[first.id] ? new Date(paymentTimestamps[first.id]).getTime() : 0;
                const timeSecond = paymentTimestamps[second.id] ? new Date(paymentTimestamps[second.id]).getTime() : 0;
                if (timeFirst !== timeSecond) {
                    return timeSecond - timeFirst; // ล่าสุดอยู่บนสุด (ดันคนจ่ายก่อนลงไป)
                }
                return 0;
            }

            // ถ้ายังไม่จ่ายทั้งคู่: คงตามเวลาเข้าร่วมก๊วน (created_at)
            if (!isPaidFirst && !isPaidSecond) {
                const timeFirst = first.created_at ? new Date(first.created_at).getTime() : 0;
                const timeSecond = second.created_at ? new Date(second.created_at).getTime() : 0;
                return timeFirst - timeSecond;
            }

            // กรณีคนหนึ่งจ่ายแล้ว อีกคนยังไม่จ่าย (แสดงในแท็บ 'all'):
            if (paymentSortOrder === 'paid_first') {
                return isPaidFirst ? -1 : 1; // คนจ่ายแล้วอยู่บน คนยังไม่จ่ายอยู่ล่าง
            } else {
                return isPaidFirst ? 1 : -1; // คนยังไม่จ่ายอยู่บน คนจ่ายแล้วอยู่ล่าง
            }
        });
    const scoreTeamPlayers = (team: 'A' | 'B') => (scoreMatch?.match_players || [])
        .filter(player => player.team === team)
        .map(player => player.profiles as unknown as Profile);
    const paymentModalAmount = paymentModalPlayer
        ? Number(
            billingRows.find(row => row.event_player_id === paymentModalPlayer.id)?.pending_amount ??
            Math.max(0, (userBills[paymentModalPlayer.user_id] || 0) - Number(paymentModalPlayer.paid_amount || 0))
          )
        : 0;

    if (loading) return <div className="flex items-center justify-center py-20"><div className="spinner" style={{ width: 28, height: 28 }} /></div>;

    return (
        <>
            <div className="animate-in">
                {billingError && <div role="alert" className="mb-4 rounded-lg bg-amber-50 p-4 text-amber-900">{billingError}<button className="btn btn-sm ml-2" onClick={() => loadData(eventId)}>โหลดใหม่</button></div>}
                <Link href={`/dashboard/admin/events/${eventId}`} className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: 'var(--gray-500)' }}>
                    <Icon icon="solar:arrow-left-linear" width={16} /> กลับหน้าก๊วน
                </Link>

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sticky z-[30] bg-gray-50/95 backdrop-blur-sm pb-4 pt-2 -mx-4 px-4 border-b border-gray-200 shadow-sm top-16 lg:top-0" style={{ marginTop: '-16px' }}>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm border border-gray-100 shrink-0">
                                <img src="/images/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
                            </div>
                            <h1 className="text-2xl font-bold" style={{ color: 'var(--gray-900)' }}>{activeSection === 'matches' ? 'จัดแมตช์' : 'การเงินก๊วน'}</h1>
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

                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-50 border border-green-100" title={`โอนเงิน: ฿${transferTotal.toLocaleString()} | เงินสด: ฿${cashTotal.toLocaleString()}${totalDiscount > 0 ? ` | ส่วนลด: ฿${totalDiscount.toLocaleString()}` : ''}`}>
                                <Icon icon="solar:wallet-money-linear" width={16} className="text-green-500" />
                                <span className="text-xs font-semibold text-green-700">
                                    เก็บแล้ว ฿{totalCollected.toLocaleString()}
                                    <span className="text-gray-400 mx-1">/</span>
                                    <span className="text-blue-700">฿{totalBilled.toLocaleString()}</span>
                                    <span className="text-[10px] font-medium text-green-600 opacity-90 ml-1">
                                        (โอน ฿{transferTotal.toLocaleString()} · สด ฿{cashTotal.toLocaleString()}{totalDiscount > 0 ? ` · ลด ฿${totalDiscount.toLocaleString()}` : ''})
                                    </span>
                                </span>
                            </div>

                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100">
                                <Icon icon="solar:clapperboard-edit-linear" width={16} className="text-indigo-500" />
                                <span className="text-xs font-semibold text-indigo-700">คอร์ท:</span>
                                <div className="flex items-center gap-1 ml-0.5">
                                    {eventCourts.length > 0 ? (
                                        eventCourts.map(num => (
                                            <span key={num} className={`text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm transition-colors ${activeCourtsSet.has(num) ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                                {num}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-[10px] font-medium text-indigo-400">ยังไม่มี</span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowAddCourtModal(true)}
                                    className="w-5 h-5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition-all ml-1 shadow-xs active:scale-95 cursor-pointer"
                                    title="เพิ่มหรือจัดการคอร์ท"
                                    aria-label="เพิ่มคอร์ท"
                                >
                                    <Icon icon="solar:add-circle-bold" width={13} />
                                </button>
                            </div>
                        </div>
                    </div>
                    {activeSection === 'matches' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => setShowPlayerBoard(true)} className="btn btn-secondary">
                                <Icon icon="solar:clipboard-list-linear" width={18} />
                                กระดานผู้เล่น
                            </button>
                            <button onClick={() => setShowPlayersSidebar(true)} className="btn btn-secondary">
                                <Icon icon="solar:users-group-rounded-linear" width={18} />
                                รายชื่อผู้เล่น
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
                    )}
                </div>

                <div className="card mb-6 p-1.5 flex gap-1.5" role="tablist" aria-label="เลือกส่วนจัดการก๊วน">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeSection === 'matches'}
                        onClick={() => setActiveSection('matches')}
                        className={`flex-1 min-h-12 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all ${activeSection === 'matches' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 hover:bg-orange-50 hover:text-orange-600'}`}
                    >
                        <Icon icon="solar:sort-horizontal-bold-duotone" width={20} />
                        จัดแมตช์
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeSection === 'matches' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>{matches.length}</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeSection === 'finance'}
                        onClick={() => { setActiveSection('finance'); setSidebarTeam(null); setScoreMatch(null); }}
                        className={`flex-1 min-h-12 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all ${activeSection === 'finance' ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500 hover:bg-orange-50 hover:text-orange-600'}`}
                    >
                        <Icon icon="solar:wallet-money-bold-duotone" width={20} />
                        การเงิน
                        {pendingPlayerCount > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeSection === 'finance' ? 'bg-white text-orange-600' : 'bg-orange-100 text-orange-700'}`}>ค้าง {pendingPlayerCount}</span>}
                    </button>
                </div>

                <div className="flex gap-6">
                    {/* Main Content */}
                    <div className="w-full">

                        <div className={activeSection === 'matches' ? 'block' : 'hidden'}>
                        {/* Create Form */}
                        <CreateMatchForm
    showForm={showForm}
    editingMatchId={editingMatchId}
    teamA={teamA}
    teamB={teamB}
    players={players}
    togglePlayer={togglePlayer}
    playerStats={playerStats}
    setSidebarTeam={setSidebarTeam}
    courtNumber={courtNumber}
    setCourtNumber={setCourtNumber}
    event={event}
    matchSeq={matchSeq}
    setMatchSeq={setMatchSeq}
    shuttlecockNumber={shuttlecockNumber}
    setShuttlecockNumber={setShuttlecockNumber}
    matchErrors={matchErrors}
    saveMatch={saveMatch}
    creating={creating}
    setShowForm={setShowForm}
    setTeamA={setTeamA}
    setTeamB={setTeamB}
    setEditingMatchId={setEditingMatchId}
/>

                        {/* Player Selection Sidebar */}
                        <PlayerSelectionSidebar
    sidebarTeam={sidebarTeam}
    setSidebarTeam={setSidebarTeam}
    setSearchQuery={setSearchQuery}
    teamA={teamA}
    teamB={teamB}
    searchQuery={searchQuery}
    players={players}
    playerStats={playerStats}
    togglePlayer={togglePlayer}
/>

                                                {/* Matches */}
                        {matches.length > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-gray-100/80 border border-gray-200/50 backdrop-blur-sm shadow-sm shrink-0">
                                    {[
                                        { id: 'all', label: 'ทั้งหมด', icon: 'solar:hamburger-menu-bold-duotone', count: matches.length },
                                        { id: 'waiting', label: 'รอคิว', icon: 'solar:hourglass-bold-duotone', count: matches.filter(m => m.status === 'waiting').length, color: 'var(--warning)' },
                                        { id: 'playing', label: 'กำลังตี', icon: 'solar:play-bold-duotone', count: matches.filter(m => m.status === 'playing').length, color: 'var(--success)' },
                                        { id: 'finished', label: 'จบแมท', icon: 'solar:check-circle-bold-duotone', count: matches.filter(m => m.status === 'finished').length, color: 'var(--gray-500)' },
                                    ].map((tab) => {
                                        const isSelected = matchFilter === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                onClick={() => setMatchFilter(tab.id as any)}
                                                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                                                    isSelected 
                                                        ? 'bg-white shadow-sm text-gray-900 scale-[1.02]' 
                                                        : 'text-gray-500 hover:text-gray-900 hover:bg-white/40'
                                                }`}
                                            >
                                                <Icon icon={tab.icon} width={14} style={{ color: isSelected && tab.color ? tab.color : 'inherit' }} />
                                                <span>{tab.label}</span>
                                                {tab.count > 0 && (
                                                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                                                        isSelected ? 'bg-gray-100 text-gray-700' : 'bg-gray-200/60 text-gray-500'
                                                    }`}>
                                                        {tab.count}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="text-xs font-semibold text-gray-400">
                                    เรียงลำดับ: แมทช์ใหม่สุดอยู่บน 🕒
                                </div>
                            </div>
                        )}

                        {/* Match Cards */}
                        <MatchCards
    matches={matches}
    sortedMatches={sortedMatches}
    statusCfg={statusCfg}
    removeShuttlecock={removeShuttlecock}
    addShuttlecock={addShuttlecock}
    updateMatchStatus={updateMatchStatus}
    handleDeleteMatch={handleDeleteMatch}
    editMatch={editMatch}
    handleCancelMatch={handleCancelMatch}
    currentUserId={currentUserId}
    players={players}
/>
                        </div>

                        {/* Payment Status Section */}
                        <FinanceSection
    activeSection={activeSection}
    players={players}
    totalBilled={totalBilled}
    totalCollected={totalCollected}
    totalOutstanding={totalOutstanding}
    paidPlayerCount={paidPlayerCount}
    transferTotal={transferTotal}
    transferPlayerCount={transferPlayerCount}
    cashTotal={cashTotal}
    cashPlayerCount={cashPlayerCount}
    totalDiscount={totalDiscount}
    discountedPlayerCount={discountedPlayerCount}
    totalAdditionalCost={totalAdditionalCost}
    additionalCostPlayerCount={additionalCostPlayerCount}
    pendingPlayerCount={pendingPlayerCount}
    setPaymentFilter={setPaymentFilter}
    paymentFilter={paymentFilter}
    visiblePaymentPlayers={visiblePaymentPlayers}
    setPaymentSortOrder={setPaymentSortOrder}
    paymentSortOrder={paymentSortOrder}
    paymentSearchQuery={paymentSearchQuery}
    setPaymentSearchQuery={setPaymentSearchQuery}
    updatingPayment={updatingPayment}
    paymentTimestamps={paymentTimestamps}
    formatPaymentTime={formatPaymentTime}
    event={event}
    matches={matches}
    updateAdditionalCost={updateAdditionalCost}
    updateDiscount={updateDiscount}
    userBills={userBills}
    togglePayment={togglePayment}
/>

                        {activeSection === 'finance' && players.length === 0 && (
                            <div className="card text-center shadow-sm" style={{ padding: '56px 28px' }}>
                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-green-50 text-green-600">
                                    <Icon icon="solar:wallet-money-linear" width={28} />
                                </div>
                                <h2 className="text-lg font-bold text-gray-900">ยังไม่มีรายการการเงิน</h2>
                                <p className="text-sm text-gray-500 mt-1">เพิ่มผู้เล่นเข้าก๊วนก่อนเริ่มบันทึกการชำระเงิน</p>
                            </div>
                        )}

                        {/* Score Modal — 2-Set + Winner */}
                        <ScoreModal
    scoreMatch={scoreMatch}
    setScoreMatch={setScoreMatch}
    winner={winner}
    setWinner={setWinner}
    scoreTeamPlayers={scoreTeamPlayers}
    submitScore={submitScore}
/>
                        {/* Add Shuttlecock Modal */}
                        <PlayerBoardModal
    open={showPlayerBoard}
    onClose={() => setShowPlayerBoard(false)}
    players={players}
    matches={matches}
/>
                        <AddShuttlecockModal
    addingShuttlecockMatch={addingShuttlecockMatch}
    creating={creating}
    setAddingShuttlecockMatch={setAddingShuttlecockMatch}
    newShuttlecockNumber={newShuttlecockNumber}
    setNewShuttlecockNumber={setNewShuttlecockNumber}
    submitAddShuttlecock={submitAddShuttlecock}
/>

                        {/* Add Guest Modal */}
                        <AddGuestModal
    showAddGuestModal={showAddGuestModal}
    creating={creating}
    setShowAddGuestModal={setShowAddGuestModal}
    guestName={guestName}
    setGuestName={setGuestName}
    handleAddGuest={handleAddGuest}
    guestSkill={guestSkill}
    setGuestSkill={setGuestSkill}
/>

                        {/* Add Player Modal */}
                        <AddPlayerModal
    showAddPlayerModal={showAddPlayerModal}
    setShowAddPlayerModal={setShowAddPlayerModal}
    newPlayerSearch={newPlayerSearch}
    setNewPlayerSearch={setNewPlayerSearch}
    searchUnjoinedPlayers={searchUnjoinedPlayers}
    searchingPlayers={searchingPlayers}
    unjoinedPlayers={unjoinedPlayers}
    addingPlayer={addingPlayer}
    addSubstitutePlayer={addSubstitutePlayer}
/>
                    </div > {/* end main content */}

                    {/* Player list popup (เปิดจากปุ่ม "รายชื่อผู้เล่น") */}
                    <CheckInPanel
    activeSection={activeSection}
    showPlayersSidebar={showPlayersSidebar}
    players={players}
    setShowAddGuestModal={setShowAddGuestModal}
    setShowAddPlayerModal={setShowAddPlayerModal}
    searchUnjoinedPlayers={searchUnjoinedPlayers}
    setShowPlayersSidebar={setShowPlayersSidebar}
    playerStats={playerStats}
    sidebarTeam={sidebarTeam}
    teamA={teamA}
    teamB={teamB}
    togglePlayer={togglePlayer}
    toggleCheckIn={toggleCheckIn}
    handleRemovePlayer={handleRemovePlayer}
/>
                </div>
            </div>

            {/* Payment Method Selector Modal */}
            {paymentModalPlayer && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={() => setPaymentModalPlayer(null)}>
                    <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-gray-100 overflow-hidden p-6 sm:p-8 animate-in slide-in-from-bottom-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4 mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-green-600 shrink-0">
                                    <Icon icon="solar:wallet-money-bold" width={26} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-gray-950">ยืนยันการรับชำระเงิน</h3>
                                    <p className="text-sm text-gray-500 font-medium mt-0.5">
                                        {(paymentModalPlayer.profiles as unknown as Profile)?.display_name}
                                    </p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setPaymentModalPlayer(null)} className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors" aria-label="ปิดหน้าต่าง">
                                <Icon icon="solar:close-circle-linear" width={22} />
                            </button>
                        </div>

                        <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 px-5 py-6 text-center mb-6">
                            <p className="text-xs font-bold uppercase tracking-wide text-orange-700">ยอดที่ต้องรับ</p>
                            <p className="text-4xl sm:text-5xl font-black text-orange-600 mt-2 tabular-nums leading-none">
                                ฿{paymentModalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            <p className="text-xs font-medium text-orange-700/70 mt-3">ตรวจสอบยอดก่อนเลือกช่องทางการชำระเงิน</p>
                        </div>

                        <p className="text-sm font-bold text-gray-800 mb-3">เลือกช่องทางที่รับเงินจริง</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                            <button
                                onClick={() => handleConfirmPayment(paymentModalPlayer, 'transfer')}
                                className="min-h-32 flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-blue-200 bg-blue-50/40 text-blue-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 hover:shadow-xl hover:-translate-y-1 active:translate-y-0 active:scale-[0.99] transition-all duration-200 font-black gap-3 text-base shadow-sm cursor-pointer"
                            >
                                <Icon icon="solar:smartphone-line-duotone" width={38} />
                                <span>ยืนยันรับเงินโอน</span>
                                <span className="text-xs font-semibold opacity-75">฿{paymentModalAmount.toLocaleString()}</span>
                            </button>
                            <button
                                onClick={() => handleConfirmPayment(paymentModalPlayer, 'cash')}
                                className="min-h-32 flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 hover:shadow-xl hover:-translate-y-1 active:translate-y-0 active:scale-[0.99] transition-all duration-200 font-black gap-3 text-base shadow-sm cursor-pointer"
                            >
                                <Icon icon="solar:notes-line-duotone" width={38} />
                                <span>ยืนยันรับเงินสด</span>
                                <span className="text-xs font-semibold opacity-75">฿{paymentModalAmount.toLocaleString()}</span>
                            </button>
                        </div>

                        <button onClick={() => setPaymentModalPlayer(null)} className="btn btn-secondary w-full min-h-11">ยกเลิก</button>
                    </div>
                </div>
            )}

            {/* Unfinished Matches Warning Modal */}
            {unfinishedMatchesPlayer && (
                <div
                    className="fixed inset-0 z-[125] flex items-center justify-center p-4 animate-in fade-in"
                    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)' }}
                    onClick={() => setUnfinishedMatchesPlayer(null)}
                >
                    <div
                        className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 overflow-hidden p-6 sm:p-7 animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center shrink-0">
                                    <Icon icon="solar:danger-triangle-bold-duotone" width={28} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-gray-950">ยังคิดเงินไม่ได้</h3>
                                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                                        {(unfinishedMatchesPlayer.player.profiles as unknown as Profile)?.display_name} ยังมีแมตช์ที่ยังไม่จบ
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setUnfinishedMatchesPlayer(null)}
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                aria-label="ปิดหน้าต่าง"
                            >
                                <Icon icon="solar:close-circle-linear" width={22} />
                            </button>
                        </div>

                        {/* Description Box */}
                        <div className="rounded-2xl bg-amber-50/70 border border-amber-200 p-4 mb-4 text-xs text-amber-900 leading-relaxed">
                            <p className="font-bold mb-1 flex items-center gap-1.5 text-amber-800">
                                <Icon icon="solar:info-circle-bold" width={16} />
                                ต้องกดจบแมตช์ก่อนรับชำระเงิน
                            </p>
                            ผู้เล่นนี้ยังมีแมตช์ที่กำลังแข่งหรือรอคิวอยู่ กรุณาไปบันทึกผลการแข่งขันและกดจบแมตช์ให้เรียบร้อยก่อน เพื่อให้ระบบคำนวณจำนวนลูกแบดและยอดชำระเงินจริงได้อย่างถูกต้อง
                        </div>

                        {/* List of unfinished matches */}
                        <div className="space-y-2 mb-5">
                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                รายการแมตช์ที่ค้างอยู่ ({unfinishedMatchesPlayer.matches.length} แมตช์)
                            </p>
                            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                                {unfinishedMatchesPlayer.matches.map((m) => {
                                    const mNum = m.match_number || (matches.findIndex(item => item.id === m.id) + 1);
                                    return (
                                        <div
                                            key={m.id}
                                            className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-200/80"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-lg bg-gray-900 text-white flex items-center justify-center text-xs font-black">
                                                    #{mNum}
                                                </div>
                                                <div>
                                                    <span className="text-xs font-bold text-gray-900 block">
                                                        แมตช์ #{mNum}
                                                    </span>
                                                    {m.court_number && (
                                                        <span className="text-[10px] text-gray-500 font-semibold">
                                                            คอร์ท {m.court_number}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                                m.status === 'playing'
                                                    ? 'bg-emerald-100 text-emerald-800'
                                                    : 'bg-amber-100 text-amber-800'
                                            }`}>
                                                {m.status === 'playing' ? 'กำลังตี 🏸' : 'รอคิว ⏳'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setUnfinishedMatchesPlayer(null);
                                    setActiveSection('matches');
                                    toast('กรุณาเลือกแมตช์ที่ค้างอยู่แล้วกดบันทึกผล/จบแมตช์', { icon: '👉' });
                                }}
                                className="btn btn-primary w-full min-h-11 flex items-center justify-center gap-2 text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
                            >
                                <Icon icon="solar:sort-horizontal-bold-duotone" width={18} />
                                ไปหน้าจัดแมตช์เพื่อกดจบ
                            </button>
                            <button
                                type="button"
                                onClick={() => setUnfinishedMatchesPlayer(null)}
                                className="btn btn-secondary w-full min-h-10 text-xs font-bold cursor-pointer"
                            >
                                ปิด
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Court Management Modal */}
            {showAddCourtModal && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => !savingCourt && setShowAddCourtModal(false)} />
                    <div className="relative bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-md w-full p-6 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                    <Icon icon="solar:clapperboard-edit-bold" width={22} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-gray-900">จัดการคอร์ทของก๊วน</h3>
                                    <p className="text-xs text-gray-500">เพิ่มหรือลบคอร์ทที่ใช้แข่งขันในวันนี้</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAddCourtModal(false)}
                                disabled={savingCourt}
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                aria-label="ปิดหน้าต่าง"
                            >
                                <Icon icon="solar:close-circle-linear" width={20} />
                            </button>
                        </div>

                        {/* Existing Courts */}
                        <div className="mb-4 p-3.5 rounded-2xl bg-gray-50 border border-gray-100">
                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2.5">
                                คอร์ทปัจจุบัน ({eventCourts.length})
                            </p>
                            {eventCourts.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {eventCourts.map(num => {
                                        const isActive = activeCourtsSet.has(num);
                                        return (
                                            <div
                                                key={num}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs transition-all ${
                                                    isActive ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-700'
                                                }`}
                                            >
                                                <span>คอร์ท {num}</span>
                                                {isActive && (
                                                    <span className="text-[9px] bg-white/20 text-white px-1 py-0.5 rounded">กำลังใช้</span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveCourt(num)}
                                                    disabled={savingCourt || isActive}
                                                    title={isActive ? 'มีแมตช์กำลังใช้คอร์ทนี้' : `ลบคอร์ท ${num}`}
                                                    className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                                                        isActive
                                                            ? 'opacity-30 cursor-not-allowed'
                                                            : 'hover:bg-red-100 hover:text-red-600 text-gray-400'
                                                    }`}
                                                >
                                                    <Icon icon="solar:close-circle-bold" width={14} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-400 italic">ยังไม่มีคอร์ทในก๊วนนี้</p>
                            )}
                        </div>

                        {/* Quick Suggestions */}
                        {['1', '2', '3', '4', '5', '6', '7', '8'].filter(c => !eventCourts.includes(c)).length > 0 && (
                            <div className="mb-4">
                                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                                    กดเพิ่มด่วน
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {['1', '2', '3', '4', '5', '6', '7', '8']
                                        .filter(c => !eventCourts.includes(c))
                                        .slice(0, 5)
                                        .map(c => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => handleAddCourt(c)}
                                                disabled={savingCourt}
                                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 border border-indigo-100 transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                                            >
                                                <Icon icon="solar:add-circle-linear" width={13} />
                                                คอร์ท {c}
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* Custom Court Input Form */}
                        <form onSubmit={(e) => { e.preventDefault(); handleAddCourt(); }} className="space-y-3">
                            <div>
                                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                                    ระบุหมายเลขหรือชื่อคอร์ทใหม่
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="เช่น 3, 4, VIP..."
                                        value={newCourtInput}
                                        onChange={(e) => setNewCourtInput(e.target.value)}
                                        disabled={savingCourt}
                                        className="flex-1 form-input text-sm h-11 rounded-xl"
                                        autoFocus
                                    />
                                    <button
                                        type="submit"
                                        disabled={savingCourt || !newCourtInput.trim()}
                                        className="btn btn-primary h-11 px-5 shrink-0"
                                    >
                                        {savingCourt ? (
                                            <div className="spinner" style={{ width: 16, height: 16 }} />
                                        ) : (
                                            <>
                                                <Icon icon="solar:add-circle-linear" width={18} />
                                                เพิ่ม
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
