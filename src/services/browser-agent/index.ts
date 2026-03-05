// Browser Agent Service - Public API
export { BrowserAgent, default } from './client';

// Agent lifecycle
export { BrowserAgentRunner, startAgentTask, stopAgentTask, getAgentStatus, getActiveAgents } from './core/agent-service';

// Agent types
export type {
    AgentConfig,
    AgentBrain,
    AgentAction,
    AgentActionResult,
    AgentState,
    AgentStepInfo,
    AgentEvent,
    AgentEventType,
    BrowserStateSummary,
    ScrollInfo,
    HistoryItem,
    PageFingerprint,
    LoopDetectorState,
    LLMMessage,
} from './types/agent-types';

// Tool types
export type {
    BrowserAgentAction,
    BrowserAgentMessage,
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
    GetElementsAction,
    GetPageMetadataAction,
    ToolResult,
    InteractiveElement,
    PageElements,
    PageText,
    SearchMatch,
    SearchResult,
    FoundElement,
    FindResult,
    LinkInfo,
    PageMetadata,
    DropdownOption,
} from './types';
