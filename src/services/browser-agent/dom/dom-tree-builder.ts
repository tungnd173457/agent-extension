// Browser Agent - DOM Tree Builder
// Builds an enhanced DOM tree from the live page DOM.
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
 */
export function buildDOMTree(options: {
    maxDepth?: number;
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
    // Clear stale data-ba-idx attributes from previous runs.
    // On SPAs, old elements persist in the DOM with outdated indices.
    // querySelector('[data-ba-idx="N"]') could return the wrong element
    // if multiple elements share the same index from different runs.
    document.querySelectorAll('[data-ba-idx]').forEach(el => {
        el.removeAttribute('data-ba-idx');
    });

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

    // Search element class/id indicators
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


    // Elements that propagate bounds to their children.
    // Children fully contained within these elements are NOT indexed separately.
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
                // CSS clipping techniques (e.g. .sr-only, .show-on-focus)
                const clipRaw = s.clip?.replace(/\s/g, '');
                const clipPath = s.clipPath?.replace(/\s/g, '');
                if (clipPath === 'inset(100%)') {
                    return false;
                }
                // Match clip: rect(Npx, Npx, Npx, Npx) where all values ≤ 1
                if (clipRaw) {
                    const m = clipRaw.match(/^rect\(([\d.]+)px,([\d.]+)px,([\d.]+)px,([\d.]+)px\)$/);
                    if (m && parseFloat(m[1]) <= 1 && parseFloat(m[2]) <= 1 && parseFloat(m[3]) <= 1 && parseFloat(m[4]) <= 1) {
                        return false;
                    }
                }

                // Tiny element with overflow hidden = effectively invisible
                // Since getBoundingClientRect() returns the unclipped size of children,
                // we must check if any ancestor is a tiny box that hides its overflow.
                const r = current.getBoundingClientRect();
                if (r.width <= 1 && r.height <= 1 && s.overflow === 'hidden') {
                    return false;
                }
            } catch {
                break; // getComputedStyle may fail for some elements
            }
            current = current.parentElement;
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
        // vanilla JS) are invisible to DOM attribute scanning
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
        // likely icon buttons.
        {
            const r = el.getBoundingClientRect();
            if (r.width >= 10 && r.width <= 50 && r.height >= 10 && r.height <= 50) {
                if (
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

    function getElText(el: Element, skipInnerText: boolean = false): string {
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

        // Direct child text nodes (most specific)
        const direct = Array.from(el.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent?.trim() || '')
            .filter(t => t.length > 0)
            .join(' ');
        if (direct) return direct.slice(0, 50);

        // innerText — skip when element has interactive children
        // to avoid aggregating their text (causes duplication).
        if (!skipInnerText) {
            const inner = ((el as HTMLElement).innerText?.trim() || '').slice(0, 50);
            if (inner) return inner;
        }

        // aria-label as last resort (e.g. icon-only buttons with no visible text)
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel.slice(0, 50);

        return '';
    }

    function isScrollable(el: Element): boolean {
        if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) return false;
        try {
            const s = window.getComputedStyle(el);
            const vals = [s.overflow, s.overflowX, s.overflowY];
            return vals.some(v => v === 'auto' || v === 'scroll' || v === 'overlay');
        } catch { return false; }
    }

    // ---- Semantic role & state helpers ----

    /** Map an element to its semantic role string for LLM-friendly display. */
    function resolveRole(el: Element): string {
        const tag = el.tagName.toLowerCase();

        // 1. Explicit role attribute takes priority
        const role = el.getAttribute('role');
        if (role && role !== 'presentation' && role !== 'none') {
            // For form input elements with an explicit role override, prepend tag
            // so LLM knows they accept text input (e.g. "input combobox")
            if (tag === 'input' || tag === 'textarea') return `${tag} ${role}`;
            return role;
        }

        // 2. Input type mapping
        if (tag === 'input') {
            const type = (el.getAttribute('type') || 'text').toLowerCase();
            const typeMap: Record<string, string> = {
                checkbox: 'checkbox', radio: 'radio', submit: 'button',
                reset: 'button', file: 'file', image: 'button',
                range: 'slider', number: 'spinbutton', search: 'searchbox',
                password: 'textbox', text: 'textbox', email: 'textbox',
                url: 'textbox', tel: 'textbox', date: 'textbox',
                time: 'textbox', 'datetime-local': 'textbox', month: 'textbox',
                week: 'textbox', color: 'textbox', hidden: 'hidden',
            };
            return typeMap[type] || 'textbox';
        }

        // 3. Tag name mapping
        const tagMap: Record<string, string> = {
            a: 'link', button: 'button', textarea: 'textbox',
            select: 'combobox', option: 'option', optgroup: 'group',
            img: 'img', nav: 'nav', details: 'details', summary: 'summary',
            iframe: 'iframe', frame: 'frame', label: 'label',
            h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
            table: 'table', form: 'form', dialog: 'dialog',
            header: 'header', footer: 'footer', main: 'main',
            section: 'section', article: 'article', aside: 'aside',
        };
        return tagMap[tag] || tag;
    }

    /** Build compact state flags like [required] [checked=true] [expanded] etc. */
    function resolveStateFlags(el: Element): string {
        const flags: string[] = [];
        const tag = el.tagName.toLowerCase();

        // Required
        if (el.hasAttribute('required') || el.getAttribute('aria-required') === 'true') {
            flags.push('[required]');
        }

        // Disabled
        if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
            flags.push('[disabled]');
        }

        // Readonly
        if (el.hasAttribute('readonly')) {
            flags.push('[readonly]');
        }

        // Checked (for checkbox/radio)
        if (tag === 'input') {
            const type = (el.getAttribute('type') || '').toLowerCase();
            if (type === 'checkbox' || type === 'radio') {
                flags.push(`[checked=${(el as HTMLInputElement).checked}]`);
            }
        }
        if (el.getAttribute('aria-checked') !== null) {
            flags.push(`[checked=${el.getAttribute('aria-checked')}]`);
        }

        // Expanded / Collapsed
        const expanded = el.getAttribute('aria-expanded');
        if (expanded === 'true') {
            flags.push('[expanded]');
        } else if (expanded === 'false') {
            flags.push('[collapsed]');
        }

        // Selected
        if (el.getAttribute('aria-selected') === 'true' || (el as HTMLOptionElement).selected === true) {
            flags.push('[selected]');
        }

        // Multiple (select/file)
        if (el.hasAttribute('multiple')) {
            flags.push('[multiple]');
        }

        return flags.join(' ');
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

            // ── Bounding-box propagation exclusion ────────────────────────────────
            // If parent is a propagating element (a, button, span role=button, etc.)
            // and this child is sufficiently contained within parent's bounds,
            // mark it excluded — it won't get its own index.
            let excludedByParent = false;

            // EXCEPTION RULES - Keep these even if contained
            const isContainmentException =
                tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'label' ||
                isPropagating ||
                el.hasAttribute('onclick') ||
                (el.getAttribute('aria-label') || '').trim().length > 0 ||
                ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'option'].includes(elRole || '');

            if (activeBounds && vis && !isContainmentException) {
                const childRect = el.getBoundingClientRect();
                if (isContainedInBounds(childRect, activeBounds, CONTAINMENT_THRESHOLD)) {
                    excludedByParent = true;
                }
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

            // Tags whose text content is already captured via getElText
            // — skip their text nodes to avoid duplication.
            const VALUE_TAGS = new Set(['textarea', 'input', 'select']);

            if (!isSvg) {
                for (const child of node.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE) {
                        if (vis && !VALUE_TAGS.has(tag)) {
                            const text = child.textContent?.trim();
                            if (text && text.length > 0) {
                                textNodes.push(text.slice(0, 50));
                            }
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

    // Generic container roles that should be skipped when they wrap interactive children.
    const GENERIC_ROLES = new Set(['div', 'span']);

    /** Check if any descendant is a visible, non-excluded interactive element. */
    function hasInteractiveDescendant(info: NodeInfo): boolean {
        for (const child of info.children) {
            if (child.isInteractive && child.isVisible && !child.excludedByParent) return true;
            if (hasInteractiveDescendant(child)) return true;
        }
        return false;
    }

    /**
     * Serialize a NodeInfo into LLM-friendly text.
     *
     * Format for interactive elements:
     *   [idx] role href? "text" [flags]
     *
     * Examples:
     *   [1] link /product "Sản phẩm"
     *   [2] button "Đăng nhập"
     *   [3] [required] textbox "Tên người dùng"
     *   [4] [checked=true] checkbox "Đồng ý"
     *   [5] [scroll] nav "Chat history" (0↑ 1.8↓)
     *
     * @param insideRenderedParent - true when an ancestor was rendered as
     *   interactive (its text is already captured by getElText), so orphan
     *   text nodes should be suppressed to avoid duplication.
     */
    function serializeNode(info: NodeInfo, insideRenderedParent: boolean = false): string {
        const lines: string[] = [];

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
            const role = resolveRole(info.el);
            const hasIntChildren = hasInteractiveDescendant(info);

            // Skip generic containers (div, span) that wrap interactive children.
            // These are just wrappers — let their children speak for themselves.
            const skipGeneric = GENERIC_ROLES.has(role) && hasIntChildren;

            if (!skipGeneric) {
                const idx = interactiveIdx++;
                interactiveCount.value++;
                info.el.setAttribute('data-ba-idx', String(idx));

                const stateFlags = resolveStateFlags(info.el);

                // Suppress text for elements with interactive children — their
                // getElText() uses innerText which aggregates descendant text,
                // duplicating what children will show individually.
                const text = getElText(info.el, hasIntChildren);

                // Build: [idx] [scroll]? [flags]? role href? "text"
                let line = `[${idx}]`;

                // Scroll marker
                if (info.isScrollable) line += ' [scroll]';

                // State flags before role
                if (stateFlags) line += ` ${stateFlags}`;

                // Role
                line += ` ${role}`;

                // Href for links (inline after role)
                if (info.tag === 'a') {
                    const href = info.el.getAttribute('href');
                    if (href) {
                        const cappedHref = href.length > 80 ? href.slice(0, 80) + '...' : href;
                        line += ` ${cappedHref}`;
                    }
                }

                // Display text
                if (text) {
                    const cappedText = text.length > 50 ? text.slice(0, 50) + '...' : text;
                    line += ` "${cappedText}"`;
                }

                // Scroll info
                if (info.isScrollable) {
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
                }

                lines.push(line);
                nodeRendered = true;
            }
        } else if (info.isScrollable && info.isVisible) {
            // Non-interactive scrollable container — still gets an index for scroll targeting
            const idx = interactiveIdx++;
            interactiveCount.value++;
            info.el.setAttribute('data-ba-idx', String(idx));

            const role = resolveRole(info.el);
            const hasIntChildren = hasInteractiveDescendant(info);
            const text = hasIntChildren ? '' : getElText(info.el);

            let line = `[${idx}] [scroll] ${role}`;

            if (text) {
                const cappedText = text.length > 50 ? text.slice(0, 50) + '...' : text;
                line += ` "${cappedText}"`;
            }

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

        // Render orphan text nodes ONLY if:
        // - This node was NOT rendered (its text isn't captured by getElText)
        // - AND we're not inside a rendered parent (to avoid duplication)
        if (!nodeRendered && !insideRenderedParent) {
            for (const text of info.textNodes) {
                if (text.length > 1) {
                    lines.push(text);
                }
            }
        }

        // Render children — pass insideRenderedParent=true if this node was rendered,
        // so descendant text nodes are suppressed (already in getElText).
        const childFlag = nodeRendered || insideRenderedParent;
        for (const child of info.children) {
            const childText = serializeNode(child, childFlag);
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
        domTreeText = serializeNode(rootInfo);
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
