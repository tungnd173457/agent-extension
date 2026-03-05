// Browser Agent - State Extractor
// Extracts current browser state for the agent's LLM context
// Now uses the dom/ module's buildDOMTree for richer DOM analysis.

import type { BrowserStateSummary, ScrollInfo } from '../types/agent-types';
import { buildDOMTree } from '../dom';

// ============================================================
// Helper: Execute script in tab
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

// ============================================================
// State Extractor
// ============================================================

export async function extractBrowserState(
    maxElementsLength: number = 40000,
    useVision: boolean = true
): Promise<BrowserStateSummary> {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');

    // Execute DOM analysis in page context using buildDOMTree
    const domData = await executeInTab(tab.id, buildDOMTree, [{}]);

    // Truncate if needed
    let elementsText = domData.domTreeText;
    if (elementsText.length > maxElementsLength) {
        elementsText = elementsText.slice(0, maxElementsLength) + '\n... [truncated]';
    }

    // Build scroll info
    const scrollInfo: ScrollInfo = {
        scrollY: domData.scrollInfo.scrollTop,
        scrollHeight: domData.scrollInfo.scrollHeight,
        viewportHeight: domData.scrollInfo.viewportHeight,
        pagesAbove: domData.scrollInfo.pagesAbove,
        pagesBelow: domData.scrollInfo.pagesBelow,
    };

    // Capture screenshot if vision is enabled
    let screenshot: string | undefined;
    if (useVision) {
        try {
            screenshot = await chrome.tabs.captureVisibleTab(undefined as any, { format: 'png' });
        } catch {
            // Screenshot may fail (e.g., chrome:// pages)
        }
    }

    return {
        url: domData.url,
        title: domData.title,
        elementsText,
        elementCount: domData.interactiveCount,
        scrollInfo,
        screenshot,
    };
}

/**
 * Get raw text from elements for fingerprinting (used by loop detector)
 */
export async function getRawPageText(): Promise<string> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return '';

    try {
        return await executeInTab(tab.id, () => {
            const body = document.body;
            if (!body) return '';
            return (body.innerText || '').slice(0, 5000);
        });
    } catch {
        return '';
    }
}
