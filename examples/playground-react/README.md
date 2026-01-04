# ResilientLLM Playground - React Edition

A modern React playground built with Vite to test and experiment with [`ResilientLLM`](https://github.com/gitcommitshow/resilient-llm).

Note: This is an upgrade from the older [playground-js](../playground-js/). This one has hot module replacement, ES modules, and a clean component-based architecture.

![Demo Screenshot](./demo.jpg)

## Features

- **Multiple Prompts Management** - Create, rename, and organize multiple prompt sessions
- **Version Control** - Save prompts/conversation snapshots as immutable versions
- **Conversation Branching** - Branch conversations at any message to explore different paths
- **System Prompts** - Configure system-level instructions for your conversations
- **Undo/Redo** - Undo message edits and deletions (⌘Z / Ctrl+Z)
- **Multiple LLM Service Providers** - Support for OpenAI, Anthropic, Google, local models via Ollama or any custom provider you want to configure
- **JSON Mode** - Toggle between text and structured JSON responses
- **Markdown Rendering** - Beautiful markdown rendering for AI responses
- **Local Storage** - All data persisted locally in your browser

## Project Structure

```
playground-react/
├── server/                    # Backend API server
│   ├── app.js                 # Express server with ResilientLLM integration
│   └── devutility.js          # Development utilities
├── client/                     # Frontend React application
│   ├── index.html             # HTML entry point
│   ├── main.jsx               # React entry point
│   ├── App.jsx                # Main App component
│   ├── styles.css             # Global styles
│   ├── context/
│   │   └── AppContext.jsx     # Global state management
│   ├── components/            # React components
│   │   ├── Header.jsx         # App header with status bar
│   │   ├── Footer.jsx         # Library info footer
│   │   ├── PromptsSidebar.jsx  # Left sidebar with prompts list
│   │   ├── PromptHeader.jsx   # Prompt title and save version
│   │   ├── VersionBar.jsx     # Versions and conversations bar
│   │   ├── SystemPrompt.jsx   # Collapsible system prompt editor
│   │   ├── MessageList.jsx    # Message container with version separator
│   │   ├── Message.jsx        # Individual message component
│   │   ├── MessageInput.jsx   # Text input with role toggle
│   │   ├── SettingsDrawer.jsx # Configuration panel
│   │   └── UndoNotification.jsx # Undo toast notification
│   └── utils/                 # Utility functions
│       ├── constants.js       # App constants
│       ├── storage.js         # LocalStorage abstraction
│       ├── helpers.js          # Formatting and markdown utilities
│       └── apiKeys.js         # API key management
├── vite.config.js             # Vite configuration
└── package.json               # Dependencies and scripts
```

## Quick Start

### 1. From Root Directory

The easiest way to start the playground is from the root of the ResilientLLM repository:

```bash
npm run playground
```

This will automatically:
- Link the local `resilient-llm` package
- Install dependencies
- Start both the API server and Vite dev server

### 2. Manual Setup

If you prefer to run it manually:

```bash
cd examples/playground-react
npm install
```

### 3. Set Environment Variables

Set your API key and choose the default LLM service and model:

```bash
# OpenAI
export OPENAI_API_KEY=your_key_here
export AI_SERVICE=openai
export AI_MODEL=gpt-4o-mini

# Or Anthropic
export ANTHROPIC_API_KEY=your_key_here
export AI_SERVICE=anthropic
export AI_MODEL=claude-3-5-sonnet-20240620

# Or Google
export GEMINI_API_KEY=your_key_here
export AI_SERVICE=google
export AI_MODEL=gemini-2.0-flash

# Or Local (Ollama)
export AI_SERVICE=local
export AI_MODEL=llama2
```

**Note:** You can also configure API keys directly in the playground UI via the settings panel.

### 4. Start Development Servers

```bash
npm run dev
```

This starts both servers concurrently:
- **API Server**: `http://localhost:3000` (Express backend)
- **Vite Dev Server**: `http://localhost:5173` (React frontend with HMR)

### 5. Open in Browser

Navigate to **`http://localhost:5173`** in your browser.

The Vite dev server automatically proxies API requests to the backend server, so all `/api/*` requests are forwarded to `http://localhost:3000`.

## Available Scripts

- `npm run dev` - Start both API server and Vite dev server concurrently
- `npm run client` - Start only the Vite dev server (port 5173)
- `npm run server` - Start only the API server (port 3000)
- `npm run build` - Build the React app for production
- `npm run preview` - Preview the production build
- `npm start` - Start only the API server (production mode)

## Development Features

### Hot Module Replacement (HMR)

The playground uses Vite for lightning-fast development:
- **Instant updates** - Changes to React components update immediately without page refresh
- **State preservation** - Component state is preserved during updates
- **Fast builds** - Optimized for development speed

### ES Modules

All code uses modern ES module syntax (`import`/`export`), making it:
- Easy to navigate and understand
- Tree-shakeable for smaller production builds
- Compatible with modern tooling

### Component Architecture

The app is organized into:
- **Context** - Global state management via React Context
- **Components** - Reusable UI components
- **Utils** - Pure utility functions

## Usage Tips

1. **Create a Prompt** - Click "+ New" in the sidebar to create a new prompt session
2. **Save Versions** - Click "Save Version" to create an immutable snapshot of your conversation
3. **Branch Conversations** - Click the branch icon on any message to create a new conversation starting from that point
4. **Edit Messages** - Click on any message to edit it inline
5. **Undo Actions** - Use ⌘Z (Mac) or Ctrl+Z (Windows/Linux) to undo edits or deletions
6. **System Prompts** - Click on the system prompt area to add/edit system-level instructions
7. **Settings** - Click the ☰ icon in the header to configure models, temperature, and response mode

## Production Build

To build for production:

```bash
npm run build
```

The built files will be in the `dist/` directory. You can preview the production build with:

```bash
npm run preview
```

## Troubleshooting

### Port Already in Use

If port 3000 or 5173 is already in use, you can change them:

- **API Server**: Set `PORT` environment variable (e.g., `PORT=3001 npm run server`)
- **Vite Dev Server**: Edit `vite.config.js` and change the `server.port` value

### API Key Issues

- API keys can be set via environment variables or in the playground settings
- Keys stored in the UI are saved locally in your browser's localStorage
- Environment variables take precedence over UI-configured keys

### Module Not Found Errors

If you see module resolution errors:
1. Make sure you've run `npm install`
2. Check that you're using Node.js >= 20.0.0
3. Try deleting `node_modules` and `package-lock.json`, then run `npm install` again

## Technology Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Express** - Backend API server
- **ResilientLLM** - Resilient LLM interface with circuit breaker, rate limiting, and retry logic
- **Marked** - Markdown rendering

## License

MIT License
