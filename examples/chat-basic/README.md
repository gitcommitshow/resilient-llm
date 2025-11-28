# Chat UI Example with ResilientLLM

A simple chat interface that integrates with ResilientLLM to provide real LLM responses.

## Project Structure

```
examples/chat-basic/
├── client/              # Frontend files
│   ├── index.html      # Main HTML file (shows key integration functions)
│   ├── styles.css      # Styling
│   ├── api.js          # API integration with ResilientLLM
│   ├── messages.js     # Message display and management
│   └── ui.js           # UI components and interactions
├── server/              # Backend files
│   └── server.js       # Express server with ResilientLLM
├── package.json         # Dependencies and scripts
├── nodemon.json        # Auto-reload configuration
└── README.md           # This file
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `express` - Web server framework
- `cors` - CORS middleware
- `resilient-llm` - The ResilientLLM library (from npm)
- `nodemon` - Auto-reload on file changes (dev dependency)

### 2. Set Environment Variables

Set your API key as an environment variable. Choose one provider:

**For OpenAI:**
```bash
export OPENAI_API_KEY=your_openai_api_key_here
export AI_SERVICE=openai
export AI_MODEL=gpt-4o-mini
```

**For Anthropic:**
```bash
export ANTHROPIC_API_KEY=your_anthropic_api_key_here
export AI_SERVICE=anthropic
export AI_MODEL=claude-3-5-sonnet-20240620
```

**For Google Gemini:**
```bash
export GEMINI_API_KEY=your_gemini_api_key_here
export AI_SERVICE=gemini
export AI_MODEL=gemini-2.0-flash
```

**Optional Configuration:**
```bash
export TEMPERATURE=0.7
export MAX_TOKENS=2048
export PORT=3000
```

### 3. Start the Development Server

For development with auto-reload on changes:

```bash
npm run dev
```

For production:

```bash
npm start
```

The server will start on `http://localhost:3000` by default. With `npm run dev`, the server will automatically restart when you make changes to `server.js`.

### 4. Preview in Cursor

**Option A: Using the Server (Recommended)**

1. **Start the server** in Cursor's integrated terminal:
   - Open the terminal (`Ctrl+`` or `Cmd+``)
   - Run: `npm run dev`

2. **Open in browser**:
   - Navigate to `http://localhost:3000` in your browser
   - The server serves the client files automatically

**Option B: Using Cursor's Built-in Preview**

1. **Start the server** first (as above)
2. **Open the preview**:
   - Right-click on `client/index.html` in the file explorer
   - Select **"Open Preview"** or **"Show Preview"**
   - Or use the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and type "Simple Browser: Show"
   - Navigate to `http://localhost:3000` in the preview

**Option C: Using Live Server Extension**

1. Install the "Live Server" extension in Cursor
2. Right-click on `client/index.html` and select **"Open with Live Server"**
3. The HTML will open in your default browser with auto-reload
4. Make sure the server is running on port 3000 for API calls to work

## Running in Cursor IDE

### Quick Start in Cursor:

1. **Open the terminal in Cursor** (`Ctrl+`` or `Cmd+``)

2. **Set your API key:**
   ```bash
   export OPENAI_API_KEY=your_key_here
   export AI_SERVICE=openai
   ```

3. **Start the server:**
   ```bash
   npm run dev
   ```

4. **Open in browser:**
   - Navigate to `http://localhost:3000` in your browser
   - The server automatically serves the client files

5. **Alternative: Use Tasks (F5 to run):**
   - Press `F5` or go to Run and Debug
   - Select "Launch Server" configuration
   - The server will start automatically
   - Then open `http://localhost:3000` in your browser

### Development Workflow

1. **Start the server in development mode:**
   ```bash
   npm run dev
   ```
   Or use the task: `Cmd+Shift+P` → "Tasks: Run Task" → "Start Dev Server"

2. **Make changes to `server/server.js`** - The server will automatically restart

3. **Make changes to `client/` files** - Refresh your browser to see changes

4. **For HTML/CSS changes with auto-reload**, use Live Server extension or refresh the preview manually

## Complete Setup Example

```bash
# 1. Navigate to the example directory
cd examples/chat-basic

# 2. Install dependencies
npm install

# 3. Set your API key (replace with your actual key)
export OPENAI_API_KEY=sk-your-key-here
export AI_SERVICE=openai

# 4. Start the development server
npm run dev

# 5. In another terminal, serve the HTML file (optional, for auto-reload)
# Using Python:
python3 -m http.server 8080
# Then open http://localhost:8080/index.html

# Or use Live Server extension in VS Code/Cursor
```

## Features

- Real-time chat with LLM providers (OpenAI, Anthropic, Gemini)
- Multiline input support
- Typing indicators
- Error handling
- Conversation history management
- Minimal, clean UI design

## Troubleshooting

### Server not responding

- Make sure the server is running on port 3000
- Check that your API key is set correctly
- Verify the API key has sufficient credits/permissions

### CORS errors

- The server includes CORS middleware, but if you encounter issues, make sure you're accessing the HTML file through a web server (not `file://`)

### API Key errors

- Ensure your API key is set in the environment variables
- Check that the API key is valid and has the correct permissions
- Verify you're using the correct service name (openai, anthropic, or gemini)

