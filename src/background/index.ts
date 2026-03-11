// Main background process
// Integrates all tool modules

// Import translator module (service worker environment)
import '../services/translator/background.ts';

// Import chat module (service worker environment)
import '../services/chat/background.ts';

// Import browser-agent module (service worker environment)
import '../services/browser-agent/background.ts';

// Import OCR module (service worker environment)
import '../services/ocr/background.ts';

console.log('AnyTools Background Service Worker Loaded');
