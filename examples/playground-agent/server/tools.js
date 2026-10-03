/**
 * Tools the agent playground advertises to the model, plus web_search execution.
 * DuckDuckGo needs no key. Tavily uses its Search API and an API key.
 */

const MAX_SEARCH_RESULTS = 5;
const MAX_SEARCH_CHARS = 4000;
const MAX_PAGE_CHARS = 12000;

const PAGE_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,text/plain',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
};

/** Lets the model request a web search. */
export const webSearchTool = {
    type: 'function',
    function: {
        name: 'web_search',
        description: 'Search the public web for up-to-date information. Use this when the answer depends on current facts, news, or sources that are not in the conversation.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query to look up on the web.'
                }
            },
            required: ['query']
        }
    }
};

/** Lets the model read the text of one public web page. */
export const readPageTool = {
    type: 'function',
    function: {
        name: 'read_page',
        description: 'Read the text content of a public web page. Use this after web_search when a result URL needs to be opened, or when the user gives a page URL.',
        parameters: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'http or https URL of the page to read.'
                }
            },
            required: ['url']
        }
    }
};

/** True when a tool list already advertises this function name. */
function hasTool(tools, name) {
    return tools.some((tool) => tool?.function?.name === name || tool?.name === name);
}

/**
 * Adds the enabled agent tools.
 * Strips playground-only settings so they are not forwarded to the model request.
 * @param {object} [llmOptions]
 * @returns {object}
 */
export function withAgentTools(llmOptions = {}) {
    const { webSearchEnabled, readPageEnabled, ...options } = llmOptions;
    delete options.searchProvider;
    delete options.searchApiKey;
    const tools = Array.isArray(options.tools) ? [...options.tools] : [];
    if (webSearchEnabled !== false && !hasTool(tools, 'web_search')) {
        tools.push(webSearchTool);
    }
    if (readPageEnabled !== false && !hasTool(tools, 'read_page')) {
        tools.push(readPageTool);
    }
    if (!tools.length) return options;
    return { ...options, tools };
}

/** Turns DuckDuckGo result HTML entities into plain text. */
function decodeHtml(value) {
    return String(value)
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&#x27;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, code) => {
            const point = Number(code);
            return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : '';
        })
        .replace(/\s+/g, ' ')
        .trim();
}

/** Resolves a DuckDuckGo redirect link to the target URL. */
function unwrapResultUrl(href) {
    const decoded = decodeHtml(href);
    const absolute = decoded.startsWith('//') ? `https:${decoded}` : decoded;
    try {
        const url = new URL(absolute, 'https://duckduckgo.com');
        return url.searchParams.get('uddg') || url.toString();
    } catch {
        return decoded;
    }
}

/** Reads one attribute from an HTML tag. */
function readAttr(tag, name) {
    const match = String(tag).match(new RegExp(`${name}=['"]([^'"]+)['"]`, 'i'));
    return match ? match[1] : '';
}

/** True when DuckDuckGo returned a bot check instead of results. */
function isDuckDuckGoBlockPage(html) {
    return /anomaly|bots use DuckDuckGo|unfortunately, bots/i.test(String(html));
}

/**
 * Pulls title, URL, and snippet rows out of DuckDuckGo's lite results page.
 * Each snippet is the one that follows its link, so a skipped link does not shift the rest.
 */
function parseDuckDuckGoLiteResults(html) {
    const results = [];
    const source = String(html);
    const linkRe = /<a\b([^>]*\bclass=['"][^'"]*\bresult-link\b[^'"]*['"][^>]*)>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkRe.exec(source)) && results.length < MAX_SEARCH_RESULTS) {
        const title = decodeHtml(match[2]);
        const url = unwrapResultUrl(readAttr(match[1], 'href'));
        if (!title || !url) continue;
        const after = source.slice(match.index, match.index + 2000);
        const snippetMatch = after.match(/\bclass=['"][^'"]*\bresult-snippet\b[^'"]*['"][^>]*>([\s\S]*?)<\/td>/i);
        results.push({
            title,
            url,
            snippet: snippetMatch ? decodeHtml(snippetMatch[1]) : ''
        });
    }
    return results;
}

/** Formats search rows as plain text for the model. */
function formatSearchResults(query, results) {
    const lines = [`web_search results for "${query}":`];
    results.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.title}`);
        lines.push(item.url);
        if (item.snippet) lines.push(item.snippet);
    });
    return lines.join('\n').slice(0, MAX_SEARCH_CHARS);
}

/**
 * Searches DuckDuckGo's public HTML results. No API key is required.
 * @param {string} query
 * @returns {Promise<string>}
 */
async function searchDuckDuckGo(query) {
    const response = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        },
        redirect: 'follow'
    });
    if (!response.ok) {
        throw new Error(`web_search failed for "${query}" (HTTP ${response.status}).`);
    }

    const html = await response.text();
    const results = parseDuckDuckGoLiteResults(html);
    console.log('[web_search] DuckDuckGo results for "%s":', query, results);
    if (results.length === 0) {
        const blocked = isDuckDuckGoBlockPage(html);
        console.warn('[web_search] Empty DuckDuckGo results for "%s"%s', query, blocked ? ' (bot check page)' : '');
        throw new Error(blocked
            ? `web_search was blocked by DuckDuckGo for "${query}".`
            : `web_search found no results for "${query}".`);
    }

    return formatSearchResults(query, results);
}

/**
 * Searches with the Tavily Search API.
 * Uses the request key, or TAVILY_API_KEY when the playground did not send one.
 * @param {string} query
 * @param {string} [apiKey]
 * @returns {Promise<string>}
 */
async function searchTavily(query, apiKey) {
    const key = String(apiKey || process.env.TAVILY_API_KEY || '').trim();
    if (!key) {
        throw new Error('Tavily search needs an API key. Add it in tool settings or set TAVILY_API_KEY.');
    }

    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
            query,
            max_results: MAX_SEARCH_RESULTS,
            search_depth: 'basic',
            chunks_per_source: 1,
            include_answer: false
        })
    });
    if (!response.ok) {
        let detail = '';
        try {
            const body = await response.json();
            detail = typeof body?.detail?.error === 'string' ? body.detail.error : '';
        } catch {
            detail = '';
        }
        throw new Error(`web_search failed for "${query}" (Tavily HTTP ${response.status}${detail ? `: ${detail}` : ''}).`);
    }

    const data = await response.json();
    const results = (Array.isArray(data?.results) ? data.results : [])
        .slice(0, MAX_SEARCH_RESULTS)
        .map((item) => ({
            title: String(item?.title || '').trim(),
            url: String(item?.url || '').trim(),
            snippet: String(item?.content || '').trim()
        }))
        .filter((item) => item.title || item.url);
    console.log('[web_search] Tavily results for "%s":', query, results);
    if (results.length === 0) {
        console.warn('[web_search] Empty Tavily results for "%s"', query);
        throw new Error(`web_search found no results for "${query}".`);
    }

    return formatSearchResults(query, results);
}

/**
 * Searches the public web and returns a short text block for the model.
 * A failed lookup throws. Callers must not replace that error with another search.
 * @param {string} query
 * @param {{ provider?: string, apiKey?: string }} [searchOptions]
 * @returns {Promise<string>}
 */
export async function searchWeb(query, searchOptions = {}) {
    const q = String(query || '').trim().slice(0, 300);
    if (!q) {
        throw new Error('web_search needs a query.');
    }
    if (searchOptions.provider === 'tavily') {
        return searchTavily(q, searchOptions.apiKey);
    }
    return searchDuckDuckGo(q);
}

/**
 * Accepts a public http(s) URL. Local and private hosts are rejected.
 * @param {string} value
 * @returns {URL}
 */
function publicPageUrl(value) {
    let url;
    try {
        url = new URL(String(value || '').trim());
    } catch {
        throw new Error('read_page needs an http or https URL.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('read_page only reads http and https pages.');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const privateHost = host === 'localhost'
        || host.endsWith('.localhost')
        || host.endsWith('.local')
        || host === '0.0.0.0'
        || host === '::1'
        || /^127\./.test(host)
        || /^10\./.test(host)
        || /^192\.168\./.test(host)
        || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
        || /^169\.254\./.test(host);
    if (privateHost) {
        throw new Error('read_page cannot read local or private addresses.');
    }
    return url;
}

/** Drops scripts and markup, leaving readable page text. */
function htmlToText(html) {
    const source = String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
    const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const bodyMatch = source.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return {
        title: titleMatch ? decodeHtml(titleMatch[1]) : '',
        text: decodeHtml(bodyMatch ? bodyMatch[1] : source)
    };
}

/**
 * Fetches one public page and returns its text for the model.
 * A failed or empty read throws.
 * @param {string} urlValue
 * @returns {Promise<string>}
 */
export async function readPage(urlValue) {
    const url = publicPageUrl(urlValue);
    const response = await fetch(url.href, {
        method: 'GET',
        headers: PAGE_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
        throw new Error(`read_page failed for ${url.href} (HTTP ${response.status}).`);
    }
    const finalUrl = publicPageUrl(response.url || url.href);
    const raw = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const parsed = /html|xml/i.test(contentType) || /<html|<body|<p[\s>]/i.test(raw.slice(0, 800))
        ? htmlToText(raw)
        : { title: '', text: raw.replace(/\s+/g, ' ').trim() };
    const text = parsed.text.slice(0, MAX_PAGE_CHARS);
    console.log('[read_page] %s (%s chars)', finalUrl.href, text.length);
    if (!text) {
        console.warn('[read_page] Empty page content for %s', finalUrl.href);
        throw new Error(`read_page found no content at ${finalUrl.href}.`);
    }
    const lines = [`read_page ${finalUrl.href}:`];
    if (parsed.title) lines.push(parsed.title);
    lines.push(text);
    return lines.join('\n');
}

/** Parses a tool call's argument object. */
function readToolArguments(call, toolName) {
    const raw = call?.function?.arguments ?? call?.input ?? call?.arguments;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                throw new Error(`${toolName} arguments must be an object.`);
            }
            return parsed;
        } catch (error) {
            if (error.message.startsWith(toolName)) throw error;
            throw new Error(`${toolName} arguments are not valid JSON: ${error.message}`);
        }
    }
    if (raw && typeof raw === 'object') return raw;
    throw new Error(`${toolName} needs arguments.`);
}

/** Reads the query argument from an OpenAI-style or flat tool call. */
function readSearchQuery(call) {
    const raw = call?.function?.arguments ?? call?.input ?? call?.arguments;
    if (typeof raw === 'string') {
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            throw new Error(`web_search arguments are not valid JSON: ${error.message}`);
        }
        if (!parsed || typeof parsed.query !== 'string' || !parsed.query.trim()) {
            throw new Error('web_search needs a query.');
        }
        return parsed.query;
    }
    if (raw && typeof raw.query === 'string' && raw.query.trim()) return raw.query;
    throw new Error('web_search needs a query.');
}

/**
 * Runs one approved tool call and returns the text to send back to the model.
 * @param {object} call
 * @param {{ provider?: string, apiKey?: string }} [searchOptions]
 * @returns {Promise<string>}
 */
export async function executeToolCall(call, searchOptions = {}) {
    const name = call?.function?.name || call?.name;
    if (name === 'web_search') {
        return searchWeb(readSearchQuery(call), searchOptions);
    }
    if (name === 'read_page') {
        const args = readToolArguments(call, 'read_page');
        if (typeof args.url !== 'string' || !args.url.trim()) {
            throw new Error('read_page needs a url.');
        }
        return readPage(args.url);
    }
    throw new Error(`Unsupported tool call: ${name || 'unknown'}.`);
}
