// Browser Agent - Prompt Builder
// Builds system prompt and per-step user messages for the LLM

import type {
    AgentStepInfo,
    BrowserStateSummary,
    LLMMessage,
    LLMTextContent,
    LLMImageContent,
} from '../types/agent-types';

// ============================================================
// Available Tools Description
// ============================================================

const TOOLS_DESCRIPTION = `
Available actions (use exact tool names as JSON keys):
- navigate: {"url": "string", "newTab"?: boolean} — Navigate to URL
- go-back: {} — Go back in browser history
- click-element: {"index": number} OR {"selector": "string"} OR {"coordinateX": number, "coordinateY": number} — Click an element
- type-text: {"text": "string", "index"?: number, "selector"?: string, "clear"?: boolean, "pressEnter"?: boolean} — Type text into element
- scroll: {"direction": "up"|"down"|"left"|"right", "amount"?: number, "index"?: number} — Scroll page or element
- send-keys: {"keys": "string"} — Send keyboard shortcut (e.g. "Control+a", "Enter", "Escape")
- wait-for-element: {"selector": "string", "timeout"?: number, "visible"?: boolean} — Wait for element to appear
- wait-for-navigation: {"timeout"?: number} — Wait for page load
- search-page: {"pattern": "string", "regex"?: boolean, "caseSensitive"?: boolean, "maxResults"?: number} — Search page text (grep-like, free & instant)
- find-elements: {"selector": "string", "attributes"?: string[], "includeText"?: boolean, "maxResults"?: number} — Query DOM with CSS selector (free & instant)
- get-page-text: {"includeLinks"?: boolean, "maxLength"?: number} — Get page content as clean text
- get-elements: {} — Get all interactive elements with indices
- get-dropdown-options: {"index"?: number, "selector"?: string} — Get <select> options
- select-dropdown-option: {"index"?: number, "selector"?: string, "value"?: string, "text"?: string} — Select dropdown option
- evaluate-js: {"code": "string"} — Execute JavaScript in page context
- capture-visible-tab: {"format"?: "png"|"jpeg"} — Take screenshot
- extract-links: {"filter"?: string, "includeText"?: boolean} — Extract all links
- get-page-metadata: {} — Get page title, description, OG tags
- highlight-element: {"index"?: number, "selector"?: string, "color"?: string, "duration"?: number} — Highlight element visually
- fill-form: {"fields": {"selector": "value", ...}} — Fill multiple form fields
- done: {"text": "string", "success": boolean} — Complete the task with final result
`.trim();

// ============================================================
// System Prompt Builder
// ============================================================

export function buildSystemPrompt(maxActionsPerStep: number): string {
    return `You are an AI agent designed to automate browser tasks. You operate in an iterative loop: observe the browser state, reason about your progress, then take actions.

<input>
At every step, you receive:
1. <agent_history>: Chronological event stream of your previous actions and results.
2. <agent_state>: Current task, step info, and date.
3. <browser_state>: Current URL, page statistics, interactive elements indexed for actions, scroll position.
4. Screenshot of the current page (if available) — this is your GROUND TRUTH.
</input>

<browser_state_format>
Interactive elements are shown in an indented tree format:
  [index]<tag attribute=value /> — interactive elements with [index] can be clicked/typed into
  |scroll element|<div /> (0.0↑ 2.5↓) — scrollable containers with pages above/below
  text content — visible text on the page

- Use the index number to reference elements in your actions (e.g., click-element with index).
- Indentation represents DOM nesting.
- Only elements with [index] are interactive.
</browser_state_format>

<tools>
${TOOLS_DESCRIPTION}
</tools>

<action_rules>
- You may output up to ${maxActionsPerStep} actions per step, executed sequentially.
- If a page-changing action (navigate, click on a link) is included, place it LAST — subsequent actions will be skipped.
- If the page changes after an action, remaining actions are automatically skipped.
- Always verify your previous action succeeded before proceeding.
- DO NOT repeat the same failing action more than 2-3 times. Try an alternative approach.
</action_rules>

<efficiency>
- Use search-page to quickly find text on the page (free & instant) before scrolling.
- Use find-elements with CSS selectors to explore DOM structure (free & instant).
- Combine safe actions: type-text + click-element, scroll + scroll.
- Place page-changing actions LAST in your action list.
</efficiency>

<done_rules>
- Call "done" when the task is fully complete, or when max_steps is reached.
- Set success=true ONLY if the full task has been completed.
- Put ALL relevant findings in the done action's "text" field.
- You are ONLY allowed to call "done" as a single action, not combined with others.
</done_rules>

<output>
You MUST respond with valid JSON in this exact format:
{
  "thinking": "Your structured reasoning about the current state, what worked/failed, and what to do next.",
  "evaluation_previous_goal": "One sentence: was the last action successful, failed, or uncertain?",
  "memory": "1-3 sentences of key facts to remember: progress, items found, failures to avoid.",
  "next_goal": "One clear sentence describing your next immediate goal.",
  "action": [{"tool_name": {"param": "value"}}, ...]
}
The action array must contain at least one action. Each action is an object with a single key (the tool name) mapped to its parameters object.
</output>

<critical_reminders>
1. ALWAYS verify action success using screenshot or browser_state before proceeding.
2. Handle popups/modals/cookie banners before other actions.
3. NEVER repeat the same failing action more than 2-3 times.
4. NEVER assume success — always verify from screenshot or browser state.
5. Track progress in memory to avoid loops.
6. When at max_steps, call done with whatever results you have.
7. Be efficient — combine actions when possible but verify results between steps.
</critical_reminders>`;
}

// ============================================================
// State Message Builder
// ============================================================

export function buildStateMessage(
    browserState: BrowserStateSummary,
    agentHistoryContent: (LLMTextContent | LLMImageContent)[],
    task: string,
    stepInfo: AgentStepInfo,
    nudgeMessages: string[] = [],
): LLMMessage {
    // --- Page Info ---
    let statsText = `<page_info>\n`;
    statsText += `  ${browserState.elementCount} interactive elements`;
    statsText += `\n  ${browserState.scrollInfo.pagesAbove.toFixed(1)} pages above, `;
    statsText += `${browserState.scrollInfo.pagesBelow.toFixed(1)} pages below`;
    statsText += `\n</page_info>`;



    // --- Elements with start/end markers ---
    let elementsText = browserState.elementsText;
    if (elementsText) {
        if (browserState.scrollInfo.pagesAbove <= 0) {
            elementsText = '[Start of page]\n' + elementsText;
        }
        if (browserState.scrollInfo.pagesBelow <= 0) {
            elementsText = elementsText + '\n[End of page]';
        }
    } else {
        elementsText = 'empty page';
    }

    // --- Date ---
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    // --- Build full state text ---
    let stateText = '';

    // Agent state
    stateText += '<agent_state>\n';
    stateText += `<user_request>\n${task}\n</user_request>\n`;
    stateText += `<step_info>Step ${stepInfo.stepNumber + 1} of ${stepInfo.maxSteps}. Today: ${dateStr}</step_info>\n`;
    stateText += '</agent_state>\n\n';

    // Browser state
    stateText += '<browser_state>\n';
    stateText += `${statsText}\n`;
    stateText += `Current URL: ${browserState.url}\n`;
    stateText += `Title: ${browserState.title}\n\n`;
    stateText += `Interactive elements:\n${elementsText}\n`;
    stateText += '</browser_state>';

    // Nudge messages
    if (nudgeMessages.length > 0) {
        stateText += '\n\n<system_nudge>\n';
        stateText += nudgeMessages.join('\n\n');
        stateText += '\n</system_nudge>';
    }

    const content: (LLMTextContent | LLMImageContent)[] = [];

    // Combine history content
    content.push({ type: 'text', text: '<agent_history>\n' });
    if (agentHistoryContent.length === 0) {
        content.push({ type: 'text', text: '(no history yet)' });
    } else {
        content.push(...agentHistoryContent);
    }
    content.push({ type: 'text', text: '\n</agent_history>\n\n' + stateText });

    // Build message with optional screenshot
    if (browserState.screenshot) {
        content.push({ type: 'text', text: 'Current screenshot:' });
        content.push({
            type: 'image_url',
            image_url: {
                url: browserState.screenshot,
                detail: 'auto',
            },
        });
    }

    return { role: 'user', content };
}

/**
 * Build a budget warning message when the agent has used >= 75% of steps
 */
export function buildBudgetWarning(stepInfo: AgentStepInfo): string | null {
    const ratio = stepInfo.stepNumber / stepInfo.maxSteps;
    if (ratio >= 0.75) {
        const remaining = stepInfo.maxSteps - stepInfo.stepNumber;
        return (
            `⏰ BUDGET WARNING: You have used ${stepInfo.stepNumber} of ${stepInfo.maxSteps} steps (${Math.round(ratio * 100)}%). ` +
            `Only ${remaining} steps remaining. Focus on completing the most important parts of the task and call "done" soon.`
        );
    }
    return null;
}
