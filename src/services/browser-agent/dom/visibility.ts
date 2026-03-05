// Browser Agent - DOM Visibility Utilities
// Element visibility detection and bounding box utilities.
// Adapted from browser-use's service.py visibility logic.
// These functions run in page context via chrome.scripting.executeScript.

// ============================================================
// Types
// ============================================================

export interface VisibilityOptions {
    /** Check if element is occluded by other elements (default: true) */
    checkOcclusion?: boolean;
    /** Extra pixels beyond viewport to consider visible (default: 0) */
    viewportThreshold?: number;
    /** Require element to be clickable (default: false) */
    requireClickable?: boolean;
    /** Check visibility across iframe parents (default: false) */
    checkFrames?: boolean;
    /** Treat aria-hidden="true" as invisible (default: false) */
    checkAriaHidden?: boolean;
}

// ============================================================
// Element Visibility (unified)
// ============================================================

/**
 * Check if an element is visible.
 *
 * This is the single, unified visibility check that replaces the previous
 * separate functions (isElementVisible, isInViewport, isVisibleAcrossFrames,
 * isVisibleWithinIframeScroll).
 *
 * Checks performed:
 *   1. HTML attribute checks (hidden, aria-hidden)
 *   2. Collapsed <details> detection
 *   3. Computed style chain walk (display, visibility, opacity, clip)
 *   4. Bounding rect (zero-size, tiny + overflow hidden)
 *   5. Viewport intersection with configurable threshold
 *   6. Cross-frame visibility via window.frameElement traversal (optional)
 *   7. Occlusion check via multi-point elementsFromPoint (optional)
 *   8. Clickability check via elementFromPoint + pointer-events (optional)
 *
 * @param el - Element to check
 * @param options - Configuration options
 * @returns true if element is considered visible
 */
export function isElementVisible(
    el: HTMLElement,
    options: VisibilityOptions = {}
): boolean {
    const {
        checkOcclusion = true,
        viewportThreshold = 0,
        requireClickable = false,
        checkFrames = false,
        checkAriaHidden = false,
    } = options;

    if (!el || !(el instanceof HTMLElement)) return false;

    // ===============================
    // 1️⃣ HTML attribute checks
    // ===============================
    if (el.hasAttribute('hidden')) return false;
    if (checkAriaHidden && el.getAttribute('aria-hidden') === 'true') return false;

    // ===============================
    // 2️⃣ Collapsed <details> check
    // ===============================
    // Content inside a closed <details> (other than <summary>) is invisible.
    // Computed style may not reliably reflect this across all browsers.
    if (!el.closest('summary')) {
        const closestDetails = el.closest('details');
        if (closestDetails && !closestDetails.hasAttribute('open') && closestDetails !== el) {
            return false;
        }
    }

    // ===============================
    // 3️⃣ Computed style chain walk
    // ===============================
    // Walk up the entire parent chain to catch inherited hiding.
    // This is more thorough than checking only the element itself.
    let current: HTMLElement | null = el;
    while (current) {
        const style = window.getComputedStyle(current);

        if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.visibility === 'collapse' ||
            parseFloat(style.opacity) === 0
        ) {
            return false;
        }

        // CSS clipping techniques (e.g. .sr-only) — check on current element and ancestors
        if (
            style.clip === 'rect(0px, 0px, 0px, 0px)' ||
            style.clipPath === 'inset(100%)'
        ) {
            return false;
        }

        current = current.parentElement;
    }

    // ===============================
    // 4️⃣ Bounding rect checks
    // ===============================
    const rect = el.getBoundingClientRect();

    // Zero-size elements are invisible
    if (rect.width === 0 || rect.height === 0) {
        return false;
    }

    // Tiny element (≤1px) with overflow hidden = effectively invisible
    // Common pattern: width:1px; height:1px; overflow:hidden (screen-reader text)
    if (rect.width <= 1 && rect.height <= 1) {
        const style = window.getComputedStyle(el);
        if (style.overflow === 'hidden') return false;
    }

    // ===============================
    // 5️⃣ Viewport intersection
    // ===============================
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const isIntersecting =
        rect.bottom > -viewportThreshold &&
        rect.right > -viewportThreshold &&
        rect.top < viewportHeight + viewportThreshold &&
        rect.left < viewportWidth + viewportThreshold;

    if (!isIntersecting) return false;

    // ===============================
    // 6️⃣ Cross-frame visibility (optional)
    // ===============================
    // Traverse up through parent frames via window.frameElement.
    // For cross-origin iframes, traversal stops (we assume visible).
    if (checkFrames) {
        const currentWindow = el.ownerDocument.defaultView;
        if (!currentWindow) return false;

        let currentWin: Window = currentWindow;

        while (true) {
            // Reached top-level window
            if (currentWin === currentWin.parent || !currentWin.parent) break;

            // Try to access the iframe element in the parent frame
            let frameElement: Element | null;
            try {
                frameElement = currentWin.frameElement as Element | null;
            } catch {
                // Cross-origin: can't traverse further, assume visible
                break;
            }

            if (!frameElement) break;

            // Check CSS visibility of the iframe element itself
            try {
                const frameStyle =
                    frameElement.ownerDocument.defaultView!.getComputedStyle(frameElement);
                if (
                    frameStyle.display === 'none' ||
                    frameStyle.visibility === 'hidden' ||
                    parseFloat(frameStyle.opacity) <= 0
                ) {
                    return false;
                }
            } catch {
                // Can't access parent's computed style — skip
            }

            // Check if iframe has non-zero size
            const frameRect = frameElement.getBoundingClientRect();
            if (frameRect.width === 0 && frameRect.height === 0) return false;

            // Check if iframe is within parent frame's viewport + threshold
            let parentWindow: Window;
            try {
                parentWindow = currentWin.parent;
            } catch {
                break;
            }

            const iframeInParentViewport =
                frameRect.left < parentWindow.innerWidth + viewportThreshold &&
                frameRect.right > -viewportThreshold &&
                frameRect.top < parentWindow.innerHeight + viewportThreshold &&
                frameRect.bottom > -viewportThreshold;

            if (!iframeInParentViewport) return false;

            currentWin = parentWindow;
        }
    }

    // ===============================
    // 7️⃣ Occlusion check (multi-point)
    // ===============================
    // Uses elementsFromPoint at multiple positions to handle partial occlusion.
    // Element is considered visible if ANY sample point is not fully occluded.
    if (checkOcclusion) {
        const points = [
            { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },         // center
            { x: rect.left + rect.width * 0.25, y: rect.top + rect.height * 0.25 },   // top-left quarter
            { x: rect.left + rect.width * 0.75, y: rect.top + rect.height * 0.75 },   // bottom-right quarter
        ];

        let anyPointVisible = false;

        for (const pt of points) {
            // Clamp to viewport bounds (elementsFromPoint returns empty outside viewport)
            const x = Math.max(0, Math.min(pt.x, window.innerWidth - 1));
            const y = Math.max(0, Math.min(pt.y, window.innerHeight - 1));

            const stack = document.elementsFromPoint(x, y);
            const idx = stack.indexOf(el);

            if (idx === -1) continue; // Element not in stack at this point

            if (idx === 0) {
                anyPointVisible = true;
                break; // Element is on top at this point
            }

            // Check if all elements above are transparent/non-blocking
            let blockedAtThisPoint = false;
            for (let i = 0; i < idx; i++) {
                const above = stack[i] as HTMLElement;

                // Skip if the element above is a child of our element
                // (children render on top of parent but don't occlude it)
                if (el.contains(above)) continue;

                const aboveStyle = window.getComputedStyle(above);
                if (
                    aboveStyle.pointerEvents !== 'none' &&
                    aboveStyle.visibility !== 'hidden' &&
                    parseFloat(aboveStyle.opacity) > 0
                ) {
                    blockedAtThisPoint = true;
                    break;
                }
            }

            if (!blockedAtThisPoint) {
                anyPointVisible = true;
                break;
            }
        }

        if (!anyPointVisible) return false;
    }

    // ===============================
    // 8️⃣ Clickability check (optional)
    // ===============================
    // Verifies that the element can actually receive click events.
    if (requireClickable) {
        // Check pointer-events in ancestor chain
        let ancestor: HTMLElement | null = el.parentElement;
        while (ancestor) {
            const ancestorStyle = window.getComputedStyle(ancestor);
            if (ancestorStyle.pointerEvents === 'none') {
                // Ancestor disables pointer-events — check if el re-enables it
                const elStyle = window.getComputedStyle(el);
                if (elStyle.pointerEvents === 'none' || elStyle.pointerEvents === '') {
                    return false;
                }
                break; // el explicitly re-enables pointer-events, ok
            }
            ancestor = ancestor.parentElement;
        }

        // Verify element is the top-most clickable target at its center
        const centerX = Math.max(0, Math.min(rect.left + rect.width / 2, window.innerWidth - 1));
        const centerY = Math.max(0, Math.min(rect.top + rect.height / 2, window.innerHeight - 1));
        const topElement = document.elementFromPoint(centerX, centerY);

        if (topElement && !el.contains(topElement) && topElement !== el) {
            return false;
        }
    }

    return true;
}

// ============================================================
// Containment Check
// ============================================================

/**
 * Check if a child element is contained within parent bounds.
 * Used for bounding box filtering of propagating interactive elements (e.g., <a>, <button>).
 * Adapted from browser-use's DOMTreeSerializer._is_contained.
 *
 * @param childRect - Bounding rect of the child element
 * @param parentRect - Bounding rect of the parent element
 * @param threshold - Percentage (0.0-1.0) of child that must be within parent
 */
export function isContained(
    childRect: { x: number; y: number; width: number; height: number },
    parentRect: { x: number; y: number; width: number; height: number },
    threshold: number = 0.8
): boolean {
    const xOverlap = Math.max(0,
        Math.min(childRect.x + childRect.width, parentRect.x + parentRect.width)
        - Math.max(childRect.x, parentRect.x)
    );
    const yOverlap = Math.max(0,
        Math.min(childRect.y + childRect.height, parentRect.y + parentRect.height)
        - Math.max(childRect.y, parentRect.y)
    );

    const intersectionArea = xOverlap * yOverlap;
    const childArea = childRect.width * childRect.height;

    if (childArea === 0) return false;

    return (intersectionArea / childArea) >= threshold;
}

// ============================================================
// Scroll Detection
// ============================================================

/**
 * Check if an element is scrollable.
 * Adapted from browser-use's EnhancedDOMTreeNode.is_actually_scrollable.
 */
export function isElementScrollable(el: Element): boolean {
    // Quick check: does content overflow?
    if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) {
        return false;
    }

    // Check CSS overflow property
    try {
        const style = window.getComputedStyle(el);
        const overflow = style.overflow;
        const overflowX = style.overflowX;
        const overflowY = style.overflowY;

        const allowsScroll =
            ['auto', 'scroll', 'overlay'].includes(overflow) ||
            ['auto', 'scroll', 'overlay'].includes(overflowX) ||
            ['auto', 'scroll', 'overlay'].includes(overflowY);

        if (!allowsScroll) return false;

        // Content must actually overflow
        const hasVerticalScroll = el.scrollHeight > el.clientHeight + 1;
        const hasHorizontalScroll = el.scrollWidth > el.clientWidth + 1;

        return hasVerticalScroll || hasHorizontalScroll;
    } catch {
        return false;
    }
}

/**
 * Get scroll information for an element or the page.
 * Adapted from browser-use's EnhancedDOMTreeNode.scroll_info.
 */
export function getScrollInfo(el?: Element): {
    scrollTop: number;
    scrollLeft: number;
    scrollHeight: number;
    scrollWidth: number;
    clientHeight: number;
    clientWidth: number;
    pagesAbove: number;
    pagesBelow: number;
    canScrollUp: boolean;
    canScrollDown: boolean;
    canScrollLeft: boolean;
    canScrollRight: boolean;
} {
    let scrollTop: number, scrollLeft: number;
    let scrollHeight: number, scrollWidth: number;
    let clientHeight: number, clientWidth: number;

    if (!el || el === document.documentElement || el === document.body) {
        // Page-level scroll
        scrollTop = window.scrollY || document.documentElement.scrollTop;
        scrollLeft = window.scrollX || document.documentElement.scrollLeft;
        scrollHeight = document.documentElement.scrollHeight;
        scrollWidth = document.documentElement.scrollWidth;
        clientHeight = window.innerHeight;
        clientWidth = window.innerWidth;
    } else {
        scrollTop = el.scrollTop;
        scrollLeft = el.scrollLeft;
        scrollHeight = el.scrollHeight;
        scrollWidth = el.scrollWidth;
        clientHeight = el.clientHeight;
        clientWidth = el.clientWidth;
    }

    const contentAbove = Math.max(0, scrollTop);
    const contentBelow = Math.max(0, scrollHeight - clientHeight - scrollTop);
    const contentLeft = Math.max(0, scrollLeft);
    const contentRight = Math.max(0, scrollWidth - clientWidth - scrollLeft);

    return {
        scrollTop: Math.round(scrollTop),
        scrollLeft: Math.round(scrollLeft),
        scrollHeight: Math.round(scrollHeight),
        scrollWidth: Math.round(scrollWidth),
        clientHeight: Math.round(clientHeight),
        clientWidth: Math.round(clientWidth),
        pagesAbove: clientHeight > 0 ? Math.round(contentAbove / clientHeight * 10) / 10 : 0,
        pagesBelow: clientHeight > 0 ? Math.round(contentBelow / clientHeight * 10) / 10 : 0,
        canScrollUp: contentAbove > 0,
        canScrollDown: contentBelow > 0,
        canScrollLeft: contentLeft > 0,
        canScrollRight: contentRight > 0,
    };
}

/**
 * Get human-readable scroll info text for display in serialized tree.
 * Adapted from browser-use's EnhancedDOMTreeNode.get_scroll_info_text.
 */
export function getScrollInfoText(el?: Element): string {
    const info = getScrollInfo(el);
    const parts: string[] = [];

    if (info.scrollHeight > info.clientHeight) {
        parts.push(`${info.pagesAbove}↑ ${info.pagesBelow}↓`);
    }
    if (info.scrollWidth > info.clientWidth) {
        parts.push(`${Math.round(info.scrollLeft)}← ${Math.round(info.scrollWidth - info.clientWidth - info.scrollLeft)}→`);
    }

    return parts.length > 0 ? `scroll: ${parts.join(' ')}` : '';
}
