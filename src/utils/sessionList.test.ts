import { describe, it, expect } from 'vitest';
import type { SessionInfo } from '../data/sessionsApi';
import { createListRequestGate, removeSession, type ListRequestGate } from './sessionList';

const session = (id: number): SessionInfo => ({
    id,
    label: `Session ${id}`,
    subject_code: null,
    notes: null,
    started_at: 1_000_000 + id * 3600,
    ended_at: 1_000_000 + id * 3600 + 600,
    recording: false,
});

const ids = (list: SessionInfo[]) => list.map(s => s.id);

/** What the drawer's refresh() does with a response: apply it only if fresh. */
const deliver = (gate: ListRequestGate, ticket: number, response: SessionInfo[], current: SessionInfo[]) =>
    gate.accept(ticket) ? response : current;

describe('createListRequestGate', () => {
    it('applies responses that arrive in order', () => {
        const gate = createListRequestGate();
        expect(gate.accept(gate.issue())).toBe(true);
        expect(gate.accept(gate.issue())).toBe(true);
    });

    it('drops a response older than one already applied', () => {
        const gate = createListRequestGate();
        const first = gate.issue();
        const second = gate.issue();
        expect(gate.accept(second)).toBe(true);
        expect(gate.accept(first)).toBe(false);
    });

    it('drops every request issued before invalidate(), but not later ones', () => {
        const gate = createListRequestGate();
        const before = gate.issue();
        gate.invalidate();
        const after = gate.issue();
        expect(gate.accept(before)).toBe(false);
        expect(gate.accept(after)).toBe(true);
    });
});

describe('removeSession', () => {
    it('drops the deleted entry and keeps the rest in order', () => {
        const list = [session(3), session(2), session(1)];
        expect(ids(removeSession(list, 2))).toEqual([3, 1]);
    });

    it('leaves the contents unchanged for an id that is not listed', () => {
        const list = [session(3), session(1)];
        expect(ids(removeSession(list, 2))).toEqual([3, 1]);
    });
});

describe('delete while a poll is in flight (WOR-1016)', () => {
    // The poll left before the delete committed, so the server answered with
    // the deleted session still in the list.
    const before = [session(3), session(2), session(1)];
    const after = [session(3), session(1)];

    it('the entry disappears as soon as the delete succeeds', () => {
        const gate = createListRequestGate();
        gate.issue(); // the poll in flight
        gate.invalidate();
        expect(ids(removeSession(before, 2))).toEqual([3, 1]);
    });

    it('a stale poll arriving after the delete does not bring it back', () => {
        const gate = createListRequestGate();
        const poll = gate.issue();
        gate.invalidate();
        let list = removeSession(before, 2);
        const refresh = gate.issue();

        list = deliver(gate, poll, before, list);
        expect(ids(list)).toEqual([3, 1]);
        list = deliver(gate, refresh, after, list);
        expect(ids(list)).toEqual([3, 1]);
    });

    it('a stale poll arriving after the post-delete refresh is dropped too', () => {
        const gate = createListRequestGate();
        const poll = gate.issue();
        gate.invalidate();
        let list = removeSession(before, 2);
        const refresh = gate.issue();

        list = deliver(gate, refresh, after, list);
        list = deliver(gate, poll, before, list);
        expect(ids(list)).toEqual([3, 1]);
    });

    it('control: without invalidate() the same stale poll would resurrect it', () => {
        const gate = createListRequestGate();
        const poll = gate.issue();
        const list = deliver(gate, poll, before, removeSession(before, 2));
        expect(ids(list)).toEqual([3, 2, 1]);
    });

    it('the next poll after the delete still updates the list', () => {
        const gate = createListRequestGate();
        gate.issue();
        gate.invalidate();
        const next = gate.issue();
        const newer = [session(4), ...after];
        expect(ids(deliver(gate, next, newer, after))).toEqual([4, 3, 1]);
    });
});
