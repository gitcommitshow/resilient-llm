# System prompt save behavior — exploratory design

## 1. Problem

- **Wrong-prompt save:** When the user switches to another **prompt** while editing the system prompt, the "save on stop editing" path can run with **stale local draft** (old prompt) while **context** has already switched to the **new** prompt's `messages`. Calling `setSystemPrompt(draft)` then overwrites the new prompt's system message with the old prompt's text.
- **Current mitigation:** `skipSaveOnSwitchRef` in `SystemPrompt.jsx` — set to `true` when we clear editing during a prompt switch so the save effect skips that one time. This is imperative and easy to get wrong (ordering, forgetting to clear).

**Goal:** Preserve save-on-blur UX while making it impossible to save the draft to the wrong prompt, without relying on a "skip this time" ref or fragile state/conditions.

---

## 2. Past experience (unsaved-system-prompt dialog)

A previous attempt added a **confirmation dialog** when switching prompts with unsaved system prompt edits (Save / Discard / Cancel). It was reverted due to bugs.

**What was tried:**
- Intercept `openPrompt(promptId)`; if editing system prompt and draft ≠ saved text, show modal.
- Draft surfaced to provider via `systemPromptDraftRef` synced from `SystemPrompt.jsx`.
- Save-then-switch helpers: `applySystemPromptToMessages`, `performPromptSwitch`.

**Why reverted:**
- Initialization order: dialog logic used `showUndoNotification` before it was defined → `ReferenceError`. Fixing order left room for similar closure/ordering issues.

**Takeaways (from `unsaved-system-prompt-dialog.md`):**
- Declaration order in AppContext: callbacks that depend on others must be declared after those dependencies; document or group by order.
- Draft in child + ref sync to provider is brittle (stale values, missing updates). Alternatives: lift draft to context, or a small unsaved-state module shared by provider and component.
- Save-then-switch touches messages, Storage, `currentPromptId`, `editingMessageId` — do it in one place with a clear order; splitting across `setSystemPrompt`, `saveConversation`, `performPromptSwitch` caused bugs.
- Test full flow (Save / Discard / Cancel, delete prompt, new prompt, undo after Save).
- Consider a minimal first version: warn-only (Discard / Cancel, no Save) to avoid save-then-switch and undo until the intercept + dialog are solid.

---

## 3. Approaches considered

### 3.1 Imperative guard (current)

- **Mechanism:** `skipSaveOnSwitchRef` set when clearing editing on prompt switch; save effect checks it and skips once.
- **Pros:** Small change, no API change.
- **Cons:** Imperative, order-dependent, easy to misuse; doesn't express "save only when draft belongs to current prompt."

### 3.2 Declarative "editing for which prompt"

- **Mechanism:** When entering edit mode, set `editingForPromptId = currentPromptId`. On "save when editing stops", only call `setSystemPrompt` if `editingForPromptId === currentPromptId`.
- **Pros:** One clear rule: save only when draft's prompt is still current.
- **Cons:** Still extra state/ref and a condition; doesn't change the data model.

### 3.3 Draft keyed by prompt id (`draftByPromptId`)

- **Mechanism:** Draft is a map `draftByPromptId[promptId]`. Editor shows and updates `draftByPromptId[currentPromptId]`. Save always persists that value; no single "current draft" that could belong to the wrong prompt.
- **Pros:** Wrong-prompt save impossible by structure; save is always "persist draft for current prompt."
- **Cons:** Multiple **conversations** per prompt; draft is per prompt but saved state is per conversation — need clear rules for when to show/clear draft when switching conversations or loading from storage. Lifecycle (delete prompt, load conversation) and "when to clear after save" add complexity.

### 3.4 No save-on-blur

- **Mechanism:** Remove automatic save when editing stops; only save on explicit actions (Enter, Save button).
- **Pros:** No refs or conditions; no wrong-prompt path.
- **Cons:** Weaker UX; many users expect blur to commit.

### 3.5 API-level guard: `setSystemPrompt(promptId, text)`

- **Mechanism:** Context accepts `setSystemPrompt(promptId, text)` and **only applies** when `promptId === currentPromptId`. Component triggers save **only from the textarea's `onBlur`** (and explicit Save/Enter), passing `currentPromptId` and current text. Remove the effect that saves when `isEditing` becomes false.
- **Pros:** Single rule in one place (context); wrong-prompt write impossible at the API. No "skip" ref; save is tied to real blur (or explicit action). If unmount fires blur with stale closure, context ignores the call.
- **Cons:** API signature change; callers must pass promptId (or a thin wrapper for the current-prompt editor).

### 3.6 Save only in onBlur (no effect-based save)

- **Mechanism:** Move "save on blur" from an effect (on `isEditing` → false) to the textarea's `onBlur` handler. Prompt switch unmounts the textarea without a user blur.
- **Pros:** One clear trigger; removes effect-based save and `skipSaveOnSwitchRef`.
- **Cons:** Blur may fire on unmount in some browsers; still need a guard (e.g. combine with 3.5).

### 3.7 Context pulls draft (invert control)

- **Mechanism:** Component exposes e.g. `getSystemPromptDraft(promptId)`; context (e.g. `openPrompt`) calls it before switching and saves draft for current prompt.
- **Pros:** Central place for "save then switch."
- **Cons:** Doesn't remove need for a defined save-on-blur path and a guard; adds another pattern.

### 3.8 Keyed system-prompt component

- **Mechanism:** `<SystemPrompt key={currentPromptId} />` so each prompt gets its own instance.
- **Pros:** No cross-prompt state in the component.
- **Cons:** Effect or unmount-blur can still run with wrong context; must combine with 3.5 or 3.6.

---

## 4. Recommendation (exploratory)

- **Short term:** Prefer **3.5 (API guard) + 3.6 (save in onBlur)**:
  - Change to `setSystemPrompt(promptId, text)` with `if (promptId !== currentPromptId) return` in context.
  - In `SystemPrompt.jsx`, remove the "save when isEditing becomes false" effect and `skipSaveOnSwitchRef`; save only in textarea `onBlur` (and in explicit Save/Enter) with `setSystemPrompt(currentPromptId, text)`.
  - Keeps save-on-blur UX and makes wrong-prompt save impossible at the API without extra component state.
- **If we later add the unsaved-changes dialog again:** Reuse takeaways from §2 (order, draft visibility, single save-then-switch path, minimal first version). Consider combining with 3.5 so any save path is guarded by promptId.

---

## 5. Open questions

- Does the current app have other callers of `setSystemPrompt` that would need to pass `promptId` (or a wrapper)?
- Do we want to keep the door open for `draftByPromptId` (e.g. for "draft per prompt" or future multi-conversation draft handling)?
- For the deferred dialog: prefer warn-only (Discard/Cancel) first, or full Save/Discard/Cancel from the start?
