import type { Match } from '@/src/types';

export type MatchFilter = 'all' | Match['status'];
export type MatchOrder = 'activity' | 'latest';
export type BoardMatch = Match & { originalIndex: number };

export function getVisibleMatches(matches: Match[], filter: MatchFilter, court: string, query: string, order: MatchOrder): BoardMatch[] {
    const search = query.trim().toLocaleLowerCase('th-TH');
    const priority = { playing: 0, waiting: 1, finished: 2 };
    return matches.map((match, index) => ({ ...match, originalIndex: index + 1 })).filter(match => {
        if (filter !== 'all' && match.status !== filter) return false;
        if (court !== 'all' && match.court_number !== court) return false;
        const text = [
            `#${match.match_number ?? match.originalIndex}`, match.court_number,
            ...(match.shuttlecock_numbers || []),
            ...(match.match_players || []).map(player => player.profiles?.display_name || '')
        ].join(' ').toLocaleLowerCase('th-TH');
        return !search || text.includes(search);
    }).sort((first, second) => {
        if (order === 'latest') return second.originalIndex - first.originalIndex;
        const statusDifference = priority[first.status] - priority[second.status];
        if (statusDifference) return statusDifference;
        if (first.status === 'finished') return second.originalIndex - first.originalIndex;
        return (first.match_number ?? first.originalIndex) - (second.match_number ?? second.originalIndex);
    });
}

export function getMatchResult(match: Match): string {
    if (match.status !== 'finished') return 'VS';
    if (match.team_a_score === 0 && match.team_b_score === 0) return 'ไม่ระบุผล';
    if (match.team_a_score === match.team_b_score) return 'เสมอ';
    return match.team_a_score > match.team_b_score ? 'ทีม A ชนะ' : 'ทีม B ชนะ';
}
