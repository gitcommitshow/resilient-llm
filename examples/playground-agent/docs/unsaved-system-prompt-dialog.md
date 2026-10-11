# Unsaved system prompt dialog (deferred)

## What we did

We tried to add a confirmation when the user switches to another **prompt** while the system prompt text had unsaved edits:

- **Intercept** `openPrompt(promptId)` in `AppContext`: if `editingMessageId === 'system-prompt'` and draft ≠ saved text, show a modal instead of switching.
- **Modal**: “You have some unsaved changes” with **Save** (save draft to current prompt, then switch), **Discard** (switch without saving), **Cancel** (stay on current prompt).
- **Draft in context**: `systemPromptDraftRef` in context, kept in sync from `SystemPrompt.jsx` so the provider could read the current draft when deciding to show the dialog.
- **Save-then-switch**: Helper `applySystemPromptToMessages(messages, text)` and `performPromptSwitch(promptId, { messagesToSave })` to persist the chosen draft to the current conversation then switch.

## Why we reverted

The solution had too many bugs and was reverted. Known issues included:

- **Initialization order**: `confirmUnsavedSystemPromptSave` used `showUndoNotification` before it was defined, causing `ReferenceError: Cannot access 'showUndoNotification' before initialization`. We fixed by moving the dialog callbacks below `showUndoNotification`, but other ordering/closure issues can easily reappear.

## Takeaways for next time

1. **Declaration order in AppContext**  
   Any callback that uses another context callback (e.g. `showUndoNotification`) must be declared **after** that dependency. Consider grouping callbacks by dependency order or documenting the required order.

2. **Draft lives in the child**  
   The system prompt draft is local state in `SystemPrompt.jsx`. To make it visible to the provider we used a ref (`systemPromptDraftRef`) and synced it on every change. That cross-component ref sync is easy to get wrong (stale values, missing updates). If we try again, consider either:
   - Lifting the draft into context (single source of truth, more re-renders), or
   - A small “unsaved state” module (e.g. get/set draft + “has unsaved system prompt” flag) that both provider and `SystemPrompt` use, so the flow is explicit and testable.

3. **Save-then-switch is stateful**  
   “Save draft then switch prompt” touches: current messages, Storage, `currentPromptId`, and `editingMessageId`. Doing that in one place (e.g. one callback that updates state and Storage in a clear order) reduces bugs; splitting between `setSystemPrompt`, `saveConversation`, and `performPromptSwitch` led to ordering and closure issues.

4. **Test the full flow**  
   Manually test: edit system prompt (no save), click another prompt → dialog appears; Save → draft saved and switch; Discard → switch without save; Cancel → stay. Also test with delete prompt, new prompt, and after the first bug fix (e.g. undo still works after “Save”).

5. **Minimal first version**  
   A smaller first step could be: only **warn** (“You have unsaved changes. Discard?”) with Discard / Cancel (no Save). That avoids save-then-switch and undo integration until the basic intercept + dialog is solid.
