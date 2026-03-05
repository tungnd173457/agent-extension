// Browser Agent - Agent Types
// TypeScript types for the autonomous agent loop

// ============================================================
// Agent Configuration
// ============================================================

export interface AgentConfig {
    /** The user's task description */
    task: string;
    /** OpenAI API key */
    apiKey: string;
    /** LLM model to use */
    model?: string;
    /** Maximum number of steps before stopping */
    maxSteps?: number;
    /** Maximum actions LLM can output per step */
    maxActionsPerStep?: number;
    /** Max consecutive failures before stopping */
    maxFailures?: number;
    /** Include screenshot in LLM context */
    useVision?: boolean;
    /** Max chars for interactive elements in prompt */
    maxElementsLength?: number;
    /** Rolling window for loop detection */
    loopDetectionWindow?: number;
    /** Enable history compaction */
    enableCompaction?: boolean;
    /** Compact every N steps */
    compactEveryNSteps?: number;
    /** Char threshold to trigger compaction */
    compactTriggerChars?: number;
}

export const DEFAULT_AGENT_CONFIG: Required<Omit<AgentConfig, 'task' | 'apiKey'>> = {
    model: 'gpt-4.1-mini',
    maxSteps: 50,
    maxActionsPerStep: 5,
    maxFailures: 5,
    useVision: true,
    maxElementsLength: 40000,
    loopDetectionWindow: 20,
    enableCompaction: true,
    compactEveryNSteps: 15,
    compactTriggerChars: 40000,
};

// ============================================================
// Agent Brain (LLM Structured Output)
// ============================================================

export interface AgentBrain {
    thinking?: string;
    evaluation_previous_goal: string;
    memory: string;
    next_goal: string;
    action: AgentAction[];
}

export interface AgentAction {
    [toolName: string]: Record<string, any>;
}

// ============================================================
// Action Result
// ============================================================

export interface AgentActionResult {
    isDone?: boolean;
    success?: boolean;
    error?: string;
    extractedContent?: string;
    extractedImage?: string;
    toolName: string;
    description?: string;
}

// ============================================================
// History Item (for agent memory)
// ============================================================

export interface HistoryItem {
    stepNumber: number | null;
    evaluation?: string;
    memory?: string;
    nextGoal?: string;
    actionResults?: string;
    imageUrls?: string[];
    error?: string;
    systemMessage?: string;
}

export function historyItemToString(item: HistoryItem): string {
    const stepTag = item.stepNumber !== null ? `step_${item.stepNumber}` : 'step_unknown';

    if (item.error) {
        return `<${stepTag}>\n${item.error}`;
    }
    if (item.systemMessage) {
        return item.systemMessage;
    }

    const parts: string[] = [];
    if (item.evaluation) parts.push(item.evaluation);
    if (item.memory) parts.push(item.memory);
    if (item.nextGoal) parts.push(item.nextGoal);
    if (item.actionResults) parts.push(item.actionResults);

    return `<${stepTag}>\n${parts.join('\n')}`;
}

// ============================================================
// Agent State
// ============================================================

export interface AgentState {
    nSteps: number;
    consecutiveFailures: number;
    lastResult: AgentActionResult[] | null;
    lastModelOutput: AgentBrain | null;
    stopped: boolean;
    taskId: string;
}

// ============================================================
// Step Info
// ============================================================

export interface AgentStepInfo {
    stepNumber: number;
    maxSteps: number;
}

// ============================================================
// Browser State Summary (for LLM context)
// ============================================================

export interface ScrollInfo {
    scrollY: number;
    scrollHeight: number;
    viewportHeight: number;
    pagesAbove: number;
    pagesBelow: number;
}

export interface BrowserStateSummary {
    url: string;
    title: string;
    scrollInfo: ScrollInfo;
    /** Tree-structured interactive elements text from buildDOMTree */
    elementsText: string;
    /** Number of interactive elements found */
    elementCount: number;
    /** Base64 screenshot data URL (if vision enabled) */
    screenshot?: string;
}

// ============================================================
// Loop Detection Types
// ============================================================

export interface PageFingerprint {
    url: string;
    elementCount: number;
    textHash: string;
}

export interface LoopDetectorState {
    windowSize: number;
    recentActionHashes: string[];
    recentPageFingerprints: PageFingerprint[];
    maxRepetitionCount: number;
    mostRepeatedHash: string | null;
    consecutiveStagnantPages: number;
}

// ============================================================
// Agent Events (for UI communication)
// ============================================================

export type AgentEventType =
    | 'agent:step-start'
    | 'agent:thinking'
    | 'agent:action-executed'
    | 'agent:step-complete'
    | 'agent:done'
    | 'agent:error'
    | 'agent:stopped';

export interface AgentEvent {
    type: AgentEventType;
    taskId: string;
    stepNumber?: number;
    data?: any;
}

// ============================================================
// OpenAI Message Types (for LLM calls)
// ============================================================

export interface LLMTextContent {
    type: 'text';
    text: string;
}

export interface LLMImageContent {
    type: 'image_url';
    image_url: {
        url: string;
        detail?: 'auto' | 'low' | 'high';
    };
}

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | (LLMTextContent | LLMImageContent)[];
}
