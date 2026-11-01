import type { SessionInfo } from '../data/sessionsApi';

/**
 * Orders GET /api/sessions responses so a slow one cannot overwrite newer
 * state (WOR-1016). Each request takes a ticket from `issue()`, and its
 * response (or error) is applied only if `accept(ticket)` says nothing newer
 * was applied since. A local change, such as a confirmed delete, calls
 * `invalidate()`: every request issued before it counts as stale, because it
 * may have been answered before the change reached the database.
 */
export interface ListRequestGate {
    issue: () => number;
    accept: (ticket: number) => boolean;
    invalidate: () => void;
}

export function createListRequestGate(): ListRequestGate {
    let issued = 0;
    let applied = 0;
    return {
        issue: () => ++issued,
        accept: (ticket) => {
            if (ticket <= applied) return false;
            applied = ticket;
            return true;
        },
        invalidate: () => {
            applied = issued;
        },
    };
}

/** The list without the given session (unchanged contents if it is not there). */
export const removeSession = (sessions: SessionInfo[], id: number): SessionInfo[] =>
    sessions.filter(s => s.id !== id);
