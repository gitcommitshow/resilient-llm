# Chat UI Example with ResilientLLM

A simple chat interface demonstrating how easy it is to integrate ResilientLLM in your application.

## Project Structure

```
client/              # Frontend files
├── index.html      # Main HTML file (shows key integration functions)
├── styles.css      # Styling
├── api.js          # API integration with the express API backend
├── messages.js     # Message display and management
└── ui.js           # UI components and interactions
server/              # Backend files
└── app.js       # Express server with ResilientLLM
```

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/gitcommitshow/resilient-llm
cd resilient-llm/examples/chat-basic
```

### 2. Install Dependencies

```bash
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

# Or Gemini
export GEMINI_API_KEY=your_key_here
export AI_SERVICE=gemini
export AI_MODEL=gemini-2.0-flash
```

### 4. Start the Server

```bash
npm run dev
```

The server will start on `http://localhost:3000` and automatically serve the client files.

### 5. Open in Browser

Navigate to **`http://localhost:3000`** in your browser.

<details>
<summary><strong>Want to preview in the VSCode/Cursor editor directly?</strong></summary>

- Install [Live Preview extension](https://marketplace.cursorapi.com/items/?itemName=ms-vscode.live-server)
- Right-click on `client/index.html` → **"Show Preview"**

**Note:** The server must be running for the preview to work, as it serves the client files and handles API requests.

</details>

## How It Works

The `client/index.html` file shows the complete integration flow:

1. **Build conversation history** - `buildConversationHistory()` formats messages for ResilientLLM
2. **Call ResilientLLM API** - `getAIResponse()` sends POST request to `/api/chat`
3. **ResilientLLM handles everything** - Rate limiting, retries, circuit breaker, token estimation
4. **Display response** - `addMessage()` renders the AI response with markdown support

All implementation details are in the categorized JavaScript files:
- `api.js` - ResilientLLM API integration
- `messages.js` - Message rendering and management
- `ui.js` - UI components and interactions

## Features

- Real-time chat with AI (feel free to change the LLM providers and modesl in `server/app.js`)
- Markdown rendering for assistant responses
- Minimal, clean UI design

## Troubleshooting

**Server not responding**
- Make sure the server is running: `npm run dev`
- Check that your API key is set correctly
- Verify the API key has sufficient credits/permissions

**API Key errors**
- Ensure your API key is set in environment variables
- Check that the API key is valid and has correct permissions
- Verify you're using the correct service name (openai, anthropic, or gemini)
