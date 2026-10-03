/**
 * Serialize, parse, and download conversation exports (JSON and plain text).
 */
import { generateId } from './helpers';

export const EXPORT_FORMAT = 'resilientllm-playground-conversation';
export const EXPORT_SCHEMA_VERSION = 1;

const VALID_ROLES = new Set(['system', 'user', 'assistant']);

const ROLE_LABEL = {
    system: 'System',
    user: 'User',
    assistant: 'Assistant'
};

/** Email-style message boundary (optional resilientllm tag for older exports). */
const TEXT_MESSAGE_SPLIT_RE =
    /^={60,}\s*\r?\nFrom: (System|User|Assistant)(?: \(resilientllm-playground\))?\s*\r?\n={60,}\s*\r?\n/gim;
const TEXT_MESSAGE_DETECT_RE =
    /^From: (System|User|Assistant)(?: \(resilientllm-playground\))?/im;
const TEXT_SEPARATOR_BLOCK_RE =
    /^={60,}\s*\r?\nFrom: (System|User|Assistant)(?: \(resilientllm-playground\))?\s*\r?\n={60,}\s*\r?\n/im;

const TEXT_SEPARATOR = '='.repeat(72);

/** Legacy Markdown role markers (import only). */
const MD_ROLE_MARKER_SPLIT_RE = /<!--\s*resilientllm-message\s+role="(system|user|assistant)"\s*-->/gi;
const MD_ROLE_MARKER_DETECT_RE = /<!--\s*resilientllm-message\s+role="(?:system|user|assistant)"\s*-->/i;

/**
 * Picks role and text only for export (drops metadata, ids, timestamps).
 */
export function stripMessageForExport(msg) {
    return {
        role: msg.role,
        text: msg.text ?? ''
    };
}

/**
 * Builds the canonical export payload for the active conversation.
 */
export function buildExportPayload({ promptName, messages }) {
    return {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        format: EXPORT_FORMAT,
        exportedAt: new Date().toISOString(),
        ...(promptName ? { promptName } : {}),
        messages: messages.map(stripMessageForExport)
    };
}

/**
 * JSON file content for download.
 */
export function serializeToJson(payload) {
    return JSON.stringify(payload, null, 2);
}

/**
 * Formats export timestamp for the text header.
 */
function formatExportDate(iso) {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

/**
 * Plain-text transcript in an email-style thread (use JSON export for machine-readable files).
 */
export function serializeToText(payload) {
    const lines = [
        'Conversation export',
        ...(payload.promptName ? [`Prompt: ${payload.promptName}`] : []),
        `Exported: ${formatExportDate(payload.exportedAt)}`,
        ''
    ];

    for (const msg of payload.messages) {
        const role = VALID_ROLES.has(msg.role) ? msg.role : 'user';
        const label = ROLE_LABEL[role];
        lines.push(
            TEXT_SEPARATOR,
            `From: ${label} (resilientllm-playground)`,
            TEXT_SEPARATOR,
            '',
            msg.text ?? '',
            ''
        );
    }

    return lines.join('\n').trimEnd() + '\n';
}

/**
 * Slugifies prompt name for safe filenames.
 */
function slugify(name) {
    const slug = (name || 'conversation')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'conversation';
}

/**
 * Suggested download filename for an export.
 */
export function suggestedExportFilename(promptName, ext) {
    const date = new Date().toISOString().slice(0, 10);
    return `${slugify(promptName)}-conversation-${date}.${ext}`;
}

/**
 * Triggers a browser download for text content.
 */
export function downloadText(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

/**
 * Maps a captured role label or id (e.g. "System", "system") to a normalized role id.
 */
function roleFromLabel(label) {
    const role = typeof label === 'string' ? label.trim().toLowerCase() : '';
    if (!VALID_ROLES.has(role)) {
        throw new Error(`Invalid role "${label}" in export file.`);
    }
    return role;
}

/**
 * Normalizes message objects from JSON exports before validation.
 */
function normalizeImportMessages(messages) {
    return messages.map((msg, index) => {
        if (!msg || typeof msg !== 'object') {
            throw new Error(`Invalid message at index ${index}.`);
        }
        const role = typeof msg.role === 'string' ? msg.role.trim().toLowerCase() : '';
        if (!VALID_ROLES.has(role)) {
            throw new Error(`Invalid role "${msg.role}" at index ${index}.`);
        }
        return {
            role,
            text: typeof msg.text === 'string' ? msg.text : ''
        };
    });
}

/** Builds a minimal validated payload wrapper from parsed messages. */
function payloadFromMessages(messages) {
    return {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        format: EXPORT_FORMAT,
        messages
    };
}

/**
 * Parses email-style plain-text exports.
 */
function parseTextTranscript(text) {
    const parts = text.split(TEXT_MESSAGE_SPLIT_RE);
    const messages = [];

    for (let i = 1; i < parts.length; i += 2) {
        const roleToken = parts[i];
        if (!roleToken) continue;
        messages.push({
            role: roleFromLabel(roleToken),
            text: (parts[i + 1] ?? '').trim()
        });
    }

    if (messages.length === 0) {
        throw new Error(
            'Text file has no messages. Expected blocks like:\n' +
            `${TEXT_SEPARATOR}\nFrom: User (resilientllm-playground)\n${TEXT_SEPARATOR}`
        );
    }

    return payloadFromMessages(messages);
}

/**
 * Parses legacy Markdown exports that embedded JSON between --- delimiters.
 */
function parseLegacyMarkdownFrontmatter(text) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) {
        return null;
    }
    return JSON.parse(match[1]);
}

/**
 * Parses legacy Markdown with HTML comment role markers.
 */
function parseLegacyMarkdownWithRoleMarkers(text) {
    const messages = [];
    const markerRe = new RegExp(MD_ROLE_MARKER_SPLIT_RE.source, MD_ROLE_MARKER_SPLIT_RE.flags);
    const parts = text.split(markerRe);

    for (let i = 1; i < parts.length; i += 2) {
        const roleToken = parts[i];
        if (!roleToken) continue;
        messages.push({
            role: roleFromLabel(roleToken),
            text: (parts[i + 1] ?? '').trim()
        });
    }

    if (messages.length === 0) {
        throw new Error('Legacy Markdown file has no message markers.');
    }

    return payloadFromMessages(messages);
}

/**
 * Parses legacy Markdown that used ## System / ## User / ## Assistant headings.
 */
function parseLegacyMarkdownHeadingTranscript(text) {
    const parts = text.split(/^## (System|User|Assistant)\s*$/gim);
    const messages = [];

    for (let i = 1; i < parts.length; i += 2) {
        const roleToken = parts[i];
        if (!roleToken) continue;
        messages.push({
            role: roleFromLabel(roleToken),
            text: (parts[i + 1] ?? '').trim()
        });
    }

    if (messages.length === 0) {
        throw new Error('Legacy Markdown file has no ## System / ## User / ## Assistant sections.');
    }

    return payloadFromMessages(messages);
}

/**
 * Parses older Markdown export formats (import only).
 */
function parseLegacyMarkdownTranscript(text) {
    if (MD_ROLE_MARKER_DETECT_RE.test(text)) {
        return parseLegacyMarkdownWithRoleMarkers(text);
    }
    return parseLegacyMarkdownHeadingTranscript(text);
}

/**
 * Validates and normalizes an export payload object.
 */
function validateExportPayload(raw) {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Invalid export file: expected a JSON object.');
    }
    if (raw.format && raw.format !== EXPORT_FORMAT) {
        throw new Error(`Unsupported export format: ${raw.format}`);
    }
    if (raw.schemaVersion != null && raw.schemaVersion !== EXPORT_SCHEMA_VERSION) {
        throw new Error(`Unsupported schema version: ${raw.schemaVersion}`);
    }
    if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
        throw new Error('Export file has no messages to import.');
    }
    raw.messages = normalizeImportMessages(raw.messages);
    return raw;
}

/** True when content looks like legacy Markdown export (not email-style text). */
function isLegacyMarkdownExport(text) {
    return (
        MD_ROLE_MARKER_DETECT_RE.test(text) ||
        /^## (System|User|Assistant)\s*$/m.test(text) ||
        /^#\s+Conversation export/m.test(text)
    );
}

/** True when content looks like email-style plain-text export. */
function isTextEmailExport(text) {
    return TEXT_MESSAGE_DETECT_RE.test(text) || TEXT_SEPARATOR_BLOCK_RE.test(text);
}

/**
 * Parses plain-text or legacy Markdown transcript exports.
 */
function parseTranscriptExport(text) {
    if (isTextEmailExport(text)) {
        try {
            return parseTextTranscript(text);
        } catch (err) {
            if (!isLegacyMarkdownExport(text)) throw err;
        }
    }
    if (isLegacyMarkdownExport(text)) {
        return parseLegacyMarkdownTranscript(text);
    }
    if (/^Conversation export\r?\n/m.test(text)) {
        return parseTextTranscript(text);
    }
    throw new Error(
        'Unrecognized conversation export. Use JSON, or plain text with From: System/User/Assistant blocks.'
    );
}

/**
 * Parses file text into an export payload (JSON or plain text).
 */
export function parseImportFile(text, filename = '') {
    const trimmed = text.trim();
    const lowerName = (filename || '').toLowerCase();

    if (trimmed.startsWith('---')) {
        const legacyJson = parseLegacyMarkdownFrontmatter(trimmed);
        if (legacyJson) {
            return validateExportPayload(legacyJson);
        }
    }

    if (lowerName.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return validateExportPayload(JSON.parse(trimmed));
    }

    if (lowerName.endsWith('.md') || lowerName.endsWith('.txt') || isTextEmailExport(trimmed) || isLegacyMarkdownExport(trimmed)) {
        return validateExportPayload(parseTranscriptExport(trimmed));
    }

    try {
        return validateExportPayload(JSON.parse(trimmed));
    } catch {
        return validateExportPayload(parseTranscriptExport(trimmed));
    }
}

/**
 * Puts system messages first (matches setSystemPrompt storage order).
 */
export function orderMessagesForImport(messages) {
    const system = messages.filter(m => m.role === 'system');
    const rest = messages.filter(m => m.role !== 'system');
    return [...system, ...rest];
}

/**
 * Validates imported messages and returns storage-ready messages with new ids.
 */
export function sanitizeMessagesForImport(messages) {
    const normalized = normalizeImportMessages(messages).map(msg => ({
        id: generateId(),
        role: msg.role,
        text: msg.text,
        timestamp: new Date().toISOString()
    }));
    return orderMessagesForImport(normalized);
}

/**
 * Messages for export, including unsaved system-prompt draft when the editor is open.
 */
export function messagesForExport(messages, editingMessageId) {
    if (editingMessageId !== 'system-prompt') {
        return messages;
    }
    const field = document.querySelector('.system-prompt-input-field');
    if (!field) {
        return messages;
    }
    const draft = field.value;
    const withoutSystem = messages.filter(m => m.role !== 'system');
    if (!draft.trim()) {
        return withoutSystem;
    }
    const existing = messages.find(m => m.role === 'system');
    const systemMessage = existing
        ? { ...existing, text: draft }
        : { role: 'system', text: draft };
    return [systemMessage, ...withoutSystem];
}
