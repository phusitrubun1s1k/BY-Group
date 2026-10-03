'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import type { Event, EventPlayer, Match } from '@/src/types';
import type { MatchFilter, MatchOrder } from '@/src/lib/utils/match-board';
import { validateMatchInput } from '@/src/lib/utils/match-validation';
import CustomSelect from '@/src/components/CustomSelect';
import styles from './match-manager.module.css';

const FILTERS: { id: MatchFilter; label: string }[] = [
    { id: 'all', label: 'ทั้งหมด' }, { id: 'playing', label: 'กำลังเล่น' },
    { id: 'waiting', label: 'รอคิว' }, { id: 'finished', label: 'จบแล้ว' }
];

interface HeaderProps {
    event: Event | null; matches: Match[]; playerCount: number; checkedInCount: number; readyCount: number;
    court: string; courts: string[]; onCourt: (court: string) => void;
    onCreate: () => void; onAuto: () => void; onPlayers: () => void; showPlayers: boolean;
    paid: number; total: number; cash: number; transfer: number; billingAvailable: boolean;
}

export function MatchHeader({ event, matches, playerCount, checkedInCount, readyCount, court, courts, onCourt, onCreate, onAuto, onPlayers, showPlayers, paid, total, cash, transfer, billingAvailable }: HeaderProps) {
    return <header className={styles.workspaceHeader}>
        <div className={styles.headerTop}>
            <div>
                <p className={styles.eyebrow}>จัดทีม · ดูคิว · บันทึกผล</p>
                <h1>จัดแมตช์<span className={styles.eventStatus}>{event?.status === 'open' ? 'เปิดก๊วน' : 'ปิดก๊วนแล้ว'}</span></h1>
                <p className={styles.eventDescription}>{event?.event_name || 'ก๊วนแบดมินตัน'}{event?.event_date && ` · ${new Date(`${event.event_date}T12:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`}</p>
            </div>
            <div className={styles.headerActions}>
                {event?.status === 'open' && <>
                    <button type="button" className={styles.secondaryButton} onClick={onAuto}><Icon icon="solar:magic-stick-3-linear" width={19} />สุ่มจัดทีม</button>
                    <button type="button" className={styles.primaryButton} onClick={onCreate}><Icon icon="solar:add-circle-linear" width={20} />สร้างแมตช์ใหม่</button>
                </>}
            </div>
        </div>
        <div className={styles.overview}>
            <div><span className={styles.overviewIcon}><Icon icon="solar:users-group-rounded-linear" width={22} /></span><p><strong>{checkedInCount}<small> / {playerCount}</small></strong><span>เช็คอินแล้ว</span></p></div>
            <div><span className={styles.overviewIcon} data-tone="green"><Icon icon="solar:user-check-linear" width={22} /></span><p><strong>{readyCount}<small> คน</small></strong><span>พร้อมจัดทีม</span></p></div>
            <div><span className={styles.overviewIcon} data-tone="green"><Icon icon="solar:play-circle-linear" width={22} /></span><p><strong>{matches.filter(match => match.status === 'playing').length}<small> เกม</small></strong><span>กำลังเล่น</span></p></div>
            <div><span className={styles.overviewIcon} data-tone="amber"><Icon icon="solar:clock-circle-linear" width={22} /></span><p><strong>{matches.filter(match => match.status === 'waiting').length}<small> เกม</small></strong><span>รอคิว</span></p></div>
        </div>
        <div className={styles.courtOverview}>
            <div className={styles.courtHeading}><span>ภาพรวมคอร์ท</span><span>เลือกคอร์ทเพื่อกรองแมตช์</span></div>
            <div className={styles.courtButtons}>
                <button type="button" className={styles.courtButton} aria-pressed={court === 'all'} onClick={() => onCourt('all')}><strong>ทุกคอร์ท</strong><span>{matches.length} แมตช์</span></button>
                {courts.map(name => {
                    const playing = matches.filter(match => match.court_number === name && match.status === 'playing');
                    const waiting = matches.filter(match => match.court_number === name && match.status === 'waiting').length;
                    return <button type="button" key={name} className={styles.courtButton} aria-pressed={court === name} onClick={() => onCourt(court === name ? 'all' : name)}>
                        <strong><span className={styles.courtDot} data-active={playing.length > 0} />คอร์ท {name}</strong>
                        <span>{playing.length ? `กำลังเล่น ${playing.length} เกม` : 'ไม่มีเกมกำลังเล่น'}{waiting > 0 && ` · รอ ${waiting}`}</span>
                    </button>;
                })}
            </div>
        </div>
        <div className={styles.headerBottom}>
            <p><Icon icon="solar:wallet-money-linear" width={17} />{billingAvailable ? <>รับแล้ว <strong>฿{paid.toLocaleString('th-TH', { maximumFractionDigits: 2 })}</strong> / ฿{total.toLocaleString('th-TH', { maximumFractionDigits: 2 })}<span className={styles.paymentBreakdown}> · เงินสด ฿{cash.toLocaleString()} · โอน ฿{transfer.toLocaleString()}</span></> : 'รอตรวจสอบยอดเงิน'}</p>
            <button type="button" className={styles.quietButton} onClick={onPlayers} aria-expanded={showPlayers} aria-controls="match-checkin-panel"><Icon icon="solar:users-group-rounded-linear" width={18} />{showPlayers ? 'ซ่อนรายชื่อ' : 'ผู้เล่น / เช็คอิน'}</button>
        </div>
    </header>;
}

interface FilterProps {
    matches: Match[]; filter: MatchFilter; onFilter: (filter: MatchFilter) => void;
    query: string; onQuery: (query: string) => void; order: MatchOrder; onOrder: (order: MatchOrder) => void;
    court: string; visibleCount: number; onClear: () => void;
}

export function MatchFilters({ matches, filter, onFilter, query, onQuery, order, onOrder, court, visibleCount, onClear }: FilterProps) {
    return <section className={styles.boardTools} aria-label="ค้นหาและกรองแมตช์">
        <div className={styles.boardHeading}><div><h2>กระดานแมตช์</h2><p>เริ่มเกมและบันทึกผลได้จากแต่ละการ์ด</p></div><span aria-live="polite">แสดง {visibleCount} / {matches.length} แมตช์</span></div>
        <div className={styles.filterTabs} role="group" aria-label="สถานะแมตช์">{FILTERS.map(option => <button type="button" key={option.id} aria-pressed={filter === option.id} onClick={() => onFilter(option.id)}>{option.label}<span>{option.id === 'all' ? matches.length : matches.filter(match => match.status === option.id).length}</span></button>)}</div>
        <div className={styles.searchRow}>
            <label className={styles.searchBox}><Icon icon="solar:magnifer-linear" width={19} /><input type="search" aria-label="ค้นหาแมตช์" placeholder="ค้นหาชื่อผู้เล่น ลำดับแมตช์ หรือเลขลูก" value={query} onChange={event => onQuery(event.target.value)} /></label>
            <label className={styles.sortBox}><span>เรียงตาม</span><select aria-label="เรียงลำดับแมตช์" value={order} onChange={event => onOrder(event.target.value as MatchOrder)}><option value="activity">กำลังเล่น → รอคิว → จบแล้ว</option><option value="latest">แมตช์ใหม่สุด</option></select></label>
        </div>
        {(court !== 'all' || query || filter !== 'all') && <div className={styles.filterSummary}><span>{court !== 'all' ? `คอร์ท ${court}` : 'ทุกคอร์ท'}{query.trim() && ` · ค้นหา “${query.trim()}”`}</span><button type="button" onClick={onClear}>ล้างตัวกรอง</button></div>}
    </section>;
}

interface ComposerProps {
    players: EventPlayer[]; teamA: string[]; teamB: string[]; court: string; courts: string[]; sequence: string; shuttle: string;
    editing: boolean; saving: boolean; errors: string[]; extraShuttles: string[];
    onCourt: (value: string) => void; onSequence: (value: string) => void; onShuttle: (value: string) => void;
    onSelect: (team: 'A' | 'B') => void; onRemove: (id: string, team: 'A' | 'B') => void;
    onSave: () => void; onCancel: () => void;
}

export function MatchComposer({ players, teamA, teamB, court, courts, sequence, shuttle, editing, saving, errors, extraShuttles, onCourt, onSequence, onShuttle, onSelect, onRemove, onSave, onCancel }: ComposerProps) {
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        heading.current?.focus({ preventScroll: true });
        heading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);
    const validation = validateMatchInput(teamA, teamB, court, sequence, shuttle);
    const checks = [
        { label: 'ทีม A', done: teamA.length === 2 }, { label: 'ทีม B', done: teamB.length === 2 },
        { label: 'คอร์ท', done: Boolean(court.trim()) }, { label: 'ลำดับแมตช์', done: /^[1-9]\d*$/.test(sequence) && Number.isSafeInteger(Number(sequence)) },
        { label: 'หมายเลขลูก', done: Boolean(shuttle.trim()) }
    ];
    return <form id="match-composer" className={styles.composer} onSubmit={event => { event.preventDefault(); if (!saving && !validation.length) onSave(); }}>
        <div className={styles.composerHeading}><div><p className={styles.eyebrow}>จัดทีมให้ครบ แล้วเพิ่มเข้าคิว</p><h2 ref={heading} tabIndex={-1}>{editing ? 'แก้ไขแมตช์' : 'สร้างแมตช์ใหม่'}</h2></div><button type="button" className={styles.quietButton} disabled={saving} onClick={onCancel} aria-label="ปิดแบบฟอร์มจัดแมตช์"><Icon icon="solar:close-circle-linear" width={24} /></button></div>
        <fieldset disabled={saving}>
            <legend className={styles.stepLabel}><span>1</span>เลือกผู้เล่นทีมละ 2 คน</legend>
            <div className={styles.composerTeams}>{(['A', 'B'] as const).map(team => {
                const selected = team === 'A' ? teamA : teamB;
                return <div key={team} className={styles.composerTeam} data-team={team}>
                    <div className={styles.teamCaption}><strong>ทีม {team}</strong><span>{selected.length}/2 คน</span></div>
                    {[0, 1].map(slot => {
                        const id = selected[slot];
                        const player = players.find(player => player.user_id === id)?.profiles;
                        return id ? <div key={id} className={styles.selectedPlayer}><span className={styles.avatar}>{player?.display_name?.slice(0,1) || '?'}</span><div><strong>{player?.display_name || 'ไม่พบข้อมูลผู้เล่น'}</strong><span>มือ {player?.skill_level || '—'} · MMR {player?.mmr ?? 1000}</span></div><button type="button" onClick={() => onRemove(id, team)} aria-label={`นำ ${player?.display_name || 'ผู้เล่น'} ออกจากทีม ${team}`}><Icon icon="solar:close-circle-linear" width={21} /></button></div> :
                            <button key={slot} type="button" className={styles.emptySlot} onClick={() => onSelect(team)}><Icon icon="solar:user-plus-linear" width={20} />เลือกผู้เล่นคนที่ {slot+1}</button>;
                    })}
                    {selected.length === 2 && <button type="button" className={styles.changeTeam} onClick={() => onSelect(team)}>เปลี่ยนผู้เล่นทีม {team}</button>}
                </div>;
            })}</div>
        </fieldset>
        <fieldset disabled={saving}>
            <legend className={styles.stepLabel}><span>2</span>ระบุข้อมูลแมตช์ <small>ต้องกรอกทุกช่อง</small></legend>
            <div className={styles.matchFields}>
                <div><CustomSelect label="คอร์ท *" value={court} onChangeAction={value => onCourt(value || '')} options={courts.map(value => ({ value, label: `คอร์ท ${value}` }))} /><p>เลือกคอร์ทที่จะใช้เล่น</p></div>
                <label>ลำดับแมตช์ *<input type="number" inputMode="numeric" min={1} step={1} required value={sequence} onChange={event => onSequence(event.target.value)} placeholder="เช่น 12" aria-label="ลำดับแมตช์" /><span>จำนวนเต็มมากกว่า 0 และไม่ซ้ำ</span></label>
                <label>หมายเลขลูก *<input required value={shuttle} onChange={event => onShuttle(event.target.value)} placeholder="เช่น 25" aria-label="หมายเลขลูก" /><span>ใช้ตรวจสอบและคำนวณค่าลูก</span></label>
            </div>
            {extraShuttles.length > 0 && <p className={styles.preservedShuttles}><Icon icon="solar:shield-check-linear" width={18} />ลูกที่เบิกเพิ่มยังเก็บไว้: {extraShuttles.join(', ')}</p>}
        </fieldset>
        <div className={styles.checklist} aria-label="ความครบถ้วนของข้อมูล">{checks.map(check => <span key={check.label} data-complete={check.done}><Icon icon={check.done ? 'solar:check-circle-bold' : 'solar:record-circle-linear'} width={16} />{check.label}</span>)}</div>
        {errors.length > 0 && <div role="alert" className={styles.formError}><strong>ยังบันทึกไม่ได้</strong><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
        <div className={styles.composerFooter}><p aria-live="polite">{validation.length ? `ยังต้องตรวจ: ${checks.filter(check => !check.done).map(check => check.label).join(', ') || 'รายชื่อผู้เล่นซ้ำ'}` : 'ข้อมูลครบ พร้อมบันทึกแมตช์'}</p><div><button type="button" className={styles.secondaryButton} disabled={saving} onClick={onCancel}>ยกเลิก</button><button type="submit" className={styles.primaryButton} disabled={saving || validation.length > 0}><Icon icon="solar:check-circle-linear" width={19} />{saving ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'สร้างแมตช์เข้าคิว'}</button></div></div>
    </form>;
}
