import React from 'react';
import type { AgentStep, AgentStepAction } from '../../context/AgentContext';
import {
    Globe, Camera, Search, Type, MousePointerClick,
    ArrowUp, ArrowDown, Keyboard, Code, Link2,
    Eye, FormInput, ChevronLeft, Clock, CheckCircle2,
    Loader2, XCircle, Square, List
} from 'lucide-react';

// ============================================================
// Tool Icon Map
// ============================================================

function getToolIcon(toolName: string): React.ReactNode {
    const iconClass = 'w-4 h-4';
    const map: Record<string, React.ReactNode> = {
        'navigate': <Globe className={iconClass} />,
        'go-back': <ChevronLeft className={iconClass} />,
        'capture-visible-tab': <Camera className={iconClass} />,
        'get-page-text': <Eye className={iconClass} />,
        'get-elements': <List className={iconClass} />,
        'click-element': <MousePointerClick className={iconClass} />,
        'type-text': <Type className={iconClass} />,
        'scroll': <ArrowDown className={iconClass} />,
        'send-keys': <Keyboard className={iconClass} />,
        'search-page': <Search className={iconClass} />,
        'find-elements': <Search className={iconClass} />,
        'evaluate-js': <Code className={iconClass} />,
        'extract-links': <Link2 className={iconClass} />,
        'get-page-metadata': <Eye className={iconClass} />,
        'highlight-element': <Eye className={iconClass} />,
        'fill-form': <FormInput className={iconClass} />,
        'wait-for-element': <Clock className={iconClass} />,
        'wait-for-navigation': <Clock className={iconClass} />,
        'get-dropdown-options': <List className={iconClass} />,
        'select-dropdown-option': <List className={iconClass} />,
        'done': <CheckCircle2 className={iconClass} />,
    };
    return map[toolName] || <Square className={iconClass} />;
}

// ============================================================
// Format action description
// ============================================================

function formatActionText(action: AgentStepAction): string {
    const { toolName, params, description } = action;
    if (description) return description;

    switch (toolName) {
        case 'navigate':
            return `Navigate to ${params?.url || '...'}`;
        case 'go-back':
            return 'Go back';
        case 'capture-visible-tab':
            return 'Take screenshot';
        case 'get-page-text':
            return 'Read page content';
        case 'get-elements':
            return 'Get interactive elements';
        case 'click-element':
            if (params?.elementLabel) return `Click: ${params.elementLabel}`;
            if (params?.index) return `Click element #${params.index}`;
            if (params?.coordinateX) return `Click at (${params.coordinateX}, ${params.coordinateY})`;
            return `Click: ${params?.selector || '...'}`;
        case 'type-text': {
            const label = params?.elementLabel ? ` in ${params.elementLabel}` : '';
            return `Type "${(params?.text || '').slice(0, 40)}${(params?.text || '').length > 40 ? '...' : ''}"${label}`;
        }
        case 'scroll': {
            const label = params?.elementLabel ? ` in ${params.elementLabel}` : '';
            return `Scroll ${params?.direction || 'down'}${label}`;
        }
        case 'send-keys':
            return `Send keys: ${params?.keys || '...'}`;
        case 'search-page':
            return `Find: "${params?.pattern || '...'}"`;
        case 'find-elements':
            return `Find: "${params?.selector || '...'}"`;
        case 'evaluate-js':
            return 'Execute JavaScript';
        case 'extract-links':
            return 'Extract page links';
        case 'fill-form':
            return 'Fill form fields';
        case 'done':
            return params?.success ? 'Task completed' : 'Task could not be completed';
        default:
            return toolName;
    }
}

// ============================================================
// Action Card Component
// ============================================================

const ActionCard: React.FC<{ action: AgentStepAction }> = ({ action }) => {
    const isExecuting = action.status === 'executing';
    const isError = action.status === 'error' || !!action.error;

    return (
        <div className={`action-card ${isError ? 'action-card-error' : ''} ${isExecuting ? 'action-card-executing' : ''}`}>
            <span className="action-card-icon">
                {isExecuting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    getToolIcon(action.toolName)
                )}
            </span>
            <span className="action-card-text">
                {formatActionText(action)}
            </span>
            {isError && action.error && (
                <XCircle className="w-3.5 h-3.5 text-[var(--error)] shrink-0 ml-auto" />
            )}
        </div>
    );
};

// ============================================================
// Step Card Component
// ============================================================

interface AgentStepCardProps {
    step: AgentStep;
}

const AgentStepCard: React.FC<AgentStepCardProps> = ({ step }) => {
    return (
        <div className="agent-step-card">
            {/* Thinking / narrative text */}
            {step.nextGoal && (
                <p className="text-sm leading-relaxed text-[var(--chrome-text)] mb-3 agent-step-text">
                    {step.nextGoal}
                </p>
            )}

            {/* Action cards */}
            {step.actions.length > 0 && (
                <div className="flex flex-col gap-2">
                    {step.actions.map((action, i) => (
                        <ActionCard key={i} action={action} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default AgentStepCard;
