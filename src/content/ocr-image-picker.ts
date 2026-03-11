// OCR Image Picker — Content Script
// Shows a floating "pick" button when hovering over images on the page.
// On click, converts the image to a data URL and sends it to the extension.

let pickerActive = false;
let pickButton: HTMLDivElement | null = null;
let currentTarget: HTMLImageElement | null = null;

function createPickButton(): HTMLDivElement {
    const btn = document.createElement('div');
    btn.id = 'side-agent-ocr-pick-btn';
    btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
    `;
    Object.assign(btn.style, {
        position: 'fixed',
        zIndex: '2147483647',
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 2px 12px rgba(124,58,237,0.4)',
        transition: 'transform 0.15s, box-shadow 0.15s',
        pointerEvents: 'auto',
        opacity: '0',
    });

    btn.addEventListener('mouseenter', () => {
        btn.style.transform = 'scale(1.15)';
        btn.style.boxShadow = '0 4px 16px rgba(124,58,237,0.5)';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.transform = 'scale(1)';
        btn.style.boxShadow = '0 2px 12px rgba(124,58,237,0.4)';
    });

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentTarget) {
            convertImageToDataUrl(currentTarget);
        }
    });

    document.body.appendChild(btn);
    return btn;
}

function positionPickButton(img: HTMLImageElement) {
    if (!pickButton) return;
    const rect = img.getBoundingClientRect();
    pickButton.style.top = `${rect.top + 8}px`;
    pickButton.style.left = `${rect.right - 44}px`;
    pickButton.style.opacity = '1';
}

function hidePickButton() {
    if (pickButton) {
        pickButton.style.opacity = '0';
    }
    currentTarget = null;
}

async function convertImageToDataUrl(img: HTMLImageElement) {
    try {
        // Try fetching the image first (handles CORS images)
        const response = await fetch(img.src);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            chrome.runtime.sendMessage({
                action: 'ocrImagePicked',
                imageUrl: dataUrl,
            });
            cleanupPicker();
        };
        reader.readAsDataURL(blob);
    } catch {
        // Fallback: draw to canvas (for same-origin images)
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            chrome.runtime.sendMessage({
                action: 'ocrImagePicked',
                imageUrl: dataUrl,
            });
            cleanupPicker();
        } catch (err) {
            console.error('OCR: Failed to convert image', err);
            cleanupPicker();
        }
    }
}

function onMouseOver(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG' && (target as HTMLImageElement).src) {
        const img = target as HTMLImageElement;
        const rect = img.getBoundingClientRect();
        // Ignore tiny images (icons, spacers, etc.)
        if (rect.width < 40 || rect.height < 40) return;

        currentTarget = img;
        if (!pickButton) {
            pickButton = createPickButton();
        }
        positionPickButton(img);
    }
}

function onMouseOut(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const related = e.relatedTarget as HTMLElement | null;

    if (target.tagName === 'IMG') {
        // Don't hide if moving to the pick button
        if (related && (related.id === 'side-agent-ocr-pick-btn' || related.closest('#side-agent-ocr-pick-btn'))) {
            return;
        }
        hidePickButton();
    }
    // If leaving the pick button and not going to an image
    if (target.id === 'side-agent-ocr-pick-btn' || target.closest('#side-agent-ocr-pick-btn')) {
        if (related && related.tagName === 'IMG') {
            return;
        }
        hidePickButton();
    }
}

function startPicker() {
    if (pickerActive) return;
    pickerActive = true;
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
}

function cleanupPicker() {
    pickerActive = false;
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    if (pickButton) {
        pickButton.remove();
        pickButton = null;
    }
    currentTarget = null;
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'ocrStartImagePicker') {
        startPicker();
    }
    if (request.action === 'ocrStopImagePicker') {
        cleanupPicker();
    }
    // Handle OCR screenshot selection (reuses the selection overlay pattern)
    if (request.action === 'ocrStartScreenshot') {
        startOcrScreenshotSelection();
    }
});

// --- OCR Screenshot Selection (separate from chat screenshot) ---
let ocrSelecting = false;
let ocrStartX = 0;
let ocrStartY = 0;
let ocrOverlay: HTMLDivElement | null = null;
let ocrSelBox: HTMLDivElement | null = null;

function startOcrScreenshotSelection() {
    if (ocrOverlay) return;

    ocrOverlay = document.createElement('div');
    Object.assign(ocrOverlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '2147483647',
        cursor: 'crosshair',
        background: 'rgba(0, 0, 0, 0.2)',
    });

    document.body.appendChild(ocrOverlay);
    ocrOverlay.addEventListener('mousedown', ocrOnMouseDown);
}

function ocrOnMouseDown(e: MouseEvent) {
    if (!ocrOverlay) return;
    e.preventDefault();
    ocrSelecting = true;
    ocrStartX = e.clientX;
    ocrStartY = e.clientY;

    ocrSelBox = document.createElement('div');
    Object.assign(ocrSelBox.style, {
        position: 'fixed',
        border: '2px dashed #8b5cf6',
        background: 'rgba(139, 92, 246, 0.1)',
        left: ocrStartX + 'px',
        top: ocrStartY + 'px',
        pointerEvents: 'none',
    });
    ocrOverlay.appendChild(ocrSelBox);

    ocrOverlay.addEventListener('mousemove', ocrOnMouseMove);
    ocrOverlay.addEventListener('mouseup', ocrOnMouseUp);
}

function ocrOnMouseMove(e: MouseEvent) {
    if (!ocrSelecting || !ocrSelBox) return;
    const w = Math.abs(e.clientX - ocrStartX);
    const h = Math.abs(e.clientY - ocrStartY);
    ocrSelBox.style.width = w + 'px';
    ocrSelBox.style.height = h + 'px';
    ocrSelBox.style.left = Math.min(e.clientX, ocrStartX) + 'px';
    ocrSelBox.style.top = Math.min(e.clientY, ocrStartY) + 'px';
}

function ocrOnMouseUp() {
    if (!ocrSelecting || !ocrSelBox || !ocrOverlay) return;
    ocrSelecting = false;

    ocrOverlay.removeEventListener('mousemove', ocrOnMouseMove);
    ocrOverlay.removeEventListener('mouseup', ocrOnMouseUp);
    ocrOverlay.removeEventListener('mousedown', ocrOnMouseDown);

    const rect = {
        x: parseInt(ocrSelBox.style.left),
        y: parseInt(ocrSelBox.style.top),
        width: parseInt(ocrSelBox.style.width),
        height: parseInt(ocrSelBox.style.height),
    };

    document.body.removeChild(ocrOverlay);
    ocrOverlay = null;
    ocrSelBox = null;

    setTimeout(() => {
        try {
            chrome.runtime.sendMessage({
                action: 'ocrScreenshotAreaSelected',
                rect,
                devicePixelRatio: window.devicePixelRatio || 1,
            });
        } catch (err) {
            console.error('Failed to send OCR screenshot area:', err);
        }
    }, 100);
}
