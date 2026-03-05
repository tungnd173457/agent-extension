// Browser Agent - DOM Actions
// Functions that perform interactions with the page DOM (click, type, scroll, etc.).
// Moved from dom-utils.ts — these are action functions (mutate state).
// Run in page context via chrome.scripting.executeScript.
// Currently unused — placed here for future integration.

// ============================================================
// Types
// ============================================================

export interface DropdownOption {
    value: string;
    text: string;
    selected: boolean;
    disabled: boolean;
}

// ============================================================
// Click Actions
// ============================================================

/**
 * Click an element by its browser-agent index (data-ba-idx).
 */
export function clickElementByIndex(index: number): { success: boolean; error?: string; description?: string } {
    try {
        function _getElementText(el: Element): string {
            const tag = el.tagName.toLowerCase();
            if (tag === 'input') {
                const input = el as HTMLInputElement;
                return input.value || input.placeholder || el.getAttribute('aria-label') || input.name || '';
            }
            if (tag === 'textarea') {
                const textarea = el as HTMLTextAreaElement;
                return textarea.value || textarea.placeholder || el.getAttribute('aria-label') || '';
            }
            if (tag === 'select') {
                const select = el as HTMLSelectElement;
                return select.options[select.selectedIndex]?.text || el.getAttribute('aria-label') || '';
            }
            if (tag === 'img') {
                return (el as HTMLImageElement).alt || el.getAttribute('aria-label') || '';
            }
            const directText = Array.from(el.childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .map(n => n.textContent?.trim() || '')
                .filter(t => t.length > 0)
                .join(' ');
            if (directText) return directText.slice(0, 200);
            return ((el as HTMLElement).innerText?.trim() || '').slice(0, 200);
        }

        const el = document.querySelector(`[data-ba-idx="${index}"]`) as HTMLElement;
        if (!el) {
            return { success: false, error: `Element with index ${index} not found. The page may have changed - try refreshing elements.` };
        }

        // Scroll into view if needed
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Small delay to let scroll settle, then click
        setTimeout(() => {
            el.focus();
            el.click();

            // Also dispatch mouse events for frameworks that rely on them
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }, 100);

        const desc = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`;
        const text = _getElementText(el);
        return { success: true, description: `Clicked ${desc}: "${text.slice(0, 50)}"` };
    } catch (e: any) {
        return { success: false, error: `Failed to click element ${index}: ${e.message}` };
    }
}

/**
 * Click an element at specific viewport coordinates.
 */
export function clickAtCoordinates(x: number, y: number): { success: boolean; error?: string; description?: string } {
    try {
        const el = document.elementFromPoint(x, y) as HTMLElement;
        if (!el) {
            return { success: false, error: `No element found at coordinates (${x}, ${y})` };
        }

        el.focus();
        el.click();
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));

        const desc = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}`;
        return { success: true, description: `Clicked at (${x}, ${y}) on ${desc}` };
    } catch (e: any) {
        return { success: false, error: `Failed to click at (${x}, ${y}): ${e.message}` };
    }
}

// ============================================================
// Text Input
// ============================================================

/**
 * Type text into an element by index.
 */
export function typeTextByIndex(
    index: number,
    text: string,
    clear: boolean = true,
    pressEnter: boolean = false
): { success: boolean; error?: string; description?: string } {
    try {
        let el: HTMLElement | null;

        if (index <= 0) {
            // Index 0 or negative: type into currently focused element
            el = document.activeElement as HTMLElement;
            if (!el || el === document.body) {
                return { success: false, error: 'No element is currently focused. Use an index to specify which element to type into.' };
            }
        } else {
            el = document.querySelector(`[data-ba-idx="${index}"]`) as HTMLElement;
        }

        if (!el) {
            return { success: false, error: `Element with index ${index} not found.` };
        }

        // Focus the element
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

        if (isInput) {
            const inputEl = el as HTMLInputElement | HTMLTextAreaElement;

            if (clear) {
                inputEl.value = '';
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Set value directly
            inputEl.value = clear ? text : inputEl.value + text;

            // Dispatch all relevant events for framework compatibility
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));

            // Also simulate keypress events for each character
            for (const char of text) {
                inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
                inputEl.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
                inputEl.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
            }
        } else if (el.getAttribute('contenteditable') === 'true') {
            // Content editable
            if (clear) {
                el.textContent = '';
            }
            el.textContent = (el.textContent || '') + text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            return { success: false, error: `Element at index ${index} is not a text input (tag: ${el.tagName.toLowerCase()})` };
        }

        // Press Enter if requested
        if (pressEnter) {
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            if (isInput) {
                const form = el.closest('form');
                if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
        }

        return { success: true, description: `Typed "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" into element ${index}` };
    } catch (e: any) {
        return { success: false, error: `Failed to type text: ${e.message}` };
    }
}

// ============================================================
// Scroll
// ============================================================

/**
 * Scroll the page in a direction.
 */
export function scrollPage(
    direction: 'up' | 'down' | 'left' | 'right',
    amount?: number,
    index?: number,
    selector?: string
): { success: boolean; scrollTop: number; scrollHeight: number; viewportHeight: number; description?: string } {
    try {
        let target: Element = document.documentElement;

        if (index && index > 0) {
            const el = document.querySelector(`[data-ba-idx="${index}"]`);
            if (el) target = el;
        } else if (selector) {
            const el = document.querySelector(selector);
            if (el) target = el;
        }

        const vh = window.innerHeight;
        const pixels = amount || vh;

        const scrollOptions: ScrollToOptions = { behavior: 'smooth' };

        switch (direction) {
            case 'down':
                scrollOptions.top = (target === document.documentElement ? window.scrollY : target.scrollTop) + pixels;
                break;
            case 'up':
                scrollOptions.top = (target === document.documentElement ? window.scrollY : target.scrollTop) - pixels;
                break;
            case 'right':
                scrollOptions.left = (target === document.documentElement ? window.scrollX : target.scrollLeft) + pixels;
                break;
            case 'left':
                scrollOptions.left = (target === document.documentElement ? window.scrollX : target.scrollLeft) - pixels;
                break;
        }

        if (target === document.documentElement) {
            window.scrollTo(scrollOptions);
        } else {
            target.scrollTo(scrollOptions);
        }

        return {
            success: true,
            scrollTop: window.scrollY || document.documentElement.scrollTop,
            scrollHeight: document.documentElement.scrollHeight,
            viewportHeight: vh,
            description: `Scrolled ${direction} by ${pixels}px`,
        };
    } catch (e: any) {
        return {
            success: false,
            scrollTop: 0,
            scrollHeight: 0,
            viewportHeight: 0,
            description: `Failed to scroll: ${e.message}`,
        };
    }
}

// ============================================================
// Keyboard
// ============================================================

/**
 * Send keyboard shortcuts.
 */
export function sendKeyboardEvent(keys: string): { success: boolean; description?: string; error?: string } {
    try {
        const target = document.activeElement || document.body;

        // Parse key combo: "Control+a", "Shift+Enter", "Escape"
        const parts = keys.split('+');
        const key = parts[parts.length - 1];
        const ctrlKey = parts.includes('Control') || parts.includes('Ctrl');
        const shiftKey = parts.includes('Shift');
        const altKey = parts.includes('Alt');
        const metaKey = parts.includes('Meta') || parts.includes('Command');

        // Map common key names
        const keyMap: Record<string, { key: string; code: string; keyCode: number }> = {
            'Enter': { key: 'Enter', code: 'Enter', keyCode: 13 },
            'Escape': { key: 'Escape', code: 'Escape', keyCode: 27 },
            'Tab': { key: 'Tab', code: 'Tab', keyCode: 9 },
            'Backspace': { key: 'Backspace', code: 'Backspace', keyCode: 8 },
            'Delete': { key: 'Delete', code: 'Delete', keyCode: 46 },
            'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
            'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
            'ArrowLeft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
            'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
            'Home': { key: 'Home', code: 'Home', keyCode: 36 },
            'End': { key: 'End', code: 'End', keyCode: 35 },
            'PageUp': { key: 'PageUp', code: 'PageUp', keyCode: 33 },
            'PageDown': { key: 'PageDown', code: 'PageDown', keyCode: 34 },
            'Space': { key: ' ', code: 'Space', keyCode: 32 },
        };

        const keyInfo = keyMap[key] || { key, code: `Key${key.toUpperCase()}`, keyCode: key.charCodeAt(0) };

        const eventInit: KeyboardEventInit = {
            key: keyInfo.key,
            code: keyInfo.code,
            keyCode: keyInfo.keyCode,
            ctrlKey,
            shiftKey,
            altKey,
            metaKey,
            bubbles: true,
            cancelable: true,
        };

        target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
        target.dispatchEvent(new KeyboardEvent('keypress', eventInit));
        target.dispatchEvent(new KeyboardEvent('keyup', eventInit));

        return { success: true, description: `Sent keys: ${keys}` };
    } catch (e: any) {
        return { success: false, error: `Failed to send keys "${keys}": ${e.message}` };
    }
}

// ============================================================
// Wait
// ============================================================

/**
 * Wait for an element matching a CSS selector to appear.
 */
export function waitForElement(
    selector: string,
    timeout: number = 5000,
    visible: boolean = true
): Promise<{ success: boolean; found: boolean; error?: string }> {
    return new Promise((resolve) => {
        function _isElementVisible(el: Element): boolean {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return false;
            try {
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            } catch { return true; }
            return true;
        }

        const startTime = Date.now();

        function check() {
            const el = document.querySelector(selector);
            if (el) {
                if (!visible || _isElementVisible(el)) {
                    resolve({ success: true, found: true });
                    return;
                }
            }

            if (Date.now() - startTime >= timeout) {
                resolve({ success: true, found: false, error: `Element "${selector}" not found within ${timeout}ms` });
                return;
            }

            requestAnimationFrame(check);
        }

        check();
    });
}

// ============================================================
// Dropdown
// ============================================================

/**
 * Get all options from a <select> dropdown.
 */
export function getDropdownOptions(index?: number, selector?: string): {
    success: boolean;
    options?: DropdownOption[];
    error?: string;
} {
    try {
        let el: Element | null = null;

        if (index && index > 0) {
            el = document.querySelector(`[data-ba-idx="${index}"]`);
        } else if (selector) {
            el = document.querySelector(selector);
        }

        if (!el || el.tagName.toLowerCase() !== 'select') {
            return { success: false, error: 'Element is not a <select> dropdown' };
        }

        const selectEl = el as HTMLSelectElement;
        const options: DropdownOption[] = Array.from(selectEl.options).map(opt => ({
            value: opt.value,
            text: opt.text,
            selected: opt.selected,
            disabled: opt.disabled,
        }));

        return { success: true, options };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Select an option in a <select> dropdown.
 */
export function selectDropdownOption(
    index: number | undefined,
    selector: string | undefined,
    value: string | undefined,
    text: string | undefined
): { success: boolean; error?: string; description?: string } {
    try {
        let el: Element | null = null;

        if (index && index > 0) {
            el = document.querySelector(`[data-ba-idx="${index}"]`);
        } else if (selector) {
            el = document.querySelector(selector);
        }

        if (!el || el.tagName.toLowerCase() !== 'select') {
            return { success: false, error: 'Element is not a <select> dropdown' };
        }

        const selectEl = el as HTMLSelectElement;

        // Find option by value or text
        let found = false;
        for (const opt of selectEl.options) {
            if ((value !== undefined && opt.value === value) || (text !== undefined && opt.text === text)) {
                opt.selected = true;
                found = true;
                break;
            }
        }

        if (!found) {
            return { success: false, error: `Option with ${value ? 'value="' + value + '"' : 'text="' + text + '"'} not found` };
        }

        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        selectEl.dispatchEvent(new Event('input', { bubbles: true }));

        return { success: true, description: `Selected option: ${text || value}` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// Visual Feedback
// ============================================================

/**
 * Highlight an element visually with an overlay.
 */
export function highlightElement(
    index: number | undefined,
    selector: string | undefined,
    color: string = 'rgba(255, 100, 0, 0.35)',
    duration: number = 2000
): { success: boolean; error?: string } {
    try {
        let el: Element | null = null;

        if (index && index > 0) {
            el = document.querySelector(`[data-ba-idx="${index}"]`);
        } else if (selector) {
            el = document.querySelector(selector);
        }

        if (!el) {
            return { success: false, error: 'Element not found' };
        }

        const rect = el.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            background: ${color};
            border: 2px solid rgba(255, 100, 0, 0.8);
            border-radius: 4px;
            z-index: 2147483646;
            pointer-events: none;
            transition: opacity 0.3s ease;
        `;

        document.body.appendChild(highlight);

        setTimeout(() => {
            highlight.style.opacity = '0';
            setTimeout(() => highlight.remove(), 300);
        }, duration);

        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ============================================================
// Form Filling
// ============================================================

/**
 * Fill multiple form fields at once.
 */
export function fillFormFields(fields: Record<string, string>): {
    success: boolean;
    filled: number;
    failed: string[];
} {
    const failed: string[] = [];
    let filled = 0;

    for (const [selector, value] of Object.entries(fields)) {
        try {
            const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            if (!el) {
                failed.push(`${selector}: not found`);
                continue;
            }

            const tag = el.tagName.toLowerCase();

            if (tag === 'select') {
                const selectEl = el as HTMLSelectElement;
                let optFound = false;
                for (const opt of selectEl.options) {
                    if (opt.value === value || opt.text === value) {
                        opt.selected = true;
                        optFound = true;
                        break;
                    }
                }
                if (!optFound) {
                    failed.push(`${selector}: option "${value}" not found`);
                    continue;
                }
            } else if (tag === 'input' && ((el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio')) {
                (el as HTMLInputElement).checked = value === 'true' || value === '1';
            } else {
                (el as HTMLInputElement).value = value;
            }

            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
        } catch (e: any) {
            failed.push(`${selector}: ${e.message}`);
        }
    }

    return { success: failed.length === 0, filled, failed };
}

// ============================================================
// Internal helpers (inlined for page context self-containment)
// ============================================================
