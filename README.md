# Side Agent - Multi-tool Chrome Extension

Side Agent a powerful, all-in-one productivity suite and AI agent for your browser. It combines instant translation, an AI-powered chat, browser automation tools, and OCR image text extraction into a seamless, modern interface designed to enhance your workflow without leaving your current tab.

## 🚀 Key Modules & Features

### 🤖 AI Chat Side Panel (`chat`)
- **Seamless Integration**: Access a powerful AI side panel from any page.
- **Multiple Models**: Support for varied AI models, including OpenAI vision models.
- **Contextual Intelligence**: Explain, summarize, or fix highlighted text directly within the chat.
- **Conversation History**: Save and manage multiple chat sessions locally.
- **Active Tab Summary**: Instantly get a summary of what you're currently reading.

### 🌍 Smart Translator (`translator`)
- **Instant Selection**: Highlight any text to get an immediate translation popup.
- **Multiple Modes**:
  - **Button Mode**: Shows a small button on selection to avoid distractions.
  - **Auto Mode**: Translates immediately upon selection for maximum speed.
- **Rich Language Support**: Translate between 15+ languages.
- **Modern UI**: Beautifully designed popup with smooth transitions and theme support.

### 👁 OCR Text Extraction (`ocr`)
- **Image Text Extraction**: Use AI vision to extract and digitize text from any image on a page.
- **Smart Image Picker**: Hover over any image on the web to display a quick "extract text" overlay button.
- **Screenshot Selection**: Select a specific area of your screen (scissors tool) and extract the text instantly.
- **Seamless Chat Integration**: Send the extracted text directly to the AI chat, edit it, or copy to clipboard.

### 🌐 Browser Automation Agent (`browser-agent`)
- **DOM Interaction**: Deeply analyzes and serializes the state of the web page for the AI to understand.
- **Interactive Tools**: Features autonomous extraction of links, element highlighting, clicking, and scrolling.
- **Visual Snapshots**: Generates LLM-friendly structural DOM representations to support agentic web browsing directly in Chrome.

---

## 🛠️ Technical Stack

- **Framework**: [React 19](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)

---

## 📦 Installation

### Prerequisites
- Node.js (Latest LTS recommended)
- npm or yarn

### Setup
1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-repo/side-agent.git
   cd side-agent
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension**:
   ```bash
   npm run build
   ```

4. **Load into Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable **Developer mode** (top-right toggle).
   - Click **Load unpacked**.
   - Select the `dist` folder generated in the project directory.

---

## ⚙️ Configuration

1. Open the **Options** page (right-click extension icon > Options).
2. **AI Chat & OCR**: Enter your OpenAI API Key and select your preferred model.
3. **Translator**: Configure source/target languages and preferred translation behavior.

---

## 📂 Project Structure

```
side-agent/
├── public/              # Static assets & Manifest
├── src/
│   ├── services/
│   │   ├── chat/          # AI Side Panel logic & UI
│   │   ├── translator/    # Content scripts & translation popup
│   │   ├── ocr/           # Image picker, screenshot logic, & text extraction
│   │   └── browser-agent/ # Web agent state serialization and tool executor
│   ├── shared/          # Constants, types, and utilities
│   ├── background/      # Extension service worker integrating all modules
│   ├── content/         # Global content scripts for overlays and UI injection
│   └── pages/           # Extension pages (side panel, options)
├── vite.config.mjs      # Build configuration
└── tsconfig.json        # TypeScript configuration
```

---

## 🔒 Privacy & Security

- **Local Storage**: All your settings and chat history are stored locally in your browser.
- **Direct API Calls**: Translation, Vision, and AI requests are sent directly to the respective providers.
- **No Data Collection**: We do not track your usage or collect any personal data.

---

## 📄 License

This project is licensed under the ISC License.

---

Built with ❤️ for better productivity.
