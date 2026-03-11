import React, { useRef, useState, useCallback } from 'react';

interface OcrDropZoneProps {
    onImageSelected: (dataUrl: string) => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const OcrDropZone: React.FC<OcrDropZoneProps> = ({ onImageSelected }) => {
    const [dragOver, setDragOver] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback((file: File) => {
        setError('');
        if (!file.type.startsWith('image/')) {
            setError('Please select an image file.');
            return;
        }
        if (file.size > MAX_SIZE) {
            setError('Image must be under 5MB.');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            onImageSelected(reader.result as string);
        };
        reader.readAsDataURL(file);
    }, [onImageSelected]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => setDragOver(false), []);

    const handleClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    return (
        <div
            className={`ocr-dropzone ${dragOver ? 'ocr-dropzone-active' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleClick}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
            />
            <div className="ocr-dropzone-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
            </div>
            <p className="text-[12px] font-medium text-[var(--chrome-text)]">
                Click to upload or drop an image here to extract text
            </p>
            <p className="text-[11px] text-[var(--chrome-text-secondary)] mt-1">
                Max size: 5MB
            </p>
            {error && (
                <p className="text-[11px] text-red-500 mt-2">{error}</p>
            )}
        </div>
    );
};

export default OcrDropZone;
