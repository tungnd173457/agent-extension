
// Main content script
// Integrates all tool modules

// Import translator module logic and styles
import '../services/translator/content.css';
import '../services/translator/content.ts';

// Import chat selection handler
import './selection';

// Import screenshot selection handler
import './screenshot';

// Import OCR image picker handler
import './ocr-image-picker';

console.log('AnyTools Content Script Loaded');
