# Sidebar Redesign — Design Spec

**Date:** 2026-03-11
**Status:** Approved

---

## Overview

Rebuild the frontend UI of the AnyTools Chrome extension side panel. The goal is a clean, consistent visual language that mirrors the Sider Fusion reference aesthetic: white background, single purple accent, restrained typography, and no visual clutter.

---

## Design Constraints

- Max 2 font families
- Max 4 font sizes
- Consistent spacing scale (no random values)
- Single primary color: `#7c3aed` (purple)
- No saturated background colors
- No heavy shadows
- No thick borders
- Consistent border radius throughout
- No dense layouts
- Minimal UI elements — no unused controls
- Single visual style, no mixing

---

## Design Tokens

### New token namespace (`--color-*`)

Define in `:root` in `index.css`:

```css
--color-primary: #7c3aed;
--color-primary-light: #a78bfa;
--color-primary-tint: #f0ebff;
--color-bg: #ffffff;
--color-surface: #fafafa;
--color-border: #e0e0e0;
--color-border-light: #f0f0f0;
--color-text: #202124;
--color-text-secondary: #5f6368;
--color-text-muted: #9aa0a6;
--color-text-placeholder: #bbb;
--color-send-inactive: #9aa0a6;
```

### Legacy token aliases

The existing codebase uses `--chrome-*` tokens across out-of-scope components. Alias them to the new values in `:root` so those components adopt the new palette without file-by-file edits:

```css
--chrome-bg: var(--color-bg);
--chrome-text: var(--color-text);
--chrome-text-secondary: var(--color-text-secondary);
--chrome-border: var(--color-border);
--chrome-input-bg: var(--color-bg);
```

**Note:** `--chrome-border` currently resolves to `rgba(0,0,0,0.12)`. After aliasing it to `--color-border` (`#e0e0e0`), borders on out-of-scope components (Agent, Debug, OCR panels) will change subtly. This is intentional.

**`--chrome-border-light` does not currently exist in the codebase.** `--color-border-light` is a new token introduced by this spec. No alias is needed — only in-scope components use it, and they reference it directly as `var(--color-border-light)`.

### Dark mode

**Delete all `@media (prefers-color-scheme: dark)` and `@media (prefers-color-scheme: light)` blocks from `index.css`.** There are approximately 7 dark-mode blocks and 2 light-mode blocks scattered across the file (`:root`, `.sidebar-item:hover`, `.action-card`, `.debug-btn:hover`, `.agent-done-banner`, code-block sections, etc.). Remove all of them. Dark mode is out of scope for this redesign.

For code blocks (currently conditionally styled with `background: #f6f8fa; color: #24292e` in a light-mode media query): apply those values unconditionally — `background: #f6f8fa; color: #24292e` — so code blocks remain readable after the media query is removed.

### Typography
- Font family: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` — single stack, no Inter.
- **Remove the hardcoded `font-['Inter',system-ui,sans-serif]` class from `ChatLayout.tsx`** (currently on the wrapper div). This is the only place Inter is injected; removing it ensures the system stack is used throughout.
- 4 sizes only (ascending), using Tailwind arbitrary values:
  - `text-[10px]` — selector labels, secondary controls, dropdown option rows
  - `text-[11px]` — chatbox textarea placeholder, small labels
  - `text-[12px]` — body / message text
  - `text-[13px]` — header title

### Spacing scale
`4px · 6px · 8px · 10px · 12px · 14px · 16px`

The chatbox `padding: 9px 10px 7px 11px` uses off-scale values intentionally to achieve compact internal rhythm for this specific element. These are the only allowed exceptions.

### Border radius
- `6px` — small controls (tool buttons, selectors, `ToolbarDropdown` trigger)
- `8px` — icon rail buttons, `ToolbarDropdown` open panel
- `10px` — chatbox input
- `12px` — outer shell (dev reference only)
- `50%` — send button, avatar dots

### Borders
- All borders: `1px solid var(--color-border)` or `1px solid var(--color-border-light)`
- No borders thicker than 1px

### Shadows
- Outer shell only: `0 2px 12px rgba(0,0,0,0.06)`
- No shadows on any internal components

---

## Layout

### Shell
```
┌─────────────────────────────────┬──────┐
│  Main content (flex: 1)         │ Rail │
│  ├─ Header                      │ 44px │
│  ├─ Messages (scrollable)       │      │
│  └─ Input area                  │      │
└─────────────────────────────────┴──────┘
```

- Right icon rail: **44px wide** (down from 56px). Update `.sidebar-strip { width: 44px; min-width: 44px; }`.
- Main content: fills remaining width, flex column.

---

## Components

### 1. Header (`ChatHeader.tsx`)
- Remove `bg-[#0f0f10]/80`, `backdrop-blur-sm`, and `border-white/[0.06]` (the existing dark border).
- Replace with: `background: var(--color-bg); border-bottom: 1px solid var(--color-border-light);`
- Height: ~40px
- Left: gradient dot (`width: 16px; height: 16px; border-radius: 50%; background: linear-gradient(135deg, #7c3aed, #a78bfa)`) + title (`text-[13px] font-semibold`, `color: var(--color-text)`)
- **Title:** keep existing dynamic logic: `currentConversation?.title || 'Any Tools'`
- Right: **empty** — no buttons
- **`ChatLayout.tsx` must import and render `<ChatHeader />` at the top of its layout.** It is currently not wired in.

### 2. Right Icon Rail (`Sidebar.tsx`)
- `.sidebar-strip`: `width: 44px; min-width: 44px`
- `.sidebar-item` (outer button): `width: 36px; padding: 2px 4px; border-radius: 8px` — this fits within the 44px rail with 4px margin on each side
- Each icon wrapper: `32×32px`, `border-radius: 8px`
- **Inactive:** no background, icon `color: var(--color-text-muted)`
- **Active (`.sidebar-icon-active`):** `background: var(--color-primary-tint); color: var(--color-primary)`. Remove the existing `linear-gradient` background, white icon color, and `box-shadow`.
- **Text labels removed.** Delete the `.sidebar-label` span and any label text in `Sidebar.tsx`.

### 3. Message List (`MessageList.tsx`, `MessageBubble.tsx`)

#### `MessageList` container
- `padding: 12px` (replace `p-4`)
- `gap: 14px` between messages (replace `gap-1`)

#### AI message (`MessageBubble`)
- Remove the model-icon / model-name / timestamp header row. Remove `chrome.runtime.getURL` model icon logic.
- Layout: row, `gap: 8px`
- Left avatar: `width: 20px; height: 20px; border-radius: 6px; background: var(--color-primary-tint)` — contains an 8px circle (`background: var(--color-primary)`)
- Text: `text-[12px]`, `color: var(--color-text)`, `line-height: 1.6`, `flex: 1`

#### User message (`MessageBubble`)
- `justify-content: flex-end`
- Bubble: `max-width: 68%; background: var(--color-primary-tint); border-radius: 10px 10px 2px 10px; padding: 8px 11px; font-size: text-[12px]; color: var(--color-text)`
- No avatar

#### `ContextBox` and `PageContextBox` (inside `MessageBubble.tsx`)
- Remove all `dark:` variant classes (`dark:border-white/10`, `dark:bg-white/10`, `dark:text-gray-300`, etc.).
- Replace any `dark:`-only colors with their light-mode equivalents using `--color-*` tokens.

### 4. Welcome Screen (`WelcomeScreen.tsx`)
- Replace `text-4xl`, `text-2xl`, and other out-of-scale classes with `text-[13px]` / `text-[12px]`.
- Remove the **"Deep Research" entry only** from `topActions`. Keep Full Screen Chat, My Highlights, AI Slides.
- Remove all `dark:` variant classes.

### 5. Input Area (`ChatInput.tsx`)

#### Outer wrapper
- `padding: 6px 10px 10px 10px`
- **Remove the `border-t` top border** on the outer wrapper.

#### Toolbar row
- `display: flex; gap: 5px; padding-bottom: 6px`
- Left group (3 buttons): `Scissors`, `Paperclip`, `BookOpen`
- Right group (`margin-left: auto`): History, New Chat
- Each button: `26×26px; border-radius: 6px; border: 1px solid var(--color-border); font-size: 13px; color: var(--color-text-secondary)`
- **Remove "Think" and "Deep Research" pill buttons entirely.**
- **Remove the service-provider selector and model selector from this row** — they move to the chatbox bottom row.

#### Chatbox
- `border: 1px solid var(--color-border); border-radius: 10px; padding: 9px 10px 7px 11px`
- Textarea: `text-[11px]`, placeholder `color: var(--color-text-placeholder)`, `min-height: 38px`, `margin-bottom: 7px`
- **No inner divider**
- Bottom row:
  - **Service selector** (`ToolbarDropdown`): `border: 1px solid var(--color-border); border-radius: 6px; padding: 3px 7px; font-size: text-[10px]`
  - **Model selector** (`ToolbarDropdown`): same + 10×10px gradient dot (`background: linear-gradient(135deg, #7c3aed, #a78bfa)`) left of label
  - **Send button:** `26×26px; border-radius: 50%; margin-left: auto`
    - Empty input **and** no screenshot attached: `background: var(--color-send-inactive)`
    - Has text **or** screenshot attached: `background: var(--color-primary)`
    - Streaming (`isStreaming`): `background: var(--color-primary)`, spinner icon

#### Screenshot preview area
- Out of scope for layout changes. Apply `border-radius: 6px; border: 1px solid var(--color-border)` to the container only.

### 6. `ToolbarDropdown.tsx`
- **Trigger:** `border: 1px solid var(--color-border); border-radius: 6px; padding: 3px 7px; font-size: text-[10px]`. Remove `rounded-full` or other conflicting classes.
- **Open panel container:** `border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg)`. Remove `shadow-[0_4px_20px_rgba(0,0,0,0.15)]`.
- **Option rows:** `font-size: text-[10px]`. Keep existing hover/selected opacity states (`bg-[var(--color-text)]/5` hover, `bg-[var(--color-text)]/10` selected) — they remain readable with the new token values.

---

## Module Consistency

All four modules must share the same visual foundation: white background, system font, 4-size type scale, consistent border radius, no shadows on internal components, no dark mode classes. Behavioral and layout logic is unchanged.

### Shared rules for all modules

- Remove `font-['Inter',system-ui,sans-serif]` from any layout wrapper (found in `AgentLayout.tsx`, `ChatLayout.tsx`)
- Replace all `dark:` Tailwind variant classes with their light-mode equivalents
- Replace `text-xs` → `text-[11px]`, `text-sm` → `text-[12px]`, `text-base`/`text-lg`/`text-xl`/`text-2xl` → `text-[13px]`
- Replace `rounded-2xl` → `rounded-[10px]`, `rounded-xl` → `rounded-[8px]`, `rounded-md` → `rounded-[6px]`; keep `rounded-lg` (8px) and `rounded-full` where semantically correct (send buttons, avatars)
- Replace gradient accent buttons (`from-violet-500 to-purple-600`, `linear-gradient(135deg, #8b5cf6, #6d28d9)`) with flat `background: var(--color-primary)`
- Remove all `box-shadow` and `shadow-*` utilities except the outer shell
- Remove `backdrop-filter: blur` from all internal components
- **Semantic status colors are kept as-is:** success green (`#10b981`, `text-emerald-500`) and error red (`#ef4444`, `text-red-400`) are state indicators, not branding, and remain unchanged across all modules

---

### Agent module (`AgentLayout.tsx`, `AgentInput.tsx`, `AgentStepList.tsx`, `AgentStepCard.tsx`, `AgentWelcomeScreen.tsx`, `AgentHistoryPanel.tsx`)

| Issue | Fix |
|-------|-----|
| `font-['Inter'...]` in `AgentLayout.tsx` | Remove — system font stack inherits from body |
| `text-2xl` in `AgentWelcomeScreen` title | → `text-[13px]` |
| `text-lg` in `AgentHistoryPanel` header | → `text-[13px]` |
| `text-sm`, `text-xs` throughout | → `text-[12px]` / `text-[11px]` |
| `rounded-2xl` in `AgentInput` chatbox | → `rounded-[10px]` |
| `rounded-xl` in `AgentWelcomeScreen` buttons | → `rounded-[8px]` |
| `shadow-lg shadow-violet-500/25` on welcome icon badge | Remove shadow; keep gradient background |
| `from-violet-500 to-purple-600` on `AgentInput` send button | → `background: var(--color-primary)` flat |
| All `dark:` classes in all agent files | Remove; use light-mode values only |
| `bg-gradient-to-br from-gray-200 to-gray-300` in `AgentStepList` avatar | → `background: var(--color-surface)` |

---

### Debug module (`DebugLayout.tsx`, `index.css` debug classes)

**Accent color: amber (`#f59e0b`) is intentionally kept** as the debug module's semantic accent. It differentiates the developer tooling from the AI chat interface and is not a branding violation.

| Issue | Fix |
|-------|-----|
| `text-sm`, `text-xs` in `DebugLayout` | → `text-[12px]` / `text-[11px]` |
| `text-[#f59e0b]` orange label — keep | No change needed; amber is the debug accent |
| `.debug-btn-run` gradient (`#f59e0b → #d97706`) — keep gradient, remove shadow | Keep gradient; ensure no `box-shadow` on button |
| `.debug-btn-icon` background: `rgba(245,158,11,0.1)` — keep | No change; amber tint is correct |
| `.debug-output` background: `#1e1e1e` — **keep dark** | Code output stays dark for readability |
| `.debug-table` header `color: #f59e0b` — keep | No change |
| All `@media (prefers-color-scheme: dark)` blocks in debug CSS | Deleted globally (see Dark mode section above) |
| `.debug-output` currently conditionally light (`#f6f8fa`) via `@media light` | After media query removal, set unconditionally to `#1e1e1e` (dark is the chosen style) |

---

### OCR module (`OcrLayout.tsx`, `OcrDropZone.tsx`, `OcrImagePreview.tsx`, `OcrResultPanel.tsx`, `OcrToolbar.tsx`, `index.css` ocr classes)

| Issue | Fix |
|-------|-----|
| `.ocr-drop-zone` border: `2px dashed` | → `1px dashed var(--color-border)` |
| `.ocr-drop-zone` `border-radius: 16px` | → `10px` |
| `.ocr-drop-zone-icon` `box-shadow: 0 2px 10px rgba(124,58,237,0.3)` | Remove shadow |
| `.ocr-screenshot-btn` `box-shadow: 0 4px 14px` + hover `0 6px 20px` | Remove both shadows |
| `.ocr-screenshot-btn` gradient `linear-gradient(135deg, #8b5cf6, #6d28d9)` | → `background: var(--color-primary)` flat |
| `.ocr-screenshot-btn` `font-size: 14px` | → `13px` |
| `.ocr-image-preview` `border-radius: 12px` | → `8px` |
| `.ocr-result-panel` `border-radius: 12px` | → `8px` |
| `.ocr-zoom-btn` `backdrop-filter: blur(8px)` | Remove |
| `.ocr-zoom-btn` dark mode background/border | Remove dark variants; light-mode values only |
| Image preview area dark background `#1a1a2e` | Remove; use `background: var(--color-surface)` |
| `text-base` in `OcrLayout` header | → `text-[13px]` |
| `text-xs`, `text-sm` in OCR components | → `text-[11px]` / `text-[12px]` |
| All `dark:` classes in OCR TSX files | Remove |

---

## Files to Change

### Chat (previously in scope)
| File | Change |
|------|--------|
| `src/pages/sidepanel/index.css` | Define `--color-*` tokens; add `--chrome-*` aliases; delete all dark/light `@media` blocks; update `.sidebar-strip`, `.sidebar-icon-active`; set `.debug-output` bg unconditionally dark; set code block bg unconditionally light |
| `src/pages/sidepanel/components/layout/Sidebar.tsx` | Rail 44px; active = tint (no gradient/shadow); inactive = muted; remove text labels |
| `src/pages/sidepanel/components/layout/ChatLayout.tsx` | Wire in `<ChatHeader />`; remove `font-['Inter'...]` class |
| `src/pages/sidepanel/components/layout/ChatHeader.tsx` | Remove dark bg/blur/border; add gradient dot + dynamic title; no right buttons |
| `src/pages/sidepanel/components/chat/MessageList.tsx` | `padding: 12px`, `gap: 14px` |
| `src/pages/sidepanel/components/chat/MessageBubble.tsx` | Remove model-icon row; new AI avatar; new user bubble; remove `dark:` from `ContextBox`/`PageContextBox` |
| `src/pages/sidepanel/components/chat/WelcomeScreen.tsx` | Remove Deep Research; fix font sizes; remove `dark:` classes |
| `src/pages/sidepanel/components/chat/ChatInput.tsx` | Remove Think/Deep Research; remove `border-t`; move selectors into chatbox; send button states |
| `src/pages/sidepanel/components/shared/ToolbarDropdown.tsx` | Trigger + panel style; remove shadow; option row font-size |

### Agent (expanded scope)
| File | Change |
|------|--------|
| `src/pages/sidepanel/components/agent/AgentLayout.tsx` | Remove `font-['Inter'...]` |
| `src/pages/sidepanel/components/agent/AgentInput.tsx` | Fix border radius; flat send button; remove `dark:` |
| `src/pages/sidepanel/components/agent/AgentStepList.tsx` | Fix avatar bg; fix font sizes; remove `dark:` |
| `src/pages/sidepanel/components/agent/AgentStepCard.tsx` | Fix font sizes; remove `dark:` if present |
| `src/pages/sidepanel/components/agent/AgentWelcomeScreen.tsx` | Fix font sizes; fix border radius; remove shadow from icon badge; flat primary button; remove `dark:` |
| `src/pages/sidepanel/components/agent/AgentHistoryPanel.tsx` | Fix font sizes; fix border radius; remove `dark:` |

### Debug (expanded scope)
| File | Change |
|------|--------|
| `src/pages/sidepanel/components/debug/DebugLayout.tsx` | Fix font sizes (`text-sm` → `text-[12px]`) |
| `src/pages/sidepanel/index.css` (debug classes) | Remove shadow from `.debug-btn-run`; set `.debug-output` bg unconditionally `#1e1e1e`; delete dark-mode media blocks (covered globally) |

### OCR (expanded scope)
| File | Change |
|------|--------|
| `src/pages/sidepanel/components/ocr/OcrLayout.tsx` | Fix font sizes; remove `dark:` |
| `src/pages/sidepanel/components/ocr/OcrDropZone.tsx` | Fix font sizes; remove `dark:` |
| `src/pages/sidepanel/index.css` (ocr classes) | Fix borders (1px), border radii, remove shadows, remove `backdrop-filter`, remove dark image preview bg, flat screenshot button |

---

## Out of Scope

- Dark mode
- New features or behavioral changes
- Options page redesign
- Screenshot preview layout/controls (token border/radius only)
- `ActiveTabSummary` and `SelectionContext` structural changes
- Debug panel internal layout (11 tool panels — token consistency only via CSS class updates in `index.css`)
