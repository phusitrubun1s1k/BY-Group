export type MatchResult = 'Win' | 'Loss' | 'Draw' | 'Unrated';

export function getPlayerMatchResult(team: 'A' | 'B', teamAScore: number, teamBScore: number): MatchResult {
    if (teamAScore === 0 && teamBScore === 0) return 'Unrated';
    if (teamAScore === teamBScore) return 'Draw';
    const teamWon = team === 'A' ? teamAScore > teamBScore : teamBScore > teamAScore;
    return teamWon ? 'Win' : 'Loss';
}

export function getHistoryMatchResult(teamAScore: number | null, teamBScore: number | null, result?: string): MatchResult | 'Adjustment' {
    if (teamAScore === null || teamBScore === null) return result === 'Draw' ? 'Draw' : 'Adjustment';
    if (teamAScore === 0 && teamBScore === 0) return 'Unrated';
    if (teamAScore === teamBScore) return 'Draw';
    return result === 'Win' ? 'Win' : 'Loss';
}

export const MATCH_RESULT_LABELS: Record<MatchResult | 'Adjustment', string> = {
    Win: 'ชนะ', Loss: 'แพ้', Draw: 'เสมอ', Unrated: 'ไม่ระบุผล', Adjustment: 'ปรับคะแนน'
};
