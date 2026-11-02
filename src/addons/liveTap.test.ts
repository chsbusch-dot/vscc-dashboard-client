import { describe, expect, it, vi } from 'vitest';
import { subscribeWaveform, tapLiveMessage } from './liveTap';

const sample = (physio_id: string, time: number) => ({ time, physio_id, value: 1 });

describe('tapLiveMessage', () => {
    it('delivers only the requested ids and stops after unsubscribe', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeWaveform(['SYN_A'], listener);

        tapLiveMessage('synthetic/t', [sample('SYN_A', 1), sample('SYN_B', 1)]);
        tapLiveMessage('synthetic/t', sample('SYN_B', 2));
        unsubscribe();
        tapLiveMessage('synthetic/t', sample('SYN_A', 3));

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ topic: 'synthetic/t', samples: [sample('SYN_A', 1)] });
    });

    it('skips malformed samples and keeps going when a listener throws', () => {
        const failing = subscribeWaveform(['SYN_A'], () => { throw new Error('synthetic failure'); });
        const listener = vi.fn();
        const healthy = subscribeWaveform(['SYN_A'], listener);
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        tapLiveMessage('synthetic/t', [{ physio_id: 'SYN_A' }, sample('SYN_A', 4)]);

        expect(listener).toHaveBeenCalledWith({ topic: 'synthetic/t', samples: [sample('SYN_A', 4)] });
        expect(consoleError).toHaveBeenCalledOnce();
        consoleError.mockRestore();
        failing();
        healthy();
    });
});
