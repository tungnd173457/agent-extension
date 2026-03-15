// Browser Agent - Agent Service (Core Loop)
// Orchestrates the Read → Think → Act cycle

import type {
    AgentConfig,
    AgentBrain,
    AgentAction,
    AgentActionResult,
    AgentState,
    AgentStepInfo,
    AgentEvent,
    LLMMessage,
    BrowserStateSummary,
} from '../types/agent-types';
import { DEFAULT_AGENT_CONFIG } from '../types/agent-types';
import { LoopDetector } from './loop-detector';
import { MessageManager } from './message-manager';
import { extractBrowserState, getRawPageText } from './state-extractor';
import { handleBrowserAgentAction } from '../tools';
import { NetworkIdleTracker } from './network-idle-tracker';
import { waitForPageStable, captureFingerprint } from './page-stability';
import OpenAI from 'openai';

// ============================================================
// Agent Runner
// ============================================================

export class BrowserAgentRunner {
    private config: Required<Omit<AgentConfig, 'task' | 'apiKey'>> & { task: string; apiKey: string };
    private state: AgentState;
    private loopDetector: LoopDetector;
    private messageManager: MessageManager;
    private networkTracker: NetworkIdleTracker;

    constructor(config: AgentConfig) {
        this.config = {
            ...DEFAULT_AGENT_CONFIG,
            ...config,
        } as any;

        this.state = {
            nSteps: 0,
            consecutiveFailures: 0,
            lastResult: null,
            lastModelOutput: null,
            stopped: false,
            taskId: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        };

        this.loopDetector = new LoopDetector(this.config.loopDetectionWindow);
        this.messageManager = new MessageManager(this.config.task, this.config.maxActionsPerStep);
        this.networkTracker = new NetworkIdleTracker();
    }

    /** Get the task ID */
    getTaskId(): string {
        return this.state.taskId;
    }

    /** Get current step */
    getCurrentStep(): number {
        return this.state.nSteps;
    }

    /** Stop the agent */
    stop(): void {
        this.state.stopped = true;
        console.log(`🛑 Agent ${this.state.taskId} stop requested`);
    }

    /** Check if the agent is running */
    isRunning(): boolean {
        return !this.state.stopped && this.state.nSteps < this.config.maxSteps;
    }

    /**
     * Check if a specific action may trigger a page change (navigation or SPA update).
     */
    private isPageChangingAction(toolName: string, params: Record<string, any>): boolean {
        if (['click-element', 'go-back', 'select-dropdown-option'].includes(toolName)) return true;
        if (toolName === 'type-text' && params.pressEnter === true) return true;
        if (toolName === 'send-keys' && typeof params.keys === 'string' && params.keys.includes('Enter')) return true;
        return false;
    }

    /**
     * Check if any action in the list may trigger a page change.
     */
    private wasPageChangingAction(actions: AgentAction[]): boolean {
        return actions.some(action => {
            const entries = Object.entries(action);
            if (entries.length === 0) return false;
            const [toolName, params] = entries[0];
            return this.isPageChangingAction(toolName, params);
        });
    }

    // ============================================================
    // Main Loop
    // ============================================================

    async run(): Promise<{ success: boolean; result?: string; steps: number }> {
        console.log(`🤖 Agent started. Task: "${this.config.task.slice(0, 100)}"`);
        console.log(`📋 Config: model=${this.config.model}, maxSteps=${this.config.maxSteps}, vision=${this.config.useVision}`);

        this.emitEvent('agent:step-start', { taskId: this.state.taskId, task: this.config.task });

        let finalResult: string | undefined;
        let finalSuccess = false;

        try {
            // Start tracking network requests for the active tab
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (activeTab?.id) {
                this.networkTracker.start(activeTab.id);
            }

            while (this.state.nSteps < this.config.maxSteps && !this.state.stopped) {
                const stepInfo: AgentStepInfo = {
                    stepNumber: this.state.nSteps,
                    maxSteps: this.config.maxSteps,
                };

                try {
                    // ═══════════════════════════════════════
                    // Phase 1: Extract browser state
                    // ═══════════════════════════════════════
                    this.emitEvent('agent:step-start', { step: this.state.nSteps });

                    const browserState = await extractBrowserState(
                        this.config.maxElementsLength,
                        this.config.useVision,
                    );

                    // Record page state for loop detection
                    const rawText = browserState.elementsText.slice(0, 5000);
                    this.loopDetector.recordPageState(browserState.url, rawText, browserState.elementCount);

                    // ═══════════════════════════════════════
                    // Phase 2: Build messages & call LLM
                    // ═══════════════════════════════════════
                    const nudges: string[] = [];
                    const loopNudge = this.loopDetector.getNudgeMessage();
                    if (loopNudge) nudges.push(loopNudge);

                    const messages = this.messageManager.buildMessages(browserState, stepInfo, nudges);
                    const brain = await this.callLLM(messages);

                    if (!brain) {
                        this.state.consecutiveFailures++;
                        this.messageManager.addStepResult(this.state.nSteps, null, []);
                        this.state.nSteps++;

                        if (this.state.consecutiveFailures >= this.config.maxFailures) {
                            console.error(`❌ Max failures (${this.config.maxFailures}) reached. Stopping.`);
                            break;
                        }
                        continue;
                    }

                    this.state.lastModelOutput = brain;

                    // Emit thinking
                    if (brain.thinking) {
                        this.emitEvent('agent:thinking', {
                            step: this.state.nSteps,
                            thinking: brain.thinking,
                            evaluation: brain.evaluation_previous_goal,
                            memory: brain.memory,
                            nextGoal: brain.next_goal,
                        });
                    }

                    console.log(`📝 Step ${this.state.nSteps}: ${brain.next_goal}`);

                    // ═══════════════════════════════════════
                    // Phase 3: Execute actions
                    // ═══════════════════════════════════════

                    // Capture pre-action DOM fingerprint for stability detection
                    let preActionFingerprint = '';
                    if (this.wasPageChangingAction(brain.action)) {
                        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (currentTab?.id) {
                            preActionFingerprint = await captureFingerprint(currentTab.id);
                            this.networkTracker.resetPending();
                        }
                    }

                    const results = await this.executeActions(brain.action);
                    this.state.lastResult = results;

                    // Wait for page stability after page-changing actions
                    if (preActionFingerprint) {
                        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (currentTab?.id) {
                            const stabilityResult = await waitForPageStable(
                                currentTab.id,
                                this.networkTracker,
                                preActionFingerprint,
                                {
                                    networkQuietMs: this.config.networkQuietMs,
                                    domConfirmMs: this.config.domConfirmMs,
                                    maxTimeoutMs: this.config.stabilityTimeoutMs,
                                },
                            );
                            console.log(`⏳ Page stability: stable=${stabilityResult.stable}, changed=${stabilityResult.changed}, duration=${stabilityResult.durationMs}ms`);
                        }
                    }

                    // Record actions for loop detection
                    for (const action of brain.action) {
                        const [toolName, params] = Object.entries(action)[0];
                        this.loopDetector.recordAction(toolName, params);
                    }

                    // Update history
                    this.messageManager.addStepResult(this.state.nSteps, brain, results);

                    // ═══════════════════════════════════════
                    // Phase 4: Post-processing
                    // ═══════════════════════════════════════

                    // Check for done action
                    const doneResult = results.find(r => r.isDone);
                    if (doneResult) {
                        finalResult = doneResult.extractedContent;
                        finalSuccess = doneResult.success ?? false;
                        console.log(`✅ Agent completed. Success: ${finalSuccess}`);
                        this.emitEvent('agent:done', {
                            step: this.state.nSteps,
                            success: finalSuccess,
                            result: finalResult,
                        });
                        break;
                    }

                    // Track consecutive failures
                    const hasError = results.some(r => r.error);
                    if (hasError && results.length === 1) {
                        this.state.consecutiveFailures++;
                    } else if (!hasError) {
                        this.state.consecutiveFailures = 0;
                    }

                    if (this.state.consecutiveFailures >= this.config.maxFailures) {
                        console.error(`❌ Max failures (${this.config.maxFailures}) reached. Stopping.`);
                        this.emitEvent('agent:error', { error: 'Max consecutive failures reached' });
                        break;
                    }

                    // Maybe compact history
                    if (this.config.enableCompaction) {
                        await this.messageManager.maybeCompact(
                            this.config.apiKey,
                            this.config.model,
                            this.state.nSteps,
                            this.config.compactEveryNSteps,
                            this.config.compactTriggerChars,
                        );
                    }

                    this.emitEvent('agent:step-complete', { step: this.state.nSteps });

                } catch (stepError: any) {
                    console.error(`❌ Step ${this.state.nSteps} error:`, stepError.message);
                    this.state.consecutiveFailures++;
                    this.messageManager.addStepResult(this.state.nSteps, null, [{
                        toolName: 'step-error',
                        error: stepError.message,
                    }]);
                    this.emitEvent('agent:error', { step: this.state.nSteps, error: stepError.message });

                    if (this.state.consecutiveFailures >= this.config.maxFailures) {
                        break;
                    }
                }

                this.state.nSteps++;
            }

        } catch (fatalError: any) {
            console.error(`💀 Fatal agent error:`, fatalError.message);
            this.emitEvent('agent:error', { error: fatalError.message, fatal: true });
        } finally {
            this.networkTracker.stop();
        }

        // If stopped or max steps without done, emit stopped
        if (!finalResult && this.state.stopped) {
            this.emitEvent('agent:stopped', { step: this.state.nSteps });
        } else if (!finalResult) {
            // Max steps reached without done
            this.emitEvent('agent:done', {
                step: this.state.nSteps,
                success: false,
                result: 'Agent reached maximum steps without completing the task.',
            });
        }

        return {
            success: finalSuccess,
            result: finalResult,
            steps: this.state.nSteps,
        };
    }

    // ============================================================
    // LLM Call
    // ============================================================

    private async callLLM(messages: LLMMessage[]): Promise<AgentBrain | null> {
        try {
            const openai = new OpenAI({
                apiKey: this.config.apiKey,
                dangerouslyAllowBrowser: true,
            });

            const response = await openai.chat.completions.create({
                model: this.config.model,
                messages: messages as any,
                temperature: 0.3,
                max_tokens: 4096,
                response_format: { type: 'json_object' },
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                console.error('🔴 LLM returned empty content');
                return null;
            }

            // Parse JSON output
            const brain: AgentBrain = JSON.parse(content);

            // Validate required fields
            if (!brain.action || !Array.isArray(brain.action) || brain.action.length === 0) {
                console.error('🔴 LLM output missing action array');
                return null;
            }

            // Enforce max actions per step
            if (brain.action.length > this.config.maxActionsPerStep) {
                brain.action = brain.action.slice(0, this.config.maxActionsPerStep);
            }

            return brain;

        } catch (error: any) {
            console.error(`🔴 LLM call error: ${error.message}`);
            return null;
        }
    }

    // ============================================================
    // Action Execution
    // ============================================================

    private async executeActions(actions: AgentAction[]): Promise<AgentActionResult[]> {
        const results: AgentActionResult[] = [];

        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            const entries = Object.entries(action);
            if (entries.length === 0) continue;

            const [toolName, params] = entries[0];

            this.emitEvent('agent:action-executed', {
                step: this.state.nSteps,
                actionIndex: i,
                totalActions: actions.length,
                toolName,
                params,
            });

            // Handle the special "done" action
            if (toolName === 'done') {
                results.push({
                    toolName: 'done',
                    isDone: true,
                    success: params.success ?? false,
                    extractedContent: params.text ?? '',
                    description: `Task completed. Success: ${params.success}`,
                });
                return results; // Stop processing more actions
            }

            // Dispatch to existing tools
            try {
                const toolResult = await handleBrowserAgentAction({
                    tool: toolName as any,
                    params,
                });

                const agentResult: AgentActionResult = {
                    toolName,
                    description: toolResult.data?.description ?? undefined,
                };

                if (toolResult.success) {
                    // Extract useful content from tool result
                    if (toolResult.data) {
                        if (toolResult.data.imageUrl) {
                            agentResult.extractedImage = toolResult.data.imageUrl;
                            agentResult.description = toolResult.data.description || 'Captured image';
                        } else if (typeof toolResult.data === 'string') {
                            agentResult.extractedContent = toolResult.data;
                        } else if (toolResult.data.text) {
                            agentResult.extractedContent = typeof toolResult.data.text === 'string'
                                ? toolResult.data.text.slice(0, 2000)
                                : undefined;
                        } else if (toolResult.data.description) {
                            agentResult.description = toolResult.data.description;
                        }
                    }
                } else {
                    agentResult.error = toolResult.error ?? 'Unknown tool error';
                }

                results.push(agentResult);

                console.log(`  ↳ [${toolName}] ${agentResult.error ? '❌ ' + agentResult.error : '✓ ' + (agentResult.description ?? 'OK')}`);

                // If page might have changed, wait for stability before next action
                if (this.isPageChangingAction(toolName, params) && i < actions.length - 1) {
                    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (currentTab?.id) {
                        const midFingerprint = await captureFingerprint(currentTab.id);
                        this.networkTracker.resetPending();
                        await waitForPageStable(
                            currentTab.id,
                            this.networkTracker,
                            midFingerprint,
                            {
                                networkQuietMs: this.config.networkQuietMs,
                                domConfirmMs: this.config.domConfirmMs,
                                maxTimeoutMs: this.config.stabilityTimeoutMs,
                            },
                        );
                    }
                }

            } catch (error: any) {
                results.push({
                    toolName,
                    error: error.message ?? 'Tool execution failed',
                });
                console.error(`  ↳ [${toolName}] ❌ Exception: ${error.message}`);
            }
        }

        return results;
    }

    // ============================================================
    // Event Emission
    // ============================================================

    private emitEvent(type: AgentEvent['type'], data?: any): void {
        const event: AgentEvent = {
            type,
            taskId: this.state.taskId,
            stepNumber: this.state.nSteps,
            data,
        };

        try {
            chrome.runtime.sendMessage({
                action: 'browserAgentEvent',
                event,
            });
        } catch {
            // Message sending may fail if no listeners
        }
    }
}

// ============================================================
// Active runners registry (for background script)
// ============================================================

const activeRunners = new Map<string, BrowserAgentRunner>();

/**
 * Start a new agent task
 */
export async function startAgentTask(config: AgentConfig): Promise<{ taskId: string }> {
    const runner = new BrowserAgentRunner(config);
    const taskId = runner.getTaskId();
    activeRunners.set(taskId, runner);

    // Run in background (don't await)
    runner.run().then(result => {
        console.log(`🏁 Agent ${taskId} finished: success=${result.success}, steps=${result.steps}`);
        activeRunners.delete(taskId);
    }).catch(err => {
        console.error(`💀 Agent ${taskId} crashed:`, err);
        activeRunners.delete(taskId);
    });

    return { taskId };
}

/**
 * Stop an active agent
 */
export function stopAgentTask(taskId: string): boolean {
    const runner = activeRunners.get(taskId);
    if (runner) {
        runner.stop();
        return true;
    }
    return false;
}

/**
 * Get status of an active agent
 */
export function getAgentStatus(taskId: string): { running: boolean; step: number } | null {
    const runner = activeRunners.get(taskId);
    if (!runner) return null;
    return {
        running: runner.isRunning(),
        step: runner.getCurrentStep(),
    };
}

/**
 * Get all active agent task IDs
 */
export function getActiveAgents(): string[] {
    return Array.from(activeRunners.keys());
}
