import React from 'react';
import { Bug } from 'lucide-react';
import DomTreePanel from './panels/DomTreePanel';
import PageTextPanel from './panels/PageTextPanel';
import ScreenshotPanel from './panels/ScreenshotPanel';
import ExtractLinksPanel from './panels/ExtractLinksPanel';
import PageMetadataPanel from './panels/PageMetadataPanel';
import SearchPagePanel from './panels/SearchPagePanel';
import FindElementsPanel from './panels/FindElementsPanel';
import HighlightPanel from './panels/HighlightPanel';
import ScrollPanel from './panels/ScrollPanel';
import EvaluateJsPanel from './panels/EvaluateJsPanel';
import AgentStatusPanel from './panels/AgentStatusPanel';

const DebugLayout: React.FC = () => {
    return (
        <div className="flex flex-col h-screen bg-[var(--chrome-bg)] text-[var(--chrome-text)] font-['Inter',system-ui,sans-serif] relative overflow-hidden">
            {/* Header */}
            <div className="debug-header">
                <div className="flex items-center gap-2">
                    <Bug className="w-4.5 h-4.5 text-[#f59e0b]" />
                    <span className="text-sm font-semibold">Browser Agent Debugger</span>
                </div>
                <span className="text-xs text-[var(--chrome-text-secondary)]">
                    Inspect & test agent functions
                </span>
            </div>

            {/* Scrollable panels */}
            <div className="flex-1 overflow-y-auto debug-scroll-area">
                <div className="debug-panels-grid">
                    <DomTreePanel />
                    <PageTextPanel />
                    <ScreenshotPanel />
                    <ExtractLinksPanel />
                    <PageMetadataPanel />
                    <SearchPagePanel />
                    <FindElementsPanel />
                    <HighlightPanel />
                    <ScrollPanel />
                    <EvaluateJsPanel />
                    <AgentStatusPanel />
                </div>
            </div>
        </div>
    );
};

export default DebugLayout;
