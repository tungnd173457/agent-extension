// Browser Agent - Page Stability Detection
// Combines network idle + DOM fingerprint to determine when a page
// has finished updating after an action.

import { NetworkIdleTracker } from './network-idle-tracker';
import { captureInteractiveDOMFingerprint } from '../dom/dom-actions';

// ============================================================
// Helper: Execute script in tab (duplicated for module isolation)
// ============================================================

async function executeInTab<T>(tabId: number, func: (...args: any[]) => T, args: any[] = []): Promise<T> {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func,
        args,
    });
    if (!results || results.length === 0) throw new Error('Script execution returned no results');
    return results[0].result as T;
}

/**
 * Try to capture DOM fingerprint with retries.
 * During navigation, executeInTab may fail because the page context is being rebuilt.
 */
async function safeCaptureFingerprint(tabId: number, maxRetries: number = 3): Promise<string | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await executeInTab(tabId, captureInteractiveDOMFingerprint);
        } catch {
            if (attempt < maxRetries - 1) {
                await new Promise(r => setTimeout(r, 200));
            }
        }
    }
    return null;
}

// ============================================================
// Page Stability
// ============================================================

export interface PageStabilityOptions {
    /** Network quiet period before declaring idle (ms). Default: 500 */
    networkQuietMs?: number;
    /** Extra wait if DOM unchanged after network idle (ms). Default: 500 */
    domConfirmMs?: number;
    /** Max total wait for page stability (ms). Default: 8000 */
    maxTimeoutMs?: number;
}

export interface PageStabilityResult {
    /** Whether the page stabilized within the timeout */
    stable: boolean;
    /** Whether the DOM fingerprint changed from pre-action */
    changed: boolean;
    /** Whether the max timeout was reached */
    timedOut: boolean;
    /** Total time spent waiting (ms) */
    durationMs: number;
}

/**
 * Wait for a page to stabilize after an action.
 *
 * Strategy:
 * 1. Wait for network idle (no pending requests for networkQuietMs)
 * 2. Capture DOM fingerprint and compare to pre-action fingerprint
 * 3. If DOM changed → stable
 * 4. If DOM unchanged → wait domConfirmMs for framework rendering, re-check
 * 5. Max timeout prevents infinite waiting
 */
export async function waitForPageStable(
    tabId: number,
    networkTracker: NetworkIdleTracker,
    preActionFingerprint: string,
    options?: PageStabilityOptions,
): Promise<PageStabilityResult> {
    const networkQuietMs = options?.networkQuietMs ?? 500;
    const domConfirmMs = options?.domConfirmMs ?? 500;
    const maxTimeoutMs = options?.maxTimeoutMs ?? 8000;

    const startTime = Date.now();

    // Step 1: Wait for network idle
    const remainingForNetwork = maxTimeoutMs - (Date.now() - startTime);
    const networkResult = await networkTracker.waitForIdle(networkQuietMs, remainingForNetwork);

    // Step 2: Check DOM fingerprint
    const postFingerprint = await safeCaptureFingerprint(tabId);

    if (postFingerprint !== null && postFingerprint !== preActionFingerprint) {
        // DOM changed and network is idle — page is stable
        return {
            stable: true,
            changed: true,
            timedOut: false,
            durationMs: Date.now() - startTime,
        };
    }

    // Step 3: DOM hasn't changed yet — maybe framework hasn't rendered.
    // Wait domConfirmMs and re-check.
    const remainingForDom = maxTimeoutMs - (Date.now() - startTime);
    if (remainingForDom > 0) {
        await new Promise(r => setTimeout(r, Math.min(domConfirmMs, remainingForDom)));

        const finalFingerprint = await safeCaptureFingerprint(tabId);
        const changed = finalFingerprint !== null && finalFingerprint !== preActionFingerprint;

        return {
            stable: true,
            changed,
            timedOut: networkResult.timedOut,
            durationMs: Date.now() - startTime,
        };
    }

    // Max timeout reached
    return {
        stable: false,
        changed: false,
        timedOut: true,
        durationMs: Date.now() - startTime,
    };
}

/**
 * Capture the current interactive DOM fingerprint for a tab.
 * Convenience wrapper used by agent-service before executing actions.
 */
export async function captureFingerprint(tabId: number): Promise<string> {
    const result = await safeCaptureFingerprint(tabId);
    return result ?? '';
}
