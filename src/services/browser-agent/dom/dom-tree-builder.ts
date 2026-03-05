// Browser Agent - DOM Tree Builder
// Builds an enhanced DOM tree from the live page DOM.
// Adapted from browser-use's service.py:get_dom_tree and _construct_enhanced_node.
// Runs in page context via chrome.scripting.executeScript.

// ============================================================
// DOM Tree Building
// ============================================================

/**
 * Build a complete DOM tree from the page.
 * This is the main DOM analysis function — designed to run in page context.
 *
 * It walks the entire DOM, identifies interactive elements, builds a simplified tree,
 * and serializes it into text format for LLM consumption.
 *
 * Adapted from browser-use's DomService.get_dom_tree + DOMTreeSerializer.
 */
export function buildDOMTree(options: {
    maxDepth?: number;
    includeAttributes?: string[];
    viewportExpansion?: number;
} = {}): {
    url: string;
    title: string;
    domTreeText: string;
    interactiveCount: number;
    scrollInfo: {
        scrollTop: number;
        scrollHeight: number;
        viewportHeight: number;
        pagesAbove: number;
        pagesBelow: number;
    };
} {
    const maxDepth = options.maxDepth ?? 100;
    const viewportExpansion = options.viewportExpansion ?? 1000; // px beyond viewport to include

    // ---- Constants (inlined for page context) ----

    const INTERACTIVE_TAGS_SET = new Set([
        'a', 'button', 'input', 'textarea', 'select',
        'option', 'details', 'summary', 'optgroup',
    ]);

    const INTERACTIVE_ROLES_SET = new Set([
        'button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
        'option', 'radio', 'switch', 'textbox', 'combobox', 'searchbox',
        'slider', 'spinbutton', 'checkbox', 'listbox', 'treeitem', 'gridcell',
        'row', 'cell', 'search',
    ]);

    const INTERACTIVE_ATTRS_SET = new Set([
        'onclick', 'onmousedown', 'onmouseup', 'onkeydown', 'onkeyup', 'ontouchstart',
        'tabindex', 'ng-click', 'v-on:click', '@click', 'data-action',
        'data-onclick', 'jsaction', '(click)', 'data-ng-click', 'data-ember-action',
    ]);

    // Search element class/id indicators (from browser-use)
    const SEARCH_INDICATORS_SET = new Set([
        'search', 'magnify', 'glass', 'lookup', 'find', 'query',
        'search-icon', 'search-btn', 'search-button', 'searchbox',
    ]);

    const SKIP_TAGS = new Set([
        'script', 'style', 'noscript', 'template',
    ]);

    const SVG_CHILD_TAGS = new Set([
        'path', 'rect', 'g', 'circle', 'ellipse', 'line', 'polyline',
        'polygon', 'use', 'defs', 'clipPath', 'mask', 'pattern', 'image',
        'text', 'tspan',
    ]);

    const INCLUDE_ATTRIBUTES = options.includeAttributes ?? [
        'title', 'type', 'checked', 'id', 'name', 'role', 'value',
        'placeholder', 'alt', 'aria-label', 'aria-expanded', 'aria-checked',
        'aria-selected', 'data-state', 'disabled', 'readonly', 'required',
        'selected', 'href', 'src', 'for', 'action', 'method',
        'pattern', 'min', 'max', 'minlength', 'maxlength', 'step',
        'accept', 'multiple', 'inputmode', 'autocomplete', 'contenteditable',
    ];

    // Elements that propagate bounds to their children.
    // Children fully contained within these elements are NOT indexed separately.
    // Mirrors browser-use's DOMTreeSerializer.PROPAGATING_ELEMENTS.
    const PROPAGATING_ELEMENTS: Array<{ tag: string; role: string | null }> = [
        { tag: 'a', role: null },           // Any <a>
        { tag: 'button', role: null },           // Any <button>
        { tag: 'div', role: 'button' },       // <div role="button">
        { tag: 'div', role: 'combobox' },     // <div role="combobox">
        { tag: 'span', role: 'button' },       // <span role="button">
        { tag: 'span', role: 'combobox' },     // <span role="combobox">
        { tag: 'input', role: 'combobox' },     // <input role="combobox">
    ];
    const CONTAINMENT_THRESHOLD = 0.95; // 95% of child must be within parent bounds

    // ---- Helper functions ----

    /**
     * Comprehensive element visibility check (inlined for page-context self-containment).
     * Synced with isElementVisible() from visibility.ts.
     *
     * For DOM tree building, we skip occlusion and clickability checks (too expensive
     * during full tree walk) but include all CSS, geometry, and HTML attribute checks.
     */
    function isElementVisible(el: Element): boolean {
        // HTML attribute check
        if (el.hasAttribute('hidden')) return false;

        // Collapsed <details> check — content inside closed <details>
        // (other than <summary>) is invisible
        if (!el.closest('summary')) {
            const closestDetails = el.closest('details');
            if (closestDetails && !closestDetails.hasAttribute('open') && closestDetails !== el) {
                return false;
            }
        }

        // Bounding rect check
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;

        // Computed style chain walk — check el and all ancestors
        let current: Element | null = el;
        while (current) {
            try {
                const s = window.getComputedStyle(current);
                if (
                    s.display === 'none' ||
                    s.visibility === 'hidden' ||
                    s.visibility === 'collapse' ||
                    s.opacity === '0'
                ) {
                    return false;
                }
                // CSS clipping techniques (e.g. .sr-only)
                if (
                    s.clip === 'rect(0px, 0px, 0px, 0px)' ||
                    s.clipPath === 'inset(100%)'
                ) {
                    return false;
                }
            } catch {
                break; // getComputedStyle may fail for some elements
            }
            current = current.parentElement;
        }

        // Tiny element with overflow hidden = effectively invisible (e.g. sr-only text)
        if (rect.width <= 1 && rect.height <= 1) {
            try {
                const s = window.getComputedStyle(el);
                if (s.overflow === 'hidden') return false;
            } catch { /* skip */ }
        }

        // Viewport intersection with expansion threshold
        const isIntersecting =
            rect.bottom > -viewportExpansion &&
            rect.right > -viewportExpansion &&
            rect.top < window.innerHeight + viewportExpansion &&
            rect.left < window.innerWidth + viewportExpansion;

        if (!isIntersecting) return false;

        return true;
    }

    /**
     * Check if two rects overlap enough to count as contained.
     * Returns true if childRect is >= threshold fraction inside parentRect.
     */
    function isContainedInBounds(
        child: DOMRect,
        parent: DOMRect,
        threshold: number
    ): boolean {
        const xOverlap = Math.max(0, Math.min(child.right, parent.right) - Math.max(child.left, parent.left));
        const yOverlap = Math.max(0, Math.min(child.bottom, parent.bottom) - Math.max(child.top, parent.top));
        const childArea = child.width * child.height;
        if (childArea <= 0) return false;
        return (xOverlap * yOverlap) / childArea >= threshold;
    }

    function isInteractive(el: Element): boolean {
        const tag = el.tagName.toLowerCase();

        // ── Skip non-interactive containers ──────────────────────────────────
        if (tag === 'html' || tag === 'body') return false;

        // ── role=presentation / role=none = explicitly decorative ─────────────
        const elRole = el.getAttribute('role');
        if (elRole === 'presentation' || elRole === 'none') return false;

        // ── Disabled elements are not interactive ────────────────────────────
        // Note: CDP version checks ax_node.properties for 'disabled'/'hidden'.
        // Without CDP we use DOM attributes as a best-effort equivalent.
        if (el.hasAttribute('disabled')) return false;
        if (el.getAttribute('aria-disabled') === 'true') return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;

        // ── contenteditable="false" overrides interactivity ──────────────────
        if (el.getAttribute('contenteditable') === 'false') return false;

        // ── Large iframes need interaction (e.g. scrolling their content) ────
        // Mirrors browser-use: iframes > 100×100px are treated as interactive.
        if (tag === 'iframe' || tag === 'frame') {
            const r = el.getBoundingClientRect();
            return r.width > 100 && r.height > 100;
        }

        // ── Natively interactive tags ─────────────────────────────────────────
        if (INTERACTIVE_TAGS_SET.has(tag)) return true;

        // ── Label handling ────────────────────────────────────────────────────
        if (tag === 'label') {
            // Labels proxying via 'for' → don't double-count; let the input handle it
            if (el.getAttribute('for')) return false;
            // Labels that directly wrap a form control ARE interactive
            if (hasFormControl(el, 2)) return true;
            // Fall through to heuristics for all other label cases
        }

        // ── Span / div wrapping a form control ───────────────────────────────
        if ((tag === 'span' || tag === 'div') && hasFormControl(el, 2)) return true;

        // ── Search element heuristic ──────────────────────────────────────────
        // Matches browser-use's search_indicators detection.
        {
            const cls = (el.getAttribute('class') || '').toLowerCase();
            const id = (el.getAttribute('id') || '').toLowerCase();
            for (const indicator of SEARCH_INDICATORS_SET) {
                if (cls.includes(indicator) || id.includes(indicator)) return true;
            }
            for (const attr of el.attributes) {
                if (attr.name.startsWith('data-') && attr.value) {
                    const v = attr.value.toLowerCase();
                    for (const indicator of SEARCH_INDICATORS_SET) {
                        if (v.includes(indicator)) return true;
                    }
                }
            }
        }

        // ── Event handler attributes ──────────────────────────────────────────
        // NOTE: addEventListener()-based listeners (React onClick, Vue @click compiled,
        // vanilla JS) are invisible to DOM attribute scanning. browser-use detects them
        // via CDP getEventListeners(). Without CDP we can only catch attribute-style
        // handlers here — this is a known limitation.
        for (const attr of el.attributes) {
            if (INTERACTIVE_ATTRS_SET.has(attr.name)) return true;
            if (attr.name.startsWith('on') && attr.name.length > 2) return true;
            if (attr.name.startsWith('@') || attr.name.startsWith('v-on:')) return true;
        }

        // ── ARIA role ─────────────────────────────────────────────────────────
        const role = el.getAttribute('role');
        if (role && INTERACTIVE_ROLES_SET.has(role)) return true;

        // ── Contenteditable ───────────────────────────────────────────────────
        if (el.getAttribute('contenteditable') === 'true') return true;

        // ── Explicit positive tabindex ────────────────────────────────────────
        const tabindex = el.getAttribute('tabindex');
        if (tabindex !== null && tabindex !== '-1') return true;

        // ── Icon-size elements with interactive signals ───────────────────────
        // Small elements (10-50px) that have class/role/onclick/aria-label are
        // likely icon buttons. Mirrors browser-use's icon heuristic.
        {
            const r = el.getBoundingClientRect();
            if (r.width >= 10 && r.width <= 50 && r.height >= 10 && r.height <= 50) {
                if (
                    el.hasAttribute('class') ||
                    el.hasAttribute('role') ||
                    el.hasAttribute('onclick') ||
                    el.hasAttribute('data-action') ||
                    el.hasAttribute('aria-label')
                ) {
                    return true;
                }
            }
        }

        // ── Cursor pointer (last resort — most expensive) ─────────────────────
        try {
            if (window.getComputedStyle(el).cursor === 'pointer') return true;
        } catch { /* skip */ }

        return false;
    }

    function hasFormControl(el: Element, depth: number): boolean {
        if (depth <= 0) return false;
        for (const child of el.children) {
            const t = child.tagName.toLowerCase();
            if (t === 'input' || t === 'select' || t === 'textarea') return true;
            if (hasFormControl(child, depth - 1)) return true;
        }
        return false;
    }

    function getElText(el: Element): string {
        const tag = el.tagName.toLowerCase();
        if (tag === 'input') {
            const i = el as HTMLInputElement;
            return i.value || i.placeholder || el.getAttribute('aria-label') || i.name || '';
        }
        if (tag === 'textarea') {
            const t = el as HTMLTextAreaElement;
            return t.value || t.placeholder || el.getAttribute('aria-label') || '';
        }
        if (tag === 'select') {
            const s = el as HTMLSelectElement;
            return s.options[s.selectedIndex]?.text || el.getAttribute('aria-label') || '';
        }
        if (tag === 'img') return (el as HTMLImageElement).alt || el.getAttribute('aria-label') || '';

        const direct = Array.from(el.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent?.trim() || '')
            .filter(t => t.length > 0)
            .join(' ');
        if (direct) return direct.slice(0, 150);

        return ((el as HTMLElement).innerText?.trim() || '').slice(0, 150);
    }

    function isScrollable(el: Element): boolean {
        if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) return false;
        try {
            const s = window.getComputedStyle(el);
            const vals = [s.overflow, s.overflowX, s.overflowY];
            return vals.some(v => v === 'auto' || v === 'scroll' || v === 'overlay');
        } catch { return false; }
    }

    function buildAttrString(el: Element): string {
        const parts: string[] = [];
        for (const attrName of INCLUDE_ATTRIBUTES) {
            let value: string | null = null;

            // For 'value', get live value from input elements
            if (attrName === 'value') {
                const tag = el.tagName.toLowerCase();
                if (tag === 'input' || tag === 'textarea') {
                    value = (el as HTMLInputElement).value || null;
                } else if (tag === 'select') {
                    value = (el as HTMLSelectElement).value || null;
                } else {
                    value = el.getAttribute(attrName);
                }
            } else if (attrName === 'checked') {
                if ((el as HTMLInputElement).checked) {
                    value = 'true';
                } else {
                    continue;
                }
            } else {
                value = el.getAttribute(attrName);
            }

            if (value !== null && value.trim() !== '') {
                // Cap value length
                const capped = value.length > 100 ? value.slice(0, 100) + '...' : value;
                parts.push(`${attrName}=${capped}`);
            }
        }

        // Remove duplicates (same value with different attribute names)
        const seen = new Map<string, string>();
        const result: string[] = [];
        const protectedAttrs = new Set(['value', 'aria-label', 'placeholder', 'title', 'alt']);

        for (const part of parts) {
            const eqIdx = part.indexOf('=');
            const key = part.slice(0, eqIdx);
            const val = part.slice(eqIdx + 1);
            if (val.length > 5 && seen.has(val) && !protectedAttrs.has(key)) {
                continue;
            }
            seen.set(val, key);
            result.push(part);
        }

        return result.join(' ');
    }

    // ---- Tree walk and serialization ----

    interface NodeInfo {
        el: Element;
        tag: string;
        isInteractive: boolean;
        isVisible: boolean;
        isScrollable: boolean;
        children: NodeInfo[];
        textNodes: string[];
        isSvg: boolean;
        /** True if this node is sufficiently contained within a propagating parent's bounds. */
        excludedByParent: boolean;
    }

    let interactiveIdx = 1;
    const interactiveCount = { value: 0 };

    /**
     * Walk the DOM and build a NodeInfo tree.
     * activeBounds: if set, any child whose rect is ≥ CONTAINMENT_THRESHOLD inside
     * these bounds will be marked excludedByParent (not indexed separately).
     */
    function walkDOM(node: Node, depth: number, activeBounds: DOMRect | null = null): NodeInfo | null {
        if (depth > maxDepth) return null;

        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            const tag = el.tagName.toLowerCase();

            // Skip certain tags entirely
            if (SKIP_TAGS.has(tag)) return null;

            // Check if SVG child (decorative)
            const isSvg = tag === 'svg';
            if (SVG_CHILD_TAGS.has(tag)) return null;

            const vis = isElementVisible(el);
            const scroll = isScrollable(el);
            const interactive = isInteractive(el);

            // EXCEPTION: file inputs are often hidden but functional
            const isFileInput = tag === 'input' && el.getAttribute('type') === 'file';

            // ── Bounding-box propagation exclusion ────────────────────────────────
            // If parent is a propagating element (a, button, span role=button, etc.)
            // and this child is sufficiently contained within parent's bounds,
            // mark it excluded — it won't get its own index.
            // Mirrors browser-use's _apply_bounding_box_filtering.
            let excludedByParent = false;
            if (activeBounds && vis) {
                const childRect = el.getBoundingClientRect();
                if (isContainedInBounds(childRect, activeBounds, CONTAINMENT_THRESHOLD)) {
                    excludedByParent = true;
                }
            }

            // ── Determine if this element propagates its bounds to children ───────
            const elRole = el.getAttribute('role');
            let nextActiveBounds = activeBounds;
            const isPropagating = PROPAGATING_ELEMENTS.some(
                p => p.tag === tag && (p.role === null || p.role === elRole)
            );
            if (isPropagating && vis) {
                // This element's bounds will be used to exclude contained children
                nextActiveBounds = el.getBoundingClientRect();
            }

            // Skip completely invisible elements (unless file input or has children)
            if (!vis && !scroll && !interactive && !isFileInput) {
                // But still check children — some invisible wrappers have visible content
                const childResults: NodeInfo[] = [];
                for (const child of node.childNodes) {
                    const r = walkDOM(child, depth + 1, nextActiveBounds);
                    if (r) childResults.push(r);
                }
                if (childResults.length === 0) return null;

                // Invisible wrapper — pass children through
                return {
                    el, tag, isInteractive: false, isVisible: false,
                    isScrollable: false, children: childResults, textNodes: [],
                    isSvg: false, excludedByParent,
                };
            }

            // Collect text nodes and child elements
            const children: NodeInfo[] = [];
            const textNodes: string[] = [];

            if (!isSvg) {
                for (const child of node.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        const text = child.textContent?.trim();
                        if (text && text.length > 0) {
                            textNodes.push(text.slice(0, 200));
                        }
                    } else {
                        const r = walkDOM(child, depth + 1, nextActiveBounds);
                        if (r) children.push(r);
                    }
                }
            }

            // Also check shadow DOM (open only)
            if (el.shadowRoot) {
                for (const child of el.shadowRoot.childNodes) {
                    const r = walkDOM(child, depth + 1, nextActiveBounds);
                    if (r) children.push(r);
                }
            }

            return {
                el, tag, isInteractive: interactive,
                isVisible: vis || isFileInput, isScrollable: scroll,
                children, textNodes, isSvg, excludedByParent,
            };
        }

        return null;
    }

    function serializeNode(info: NodeInfo, depth: number): string {
        const lines: string[] = [];
        const indent = '\t'.repeat(depth);

        // Handle SVG — collapsed
        if (info.isSvg) {
            if (info.isInteractive) {
                const idx = interactiveIdx++;
                interactiveCount.value++;
                info.el.setAttribute('data-ba-idx', String(idx));
                const attrStr = buildAttrString(info.el);
                lines.push(`${indent}[${idx}]<svg${attrStr ? ' ' + attrStr : ''} /> <!-- SVG -->`);
            }
            return lines.join('\n');
        }

        // Determine if this node needs to be rendered
        const shouldRender =
            info.isInteractive ||
            info.isScrollable ||
            info.isVisible ||
            info.children.length > 0 ||
            info.textNodes.length > 0;

        if (!shouldRender) return '';

        let nodeRendered = false;

        // Render interactive elements
        // Skip elements excluded by bounding-box propagation filtering.
        if (info.isInteractive && info.isVisible && !info.excludedByParent) {
            const idx = interactiveIdx++;
            interactiveCount.value++;
            info.el.setAttribute('data-ba-idx', String(idx));

            const attrStr = buildAttrString(info.el);
            const scrollPrefix = info.isScrollable ? '|scroll|' : '';

            let line = `${indent}${scrollPrefix}[${idx}]<${info.tag}`;
            if (attrStr) line += ` ${attrStr}`;
            line += ' />';

            // Add scroll info
            if (info.isScrollable) {
                const scrollEl = info.el;
                const pagesBelow = scrollEl.clientHeight > 0
                    ? Math.round((scrollEl.scrollHeight - scrollEl.clientHeight - scrollEl.scrollTop) / scrollEl.clientHeight * 10) / 10
                    : 0;
                const pagesAbove = scrollEl.clientHeight > 0
                    ? Math.round(scrollEl.scrollTop / scrollEl.clientHeight * 10) / 10
                    : 0;
                if (pagesBelow > 0 || pagesAbove > 0) {
                    line += ` (scroll: ${pagesAbove}↑ ${pagesBelow}↓)`;
                }
            }

            lines.push(line);
            nodeRendered = true;
        } else if (info.isScrollable && info.isVisible) {
            // Non-interactive scrollable container
            const attrStr = buildAttrString(info.el);
            let line = `${indent}|scroll element|<${info.tag}`;
            if (attrStr) line += ` ${attrStr}`;
            line += ' />';

            const scrollEl = info.el;
            const pagesBelow = scrollEl.clientHeight > 0
                ? Math.round((scrollEl.scrollHeight - scrollEl.clientHeight - scrollEl.scrollTop) / scrollEl.clientHeight * 10) / 10
                : 0;
            const pagesAbove = scrollEl.clientHeight > 0
                ? Math.round(scrollEl.scrollTop / scrollEl.clientHeight * 10) / 10
                : 0;
            if (pagesBelow > 0 || pagesAbove > 0) {
                line += ` (${pagesAbove}↑ ${pagesBelow}↓)`;
            }

            lines.push(line);
            nodeRendered = true;
        }

        // Render text nodes
        for (const text of info.textNodes) {
            if (text.length > 1) {
                const textDepth = nodeRendered ? depth + 1 : depth;
                lines.push(`${'\t'.repeat(textDepth)}${text}`);
            }
        }

        // Render children
        const childDepth = nodeRendered ? depth + 1 : depth;
        for (const child of info.children) {
            const childText = serializeNode(child, childDepth);
            if (childText) lines.push(childText);
        }

        return lines.join('\n');
    }

    // ---- Execute ----

    // Walk the DOM
    const rootInfo = walkDOM(document.body, 0);

    // Scroll info
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const viewportHeight = window.innerHeight;
    const pagesAbove = viewportHeight > 0 ? Math.round(scrollY / viewportHeight * 10) / 10 : 0;
    const pagesBelow = viewportHeight > 0
        ? Math.round(Math.max(0, scrollHeight - scrollY - viewportHeight) / viewportHeight * 10) / 10
        : 0;

    // Serialize
    let domTreeText = '';
    if (rootInfo) {
        domTreeText = serializeNode(rootInfo, 0);
    }

    return {
        url: window.location.href,
        title: document.title,
        domTreeText,
        interactiveCount: interactiveCount.value,
        scrollInfo: {
            scrollTop: Math.round(scrollY),
            scrollHeight: Math.round(scrollHeight),
            viewportHeight: Math.round(viewportHeight),
            pagesAbove,
            pagesBelow,
        },
    };
}
