'use strict';

function createCleanupController(cleanup, quit) {
    let started = false;
    let finished = false;

    const beforeQuit = (event) => {
        if (finished) return;

        // Every quit attempt must remain cancelled while cleanup is pending.
        // Electron may emit another before-quit after window-all-closed.
        event.preventDefault();
        if (started) return;
        started = true;

        let cleanupResult;
        try {
            cleanupResult = cleanup();
        } catch {
            cleanupResult = undefined;
        }

        Promise.resolve(cleanupResult)
            .catch(() => {})
            .finally(() => {
                finished = true;
                quit();
            });
    };

    return { beforeQuit };
}

module.exports = { createCleanupController };
