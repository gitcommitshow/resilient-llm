/**
 * Remembers a model turn that stopped on tool calls, then resumes it
 * after the user approves or denies each call by id.
 */
import { ProviderRegistry } from 'resilient-llm';
import { executeToolCall } from './tools.js';

/** @type {Map<string, object>} */
const pendingById = new Map();

/**
 * Gives every tool call an id so a later decision can point at it.
 * @param {unknown} toolCalls
 * @returns {object[]}
 */
export function assignToolCallIds(toolCalls) {
    const list = Array.isArray(toolCalls) ? toolCalls : toolCalls ? [toolCalls] : [];
    return list.map((call, index) => ({
        ...call,
        id: call?.id || `tool_${Date.now()}_${index}`
    }));
}

/**
 * Stores one model turn under each of its tool call ids.
 * @param {{ history: object[], llmOptions: object, content: unknown, toolCalls: object[] }} turnInput
 */
export function stagePendingToolTurn(turnInput) {
    const turn = {
        history: turnInput.history,
        llmOptions: turnInput.llmOptions || {},
        content: turnInput.content ?? null,
        toolCalls: turnInput.toolCalls
    };
    for (const call of turn.toolCalls) {
        pendingById.set(call.id, turn);
    }
}

/** Drops a staged turn so a finished or failed call cannot be resumed twice. */
export function clearTurn(turn) {
    if (!turn?.toolCalls) return;
    for (const call of turn.toolCalls) {
        pendingById.delete(call.id);
    }
}

/**
 * Rebuilds a turn from the approve request when the staged turn is gone.
 * A server restart drops in-memory turns, so the client sends the calls and history again.
 * @param {object} body
 * @returns {object | null}
 */
export function turnFromDecisionBody(body) {
    const decisions = Array.isArray(body?.decisions) ? body.decisions : [];
    const calls = Array.isArray(body?.toolCalls) ? body.toolCalls : [];
    if (!decisions.length || !calls.length || !Array.isArray(body?.conversationHistory)) return null;
    const byId = new Map(calls.map((call) => [String(call?.id), call]));
    const toolCalls = [];
    for (const item of decisions) {
        const call = byId.get(String(item?.id));
        if (!call) return null;
        toolCalls.push(call);
    }
    return {
        history: body.conversationHistory,
        llmOptions: body.llmOptions && typeof body.llmOptions === 'object' ? body.llmOptions : {},
        content: body.content ?? null,
        toolCalls
    };
}

/**
 * Finds the staged turn for a set of decisions.
 * Every tool call from that turn must be included.
 * @param {Array<{ id?: string, decision?: string }>} decisions
 */
export function findTurn(decisions) {
    if (!Array.isArray(decisions) || decisions.length === 0) {
        throw new Error('decisions are required.');
    }
    const turns = new Set();
    for (const item of decisions) {
        const turn = pendingById.get(item?.id);
        if (!turn) {
            throw new Error(`No pending tool call for id ${item?.id}.`);
        }
        turns.add(turn);
    }
    if (turns.size !== 1) {
        throw new Error('Tool decisions must belong to the same model turn.');
    }
    const turn = [...turns][0];
    const decided = new Set(decisions.map((item) => item.id));
    for (const call of turn.toolCalls) {
        if (!decided.has(call.id)) {
            throw new Error(`Missing decision for tool call ${call.id}.`);
        }
    }
    return turn;
}

/**
 * Runs approved calls and records a denial result for rejected ones.
 * Throws on the first tool failure and does not continue the model.
 * @param {object} turn
 * @param {Array<{ id: string, decision: string }>} decisions
 * @returns {Promise<Array<{ id: string, decision: string, result: string }>>}
 */
export async function resultsForDecisions(turn, decisions) {
    const decisionById = new Map(decisions.map((item) => [item.id, item.decision]));
    const results = [];
    for (const call of turn.toolCalls) {
        const decision = decisionById.get(call.id);
        if (decision === 'denied') {
            results.push({
                id: call.id,
                decision,
                result: 'The user denied this tool call.'
            });
            continue;
        }
        if (decision !== 'approved') {
            throw new Error(`Unsupported decision for tool call ${call.id}.`);
        }
        const result = await executeToolCall(call, {
            provider: turn.llmOptions?.searchProvider,
            apiKey: turn.llmOptions?.searchApiKey
        });
        if (!String(result || '').trim()) {
            const name = call?.function?.name || call?.name || 'tool';
            console.warn('[%s] Empty tool result for %s', name, call.id);
        }
        results.push({ id: call.id, decision, result });
    }
    return results;
}

/** Assistant text to echo back with the original tool call. */
function assistantText(content) {
    if (content == null) return null;
    if (typeof content === 'string') return content;
    try {
        return JSON.stringify(content);
    } catch {
        return String(content);
    }
}

/** OpenAI function arguments as the string the provider sent. */
function openAIArguments(call) {
    const args = call?.function?.arguments ?? call?.arguments;
    if (typeof args === 'string') return args;
    if (args != null) return JSON.stringify(args);
    if (call?.input != null) return JSON.stringify(call.input);
    return '{}';
}

/** Tool input object for an Anthropic tool_use block. */
function anthropicInput(call) {
    if (call?.input && typeof call.input === 'object') return call.input;
    const raw = call?.function?.arguments ?? call?.arguments;
    if (typeof raw === 'string') return JSON.parse(raw);
    if (raw && typeof raw === 'object') return raw;
    return {};
}

/**
 * Appends the original assistant tool call and one result per id.
 * @param {object} turn
 * @param {Array<{ id: string, result: string }>} results
 * @returns {object[]}
 */
export function continuationHistory(turn, results) {
    const byId = new Map(results.map((item) => [item.id, item.result]));
    const aiService = turn.llmOptions?.aiService || 'openai';
    const messageFormat = ProviderRegistry.getChatConfig(aiService)?.messageFormat;
    const text = assistantText(turn.content);

    if (messageFormat === 'anthropic') {
        const content = [];
        if (text) content.push({ type: 'text', text });
        for (const call of turn.toolCalls) {
            content.push({
                type: 'tool_use',
                id: call.id,
                name: call.function?.name || call.name,
                input: anthropicInput(call)
            });
        }
        return [
            ...turn.history,
            { role: 'assistant', content },
            {
                role: 'user',
                content: turn.toolCalls.map((call) => ({
                    type: 'tool_result',
                    tool_use_id: call.id,
                    content: byId.get(call.id) || ''
                }))
            }
        ];
    }

    return [
        ...turn.history,
        {
            role: 'assistant',
            content: text,
            tool_calls: turn.toolCalls.map((call) => ({
                id: call.id,
                type: call.type || 'function',
                function: {
                    name: call.function?.name || call.name,
                    arguments: openAIArguments(call)
                }
            }))
        },
        ...turn.toolCalls.map((call) => ({
            role: 'tool',
            tool_call_id: call.id,
            content: byId.get(call.id) || ''
        }))
    ];
}
