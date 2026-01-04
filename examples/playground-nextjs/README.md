# ResilientLLM Playground

An interactive React/Next.js playground to test and showcase [ResilientLLM](https://github.com/gitcommitshow/resilient-llm) - a fault-tolerant LLM integration layer.

## Features

- **Multi-Provider Support** - Switch between OpenAI, Anthropic, Google Gemini, and Ollama
- **Chaos Mode** - Simulate failures to demonstrate resilience features:
  - Configurable failure rate
  - Random delays
  - Rate limit simulation (429 errors)
- **Resilience Log** - Real-time visibility into retries, fallbacks, and error handling
- **Settings Panel** - Configure model, temperature, max tokens, and API keys
- **Dark Mode** - Automatic system preference detection

## Quick Start

### 1. Install Dependencies

Using **pnpm** (recommended):
```bash
cd examples/playground-nextjs
pnpm install
```

Using **npm**:
```bash
cd examples/playground-nextjs
npm install
```

### 2. Set Environment Variables

```bash
# OpenAI
export OPENAI_API_KEY=your_key_here

# Or Anthropic
export ANTHROPIC_API_KEY=your_key_here

# Or Gemini
export GEMINI_API_KEY=your_key_here
```

### 3. Run the Development Server

Using **pnpm**:
```bash
pnpm dev
```

Using **npm**:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Using the Playground

### Basic Chat

1. Select your preferred LLM provider and model from Settings
2. Type a message and press Enter or click Send
3. View the AI response and resilience metrics in the log panel

### Testing Resilience with Chaos Mode

1. Enable **Chaos Mode** in the sidebar
2. Adjust the failure rate, delay, and rate limit settings
3. Send messages to see how ResilientLLM handles failures
4. Watch the Resilience Log for retry attempts and fallback behavior

### What Chaos Mode Demonstrates

- **Circuit Breaker** - Prevents cascading failures when a service is down
- **Exponential Backoff** - Intelligent retry timing to avoid overwhelming the API
- **Rate Limiting** - Token bucket algorithm respects provider limits
- **Multi-Provider Fallback** - Automatically switches to alternative providers when one fails

## Project Structure

```
playground/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── chat/
│   │   │       └── route.ts    # API endpoint using ResilientLLM
│   │   ├── globals.css         # Global styles
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Main playground page
│   └── components/
│       ├── ChatInput.tsx       # Message input component
│       ├── ChatMessage.tsx     # Message display component
│       ├── ChaosMode.tsx       # Chaos mode controls
│       ├── ResilienceLog.tsx   # Resilience event log
│       └── SettingsPanel.tsx   # Settings drawer
├── package.json
└── README.md
```

## Tech Stack

- **Next.js** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **ResilientLLM** - Fault-tolerant LLM integration

## License

MIT License - see the main [resilient-llm LICENSE](../../LICENSE) file.
