# Changelog

## [1.7.2](https://github.com/gitcommitshow/resilient-llm/compare/v1.7.1...v1.7.2) (2026-03-20)

### Bug Fixes

* refactor and add structured output support ([#85](https://github.com/gitcommitshow/resilient-llm/issues/85)) ([c79b9ee](https://github.com/gitcommitshow/resilient-llm/commit/c79b9ee169f5e8909faca3010aabbf5470f982ec))

### Breaking Changes
* `ResilientLLM.chat()` now always returns a consistent envelope object: `{ content, toolCalls?, metadata }` (metadata is no longer gated by `returnOperationMetadata`).

This is how you use the library after v1.7.2

```javascript
import { ResilientLLM } from 'resilient-llm';

const llm = new ResilientLLM({
  aiService: 'openai',
  model: 'gpt-4o-mini',
});

const conversationHistory = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'assistant', content: 'Hi, I am here to help.' },
  { role: 'user', content: 'What is the capital of France?' }
];

try {
    const { content, toolCalls, metadata } = await llm.chat(conversationHistory);
    console.log('LLM response:', content);
} catch (err) {
    console.error('Error:', err);
}
```

## [1.7.1](https://github.com/gitcommitshow/resilient-llm/compare/v1.7.0...v1.7.1) (2026-03-16)


### Bug Fixes

* support custom props in operational metadata ([#82](https://github.com/gitcommitshow/resilient-llm/issues/82)) ([20079bf](https://github.com/gitcommitshow/resilient-llm/commit/20079bf73c0c284e21c27c768f42987da9910e50))

## [1.7.0](https://github.com/gitcommitshow/resilient-llm/compare/v1.6.0...v1.7.0) (2026-03-16)


### Features

* migrate lib code to typescript ([#80](https://github.com/gitcommitshow/resilient-llm/issues/80)) ([aafb625](https://github.com/gitcommitshow/resilient-llm/commit/aafb625a2cf6659e6bff113965e99fdef5dc91a8))

## [1.6.0](https://github.com/gitcommitshow/resilient-llm/compare/v1.5.0...v1.6.0) (2026-03-08)


### Features

* returnOperationMetadata config for additional observability metadata  ([#72](https://github.com/gitcommitshow/resilient-llm/issues/72)) ([28eb575](https://github.com/gitcommitshow/resilient-llm/commit/28eb575a25aef0ca20b8462975292edc9584d077))

## [1.4.2](https://github.com/gitcommitshow/resilient-llm/compare/v1.4.1...v1.4.2) (2026-03-01)


### Bug Fixes

* add nextjs keyword in playground folder ([#47](https://github.com/gitcommitshow/resilient-llm/issues/47)) ([d2b6e00](https://github.com/gitcommitshow/resilient-llm/commit/d2b6e008f09d049c8d3cc44e82edc8ad85c63b81))

## [1.4.1](https://github.com/gitcommitshow/resilient-llm/compare/v1.4.0...v1.4.1) (2026-01-05)


### Bug Fixes

* different auth for model and chat api for google ([#51](https://github.com/gitcommitshow/resilient-llm/issues/51)) ([c7204c2](https://github.com/gitcommitshow/resilient-llm/commit/c7204c22321635ef42970c5613cdb6a0fb97b849))

## [1.4.0](https://github.com/gitcommitshow/resilient-llm/compare/v1.3.1...v1.4.0) (2026-01-04)


### Features

* add provider registry ([#41](https://github.com/gitcommitshow/resilient-llm/issues/41)) ([c91795e](https://github.com/gitcommitshow/resilient-llm/commit/c91795e32f4b1a99f708f4daac4f3b3930bc763d))
* add React/Next.js playground with chaos mode ([2f148af](https://github.com/gitcommitshow/resilient-llm/commit/2f148af10900873e83c3ec190b1f8357d7bcf274))


### Bug Fixes

* use node 24 in npm publish action ([#50](https://github.com/gitcommitshow/resilient-llm/issues/50)) ([9cac13f](https://github.com/gitcommitshow/resilient-llm/commit/9cac13fe96bc697fc7317c65d39b389020ca9dc8))
* use the replce ollamaUrl with baseUrl ([#45](https://github.com/gitcommitshow/resilient-llm/issues/45)) ([d8c692f](https://github.com/gitcommitshow/resilient-llm/commit/d8c692f716fbb7becb8c51094638375dcac4d90c))

## [1.3.1](https://github.com/gitcommitshow/resilient-llm/compare/v1.3.0...v1.3.1) (2026-01-03)


### Bug Fixes

* improve ux with regenerate msg and accessibility features ([#30](https://github.com/gitcommitshow/resilient-llm/issues/30)) ([1af9c70](https://github.com/gitcommitshow/resilient-llm/commit/1af9c70019732848ef0b05e49f2fb3b5c2623f01))

## [1.3.0](https://github.com/gitcommitshow/resilient-llm/compare/v1.2.0...v1.3.0) (2025-12-29)


### Features

* playground ([#26](https://github.com/gitcommitshow/resilient-llm/issues/26)) ([731b2b3](https://github.com/gitcommitshow/resilient-llm/commit/731b2b365422ad70fa5645b46c234c8270c990de))

## [1.2.0](https://github.com/gitcommitshow/resilient-llm/compare/v1.1.0...v1.2.0) (2025-11-28)


### Features

* ship only essential in published pkg ([#24](https://github.com/gitcommitshow/resilient-llm/issues/24)) ([3c80a66](https://github.com/gitcommitshow/resilient-llm/commit/3c80a669b493fd9028f460495c4c2269b6cf0f16))

## [1.1.0](https://github.com/gitcommitshow/resilient-llm/compare/v1.0.0...v1.1.0) (2025-11-28)


### Features

* a a simple chat demo using resilient llm packckage and express ([#21](https://github.com/gitcommitshow/resilient-llm/issues/21)) ([8baf68a](https://github.com/gitcommitshow/resilient-llm/commit/8baf68a68de6e764944eb484da4c88e16f7cdf9e))

## 1.0.0 (2025-09-08)


### Bug Fixes

* claude action missing to push the branch to remote ([#11](https://github.com/gitcommitshow/resilient-llm/issues/11)) ([f2ea3b6](https://github.com/gitcommitshow/resilient-llm/commit/f2ea3b6d46eb262f33dfd67579904d3eea1ddd00))
* upgrade claude code action to v1 ([1c89a74](https://github.com/gitcommitshow/resilient-llm/commit/1c89a7450a6ea046803d935695a8e2a03835ec29))
