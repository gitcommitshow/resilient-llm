/**
 * @typedef {Object} ErrorClassification
 * @property {string} kind
 * @property {string|null} code
 * @property {number|null} httpStatus
 * @property {boolean} retryable
 * @property {string} reason
 */

function asString(value) {
  if (value == null) return null;
  try {
    return String(value);
  } catch {
    return null;
  }
}

function getHttpStatus(err) {
  const s = err?.response?.status ?? err?.status ?? err?.statusCode;
  if (typeof s === 'number' && Number.isFinite(s)) return s;
  const ns = Number(s);
  return Number.isFinite(ns) ? ns : null;
}

function getCode(err) {
  return asString(err?.code ?? err?.cause?.code);
}

function getMessage(err) {
  return typeof err?.message === 'string' ? err.message : asString(err?.message);
}

// lib/ErrorNormalization.js

function isJsonSafeValue(value) {
  if (value == null) return true;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serialize an Error-like object (e.g. cause) to a JSON-safe, flat object.
 * Standard fields: name, code, message (with constructor.name fallback).
 * Also flattens enumerable own-properties except excluded keys.
 */
export function serializeErrorCause(cause, options = {}) {
  const c = cause;
  if (c == null || typeof c !== 'object') return null;

  const excludeKeys = new Set(options.excludeKeys ?? ['stack']);

  const standard = {
    name: typeof c.name === 'string'
      ? c.name
      : (typeof c.constructor?.name === 'string' ? c.constructor.name : null),
    code: c.code != null ? String(c.code) : null,
    message: c.message != null ? String(c.message) : null,
  };

  const out = { ...standard };

  // Add enumerable own-properties as additional context
  for (const [k, v] of Object.entries(c)) {
    if (excludeKeys.has(k)) continue;
    if (k === 'name' || k === 'code' || k === 'message') continue; // keep canonical standard
    out[k] = isJsonSafeValue(v) ? v : String(v);
  }

  const keys = Object.keys(out);
  const hasNonNull = keys.some((k) => out[k] != null);
  return hasNonNull ? out : null;
}

/**
 * Best-effort classification of arbitrary errors into stable buckets.
 * @param {any} err
 * @returns {ErrorClassification}
 */
export function classifyError(err) {
  const httpStatus = getHttpStatus(err);
  const code = getCode(err);
  const message = (getMessage(err) ?? '').toLowerCase();
  const name = typeof err?.name === 'string' ? err.name : (typeof err?.constructor?.name === 'string' ? err.constructor.name : '');

  if (name === 'AbortError') {
    return { kind: 'aborted', code, httpStatus, retryable: false, reason: 'operation aborted' };
  }
  if (name === 'OversizedRequestError') {
    return { kind: 'oversized_request', code, httpStatus, retryable: false, reason: 'request too large' };
  }
  if (name === 'TimeoutError' || message.includes('timed out')) {
    return { kind: 'timeout', code, httpStatus, retryable: true, reason: 'timeout' };
  }
  if (message === 'circuit breaker is open') {
    return { kind: 'circuit_open', code, httpStatus, retryable: false, reason: 'circuit breaker open' };
  }

  // HTTP classification if we have a status
  if (httpStatus != null) {
    if (httpStatus === 401) return { kind: 'auth', code, httpStatus, retryable: false, reason: 'unauthorized' };
    if (httpStatus === 403) return { kind: 'auth', code, httpStatus, retryable: false, reason: 'forbidden' };
    if (httpStatus === 404) return { kind: 'not_found', code, httpStatus, retryable: false, reason: 'not found' };
    if (httpStatus === 429) return { kind: 'rate_limit', code, httpStatus, retryable: true, reason: 'rate limited' };
    if (httpStatus === 529) return { kind: 'overloaded', code, httpStatus, retryable: true, reason: 'overloaded' };
    if (httpStatus >= 500) return { kind: 'http_5xx', code, httpStatus, retryable: true, reason: 'server error' };
    if (httpStatus >= 400) return { kind: 'http_4xx', code, httpStatus, retryable: false, reason: 'client error' };
  }

  // Network-ish (undici/node)
  const networkCodes = new Set([
    'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ENETUNREACH',
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  ]);
  if ((code && networkCodes.has(code)) || message === 'fetch failed' || message.includes('getaddrinfo enotfound')) {
    return { kind: 'network', code, httpStatus, retryable: true, reason: 'network connectivity' };
  }

  return { kind: 'unknown', code, httpStatus, retryable: false, reason: 'unclassified' };
}

/**
 * Serialize an Error (or Error-like) into a JSON-safe object.
 * @param {any} err
 * @param {Object} [options]
 * @param {string[]} [options.excludeKeys]
 * @returns {Object|null}
 */
export function serializeError(err, options = {}) {
  if (err == null || typeof err !== 'object') return null;
  const exclude = new Set(options.excludeKeys ?? ['stack']);
  const base = serializeErrorCause(err, { excludeKeys: Array.from(exclude) }) ?? {};
  // Ensure we don't accidentally include stack via enumeration.
  delete base.stack;
  return Object.keys(base).length ? base : null;
}

/**
 * Serialize an error + its `cause` chain into a list.
 * The first element is the top-level error, followed by its causes.
 * @param {any} err
 * @param {Object} [options]
 * @param {number} [options.maxDepth]
 * @param {string[]} [options.excludeKeys]
 * @returns {Object[]}
 */
export function serializeErrorChain(err, options = {}) {
  const maxDepth = typeof options.maxDepth === 'number' ? options.maxDepth : 8;
  const excludeKeys = options.excludeKeys ?? ['stack'];
  const chain = [];
  const seen = new Set();

  let current = err;
  let depth = 0;
  while (current && typeof current === 'object' && depth < maxDepth) {
    if (seen.has(current)) break;
    seen.add(current);
    const ser = serializeError(current, { excludeKeys });
    if (ser) chain.push(ser);
    current = current.cause;
    depth++;
  }
  return chain;
}

export class ResilientLLMError extends Error {
  /**
   * @param {string} message
   * @param {Object} options
   * @param {string} options.kind
   * @param {string|null} [options.code]
   * @param {number|null} [options.httpStatus]
   * @param {boolean} [options.retryable]
   * @param {string} [options.provider]
   * @param {Object|null} [options.metadata]
   * @param {Object|null} [options.classification]
   * @param {Object[]} [options.errorChain]
   * @param {any} [options.cause]
   */
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ResilientLLMError';
    this.kind = options.kind ?? 'unknown';
    this.code = options.code ?? null;
    this.httpStatus = options.httpStatus ?? null;
    this.retryable = typeof options.retryable === 'boolean' ? options.retryable : null;
    this.provider = options.provider ?? null;
    this.classification = options.classification ?? null;
    this.errorChain = Array.isArray(options.errorChain) ? options.errorChain : [];
    if (options.metadata) this.metadata = options.metadata;
  }

  /**
   * Convenience wrapper for serializeErrorCause.
   * @param {any} cause
   * @param {{ excludeKeys?: string[] }} [options]
   * @returns {Object|null}
   */
  static serializeCause(cause, options = {}) {
    return serializeErrorCause(cause, options);
  }

  /**
   * Convenience wrapper for classifyError.
   * @param {any} err
   * @returns {ErrorClassification}
   */
  static classify(err) {
    return classifyError(err);
  }

  /**
   * Convenience wrapper for serializeError.
   * @param {any} err
   * @param {Object} [options]
   * @returns {Object|null}
   */
  static serializeError(err, options = {}) {
    return serializeError(err, options);
  }

  /**
   * Convenience wrapper for serializeErrorChain.
   * @param {any} err
   * @param {Object} [options]
   * @returns {Object[]}
   */
  static serializeChain(err, options = {}) {
    return serializeErrorChain(err, options);
  }

  /**
   * Create a ResilientLLMError from an arbitrary error, attaching classification
   * and serialized error chain. Optionally mutates provided metadata to include
   * error.classification and error.chain.
   * @param {any} error
   * @param {{ provider?: string|null, metadata?: Object|null }} [options]
   * @returns {ResilientLLMError}
   */
  static from(error, { provider, metadata } = {}) {
    const classification = classifyError(error);
    const chain = serializeErrorChain(error, { excludeKeys: ['stack'] });

    if (metadata) {
      metadata.error = metadata.error || {};
      metadata.error.classification = classification;
      metadata.error.chain = chain;
    }

    return new ResilientLLMError(error?.message || 'Unknown error', {
      kind: classification.kind,
      code: classification.code,
      httpStatus: classification.httpStatus,
      retryable: classification.retryable,
      provider: provider ?? null,
      metadata: metadata ?? null,
      classification,
      errorChain: chain,
      cause: error,
    });
  }
}

