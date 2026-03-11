# AnyTools - Multi-tool Chrome Extension

AnyTools is a powerful, all-in-one productivity suite for your browser. It combines instant translation, AI-powered chat, and screen capture tools into a seamless, modern interface designed to enhance your workflow without leaving your current tab.

## 🚀 Key Features

### 🤖 AI Chat Side Panel
- **Seamless Integration**: Access a powerful AI side panel from any page.
- **Multiple Models**: Support for varied AI models, including GPT-4o, GPT-4o-mini, and custom endpoints.
- **Contextual Intelligence**: Explain, summarize, or fix highlighted text directly within the chat.
- **Conversation History**: Save and manage multiple chat sessions locally.
- **Active Tab Summary**: Instantly get a summary of what you're currently reading.

### 🌍 Smart Translator
- **Instant Selection**: Highlight any text to get an immediate translation popup.
- **Multiple Modes**:
  - **Button Mode**: Shows a small button on selection to avoid distractions.
  - **Auto Mode**: Translates immediately upon selection for maximum speed.
- **Rich Language Support**: Translate between 15+ languages including English, Vietnamese, Chinese, Japanese, French, and more.
- **Modern UI**: Beautifully designed popup with smooth transitions and theme support.

### 📸 Smart Screenshots (Scissors)
- **Selection Capture**: Drag and drop to capture specific areas of your screen.
- **AI Vision**: Send screenshots directly to the AI chat to ask questions about visual content.

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
   git clone https://github.com/your-repo/any-tools.git
   cd any-tools
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
2. **AI Chat**: Enter your OpenAI API Key and select your preferred model.
3. **Translator**: Configure source/target languages and preferred translation behavior.

---

## 📂 Project Structure

```
any-tools/
├── public/              # Static assets & Manifest
├── src/
│   ├── modules/
│   │   ├── chat/        # AI Side Panel logic & UI
│   │   └── translator/  # Content scripts & translation popup
│   ├── shared/          # Constants, types, and utilities
│   ├── background/      # Extension service worker
│   ├── content/         # Global content scripts
│   └── options/         # Settings page
├── vite.config.mjs      # Build configuration
└── tsconfig.json        # TypeScript configuration
```

---

## 🔒 Privacy & Security

- **Local Storage**: All your settings and chat history are stored locally in your browser.
- **Direct API Calls**: Translation and AI requests are sent directly to the respective providers (Google/OpenAI).
- **No Data Collection**: We do not track your usage or collect any personal data.

---

## 📄 License

This project is licensed under the ISC License.

---

Built with ❤️ for better productivity.
