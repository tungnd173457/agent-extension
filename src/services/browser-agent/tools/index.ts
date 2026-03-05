// Browser Agent - Tools Service
// Orchestrates all browser automation tools from the background script context.
// Uses dom/ module functions for page-context execution.

import type {
    ToolResult,
    NavigateAction,
    ClickElementAction,
    TypeTextAction,
    ScrollAction,
    SendKeysAction,
    WaitForElementAction,
    WaitForNavigationAction,
    SearchPageAction,
    FindElementsAction,
    GetDropdownOptionsAction,
    SelectDropdownOptionAction,
    EvaluateJSAction,
    CaptureVisibleTabAction,
    ExtractLinksAction,
    HighlightElementAction,
    FillFormAction,
    GetPageTextAction,
    BrowserAgentAction,
} from '../types';

// DOM module imports — these are page-context functions
import { buildDOMTree } from '../dom/dom-tree-builder';
import { extractMarkdown } from '../dom/markdown-extractor';
import {
    clickElementByIndex,
    clickAtCoordinates,
    typeTextByIndex,
    scrollPage,
    sendKeyboardEvent,
    waitForElement,
    getDropdownOptions,
    selectDropdownOption,
    highlightElement,
    fillFormFields,
} from '../dom/dom-actions';
import {
    searchPageText,
    findElementsBySelector,
    extractLinks,
    getPageMetadata,
} from '../dom/page-query';

// ============================================================
// Helper: Get Active Tab
// ============================================================

async function getActiveTab(): Promise<chrome.tabs.Tab> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');
    return tab;
}

// ============================================================
// Helper: Execute script in tab
// ============================================================

async function executeInTab<T>(
    tabId: number,
    func: (...args: any[]) => T,
    args: any[] = []
): Promise<T> {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func,
        args,
    });

    if (!results || results.length === 0) {
        throw new Error('Script execution returned no results');
    }

    const result = results[0];
    if ('error' in result && result.error) {
        throw new Error((result.error as any).message || 'Script execution error');
    }

    return result.result as T;
}

// ============================================================
// Tool: Navigate
// ============================================================

async function navigateTool(params: NavigateAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const url = params.url.startsWith('http') ? params.url : `https://${params.url}`;

        if (params.newTab) {
            const newTab = await chrome.tabs.create({ url });
            return { success: true, data: { url, tabId: newTab.id, description: `Opened ${url} in new tab` } };
        }

        await chrome.tabs.update(tab.id!, { url });

        // Wait for navigation to complete
        return new Promise((resolve) => {
            let resolved = false;
            const listener = (tabId: number, changeInfo: { status?: string }) => {
                if (tabId === tab.id && changeInfo.status === 'complete' && !resolved) {
                    resolved = true;
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve({ success: true, data: { url, description: `Navigated to ${url}` } });
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve({ success: true, data: { url, description: `Navigation started to ${url} (may still be loading)` } });
                }
            }, 10000);
        });
    } catch (e: any) {
        return { success: false, error: `Navigation failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Go Back
// ============================================================

async function goBackTool(): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        await chrome.tabs.goBack(tab.id!);
        return { success: true, data: { description: 'Went back in browser history' } };
    } catch (e: any) {
        return { success: false, error: `Go back failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Get Page Text
// ============================================================

async function getPageTextTool(params?: GetPageTextAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const maxLength = params?.maxLength ?? 100000;
        const includeLinks = params?.includeLinks ?? false;

        const result = await executeInTab(tab.id!, extractMarkdown, [includeLinks, maxLength]);

        // Also get URL and title
        const tabInfo = await chrome.tabs.get(tab.id!);

        return {
            success: true,
            data: {
                url: tabInfo.url,
                title: tabInfo.title,
                text: result.text,
                length: result.length,
            },
        };
    } catch (e: any) {
        return { success: false, error: `Get page text failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Get Elements
// ============================================================

async function getElementsTool(): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, buildDOMTree, [{}]);

        return {
            success: true,
            data: {
                text: result.domTreeText,
                elementCount: result.interactiveCount,
                url: result.url,
                title: result.title,
                description: `Found ${result.interactiveCount} interactive elements`,
            },
        };
    } catch (e: any) {
        return { success: false, error: `Failed to get elements: ${e.message}` };
    }
}

// ============================================================
// Tool: Click Element
// ============================================================

async function clickElementTool(params: ClickElementAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();

        if (params.coordinateX !== undefined && params.coordinateY !== undefined) {
            const result = await executeInTab(tab.id!, clickAtCoordinates, [params.coordinateX, params.coordinateY]);
            return { success: result.success, data: result, error: result.error };
        }

        if (params.index !== undefined) {
            const result = await executeInTab(tab.id!, clickElementByIndex, [params.index]);
            return { success: result.success, data: result, error: result.error };
        }

        if (params.selector) {
            // Click by CSS selector — small inline since dom-actions uses index
            const result = await executeInTab(tab.id!, (sel: string) => {
                const el = document.querySelector(sel) as HTMLElement;
                if (!el) return { success: false, error: `Element not found: ${sel}` };
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.focus(); el.click();
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                return { success: true, description: `Clicked element: ${sel}` };
            }, [params.selector]);
            return { success: result.success, data: result, error: result.error };
        }

        return { success: false, error: 'Must provide index, selector, or coordinates to click' };
    } catch (e: any) {
        return { success: false, error: `Click failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Type Text
// ============================================================

async function typeTextTool(params: TypeTextAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();

        if (params.selector) {
            // Type by selector — small inline
            const result = await executeInTab(tab.id!, (sel: string, text: string, clear: boolean, pressEnter: boolean) => {
                const el = document.querySelector(sel) as HTMLElement;
                if (!el) return { success: false, error: `Element not found: ${sel}` };
                el.focus();
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
                if (isInput) {
                    const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
                    // Use native setter for React compatibility
                    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                    if (clear) inputEl.value = '';
                    if (setter) setter.call(inputEl, clear ? text : inputEl.value + text);
                    else inputEl.value = clear ? text : inputEl.value + text;
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (el.getAttribute('contenteditable') === 'true') {
                    if (clear) el.textContent = '';
                    el.textContent = (el.textContent || '') + text;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    return { success: false, error: `Element is not a text input` };
                }
                if (pressEnter) {
                    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true } as any));
                    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true } as any));
                    const form = el.closest('form');
                    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                }
                return { success: true, description: `Typed "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"` };
            }, [params.selector, params.text, params.clear ?? true, params.pressEnter ?? false]);
            return { success: result.success, data: result, error: result.error };
        }

        // Type by index — use dom-actions
        const result = await executeInTab(tab.id!, typeTextByIndex, [
            params.index ?? 0,
            params.text,
            params.clear ?? true,
            params.pressEnter ?? false,
        ]);

        return { success: result.success, data: result, error: result.error };
    } catch (e: any) {
        return { success: false, error: `Type text failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Scroll
// ============================================================

async function scrollTool(params: ScrollAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, scrollPage, [
            params.direction,
            params.amount,
            params.index,
            params.selector,
        ]);
        return { success: result.success, data: result };
    } catch (e: any) {
        return { success: false, error: `Scroll failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Send Keys
// ============================================================

async function sendKeysTool(params: SendKeysAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, sendKeyboardEvent, [params.keys]);
        return { success: result.success, data: result };
    } catch (e: any) {
        return { success: false, error: `Send keys failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Wait for Element
// ============================================================

async function waitForElementTool(params: WaitForElementAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, waitForElement, [
            params.selector,
            params.timeout ?? 5000,
            params.visible ?? true,
        ]);
        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: `Wait for element failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Wait for Navigation
// ============================================================

async function waitForNavigationTool(params?: WaitForNavigationAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const timeout = params?.timeout ?? 10000;

        return new Promise((resolve) => {
            let resolved = false;
            const listener = (tabId: number, changeInfo: { status?: string }) => {
                if (tabId === tab.id && changeInfo.status === 'complete' && !resolved) {
                    resolved = true;
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve({ success: true, data: { description: 'Navigation completed' } });
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve({ success: true, data: { description: 'Navigation wait timed out', timedOut: true } });
                }
            }, timeout);
        });
    } catch (e: any) {
        return { success: false, error: `Wait for navigation failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Search Page
// ============================================================

async function searchPageTool(params: SearchPageAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, searchPageText, [
            params.pattern,
            params.regex ?? false,
            params.caseSensitive ?? false,
            params.contextChars ?? 150,
            params.cssScope ?? null,
            params.maxResults ?? 25,
        ]);
        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: `Search page failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Find Elements by CSS Selector
// ============================================================

async function findElementsTool(params: FindElementsAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, findElementsBySelector, [
            params.selector,
            params.attributes ?? null,
            params.maxResults ?? 50,
            params.includeText ?? true,
        ]);
        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: `Find elements failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Get Dropdown Options
// ============================================================

async function getDropdownOptionsTool(params: GetDropdownOptionsAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, getDropdownOptions, [
            params.index,
            params.selector,
        ]);
        return { success: result.success, data: result, error: result.error };
    } catch (e: any) {
        return { success: false, error: `Get dropdown options failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Select Dropdown Option
// ============================================================

async function selectDropdownOptionTool(params: SelectDropdownOptionAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, selectDropdownOption, [
            params.index,
            params.selector,
            params.value,
            params.text,
        ]);
        return { success: result.success, data: result, error: result.error };
    } catch (e: any) {
        return { success: false, error: `Select dropdown failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Evaluate JS
// ============================================================

async function evaluateJSTool(params: EvaluateJSAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, (code: string) => {
            try {
                const fn = new Function(code);
                const result = fn();
                if (result && typeof result.then === 'function') {
                    return result.then((v: any) => ({ success: true, result: v }))
                        .catch((e: any) => ({ success: false, error: e.message }));
                }
                return { success: true, result };
            } catch (e: any) {
                return { success: false, error: e.message };
            }
        }, [params.code]);

        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: `Evaluate JS failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Capture Visible Tab
// ============================================================

async function captureVisibleTabTool(params?: CaptureVisibleTabAction): Promise<ToolResult> {
    try {
        const format = params?.format ?? 'png';
        const quality = params?.quality ?? 90;

        const dataUrl = await chrome.tabs.captureVisibleTab(undefined as any, {
            format,
            quality: format === 'jpeg' ? quality : undefined,
        });

        return {
            success: true,
            data: { imageUrl: dataUrl, format, description: 'Captured visible tab screenshot' },
        };
    } catch (e: any) {
        return { success: false, error: `Capture failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Extract Links
// ============================================================

async function extractLinksTool(params?: ExtractLinksAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, extractLinks, [
            params?.filter,
            params?.includeText ?? true,
            params?.maxResults ?? 100,
        ]);
        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: `Extract links failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Get Page Metadata
// ============================================================

async function getPageMetadataTool(): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, getPageMetadata);
        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: `Get metadata failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Highlight Element
// ============================================================

async function highlightElementTool(params: HighlightElementAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, highlightElement, [
            params.index,
            params.selector,
            params.color ?? 'rgba(255,100,0,0.35)',
            params.duration ?? 2000,
        ]);
        return { success: result.success, data: result };
    } catch (e: any) {
        return { success: false, error: `Highlight failed: ${e.message}` };
    }
}

// ============================================================
// Tool: Fill Form
// ============================================================

async function fillFormTool(params: FillFormAction): Promise<ToolResult> {
    try {
        const tab = await getActiveTab();
        const result = await executeInTab(tab.id!, fillFormFields, [params.fields]);
        return { success: result.success, data: result };
    } catch (e: any) {
        return { success: false, error: `Fill form failed: ${e.message}` };
    }
}


// ============================================================
// Main Dispatcher
// ============================================================

export async function handleBrowserAgentAction(action: BrowserAgentAction): Promise<ToolResult> {
    console.log(`🤖 Browser Agent: ${action.tool}`, 'params' in action ? (action as any).params : '');

    try {
        switch (action.tool) {
            case 'navigate':
                return await navigateTool(action.params);
            case 'go-back':
                return await goBackTool();
            case 'get-page-text':
                return await getPageTextTool(action.params);
            case 'get-elements':
                return await getElementsTool();
            case 'click-element':
                return await clickElementTool(action.params);
            case 'type-text':
                return await typeTextTool(action.params);
            case 'scroll':
                return await scrollTool(action.params);
            case 'send-keys':
                return await sendKeysTool(action.params);
            case 'wait-for-element':
                return await waitForElementTool(action.params);
            case 'wait-for-navigation':
                return await waitForNavigationTool(action.params);
            case 'search-page':
                return await searchPageTool(action.params);
            case 'find-elements':
                return await findElementsTool(action.params);
            case 'get-dropdown-options':
                return await getDropdownOptionsTool(action.params);
            case 'select-dropdown-option':
                return await selectDropdownOptionTool(action.params);
            case 'evaluate-js':
                return await evaluateJSTool(action.params);
            case 'capture-visible-tab':
                return await captureVisibleTabTool(action.params);
            case 'extract-links':
                return await extractLinksTool(action.params);
            case 'get-page-metadata':
                return await getPageMetadataTool();
            case 'highlight-element':
                return await highlightElementTool(action.params);
            case 'fill-form':
                return await fillFormTool(action.params);
            default:
                return { success: false, error: `Unknown tool: ${(action as any).tool}` };
        }
    } catch (e: any) {
        return { success: false, error: `Browser Agent error: ${e.message}` };
    }
}
