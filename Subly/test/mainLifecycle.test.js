import { describe, expect, it, vi } from 'vitest';
import { createCleanupController } from '../ipc/mainLifecycle.js';

describe('Electron cleanup lifecycle', () => {
    it('keeps quit prevented until asynchronous cleanup has finished', async () => {
        let finishCleanup;
        const cleanup = vi.fn(() => new Promise(resolve => { finishCleanup = resolve; }));
        const quit = vi.fn();
        const controller = createCleanupController(cleanup, quit);
        const firstEvent = { preventDefault: vi.fn() };
        const secondEvent = { preventDefault: vi.fn() };
        const finalEvent = { preventDefault: vi.fn() };

        controller.beforeQuit(firstEvent);
        controller.beforeQuit(secondEvent);

        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(secondEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(quit).not.toHaveBeenCalled();

        finishCleanup();
        await Promise.resolve();
        await Promise.resolve();

        expect(quit).toHaveBeenCalledTimes(1);
        controller.beforeQuit(finalEvent);
        expect(finalEvent.preventDefault).not.toHaveBeenCalled();
    });
});
