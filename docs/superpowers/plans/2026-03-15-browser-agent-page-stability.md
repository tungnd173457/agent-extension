# Browser Agent Page Stability & Stale DOM Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs where the browser agent captures stale page state and clicks wrong elements on SPAs.

**Architecture:** Add a hybrid network-idle + DOM-fingerprint stability detection layer between actions and state capture. Clear stale `data-ba-idx` attributes before each DOM tree build to prevent index collisions on SPAs.

**Tech Stack:** Chrome Extension APIs (`chrome.webRequest`, `chrome.scripting`, `chrome.tabs`), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-15-browser-agent-page-stability-design.md`

---

## Chunk 1: Stale `data-ba-idx` Cleanup + Config Changes

### Task 1: Clear stale `data-ba-idx` attributes in `buildDOMTree()`

**Files:**
- Modify: `src/services/browser-agent/dom/dom-tree-builder.ts:32-34`

- [ ] **Step 1: Add cleanup at top of `buildDOMTree()`**

In `dom-tree-builder.ts`, right after the opening `{` of the function (line 32), before `const maxDepth = ...` (line 33), add:

```typescript
    // Clear stale data-ba-idx attributes from previous runs.
    // On SPAs, old elements persist in the DOM with outdated indices.
    // querySelector('[data-ba-idx="N"]') could return the wrong element
    // if multiple elements share the same index from different runs.
    document.querySelectorAll('[data-ba-idx]').forEach(el => {
        el.removeAttribute('data-ba-idx');
    });
```

- [ ] **Step 2: Build to verify no TypeScript errors**

Run: `cd /home/boltbolt/Desktop/side-agent && npm run build`
Expected: Build succeeds with no errors in `dom-tree-builder.ts`

- [ ] **Step 3: Commit**

```bash
git add src/services/browser-agent/dom/dom-tree-builder.ts
git commit -m "fix: clear stale data-ba-idx attributes before DOM tree rebuild

On SPAs like YouTube, elements from previous page states persist in the
DOM with outdated data-ba-idx attributes. This caused querySelector to
return stale elements instead of current ones, making the agent click
wrong elements."
```

---

### Task 2: Add stability config fields to `AgentConfig`

**Files:**
- Modify: `src/services/browser-agent/types/agent-types.ts:8-46`

- [ ] **Step 1: Add three optional fields to `AgentConfig` interface**

In `agent-types.ts`, add these fields at the end of the `AgentConfig` interface (before the closing `}`), after the `compactTriggerChars` field (line 32):

```typescript
    /** Network quiet period before declaring idle (ms) */
    networkQuietMs?: number;
    /** Extra wait if DOM unchanged after network idle (ms) */
    domConfirmMs?: number;
    /** Max total wait for page stability (ms) */
    stabilityTimeoutMs?: number;
```

- [ ] **Step 2: Add defaults to `DEFAULT_AGENT_CONFIG`**

In `agent-types.ts`, add these defaults at the end of `DEFAULT_AGENT_CONFIG` (before the closing `}`), after `compactTriggerChars: 40000,` (line 45):

```typescript
    networkQuietMs: 500,
    domConfirmMs: 500,
    stabilityTimeoutMs: 8000,
```

- [ ] **Step 3: Build to verify no TypeScript errors**

Run: `cd /home/boltbolt/Desktop/side-agent && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/services/browser-agent/types/agent-types.ts
git commit -m "feat: add page stability config fields to AgentConfig"
```

---

### Task 3: Add `webRequest` permission to manifest

**Files:**
- Modify: `public/manifest.json:6-13`

- [ ] **Step 1: Add `webRequest` to permissions array**

In `manifest.json`, add `"webRequest"` to the `permissions` array (after `"scripting"` on line 12):

```json
    "permissions": [
        "storage",
        "activeTab",
        "sidePanel",
        "tabs",
        "cookies",
        "scripting",
        "webRequest"
    ],
```

- [ ] **Step 2: Commit**

```bash
git add public/manifest.json
git commit -m "feat: add webRequest permission for network idle tracking"
```

---

## Chunk 2: Network Idle Tracker

### Task 4: Create `NetworkIdleTracker`

**Files:**
- Create: `src/services/browser-agent/core/network-idle-tracker.ts`

- [ ] **Step 1: Create the network idle tracker file**

Create `src/services/browser-agent/core/network-idle-tracker.ts` with the following content:

```typescript
// Browser Agent - Network Idle Tracker
// Monitors chrome.webRequest events to detect when network activity has settled.
// Used by waitForPageStable() to know when data fetching is complete.

// ============================================================
// Noise Filters
// ============================================================

/** URL patterns to ignore (analytics, ads, tracking) */
const NOISE_URL_PATTERNS = [
    'google-analytics.com',
    'googletagmanager.com',
    'doubleclick.net',
    'facebook.com/tr',
    'connect.facebook.net',
    'bat.bing.com',
    'hotjar.com',
    'mixpanel.com',
    'segment.io',
    'segment.com',
    'sentry.io',
    'newrelic.com',
    'nr-data.net',
    'clarity.ms',
    'plausible.io',
    'amplitude.com',
];

/** Resource types to track (meaningful content requests) */
const TRACKED_RESOURCE_TYPES: chrome.webRequest.ResourceType[] = [
    'main_frame',
    'sub_frame',
    'script',
    'xmlhttprequest',
];

function isNoiseUrl(url: string): boolean {
    return NOISE_URL_PATTERNS.some(pattern => url.includes(pattern));
}

// ============================================================
// NetworkIdleTracker
// ============================================================

export class NetworkIdleTracker {
    private pendingRequests = new Map<string, number>(); // requestId → timestamp
    private tabId: number | null = null;

    // Bound listener references for cleanup
    private onBeforeRequestListener: ((details: chrome.webRequest.WebRequestBodyDetails) => void) | null = null;
    private onCompletedListener: ((details: chrome.webRequest.WebResponseCacheDetails) => void) | null = null;
    private onErrorListener: ((details: chrome.webRequest.WebResponseErrorDetails) => void) | null = null;

    /**
     * Start tracking network requests for a specific tab.
     */
    start(tabId: number): void {
        this.stop(); // Clean up any previous tracking
        this.tabId = tabId;
        this.pendingRequests.clear();

        const filter: chrome.webRequest.RequestFilter = {
            urls: ['<all_urls>'],
            tabId,
            types: TRACKED_RESOURCE_TYPES,
        };

        this.onBeforeRequestListener = (details) => {
            if (!isNoiseUrl(details.url)) {
                this.pendingRequests.set(details.requestId, Date.now());
            }
        };

        this.onCompletedListener = (details) => {
            this.pendingRequests.delete(details.requestId);
        };

        this.onErrorListener = (details) => {
            this.pendingRequests.delete(details.requestId);
        };

        chrome.webRequest.onBeforeRequest.addListener(this.onBeforeRequestListener, filter);
        chrome.webRequest.onCompleted.addListener(this.onCompletedListener, filter);
        chrome.webRequest.onErrorOccurred.addListener(this.onErrorListener, filter);
    }

    /**
     * Stop tracking and remove all listeners.
     */
    stop(): void {
        if (this.onBeforeRequestListener) {
            chrome.webRequest.onBeforeRequest.removeListener(this.onBeforeRequestListener);
            this.onBeforeRequestListener = null;
        }
        if (this.onCompletedListener) {
            chrome.webRequest.onCompleted.removeListener(this.onCompletedListener);
            this.onCompletedListener = null;
        }
        if (this.onErrorListener) {
            chrome.webRequest.onErrorOccurred.removeListener(this.onErrorListener);
            this.onErrorListener = null;
        }
        this.pendingRequests.clear();
        this.tabId = null;
    }

    /**
     * Clear all pending requests. Call before an action to start fresh.
     */
    resetPending(): void {
        this.pendingRequests.clear();
    }

    /**
     * Get the number of currently pending requests.
     */
    getPendingCount(): number {
        // Purge stale requests older than 30 seconds (stuck/leaked)
        const staleThreshold = Date.now() - 30000;
        for (const [id, timestamp] of this.pendingRequests) {
            if (timestamp < staleThreshold) {
                this.pendingRequests.delete(id);
            }
        }
        return this.pendingRequests.size;
    }

    /**
     * Wait until network is idle (0 pending requests for quietPeriodMs).
     * Resolves immediately if already idle, or after timeoutMs.
     */
    waitForIdle(
        quietPeriodMs: number = 500,
        timeoutMs: number = 8000
    ): Promise<{ idle: boolean; timedOut: boolean }> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            let lastActiveTime = Date.now(); // last time we saw pending > 0

            const check = () => {
                const elapsed = Date.now() - startTime;

                if (elapsed >= timeoutMs) {
                    resolve({ idle: false, timedOut: true });
                    return;
                }

                const pending = this.getPendingCount();

                if (pending > 0) {
                    lastActiveTime = Date.now();
                    setTimeout(check, 100);
                    return;
                }

                // pending === 0
                const quietDuration = Date.now() - lastActiveTime;
                if (quietDuration >= quietPeriodMs) {
                    resolve({ idle: true, timedOut: false });
                    return;
                }

                // Still in quiet window, keep checking
                setTimeout(check, 100);
            };

            check();
        });
    }
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

Run: `cd /home/boltbolt/Desktop/side-agent && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/services/browser-agent/core/network-idle-tracker.ts
git commit -m "feat: add NetworkIdleTracker for monitoring tab network activity

Tracks chrome.webRequest events filtered by tabId and resource type.
Filters out analytics/ads noise. Provides waitForIdle() that resolves
when no pending requests exist for a configurable quiet period."
```

---

## Chunk 3: DOM Fingerprint + Page Stability Orchestrator

### Task 5: Add `captureInteractiveDOMFingerprint()` to dom-actions

**Files:**
- Modify: `src/services/browser-agent/dom/dom-actions.ts:1-5`

- [ ] **Step 1: Add the fingerprint function**

Add the following function at the end of `dom-actions.ts` (after the `fillFormFields` function, before the final comment block at line 659):

```typescript
// ============================================================
// DOM Fingerprint
// ============================================================

/**
 * Capture a lightweight fingerprint of interactive DOM elements.
 * Used to detect meaningful page changes (not full DOM serialization).
 * Runs in page context — must be fully self-contained (no imports).
 */
export function captureInteractiveDOMFingerprint(): string {
    const selector = 'a, button, input, textarea, select, [role]';
    const elements = document.querySelectorAll(selector);
    const parts: string[] = [];

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as HTMLElement;

        // Skip hidden elements
        if (el.offsetParent === null && el.tagName.toLowerCase() !== 'body') continue;

        const tag = el.tagName.toLowerCase();
        const text = (el.textContent || '').trim().slice(0, 50);
        const id = el.id || '';
        const cls = el.className && typeof el.className === 'string'
            ? el.className.slice(0, 40)
            : '';
        const role = el.getAttribute('role') || '';

        parts.push(`${tag}|${id}|${cls}|${role}|${text}`);
    }

    // djb2 hash of concatenated parts
    const str = parts.join('\n');
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
    }
    return hash.toString(36);
}
```

- [ ] **Step 2: Build to verify no TypeScript errors**

Run: `cd /home/boltbolt/Desktop/side-agent && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/services/browser-agent/dom/dom-actions.ts
git commit -m "feat: add captureInteractiveDOMFingerprint for page change detection

Lightweight function that hashes interactive elements (a, button, input,
textarea, select, [role]) by tag/id/class/role/text. Used to detect
whether the page has meaningfully changed after an action."
```

---

### Task 6: Create `waitForPageStable()` orchestrator

**Files:**
- Create: `src/services/browser-agent/core/page-stability.ts`

- [ ] **Step 1: Create the page stability orchestrator**

Create `src/services/browser-agent/core/page-stability.ts`:

```typescript
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
```

- [ ] **Step 2: Build to verify no TypeScript errors**

Run: `cd /home/boltbolt/Desktop/side-agent && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/services/browser-agent/core/page-stability.ts
git commit -m "feat: add waitForPageStable() combining network idle + DOM fingerprint

Orchestrates page stability detection:
1. Wait for network idle (no pending requests for quiet period)
2. Compare DOM fingerprint to pre-action state
3. Extra wait for framework rendering if DOM unchanged
4. Max timeout prevents infinite waiting"
```

---

## Chunk 4: Agent Service Integration

### Task 7: Integrate stability detection into the agent loop

**Files:**
- Modify: `src/services/browser-agent/core/agent-service.ts:1-402`

This is the main integration task. It modifies the agent loop to:
1. Create and manage a `NetworkIdleTracker` instance
2. Capture pre-action DOM fingerprints
3. Wait for page stability after actions
4. Replace the 500ms inter-action delay

- [ ] **Step 1: Add imports**

In `agent-service.ts`, add these imports after the existing imports (after line 19):

```typescript
import { NetworkIdleTracker } from './network-idle-tracker';
import { waitForPageStable, captureFingerprint } from './page-stability';
```

- [ ] **Step 2: Add `networkTracker` field to `BrowserAgentRunner`**

In the class definition (after `private messageManager: MessageManager;` on line 30), add:

```typescript
    private networkTracker: NetworkIdleTracker;
```

- [ ] **Step 3: Initialize tracker in constructor**

In the constructor (after `this.messageManager = new MessageManager(...)` on line 48), add:

```typescript
        this.networkTracker = new NetworkIdleTracker();
```

- [ ] **Step 4: Add `isPageChangingAction` and `wasPageChangingAction` methods**

Add these two private methods after the `isRunning()` method (after line 70):

```typescript
    /**
     * Check if a specific action may trigger a page change (navigation or SPA update).
     */
    private isPageChangingAction(toolName: string, params: Record<string, any>): boolean {
        if (['click-element', 'go-back', 'select-dropdown-option'].includes(toolName)) return true;
        if (toolName === 'type-text' && params.pressEnter === true) return true;
        if (toolName === 'send-keys' && typeof params.keys === 'string' && params.keys.includes('Enter')) return true;
        return false;
    }

    /**
     * Check if any action in the list may trigger a page change.
     */
    private wasPageChangingAction(actions: AgentAction[]): boolean {
        return actions.some(action => {
            const entries = Object.entries(action);
            if (entries.length === 0) return false;
            const [toolName, params] = entries[0];
            return this.isPageChangingAction(toolName, params);
        });
    }
```

- [ ] **Step 5: Start/stop tracker in `run()` method**

In the `run()` method, add tracker start right after the `try {` on line 85 (before the `while` loop):

```typescript
            // Start tracking network requests for the active tab
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab?.id) {
                this.networkTracker.start(activeTab.id);
            }
```

Add a `finally` block after the existing `catch` block (after line 224) to ensure the tracker is always cleaned up:

```typescript
         finally {
            this.networkTracker.stop();
        }
```

- [ ] **Step 6: Add pre-action fingerprint capture and post-action stability wait**

In the main loop, after the LLM call and before `executeActions()`. Find this code (around line 147):

```typescript
                    // ═══════════════════════════════════════
                    // Phase 3: Execute actions
                    // ═══════════════════════════════════════
                    const results = await this.executeActions(brain.action);
```

Replace with:

```typescript
                    // ═══════════════════════════════════════
                    // Phase 3: Execute actions
                    // ═══════════════════════════════════════

                    // Capture pre-action DOM fingerprint for stability detection
                    let preActionFingerprint = '';
                    if (this.wasPageChangingAction(brain.action)) {
                        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (currentTab?.id) {
                            preActionFingerprint = await captureFingerprint(currentTab.id);
                            this.networkTracker.resetPending();
                        }
                    }

                    const results = await this.executeActions(brain.action);

                    // Wait for page stability after page-changing actions
                    if (preActionFingerprint) {
                        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (currentTab?.id) {
                            const stabilityResult = await waitForPageStable(
                                currentTab.id,
                                this.networkTracker,
                                preActionFingerprint,
                                {
                                    networkQuietMs: this.config.networkQuietMs,
                                    domConfirmMs: this.config.domConfirmMs,
                                    maxTimeoutMs: this.config.stabilityTimeoutMs,
                                },
                            );
                            console.log(`⏳ Page stability: stable=${stabilityResult.stable}, changed=${stabilityResult.changed}, duration=${stabilityResult.durationMs}ms`);
                        }
                    }
```

- [ ] **Step 7: Replace the 500ms inter-action delay in `executeActions()`**

Find this code in `executeActions()` (lines 362-367):

```typescript
                // If page might have changed (navigate, click), wait briefly before next action
                const pageChangingTools = ['navigate', 'go-back', 'click-element'];
                if (pageChangingTools.includes(toolName) && i < actions.length - 1) {
                    // Small delay to let the page settle
                    await new Promise(r => setTimeout(r, 500));
                }
```

Replace with:

```typescript
                // If page might have changed, wait for stability before next action
                if (this.isPageChangingAction(toolName, params) && i < actions.length - 1) {
                    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (currentTab?.id) {
                        const midFingerprint = await captureFingerprint(currentTab.id);
                        this.networkTracker.resetPending();
                        await waitForPageStable(
                            currentTab.id,
                            this.networkTracker,
                            midFingerprint,
                            {
                                networkQuietMs: this.config.networkQuietMs,
                                domConfirmMs: this.config.domConfirmMs,
                                maxTimeoutMs: this.config.stabilityTimeoutMs,
                            },
                        );
                    }
                }
```

- [ ] **Step 8: Build to verify no TypeScript errors**

Run: `cd /home/boltbolt/Desktop/side-agent && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 9: Commit**

```bash
git add src/services/browser-agent/core/agent-service.ts
git commit -m "feat: integrate page stability detection into agent loop

- Capture DOM fingerprint before page-changing actions
- Wait for network idle + DOM change after actions complete
- Replace fixed 500ms delay with proper stability detection
- Expanded page-changing detection: click, go-back, type+Enter,
  send-keys+Enter, select-dropdown-option"
```

---

## Chunk 5: Manual Verification

### Task 8: Build and load extension for manual testing

- [ ] **Step 1: Full build**

Run: `cd /home/boltbolt/Desktop/side-agent && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Load extension in Chrome**

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked" → select `dist/` folder
4. Verify extension loads without errors (check for permission warnings about `webRequest`)

- [ ] **Step 3: Test scenario — YouTube search (Bug 1 & 2)**

1. Open YouTube in a tab
2. Start the browser agent with task: "Search for 'typescript tutorial' on YouTube"
3. Observe console logs for `⏳ Page stability:` messages
4. Verify the agent waits for search results to load before capturing state
5. Verify the agent sees and interacts with the search results page, not the homepage

- [ ] **Step 4: Test scenario — YouTube video navigation (Bug 3)**

1. Start the browser agent with task: "Go to YouTube, search for 'javascript tutorial', and click the second video result"
2. Verify that after clicking a video, the correct video opens (not a stale element from a previous page)
3. Check console logs to confirm `data-ba-idx` cleanup is happening (no duplicate index warnings)

- [ ] **Step 5: Test scenario — Non-navigating action (no false delay)**

1. Start the browser agent with task: "Go to YouTube and scroll down"
2. Verify the scroll action does not trigger an unnecessary 8-second wait
3. The `isPageChangingAction` check should skip `scroll` actions

- [ ] **Step 6: Final commit with any fixes from manual testing**

If manual testing reveals issues, fix them and commit with descriptive messages.
