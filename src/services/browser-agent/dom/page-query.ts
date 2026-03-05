// Browser Agent - DOM Page Query Utilities
// Functions for querying and searching page content.
// Moved from dom-utils.ts — these are analysis functions (not actions).
// Run in page context via chrome.scripting.executeScript.

// ============================================================
// Types
// ============================================================

export interface SearchMatch {
    matchText: string;
    context: string;
    elementPath: string;
    charPosition: number;
}

export interface SearchResult {
    matches: SearchMatch[];
    total: number;
    hasMore: boolean;
}

export interface FoundElement {
    index: number;
    tag: string;
    text?: string;
    attrs?: Record<string, string>;
    childrenCount: number;
}

export interface FindResult {
    elements: FoundElement[];
    total: number;
    showing: number;
}

export interface LinkInfo {
    url: string;
    text: string;
    isExternal: boolean;
}

export interface PageMetadata {
    url: string;
    title: string;
    description?: string;
    keywords?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    canonical?: string;
    lang?: string;
    favicon?: string;
}

// ============================================================
// Search Page Text
// ============================================================

/**
 * Search page text for a pattern (like grep).
 * Uses TreeWalker for efficient text node traversal.
 *
 * @param pattern - Search string or regex pattern
 * @param regex - Whether pattern is a regex
 * @param caseSensitive - Case-sensitive search
 * @param contextChars - Characters of context around each match
 * @param cssScope - CSS selector to limit search scope
 * @param maxResults - Maximum matches to return
 */
export function searchPageText(
    pattern: string,
    regex: boolean = false,
    caseSensitive: boolean = false,
    contextChars: number = 150,
    cssScope: string | null = null,
    maxResults: number = 25
): SearchResult {
    try {
        function _buildCssPath(el: Element): string {
            const parts: string[] = [];
            let current: Element | null = el;
            while (current && current !== document.body && current !== document.documentElement) {
                let desc = current.tagName.toLowerCase();
                if (current.id) {
                    desc += `#${current.id}`;
                } else if (current.className && typeof current.className === 'string') {
                    const classes = current.className.trim().split(/\s+/).slice(0, 2).join('.');
                    if (classes) desc += `.${classes}`;
                }
                parts.unshift(desc);
                current = current.parentElement;
            }
            return parts.join(' > ');
        }

        const scope = cssScope ? document.querySelector(cssScope) : document.body;
        if (!scope) {
            return { matches: [], total: 0, hasMore: false };
        }

        // Collect all text via TreeWalker
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        let fullText = '';
        const nodeOffsets: { offset: number; length: number; node: Node }[] = [];

        while (walker.nextNode()) {
            const node = walker.currentNode;
            const text = node.textContent;
            if (text && text.trim()) {
                nodeOffsets.push({ offset: fullText.length, length: text.length, node });
                fullText += text;
            }
        }

        // Build regex
        let re: RegExp;
        const flags = caseSensitive ? 'g' : 'gi';
        if (regex) {
            re = new RegExp(pattern, flags);
        } else {
            re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
        }

        // Find matches
        const matches: SearchMatch[] = [];
        let match: RegExpExecArray | null;
        let totalFound = 0;

        while ((match = re.exec(fullText)) !== null) {
            totalFound++;

            if (matches.length < maxResults) {
                const start = Math.max(0, match.index - contextChars);
                const end = Math.min(fullText.length, match.index + match[0].length + contextChars);
                const context = fullText.slice(start, end);

                // Find element path for context
                let elementPath = '';
                for (const no of nodeOffsets) {
                    if (no.offset <= match.index && no.offset + no.length > match.index) {
                        elementPath = _buildCssPath(no.node.parentElement!);
                        break;
                    }
                }

                matches.push({
                    matchText: match[0],
                    context: (start > 0 ? '...' : '') + context + (end < fullText.length ? '...' : ''),
                    elementPath,
                    charPosition: match.index,
                });
            }

            if (match[0].length === 0) re.lastIndex++;
        }

        return { matches, total: totalFound, hasMore: totalFound > maxResults };
    } catch {
        return { matches: [], total: 0, hasMore: false };
    }
}

// ============================================================
// Find Elements by Selector
// ============================================================

/**
 * Query DOM elements by CSS selector.
 *
 * @param selector - CSS selector string
 * @param attributes - List of attribute names to include in results
 * @param maxResults - Maximum elements to return
 * @param includeText - Whether to include text content
 */
export function findElementsBySelector(
    selector: string,
    attributes: string[] | null = null,
    maxResults: number = 50,
    includeText: boolean = true
): FindResult {
    try {
        const elements = document.querySelectorAll(selector);
        const total = elements.length;
        const limit = Math.min(total, maxResults);
        const results: FoundElement[] = [];

        for (let i = 0; i < limit; i++) {
            const el = elements[i];
            const item: FoundElement = {
                index: i,
                tag: el.tagName.toLowerCase(),
                childrenCount: el.children.length,
            };

            if (includeText) {
                const text = (el as HTMLElement).textContent?.trim() || '';
                item.text = text.length > 300 ? text.slice(0, 300) + '...' : text;
            }

            if (attributes && attributes.length > 0) {
                item.attrs = {};
                for (const attr of attributes) {
                    const val = el.getAttribute(attr);
                    if (val !== null) {
                        item.attrs[attr] = val.length > 500 ? val.slice(0, 500) + '...' : val;
                    }
                }
            }

            results.push(item);
        }

        return { elements: results, total, showing: limit };
    } catch {
        return { elements: [], total: 0, showing: 0 };
    }
}

// ============================================================
// Extract Links
// ============================================================

/**
 * Extract all links (<a href>) from the page.
 *
 * @param filter - Optional regex/text filter for URLs
 * @param includeText - Whether to include link text
 * @param maxResults - Maximum links to return
 */
export function extractLinks(
    filter?: string,
    includeText: boolean = true,
    maxResults: number = 100
): { links: LinkInfo[]; total: number } {
    const anchors = document.querySelectorAll('a[href]');
    const links: LinkInfo[] = [];
    let filterRegex: RegExp | null = null;

    if (filter) {
        try {
            filterRegex = new RegExp(filter, 'i');
        } catch {
            filterRegex = new RegExp(filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }
    }

    for (const a of anchors) {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;

        let fullUrl: string;
        try {
            fullUrl = new URL(href, window.location.origin).href;
        } catch {
            fullUrl = href;
        }

        if (filterRegex && !filterRegex.test(fullUrl)) continue;

        const isExternal = !fullUrl.startsWith(window.location.origin);

        links.push({
            url: fullUrl,
            text: includeText ? ((a as HTMLElement).innerText?.trim() || '').slice(0, 200) : '',
            isExternal,
        });

        if (links.length >= maxResults) break;
    }

    return { links, total: anchors.length };
}

// ============================================================
// Page Metadata
// ============================================================

/**
 * Get page metadata (title, description, OG tags, canonical, lang, favicon).
 */
export function getPageMetadata(): PageMetadata {
    const getMeta = (name: string): string | undefined => {
        const el = document.querySelector(
            `meta[name="${name}"], meta[property="${name}"], meta[name="${name.toLowerCase()}"]`
        );
        return el?.getAttribute('content') || undefined;
    };

    return {
        url: window.location.href,
        title: document.title,
        description: getMeta('description'),
        keywords: getMeta('keywords'),
        ogTitle: getMeta('og:title'),
        ogDescription: getMeta('og:description'),
        ogImage: getMeta('og:image'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || undefined,
        lang: document.documentElement.lang || undefined,
        favicon: (document.querySelector('link[rel="icon"], link[rel="shortcut icon"]') as HTMLLinkElement)?.href || undefined,
    };
}

// ============================================================
// Internal helpers
// ============================================================
