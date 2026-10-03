'use client';

import { useState } from 'react';
import { Icon } from '@iconify/react';
import RankBadge from '@/src/components/RankBadge';
import { getMatchResult, type BoardMatch } from '@/src/lib/utils/match-board';
import styles from './match-manager.module.css';

interface MatchCardProps {
    match: BoardMatch;
    currentUserId: string | null;
    paidUserIds: Set<string>;
    onStart: () => Promise<void>;
    onFinish: () => Promise<void>;
    onEdit: () => void;
    onResume: () => Promise<void>;
    onCancel: () => Promise<void>;
    onDelete: () => Promise<void>;
    onAddShuttle: () => void;
    onRemoveShuttle: (index: number, number: string) => Promise<void>;
}

export default function MatchCard({ match, currentUserId, paidUserIds, onStart, onFinish, onEdit, onResume, onCancel, onDelete, onAddShuttle, onRemoveShuttle }: MatchCardProps) {
    const [busy, setBusy] = useState(false);
    const [managingShuttles, setManagingShuttles] = useState(false);
    const number = match.match_number ?? match.originalIndex;
    const status = { waiting: 'รอคิว', playing: 'กำลังเล่น', finished: 'จบแล้ว' }[match.status];
    const result = getMatchResult(match);
    const shuttles = match.shuttlecock_numbers || [];
    const runAction = async (action: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        try { await action(); } finally { setBusy(false); }
    };

    return <article className={styles.matchCard} data-status={match.status} aria-label={`แมตช์ ${number} คอร์ท ${match.court_number} ${status}`} aria-busy={busy}>
        <div className={styles.matchTop}>
            <div className={styles.matchIdentity}>
                <span className={styles.matchNumber}>#{number}</span>
                <span className={styles.courtLabel}>คอร์ท {match.court_number || '—'}</span>
                <span className={styles.statusPill} data-status={match.status}><span />{status}</span>
            </div>
            <details className={styles.moreMenu}>
                <summary aria-label={`ตัวเลือกแมตช์ ${number}`}><Icon icon="solar:menu-dots-bold" width={22} /></summary>
                <div className={styles.menuItems}>
                    <button type="button" disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); if (match.status === 'finished') void runAction(onResume); else onEdit(); }}>
                        <Icon icon="solar:pen-linear" width={18} />{match.status === 'finished' ? 'เล่นต่อ / แก้ไขผล' : 'แก้ไขแมตช์'}
                    </button>
                    {match.status === 'playing' && <button type="button" disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void runAction(onCancel); }}>
                        <Icon icon="solar:undo-left-linear" width={18} />ยกเลิกกลับไปรอคิว
                    </button>}
                    <button type="button" className={styles.dangerAction} disabled={busy} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void runAction(onDelete); }}>
                        <Icon icon="solar:trash-bin-trash-linear" width={18} />ลบแมตช์
                    </button>
                </div>
            </details>
        </div>

        <div className={styles.teams}>
            {(['A', 'B'] as const).map(team => {
                const members = match.match_players?.filter(player => player.team === team) || [];
                const won = result === `ทีม ${team} ชนะ`;
                return <section key={team} className={styles.team} data-team={team} data-winner={won} aria-label={`ทีม ${team}`}>
                    <div className={styles.teamCaption}><span>ทีม {team}</span>{won && <span><Icon icon="solar:cup-star-bold" width={15} /> ชนะ</span>}</div>
                    {members.map(player => <div key={player.id} className={styles.player}>
                        <span className={styles.avatar}>{player.profiles?.display_name?.slice(0,1) || '?'}</span>
                        <div className={styles.playerInfo}>
                            <p>{player.profiles?.display_name || 'ไม่พบข้อมูลผู้เล่น'}{player.user_id === currentUserId && <small> (คุณ)</small>}</p>
                            <div className={styles.playerMeta}>
                                <RankBadge mmr={player.profiles?.mmr ?? 1000} size="sm" showName={false} showMMR={false} />
                                <span>มือ {player.profiles?.skill_level || '—'}</span>
                                {player.profiles?.is_guest && <span>ขาจร</span>}
                                {paidUserIds.has(player.user_id) && <span title="ชำระแล้ว" aria-label="ชำระแล้ว"><Icon icon="solar:check-circle-bold" width={14} /></span>}
                            </div>
                        </div>
                    </div>)}
                    {members.length < 2 && <p className={styles.missingPlayer}>ขาดข้อมูลผู้เล่น {2-members.length} คน</p>}
                </section>;
            })}
            <div className={styles.versus} aria-label={result}>
                <strong>{match.status === 'finished' && result !== 'ไม่ระบุผล' ? `${match.team_a_score} : ${match.team_b_score}` : 'VS'}</strong>
                {match.status === 'finished' && <span>{result}</span>}
            </div>
        </div>

        <div className={styles.shuttleRow}>
            <span className={styles.shuttleLabel}><Icon icon="solar:shuttlecock-linear" width={17} /> หมายเลขลูก</span>
            <div className={styles.shuttleNumbers}>
                {shuttles.length ? shuttles.map((shuttle, index) => managingShuttles && shuttles.length > 1 ?
                    <button type="button" key={`${shuttle}-${index}`} disabled={busy} onClick={() => void runAction(() => onRemoveShuttle(index, shuttle))} aria-label={`ลบลูกหมายเลข ${shuttle}`} className={styles.removeShuttle}>{shuttle}<Icon icon="solar:close-circle-linear" width={17} /></button> :
                    <span key={`${shuttle}-${index}`}>{shuttle}</span>) : <span className={styles.missingShuttle}>ยังไม่ระบุ · ตรวจสอบก่อนคิดเงิน</span>}
            </div>
        </div>
        <footer className={styles.cardFooter}>
            <div className={styles.secondaryActions}>
                {match.status !== 'waiting' && <button type="button" className={styles.quietButton} disabled={busy} onClick={onAddShuttle}><Icon icon="solar:add-circle-linear" width={18} />{shuttles.length ? 'เบิกลูกเพิ่ม' : 'ระบุหมายเลขลูก'}</button>}
                {match.status !== 'waiting' && shuttles.length > 1 && <button type="button" className={styles.quietButton} disabled={busy} aria-pressed={managingShuttles} onClick={() => setManagingShuttles(value => !value)}>{managingShuttles ? 'จัดการลูกเสร็จแล้ว' : 'จัดการลูก'}</button>}
                {match.status === 'waiting' && <button type="button" className={styles.quietButton} disabled={busy} onClick={onEdit}><Icon icon="solar:pen-linear" width={18} />แก้ไขทีม</button>}
            </div>
            {match.status !== 'finished' ? <button type="button" disabled={busy} className={styles.primaryButton} data-playing={match.status === 'playing'} onClick={() => void runAction(match.status === 'waiting' ? onStart : onFinish)}>
                <Icon icon={match.status === 'waiting' ? 'solar:play-bold' : 'solar:check-circle-linear'} width={18} />
                {busy ? 'กำลังดำเนินการ…' : match.status === 'waiting' ? 'เริ่มเกม' : 'บันทึกผล'}
            </button> : <span className={styles.resultLabel}>{result}</span>}
        </footer>
    </article>;
}
