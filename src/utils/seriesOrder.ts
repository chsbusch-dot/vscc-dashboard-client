/**
 * Order helpers for add-on families (WOR-1328): a family is a set of series and
 * panels an add-on wants listed and charted together, such as one modality.
 */

/**
 * `items` in their order, except that each item with a family moves up to follow the
 * first item of that family, so every family forms one contiguous block where its
 * first member stood. Items without a family keep their relative order.
 */
export const groupByFamily = <T>(items: readonly T[], familyOf: (item: T) => string | undefined): T[] => {
    const slots: T[][] = [];
    const blocks = new Map<string, T[]>();
    for (const item of items) {
        const family = familyOf(item);
        if (family === undefined) {
            slots.push([item]);
            continue;
        }
        const block = blocks.get(family);
        if (block) {
            block.push(item);
        } else {
            const fresh = [item];
            blocks.set(family, fresh);
            slots.push(fresh);
        }
    }
    return slots.flat();
};

/** The distinct families in `families`, in order of first appearance, unset ones skipped. */
export const familyOrder = (families: readonly (string | undefined)[]): string[] =>
    [...new Set(families.filter((f): f is string => f !== undefined))];
