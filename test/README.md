# ResilientLLM Test Suite

This directory contains comprehensive test suites for the ResilientLLM chat function.

## Test Files

### `chat.e2e.test.js`
End-to-end tests that cover the complete chat workflow including:
- **Basic Chat Functionality**: Tests successful chat interactions with all supported AI services (OpenAI, Anthropic, Gemini, Ollama)
- **Tool Calling Support**: Tests function/tool calling capabilities with proper schema conversion
- **Error Handling**: Tests various error scenarios (401, 429, 500, network errors, malformed responses)
- **LLM Options and Configuration**: Tests custom parameters like temperature, max tokens, response format
- **Rate Limiting and Resilience**: Tests rate limiting behavior and timeout handling
- **Conversation History Formatting**: Tests message formatting for different services
- **Fallback and Retry Logic**: Tests service failover when primary service is unavailable
- **Edge Cases**: Tests special characters, long conversations, network errors

### `chat.unit.test.js`
Unit tests for individual methods and components:
- **URL and API Key Generation**: Tests API endpoint generation and authentication
- **Message Formatting**: Tests Anthropic message formatting logic
- **Response Parsing**: Tests response parsing for all AI services
- **Error Parsing**: Tests error handling and status code parsing
- **Token Estimation**: Tests token counting functionality
- **Constructor and Configuration**: Tests initialization and configuration options

## Running Tests

### Prerequisites
Make sure you have Jest installed:
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Only E2E Tests
```bash
npm run test:e2e
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

## Test Environment Setup

The tests use mocked HTTP requests to avoid making actual API calls to external services. Environment variables are mocked for testing purposes.

### Environment Variables Used in Tests
- `OPENAI_API_KEY`: OpenAI API key (mocked)
- `ANTHROPIC_API_KEY`: Anthropic API key (mocked)
- `GEMINI_API_KEY`: Google Gemini API key (mocked)
- `OLLAMA_API_KEY`: Ollama API key (mocked)
- `OLLAMA_API_URL`: Ollama API URL (mocked)

## Test Coverage

The test suite covers:
- ✅ All four supported AI services (OpenAI, Anthropic, Gemini, Ollama)
- ✅ Tool/function calling with schema conversion
- ✅ Error handling and retry logic
- ✅ Rate limiting and resilience features
- ✅ Message formatting and conversation history
- ✅ Token estimation and limits
- ✅ Configuration options and environment variables
- ✅ Edge cases and special scenarios

## Test Structure

Each test file follows this pattern:
1. **Setup**: Mock environment variables and HTTP requests
2. **Test Cases**: Grouped by functionality with descriptive names
3. **Assertions**: Verify expected behavior and API calls
4. **Cleanup**: Reset mocks between tests

## Mocking Strategy

The tests use Jest mocks for:
- `fetch` API for HTTP requests
- `console` methods to reduce test noise
- `setTimeout`/`setInterval` for time-based tests
- Environment variables for configuration

## Adding New Tests

When adding new tests:
1. Follow the existing naming conventions
2. Use descriptive test names that explain what is being tested
3. Mock external dependencies appropriately
4. Test both success and failure scenarios
5. Include edge cases and error conditions
6. Update this README if adding new test categories

## Test Configuration

The test configuration is in `jest.config.js` and includes:
- ES module support
- Test environment setup
- Coverage reporting
- File matching patterns
- Global mocks and setup 