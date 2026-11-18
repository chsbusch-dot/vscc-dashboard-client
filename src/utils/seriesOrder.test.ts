import { describe, expect, it } from 'vitest';
import { familyOrder, groupByFamily } from './seriesOrder';

const FAMILY: Record<string, string | undefined> = { a1: 'A', a2: 'A', a3: 'A', b1: 'B', b2: 'B' };
const group = (ids: string[]) => groupByFamily(ids, id => FAMILY[id]);

describe('groupByFamily', () => {
    it('pulls each family into one block where its first member stood', () => {
        expect(group(['x', 'a1', 'y', 'b1', 'a2', 'z', 'b2', 'a3'])).toEqual(['x', 'a1', 'a2', 'a3', 'y', 'b1', 'b2', 'z']);
    });

    it('keeps the relative order of the items without a family', () => {
        const out = group(['x', 'a1', 'y', 'a2', 'z']);
        expect(out.filter(id => FAMILY[id] === undefined)).toEqual(['x', 'y', 'z']);
    });

    it('leaves a list without families, or an already grouped one, unchanged', () => {
        expect(group(['x', 'y', 'z'])).toEqual(['x', 'y', 'z']);
        expect(group(['x', 'a1', 'a2', 'b1', 'b2'])).toEqual(['x', 'a1', 'a2', 'b1', 'b2']);
        expect(group([])).toEqual([]);
    });
});

describe('familyOrder', () => {
    it('lists each family once, in order of first appearance, skipping unset ones', () => {
        expect(familyOrder([undefined, 'B', 'A', undefined, 'B', 'C'])).toEqual(['B', 'A', 'C']);
        expect(familyOrder([undefined])).toEqual([]);
    });
});
