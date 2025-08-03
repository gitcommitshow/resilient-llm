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

### `resilient-llm.unit.test.js`
Unit tests for the ResilientOperation integration:
- **Async Function Execution**: Tests basic async function execution
- **Parameter Passing**: Tests function execution with parameters
- **Object Returns**: Tests functions returning objects
- **Delay Handling**: Tests functions with time delays

### `resilient-operation.e2e.test.js`
End-to-end tests for the ResilientOperation class:
- **Basic Retry Logic**: Tests retry behavior for failed calls
- **Circuit Breaker**: Tests circuit breaker functionality with failure thresholds
- **Caching**: Tests result caching and duplicate call avoidance
- **Preset Configurations**: Tests different preset configurations (fast, reliable)

### `test-runner.js`
A simple test runner utility that:
- Verifies test file existence
- Checks Jest installation
- Validates module imports
- Provides test coverage summary

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

## Known Issues and TODOs

### Memory Leak Investigation Needed
The ResilientOperation class may have potential memory leaks due to ongoing async operations that continue after tests complete. This manifests as "Cannot log after tests are done" warnings.

**Current Issues:**
- setTimeout calls in retry logic that aren't properly cleared
- AbortController instances that aren't cleaned up
- Rate limiting token bucket operations that continue running
- Circuit breaker cooldown timers that persist

**Current Workaround:**
- Tests add delays (`await new Promise(resolve => setTimeout(resolve, 200))`) to allow operations to complete
- Console.log is mocked to prevent warnings

**TODO:**
- Add a `destroy()` or `cleanup()` method to ResilientOperation
- Ensure all timers are cleared when operations complete or fail
- Add proper AbortController cleanup
- Consider using WeakRef or FinalizationRegistry for automatic cleanup
- Add memory leak detection in tests

## Adding New Tests

When adding new tests:
1. Follow the existing naming conventions
2. Use descriptive test names that explain what is being tested
3. Mock external dependencies appropriately
4. Test both success and failure scenarios
5. Include edge cases and error conditions
6. Add appropriate delays for async operations to complete
7. Update this README if adding new test categories

## Test Configuration

The test configuration is in `jest.config.js` and includes:
- ES module support
- Test environment setup
- Coverage reporting
- File matching patterns
- Global mocks and setup 