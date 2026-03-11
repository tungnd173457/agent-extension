import React, { useState, useEffect, useCallback } from 'react';
import OcrDropZone from './OcrDropZone';
import OcrImagePreview from './OcrImagePreview';
import OcrResultPanel from './OcrResultPanel';
import OcrToolbar from './OcrToolbar';

export type OcrStatus = 'idle' | 'imageLoaded' | 'extracting' | 'done' | 'error';

const OcrLayout: React.FC = () => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [status, setStatus] = useState<OcrStatus>('idle');
    const [resultText, setResultText] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // Listen for messages from background
    useEffect(() => {
        const handler = (request: any) => {
            if (request.action === 'ocrResult') {
                setResultText(request.text);
                setStatus('done');
            }
            if (request.action === 'ocrError') {
                setErrorMsg(request.error);
                setStatus('error');
            }
            if (request.action === 'ocrScreenshotCaptured') {
                setImageUrl(request.imageUrl);
                setStatus('imageLoaded');
                setResultText('');
                setErrorMsg('');
            }
            if (request.action === 'ocrImagePicked') {
                setImageUrl(request.imageUrl);
                setStatus('imageLoaded');
                setResultText('');
                setErrorMsg('');
            }
        };

        chrome.runtime.onMessage.addListener(handler);
        return () => chrome.runtime.onMessage.removeListener(handler);
    }, []);

    const handleImageSelected = useCallback((dataUrl: string) => {
        setImageUrl(dataUrl);
        setStatus('imageLoaded');
        setResultText('');
        setErrorMsg('');
    }, []);

    const handleExtract = useCallback(() => {
        if (!imageUrl) return;
        setStatus('extracting');
        setErrorMsg('');
        chrome.runtime.sendMessage({
            action: 'ocrExtractText',
            imageDataUrl: imageUrl,
        });
    }, [imageUrl]);

    const handleClear = useCallback(() => {
        setImageUrl(null);
        setStatus('idle');
        setResultText('');
        setErrorMsg('');
    }, []);

    const handleScreenshot = useCallback(() => {
        chrome.runtime.sendMessage({ action: 'ocrStartScreenshot' });
    }, []);

    const handleReExtract = useCallback(() => {
        if (!imageUrl) return;
        handleExtract();
    }, [imageUrl, handleExtract]);

    const handleResultChange = useCallback((text: string) => {
        setResultText(text);
    }, []);

    return (
        <div className="flex flex-col h-screen bg-[var(--chrome-bg)] text-[var(--chrome-text)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--chrome-border)] shrink-0">
                <h1 className="text-[13px] font-bold tracking-tight">OCR</h1>
                <button
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-black/5 transition-colors"
                    title="Menu"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="4" y1="6" x2="20" y2="6" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <line x1="4" y1="18" x2="20" y2="18" />
                    </svg>
                </button>
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
                {status === 'idle' && (
                    <>
                        <OcrDropZone onImageSelected={handleImageSelected} />
                        <div className="text-center text-[11px] text-[var(--chrome-text-secondary)]">or</div>
                        <button
                            onClick={handleScreenshot}
                            className="ocr-screenshot-btn"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <line x1="8" y1="12" x2="16" y2="12" />
                                <line x1="12" y1="8" x2="12" y2="16" />
                            </svg>
                            Take a Screenshot
                        </button>
                    </>
                )}

                {(status !== 'idle') && imageUrl && (
                    <OcrImagePreview
                        imageUrl={imageUrl}
                        onDelete={handleClear}
                        onExtract={handleExtract}
                        onCrop={handleScreenshot}
                        extracting={status === 'extracting'}
                    />
                )}

                {status === 'error' && errorMsg && (
                    <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-[11px]">
                        {errorMsg}
                    </div>
                )}

                {(status === 'done' || status === 'extracting' || (status === 'imageLoaded' && resultText)) && (
                    <OcrResultPanel
                        text={resultText}
                        loading={status === 'extracting'}
                        onTextChange={handleResultChange}
                    />
                )}
            </div>

            {/* Bottom toolbar */}
            {status === 'done' && resultText && (
                <OcrToolbar
                    text={resultText}
                    onReExtract={handleReExtract}
                    onCrop={handleScreenshot}
                    onClear={handleClear}
                />
            )}
        </div>
    );
};

export default OcrLayout;
