# Browser Agent Page Stability & Stale DOM Fixes

**Date**: 2026-03-15
**Status**: Approved
**Scope**: `src/services/browser-agent/`

## Problem Statement

Three related bugs in the browser agent cause incorrect element interactions:

1. **No page load waiting**: After actions that trigger navigation or SPA updates (click, type+Enter, form submit), the agent loop immediately captures browser state before the page finishes loading. The agent then makes decisions based on stale page content.

2. **Stale DOM interactions**: Because the agent sees old page state, it may click elements from the previous page. When the new page loads, those clicks execute against wrong elements.

3. **Stale `data-ba-idx` attributes**: `buildDOMTree()` assigns `data-ba-idx` attributes to interactive elements but never clears old ones. On SPAs (YouTube, Gmail, etc.), old elements persist in the DOM with stale indices. `querySelector('[data-ba-idx="99"]')` may return a stale element instead of the current one, causing the agent to interact with the wrong element.

## Fix 1: Network Idle + DOM Change Detection

### Concept

After page-changing actions, wait for the page to stabilize using a hybrid approach:
- **Network idle** as the primary signal (data has arrived)
- **DOM fingerprint change** as confirmation (page has rendered)

### Manifest Change

**File**: `public/manifest.json`

Add `webRequest` permission:

```json
"permissions": [
    "storage",
    "activeTab",
    "sidePanel",
    "tabs",
    "cookies",
    "scripting",
    "webRequest"
]
```

### Network Request Tracker

A persistent tracker in the background script context that monitors `chrome.webRequest` events.

**File**: New file `core/network-idle-tracker.ts`

```typescript
export class NetworkIdleTracker {
    private pendingRequests: Map<string, number>;  // requestId → timestamp
    private tabId: number | null;
    private listeners: { /* stored listener refs for cleanup */ };

    // Listens to chrome.webRequest events filtered by tabId:
    //   onBeforeRequest  → add to pending
    //   onCompleted      → remove from pending
    //   onErrorOccurred  → remove from pending

    // Request type filter (only track meaningful types):
    //   Include: "xmlhttprequest", "sub_frame", "script", "main_frame"
    //   Exclude: "image", "font", "media", "stylesheet", "ping", "websocket"

    // URL noise filter — ignore requests matching patterns:
    //   google-analytics.com, doubleclick.net, facebook.com/tr,
    //   hotjar.com, mixpanel.com, segment.io, sentry.io,
    //   googletagmanager.com, connect.facebook.net, bat.bing.com

    // Public API:
    start(tabId: number): void;          // begin tracking for a tab
    stop(): void;                        // stop tracking, remove listeners
    resetPending(): void;                // clear pending map (call before action)
    getPendingCount(): number;           // number of active requests
    waitForIdle(
        quietPeriodMs: number,           // how long 0 pending must hold (default: 500)
        timeoutMs: number                // max wait (default: 8000)
    ): Promise<{ idle: boolean; timedOut: boolean }>;
}
```

### DOM Fingerprint Function

A lightweight page-context function that captures a hash of interactive elements.

**File**: New function in `dom/dom-actions.ts`

This function runs in page context via `executeInTab()`. It must be fully self-contained (no imports).

```typescript
export function captureInteractiveDOMFingerprint(): string {
    // Query: a, button, input, textarea, select, [role]
    // For each visible element, capture: tagName + textContent(50) + id + className + role
    // Concatenate all → djb2 hash
    // Returns: hash string
}
```

### `waitForPageStable()` Function

Orchestrator that combines network idle + DOM fingerprint. Runs in background script context.

**File**: New file `core/page-stability.ts`

```typescript
import { NetworkIdleTracker } from './network-idle-tracker';
import { captureInteractiveDOMFingerprint } from '../dom/dom-actions';

export async function waitForPageStable(
    tabId: number,
    networkTracker: NetworkIdleTracker,
    preActionFingerprint: string,
    options?: {
        networkQuietMs?: number;      // default: 500
        domConfirmMs?: number;        // default: 500
        maxTimeoutMs?: number;        // default: 8000
    }
): Promise<{ stable: boolean; changed: boolean; timedOut: boolean; durationMs: number }>
```

**Workflow**:
1. Wait for network idle (0 pending requests for `networkQuietMs`)
2. Capture DOM fingerprint via `executeInTab(tabId, captureInteractiveDOMFingerprint)`
3. If DOM fingerprint differs from `preActionFingerprint` → page is stable and changed
4. If DOM hasn't changed → wait extra `domConfirmMs` for framework rendering, then re-check
5. If still unchanged → proceed (action didn't cause a visible page change)
6. Max timeout: `maxTimeoutMs` total across all waiting

**`executeInTab` failure handling**: During mid-navigation, `chrome.scripting.executeScript()` may fail because the page context is being torn down. If this happens, catch the error and retry after 200ms (the new page context will be available shortly). Max 3 retries before proceeding.

### Integration Points (Two Distinct Locations)

**File**: `core/agent-service.ts`

There are two separate integration points:

#### A. Post-step stability wait (between loop iterations)

After `executeActions()` returns and before the next iteration captures state:

```typescript
// In the main loop, after line 147 (executeActions):
const results = await this.executeActions(brain.action);

// NEW: Wait for page stability if any action was page-changing
if (this.wasPageChangingAction(brain.action)) {
    await waitForPageStable(tabId, this.networkTracker, preActionFingerprint, {
        networkQuietMs: this.config.networkQuietMs,
        domConfirmMs: this.config.domConfirmMs,
        maxTimeoutMs: this.config.stabilityTimeoutMs,
    });
}
```

The pre-action fingerprint is captured once before `executeActions()`:

```typescript
// Before executeActions:
const preActionFingerprint = await executeInTab(tabId, captureInteractiveDOMFingerprint);
const results = await this.executeActions(brain.action);
```

#### B. Inter-action stability wait (between actions within a step)

Replace the existing 500ms `setTimeout` inside `executeActions()` (lines 362-367):

```typescript
// BEFORE (remove):
const pageChangingTools = ['navigate', 'go-back', 'click-element'];
if (pageChangingTools.includes(toolName) && i < actions.length - 1) {
    await new Promise(r => setTimeout(r, 500));
}

// AFTER (replace with):
if (this.isPageChangingAction(toolName, params) && i < actions.length - 1) {
    const midFingerprint = await executeInTab(tabId, captureInteractiveDOMFingerprint);
    await waitForPageStable(tabId, this.networkTracker, midFingerprint, {
        networkQuietMs: this.config.networkQuietMs,
        domConfirmMs: this.config.domConfirmMs,
        maxTimeoutMs: this.config.stabilityTimeoutMs,
    });
}
```

### Page-Changing Action Detection

**New private method** on `BrowserAgentRunner`:

```typescript
private isPageChangingAction(toolName: string, params: Record<string, any>): boolean {
    // Always page-changing:
    if (['click-element', 'go-back', 'select-dropdown-option'].includes(toolName)) return true;

    // Conditionally page-changing:
    if (toolName === 'type-text' && params.pressEnter === true) return true;
    if (toolName === 'send-keys' && typeof params.keys === 'string'
        && params.keys.includes('Enter')) return true;

    return false;
}

private wasPageChangingAction(actions: AgentAction[]): boolean {
    return actions.some(action => {
        const [toolName, params] = Object.entries(action)[0];
        return this.isPageChangingAction(toolName, params);
    });
}
```

**Excluded from page-changing**:
- `navigate` — has its own wait via `chrome.tabs.onUpdated`
- `fill-form` — fills fields and dispatches events but does NOT submit; unlikely to trigger navigation

### NetworkIdleTracker Lifecycle

The `NetworkIdleTracker` is created once per `BrowserAgentRunner` instance:

```typescript
constructor(config: AgentConfig) {
    // ... existing code ...
    this.networkTracker = new NetworkIdleTracker();
}

async run() {
    const tab = await getActiveTab();
    this.networkTracker.start(tab.id!);
    try {
        // ... existing loop ...
    } finally {
        this.networkTracker.stop();
    }
}
```

## Fix 2: Clear Stale `data-ba-idx` Attributes

**File**: `dom/dom-tree-builder.ts`

At the start of `buildDOMTree()`, before walking the DOM:

```typescript
// Clear stale indices from previous runs to prevent
// querySelector from returning old elements on SPAs
document.querySelectorAll('[data-ba-idx]').forEach(el => {
    el.removeAttribute('data-ba-idx');
});
```

This ensures only the current run's interactive elements carry indices. No duplicates, no stale references. Performance impact is negligible (~50-200 elements typically matched).

**Race condition note**: This cleanup and the subsequent `setAttribute` calls both run in page context via `executeInTab()`, which executes synchronously on the main thread. Since `clickElementByIndex()` also runs via `executeInTab()` and these calls are awaited sequentially in the agent loop, there is no race between cleanup and lookup.

## Files Changed

| File | Change |
|------|--------|
| `public/manifest.json` | **Add** `webRequest` permission |
| `core/network-idle-tracker.ts` | **New** — Network request tracker |
| `core/page-stability.ts` | **New** — `waitForPageStable()` orchestrator with `executeInTab` retry logic |
| `dom/dom-actions.ts` | **Add** `captureInteractiveDOMFingerprint()` |
| `dom/dom-tree-builder.ts` | **Add** stale `data-ba-idx` cleanup at top of `buildDOMTree()` |
| `core/agent-service.ts` | **Modify** — add `NetworkIdleTracker` lifecycle, pre-action fingerprint capture, post-step and inter-action stability waits, `isPageChangingAction()` helper |
| `types/agent-types.ts` | **Add** 3 optional config fields + `DEFAULT_AGENT_CONFIG` defaults |

## Configuration

New optional fields in `AgentConfig` and `DEFAULT_AGENT_CONFIG`:

```typescript
// In AgentConfig interface:
/** Network quiet period before declaring idle (ms) */
networkQuietMs?: number;
/** Extra wait if DOM unchanged after network idle (ms) */
domConfirmMs?: number;
/** Max total wait for page stability (ms) */
stabilityTimeoutMs?: number;

// In DEFAULT_AGENT_CONFIG:
networkQuietMs: 500,
domConfirmMs: 500,
stabilityTimeoutMs: 8000,
```

## Edge Cases

- **Action causes no page change** (e.g., clicking a no-op button): Network idle resolves quickly (no new requests), DOM fingerprint unchanged. The `domConfirmMs` wait adds 500ms, then proceeds. Total overhead: ~1 second.
- **Persistent connections** (WebSockets, SSE): Filtered out by the network tracker — only `xmlhttprequest`, `sub_frame`, `script`, `main_frame` types are tracked.
- **Rapid background requests** (analytics, ads): Filtered by URL pattern matching in the network tracker.
- **Very slow page loads**: Max timeout of 8 seconds prevents infinite waiting. The agent proceeds with whatever state is available. Configurable via `stabilityTimeoutMs`.
- **`executeInTab` fails during navigation**: Caught and retried up to 3 times with 200ms delay between retries. If all retries fail, proceed without fingerprint confirmation.
- **Iframes**: `chrome.webRequest` fires for all frames in a tab when filtered by `tabId`, so iframe requests are tracked. However, the DOM fingerprint only captures top-frame elements. This is acceptable since the agent's `buildDOMTree` primarily indexes top-frame elements.
