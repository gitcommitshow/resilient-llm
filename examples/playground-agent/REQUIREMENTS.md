# Playground Agent - Compiled Requirements

This document consolidates all requirements from the various requirement files in the playground-agent folder, with duplicates removed and conflicts clarified.

---

## Table of Contents

1. [LLM & Resilience Configuration](#llm-settings--configuration)
2. [Status Bar Requirements](#status-bar-requirements)
3. [Settings Drawer Requirements](#settings-drawer-requirements)
4. [Keyboard Accessibility](#keyboard-accessibility)
5. [New Prompt Experience](#new-prompt-experience)
6. [Message Features](#message-features)
7. [UI/UX Visual Design](#uiux-visual-design)
8. [API Key Management](#api-key-management)
9. [Backend Activity](#backend-activity---pending)

---

## LLM Settings & Configuration

### Visual Feedback for Config Saves

**Requirement**: Provide visual feedback when LLM configuration changes are saved, without being distracting.

**Implementation**:
- **Color Pulse Animation**: Subtle green color pulse (#d1fae5) to the status bar when config is saved
- **Animation Duration**: 1.2 seconds with smooth fade-out
- **Trigger**: Only pulses when config actually changes (not on every auto-save)
- **Location**: Status bar in the chat panel header

**Technical Details**:
- CSS animation: `statusBarPulse` keyframes
- React: Uses `configSaved` state that triggers pulse effect
- Tracks previous config to detect actual changes

### Config Save Timing

**Requirement**: Save LLM config changes when the settings drawer closes, not immediately while editing.

**Rationale**:
- Prevents multiple saves while user is still making changes
- Avoids conflicting state updates
- User is interested in confirmation when they finish editing
- Shows feedback at the right time (when drawer closes)

**Implementation**:
- **React**: `useEffect` watches `settingsOpen` state, saves when it transitions from open to closed
- **Save Trigger**: Drawer close event (clicking X, backdrop, or clicking outside)
- **Visual Feedback**: Status bar pulse appears when drawer closes and config is saved

### Resilience Settings - **Done**

**Requirement**: Allow users to configure resilience behavior per conversation via Settings Drawer. All resilience controls must map to actual runtime behavior at execution time.

**Settings exposed in UI** (all editable and persisted in conversation config) - **Done**:
- Retries (retry attempts before giving up)
- Backoff multiplier (exponential backoff factor)
- Timeout (total operation timeout in seconds)
- Requests/min (rate limit - requests per minute)
- Tokens/min (rate limit - LLM tokens per minute)
- Circuit breaker failure threshold
- Circuit breaker cooldown period
- Max concurrent operations (bulkhead)

**UI implementation** - **Done**:
- Resilience controls rendered via `ResilienceSettingsSection` in `SettingsDrawer.jsx`
- `ResilienceStatusBar` in `Header.jsx` shows current retries, timeout, rate-limit summary
- Clicking either status bar opens settings drawer to the relevant section
- Values persisted in conversation config via `AppContext.jsx`
- Values sent to backend in `llmOptions` payload on every request

**Runtime enforcement** - **Done (library Phase 0 complete)**:
- `ResilientLLM.chat()` computes an effective runtime config per request from `llmOptions`, falling back to constructor defaults
- `circuitBreakerConfig` and `maxConcurrent` are forwarded to `ResilientOperation`
- Shared singleton resources (`RateLimitManager`, `CircuitBreaker`) synchronize their config on every call via `syncConfig` without resetting runtime state
- Per-request resilience overrides reliably affect execution behavior

**Provider-scoped behavior** - **Done (library Phase 0 complete)**:
- Rate-limit and circuit-breaker bucket scoping uses the effective per-request `aiService`
- UI hint "Applied per LLM provider" is now accurate

**Token Bucket Visualization** - **Done**:
- Educational demo component (`TokenBucketDemo.jsx`) accessible from resilience settings
- Standalone visualization with hardcoded parameters; not connected to live settings
- Explicitly labeled as a learning tool, not a reflection of actual rate-limit state

---

## Status Bar Requirements

### Current Implementation (Resolved)

**Note**: There was a conflict between IMPLEMENTATION_NOTES.md (gear icon) and STATUS_BAR_IMPROVEMENTS.md (expand icon). The current implementation uses the expand icon approach.

**Requirement**: Make the entire status bar clickable to open settings, with clear visual indicators.

**Implementation**:
- **Clickability**: Entire status bar is clickable (not just an icon)
- **Icon**: Expand indicator (›) instead of gear icon, clearly indicating interactivity
- **Visual Feedback**:
  - Hover: Background changes from `#f4f4f5` to `#e4e4e7`, text color changes from `#71717a` to `#09090b`
  - Expand icon slides slightly to the right (`translateX(2px)`) on hover
  - Active: Background darkens to `#d4d4d8` when clicked
  - Focus: Blue outline (`#3b82f6`) for keyboard navigation
  - Cursor: Pointer cursor, `user-select: none`
- **Keyboard Accessibility**: `role="button"`, `tabIndex={0}`, Enter/Space key support

### Status Bar Positioning

**Requirement**: Status bar should be part of the prompt header panel, positioned below the versions/conversations section.

**Implementation**:
- **Component Location**: `StatusBar` is in `PromptHeader.jsx`
- **Position**: After `VersionBar`, below versions and conversations
- **Styling**:
  - Transparent background with subtle border
  - `width: fit-content` to fit content snugly
  - Reduced padding (4px 8px) for tighter appearance
  - Border radius: 6px to match header styling
  - `align-self: flex-start` for left alignment

### Status Bar as Part of Chat Panel

**Requirement**: Status bar is part of the chat panel, not a global setting. Each chat panel should have its own status bar (preparing for multi-panel support).

**Implementation**:
- **Location**: Inside `PromptHeader`, below `VersionBar`, rendered as part of the chat panel header area
- **Styling**: Adjusted margins and positioning for chat panel context

---

## Settings Drawer Requirements

### Drawer Closure

**Requirement**: Make drawer closure easier - clicking anywhere outside the drawer should close it.

**Implementation**:
- **Document-Level Handler**: Click handler on document that closes drawer when clicking outside
- **Click Prevention**: `stopPropagation` on drawer to prevent clicks inside from closing it
- **Backdrop**: Existing backdrop click handler still works
- **Delay**: 100ms delay to prevent immediate closure when opening

### Keyboard Shortcuts

#### Escape Key - Cancel Changes
- Pressing `Escape` should cancel all changes and close the drawer
- Revert config values to their original state when the drawer opened
- Revert API key to its original value
- Close without saving

#### Enter Key - Save and Close
- Pressing `Enter` while focused on input fields (text, number, password) should save changes and close the drawer
- Should NOT trigger on buttons (they should activate normally)
- Should NOT trigger on select dropdowns (they should open/close normally)

### Tab Navigation - Focus Trapping

**Requirement**: Tab navigation should be trapped within the drawer when it's open.

**Implementation**:
- Tab on the last element should wrap to the first element
- Shift+Tab on the first element should wrap to the last element
- Focus should not escape to elements outside the drawer

### Focus Management

**Requirement**: Proper focus management when opening/closing drawer.

**Implementation**:
- When the drawer opens, focus should automatically move to the first focusable element (close button)
- When the drawer closes, focus should return to the element that opened it

### Save and Close Methods

- **Close button (×)**: Save and close
- **Click outside drawer**: Save and close
- **Enter on input fields**: Save and close

### Accessibility Attributes

- Add `role="dialog"` and `aria-modal="true"` to the drawer
- Add `aria-labelledby` linking to the title
- Make backdrop non-focusable with `tabIndex={-1}` and `aria-hidden="true"`

---

## Keyboard Accessibility

### General Principles

**Requirement**: Make the UI keyboard-only accessible (tab-friendly) using HTML/CSS accessibility features only (no JavaScript for focus management).

**Implementation Constraints**:
- **No JavaScript for focus management**: All focus order should be controlled using HTML/CSS accessibility features (`tabindex` attributes)
- **Keyboard accessibility for non-interactive elements**: Elements that are clickable but not naturally keyboard accessible must be made keyboard accessible with:
  - `tabindex` for focusability
  - `role="button"` for semantic meaning
  - Keyboard handlers (`onKeyDown` for Enter/Space) for activation
- **Nested interactive elements**: Delete buttons, toggles inside pills should have `tabIndex={-1}` to avoid interfering with main tab flow

### Focus Order Requirements

#### Prompt List Sidebar
- Tab should move sequentially through prompt list items
- Only clickable/editable elements should receive focus
- Delete indicators should be excluded from tab order (`tabIndex={-1}`)

#### Chat Panel Focus Order (Loops)
When the chat panel is focused, tab should move in this specific order:

1. **Prompt title** (when in editing mode) - `tabindex={1}`
2. **Version selector** (if visible) - `tabindex={2}`
3. **Conversation selector** (if visible) - `tabindex={3}`
4. **System prompt** (when in editable mode) - `tabindex={4}`
5. **Message input** - `tabindex={5}`
6. **Save version button** - `tabindex={6}`

After the last element, focus should loop back to the first element in the list.

### Expected Behavior

- Keyboard users can navigate the entire UI using only Tab key
- Focus moves logically through interactive elements
- No focus traps or inaccessible elements
- Works in a continuous loop

---

## New Prompt Experience

### Conditional UI Display for New Prompts

#### Versions Section
- **Requirement**: Hide the versions section when there are no saved versions
- **Implementation**: The versions section only renders when `versions.length > 0`
- **Location**: `components/VersionBar.jsx`

#### Conversations Section
- **Requirement**: Hide the conversations section when there are no conversations with messages (including system prompts)
- **Implementation**: The conversations section only renders when at least one conversation has messages (`hasConversationsWithMessages`)
- **Location**: `components/VersionBar.jsx`
- **Note**: If the only conversation has 0 messages (including system prompt), the conversations section is also hidden

### System Prompt Auto-Expansion for New Prompts

- **Requirement**: For new prompts (no versions, no conversations with messages), automatically expand the system prompt section so users can see they can add a system prompt
- **Implementation**: When prompt changes and conditions are met, `setExpanded(true)` is called
- **Location**: `components/SystemPrompt.jsx`
- **Condition**: `versions.length === 0 && !hasConversationsWithMessages`

### Auto-Focus System Prompt for New Prompts

- **Requirement**: For new prompts (same conditions as above), automatically focus the system prompt textarea so users can start typing immediately
- **Implementation**: When conditions are met, `setEditingMessageId('system-prompt')` is called to start editing mode
- **Location**: `components/SystemPrompt.jsx`
- **Condition**: `versions.length === 0 && !hasConversationsWithMessages`

### Focus Management After System Prompt Editing

- **Requirement**: When system prompt editing finishes (Enter, Escape, or clicking outside), automatically move focus to the message input area
- **Implementation**:
  - `focusMessageInput()` function is called when editing finishes
  - Uses `requestAnimationFrame` to ensure DOM is ready
  - Sets selection range to ensure cursor is visible
- **Location**: `components/SystemPrompt.jsx`
- **Triggers**:
  - Pressing Enter (saves and finishes editing)
  - Pressing Escape (cancels editing)
  - Clicking outside the textarea (saves if changed)

### Focus Re-evaluation on Prompt Switch

- **Requirement**: When switching between prompts, re-evaluate focus logic based on the new prompt's conditions
- **Implementation**:
  - When `currentPromptId` changes, check if system prompt was being edited
  - Clear editing state if it was active
  - Re-evaluate conditions for the new prompt:
    - If new prompt (no versions, no conversations with messages): Auto-expand and start editing system prompt
    - Otherwise: Focus message input
- **Location**: `components/SystemPrompt.jsx`
- **Prevents**: Focus staying on the old prompt's textarea when switching prompts

### Condition Check

All new prompt conditions use:
```javascript
const versions = currentPromptId ? getVersions(currentPromptId) : [];
const conversations = currentPromptId ? getConversations(currentPromptId) : [];
const hasConversationsWithMessages = conversations.some(c => (c.messages || []).length > 0);
const shouldAutoExpand = versions.length === 0 && !hasConversationsWithMessages;
```

---

## Message Features

### Regenerate Assistant Message Feature

#### Functional Requirements

1. **Regenerate Button**
   - A regenerate button should appear in the message actions area for assistant messages only
   - The button should be visible when hovering over an assistant message
   - The button should be disabled while a response is being generated (`isResponding === true`)
   - The button should use a refresh/reload icon to indicate regeneration

2. **Regeneration Behavior**
   - When clicked, the regenerate button should:
     - Build conversation history up to (but not including) the assistant message being regenerated
     - Send a new API request with the conversation history
     - Replace only the specific assistant message with the new response
     - Preserve all messages that come after the regenerated message
     - Update the message timestamp to reflect the regeneration time

3. **Edge Cases**
   - If the message is deleted or changed during regeneration, the operation should abort gracefully
   - If the API call fails, the message should be updated with an error message
   - The feature should not interfere with other operations (editing, deleting, branching)

#### Technical Requirements

1. **State Management**
   - Use `messagesRef.current` to access the latest messages and avoid stale closures
   - Create new array references when updating state to ensure React detects changes
   - Update `messagesRef.current` synchronously with state updates

2. **API Integration**
   - Use the same API endpoint (`/api/chat`) as regular message sending
   - Pass conversation history up to the point before the regenerated message
   - Use the same LLM options (service, model, temperature, etc.) from the current config
   - Handle API errors gracefully

3. **UI/UX**
   - Show typing indicator while regenerating
   - Disable regenerate button during regeneration
   - Update message timestamp to show when it was regenerated

### Message Role Ordering (Bug Fix)

**Note**: This was a bug fix, but the requirements for proper message role handling are documented here.

**Requirement**: Messages must correctly maintain their role (user/assistant) and conversation history must be accurate.

**Implementation**:
- Use `messagesRef` to track current messages state and avoid stale closure issues
- All `setMessages` calls must sync with `messagesRef.current`
- Role normalization: defaults to 'user' unless explicitly 'assistant'
- Automatic reset of `senderRole` to 'user' after sending (unless intentionally set to 'assistant')
- All message manipulation functions (`addMessage`, `deleteMessage`, `editMessage`, `undo`, `setSystemPrompt`, `loadConversation`) must update `messagesRef.current`

---

## UI/UX Visual Design

### Border Removal & Shadow Implementation

**Requirement**: Reduce visual noise by replacing line borders with shadows and background differences.

**Changes Made**:
- **Removed all line borders** from major UI sections
- **Replaced borders with subtle shadows** for section separation
- **Used background color differences** to create visual separation where appropriate

**Specific Updates**:

#### Header (Page Title)
- **Before**: `border-bottom: 1px solid #e4e4e7`
- **After**: `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05)`
- Background changed from `white` to `#fafafa` to blend with page background

#### Footer
- **Before**: `border-top: 1px solid #e4e4e7`
- **After**: `box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.05)`
- Background changed to `#f9fafb` for subtle differentiation

#### Sidebar (Prompt List)
- **Before**: `border-right: 1px solid #e4e4e7`
- **After**: `box-shadow: 2px 0 4px rgba(0, 0, 0, 0.04)`
- Background changed to `#fafafa` to match page background

#### Sidebar Header
- **Before**: `border-bottom: 1px solid #e4e4e7`
- **After**: `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03)`
- Background changed to `#fafafa`

#### Input Container
- **Before**: `border-top: 1px solid #e4e4e7`
- **After**: Shadow removed, background changed to `#fafafa` for seamless blending

#### System Prompt Pinned Section
- **Before**: `border-bottom: 1px solid #e4e4e7`
- **After**: `box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04)`

#### Settings Drawer Header
- **Before**: `border-bottom: 1px solid #e4e4e7`
- **After**: `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03)`

#### Resilience Panel
- **Before**: `border-top: 1px solid #e4e4e7`
- **After**: `box-shadow: 0 -1px 2px rgba(0, 0, 0, 0.03)`
- Background changed to `#f4f4f5`

#### Conversation/Prompt Headers
- **Before**: `border-bottom: 1px solid #e4e4e7`
- **After**: `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03)`
- Background changed to `#fafafa`

#### Modal Headers/Footers
- **Before**: Borders on top/bottom
- **After**: Shadows with `#fafafa` background

#### Version Separator Label
- **Before**: `border: 1px solid #e4e4e7`
- **After**: `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05)`

### Input Area Seamless Blending

**Requirement**: Make input container and role bar blend seamlessly with the messages area.

**Changes**:
- Input container background changed from `white` to `#fafafa` to match messages container
- Removed shadow for seamless integration
- Role bar background set to `#fafafa` to match input container
- Role toggle background adjusted to `#f5f5f5` for subtle differentiation while blending

### Textarea Focus Enhancement

**Requirement**: Make textarea stand out with brighter background and shadow.

**Changes**:
- Input field (textarea) background changed from `#f4f4f5` to `white` for prominence
- Added `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08)` for depth
- Enhanced focus state with `box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12)`
- Added smooth transition for shadow changes

### Header Background Blending

**Requirement**: Make all headers blend with the page background instead of using white backgrounds.

**Changes**:
- Main title (Playground Header): Background changed from `white` to `#fafafa`
- Prompt List Header (Sessions Header): Background changed from `white` to `#fafafa`
- Chat Panel Header (Prompt Header Panel): Background changed from `white` to `#fafafa`
- Conversation Header: Background changed from `white` to `#fafafa`
- Chat Header: Background changed from `white` to `#fafafa` for consistency

### Message Timestamp Removal & Copy Feature

**Requirement**: Remove timestamp display and replace with copy functionality.

**Changes**:
- Removed timestamp display from message boxes
- Added copy button with clipboard icon
- Implemented copy functionality using `navigator.clipboard.writeText`
- Added visual feedback (checkmark icon) when copy is successful
- Copy button appears on hover, matching other message action buttons

**Styling**:
- Added `.message-copy-btn` styles matching existing message action buttons
- Button appears on hover with smooth opacity transition
- Different colors for user vs assistant messages
- Checkmark icon shown for 2 seconds after successful copy

### Alignment Fixes

**Requirement**: Fix left alignment of header text, versions section, conversations section, and status bar. All should align perfectly.

**Implementation**:
- Prompt Name: Removed default padding, added conditional padding on hover/focus only
- Section Labels: Added `min-width: 100px` for consistent alignment
- Sections: Added `width: 100%` to versions and conversations sections
- Status Bar: `align-self: flex-start` for left alignment

### Conversations Below Versions

**Requirement**: Move conversations section below versions section (vertical layout) and left-align it.

**Implementation**:
- Layout Change: Changed `.versions-drafts-bar` from `flex-direction: row` to `flex-direction: column`
- Gap: Reduced from 24px to 12px for tighter vertical spacing
- Alignment: Both sections now left-aligned with consistent spacing
- Removed: `flex-wrap` no longer needed

### Design Principles Applied

1. **Minimal Visual Noise**: Replaced harsh borders with subtle shadows
2. **Seamless Blending**: Used consistent background colors (`#fafafa`) for non-interactive areas
3. **Focus on Interaction**: Made interactive elements (textarea) stand out with white background and shadows
4. **Consistent Shadows**: Used subtle, consistent shadow values for section separation
5. **Better Utility**: Replaced less useful information (timestamp) with actionable features (copy)

---

## API Key Management

### Auto-fill API Key from LocalStorage

**Requirement**: When a user selects a service in the settings drawer, if an API key for that service exists in localStorage, it should automatically populate the API key input field.

**Implementation Details**:
- Modified `SettingsDrawer.jsx` to load the API key from localStorage when:
  1. The service dropdown selection changes
  2. The settings drawer opens with a service already selected

- The implementation:
  - Uses the existing `getApiKey()` utility which handles service name mapping (e.g., 'local' → 'ollama')
  - Clears the API key field if no service is selected
  - Works with all supported services: OpenAI, Anthropic, Google, and Local/Ollama

---

## Backend Activity - **Pending**

**Requirement**: Provide a UI mechanism for users to see how their resilience settings affected actual LLM request execution, enabling manual verification without reading server logs.

**Dependency**: Requires library metadata contract (library `REQUIREMENTS.md` Phase 0 + Phase 1).

### Backend Activity Panel

1. Add a collapsible "Backend Activity" panel to the chat interface
2. For each request, display:
   - Effective resilience config used by backend runtime (not just what was sent, but what was actually applied)
   - Retry attempts with delay/backoff values
   - Rate-limit wait/acquire events
   - Circuit-breaker state checks, transitions, and blocks
   - Concurrency acquire/release/reject outcomes
   - Final outcome and total latency
3. Panel capabilities:
   - Latest operation summary view
   - Expandable event timeline with details
   - Clear/reset between runs

### API Contract

1. `sendMessage()` and `regenerateMessage()` in `AppContext.jsx` must pass `includeMetadata: true` to `/api/chat`
2. `/api/chat` in `server/app.js` must forward this flag and return metadata from library
3. Response shape when metadata enabled:
   ```javascript
   {
     response: string,
     metadata: object,
     success: boolean
   }
   ```
4. When `includeMetadata` is not sent or false, response shape must remain unchanged

### Manual Verification Scenarios

These scenarios must be reproducible from UI to validate correctness:

1. **Retry verification**:
   - Set low retry count (e.g. 1) and visible backoff multiplier
   - Trigger a transient failure (e.g. invalid API key)
   - Activity panel must show retry attempts matching configured count

2. **Rate-limit verification**:
   - Set very low requests/min or tokens/min
   - Send multiple requests in quick succession
   - Activity panel must show wait/throttle events

3. **Circuit-breaker verification**:
   - Set low failure threshold
   - Trigger repeated failures exceeding threshold
   - Activity panel must show circuit open state and cooldown behavior

4. **Concurrency verification**:
   - Set low max concurrent value
   - Trigger near-simultaneous requests
   - Activity panel must show acquire/reject behavior

### Status Classification Rules

All resilience-related features in this playground must be labeled:
- **Done**: UI setting is enforced by runtime, verifiable via Backend Activity panel
- **Partial**: UI exists but runtime enforcement is incomplete
- **Pending**: not yet implemented

No resilience control may be classified as Done unless Backend Activity panel evidence confirms enforcement.

---

## Files Modified Summary

### Agent Playground Components
- `client/components/Header.jsx` - StatusBar component
- `client/components/PromptHeader.jsx` - Added StatusBar, alignment fixes
- `client/components/SettingsDrawer.jsx` - Save on close, click outside handler, keyboard shortcuts, API key auto-fill
- `client/components/VersionBar.jsx` - Conditional rendering, alignment fixes
- `client/components/SystemPrompt.jsx` - Auto-expansion, focus management
- `client/components/Message.jsx` - Copy functionality, regenerate button, timestamp removal
- `client/components/MessageInput.jsx` - Keyboard accessibility
- `client/components/PromptsSidebar.jsx` - Keyboard accessibility

### Agent Playground Core
- `client/context/AppContext.jsx` - Config save tracking, configSaved state, regenerateMessage function, messagesRef for role ordering fix
- `client/App.jsx` - Removed StatusBar (moved to PromptHeader)

### Agent Playground Styles
- `client/styles.css` - All visual styling updates, status bar styling, pulse animation, alignment fixes, border removal, shadow implementation

---

## Key Design Decisions

1. **Save Timing**: Save on drawer close rather than immediate saves to avoid conflicts
2. **Visual Feedback**: Subtle color pulse instead of notification to avoid distraction
3. **Status Bar Integration**: Entire status bar is clickable with expand icon for better UX
4. **Panel Context**: Status bar is part of chat panel, not global, for multi-panel readiness
5. **Alignment**: Consistent left alignment across all header elements
6. **Layout**: Vertical stacking (conversations below versions) for better organization
7. **Styling**: Transparent background with border for cohesive header appearance
8. **Keyboard Accessibility**: HTML/CSS-based focus management, no JavaScript focus manipulation
9. **New Prompt UX**: Auto-expand and focus system prompt for immediate usability
10. **Visual Design**: Shadow-based separation instead of borders for modern, clean appearance

---

## Resolved Conflicts

### Status Bar Icon
- **Conflict**: IMPLEMENTATION_NOTES.md mentioned gear icon (⚙), while STATUS_BAR_IMPROVEMENTS.md specified expand icon (›)
- **Resolution**: Current implementation uses expand icon (›) as specified in STATUS_BAR_IMPROVEMENTS.md
- **Rationale**: Expand icon better indicates interactivity and clickability

### Settings Drawer Requirements
- **Conflict**: IMPLEMENTATION_NOTES.md had basic drawer closure requirements, while SETTINGS_DRAWER_REQUIREMENTS.md had detailed keyboard accessibility
- **Resolution**: Merged both, with SETTINGS_DRAWER_REQUIREMENTS.md providing the authoritative detailed requirements

---

## Testing Considerations

### General Testing
- All keyboard navigation should work without mouse
- Focus order should be logical and continuous
- Visual feedback should be subtle and non-distracting
- All interactive elements should be accessible

### Specific Test Cases

1. **Status Bar**
   - Click anywhere on status bar opens settings
   - Keyboard navigation works (Tab, Enter, Space)
   - Visual feedback on hover/active/focus states
   - Config save pulse animation works

2. **Settings Drawer**
   - Escape cancels changes and closes
   - Enter on inputs saves and closes
   - Tab navigation is trapped within drawer
   - Focus returns to opener when closed
   - Click outside closes and saves

3. **New Prompt Experience**
   - Versions/conversations sections hidden for new prompts
   - System prompt auto-expands for new prompts
   - System prompt auto-focuses for new prompts
   - Focus moves to message input after system prompt editing

4. **Message Features**
   - Regenerate button only appears for assistant messages
   - Regenerate preserves subsequent messages
   - Copy button works and shows feedback
   - Message roles are correctly maintained

5. **Keyboard Accessibility**
   - Tab order follows specified sequence
   - All interactive elements are keyboard accessible
   - Focus loops work correctly
   - No focus traps or inaccessible elements

---

## Notes

- This document includes both implemented and planned requirements; each section should explicitly state status
- This document serves as the single source of truth for all playground-agent requirements
- When new requirements are added, they should be integrated into this document
- Bug fixes are documented for reference but are not considered ongoing requirements