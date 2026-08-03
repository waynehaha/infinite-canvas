const SENSITIVE_KEY = /(api[-_]?key|authorization|cookie|token|password|secret|credential|access[-_]?key|private[-_]?key)/i;
const PROMPT_KEY = /(prompt|instruction|content|text)/i;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const COMMON_API_KEY = /\b(?:sk|sess|key|token)[-_][A-Za-z0-9_-]{12,}\b/gi;
const SENSITIVE_ASSIGNMENT = /\b(api[-_ ]?key|authorization|cookie|password|secret|access[-_ ]?key)\s*[:=]\s*(?!\[已隐藏\])[^\s,;]{6,}/gi;
const DATA_URL = /data:[^;,\s]+(?:;[^,\s]+)*;base64,[A-Za-z0-9+/=\r\n]+/gi;
const LONG_BASE64 = /\b[A-Za-z0-9+/]{512,}={0,2}\b/g;
const LOCAL_PATH = /(?:[A-Za-z]:\\|\/(?:Users|home|private|var|tmp)\/)[^\s"']+/g;

export function sanitizeDiagnosticValue(value: unknown, includePrompt = false, depth = 0): unknown {
    if (depth > 8) return "[内容层级过深，已隐藏]";
    if (value == null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return sanitizeDiagnosticText(value);
    if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitizeDiagnosticValue(item, includePrompt, depth + 1));
    if (typeof value !== "object") return String(value);

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_KEY.test(key)) {
            result[key] = "[已隐藏]";
            continue;
        }
        if (!includePrompt && PROMPT_KEY.test(key)) {
            result[key] = "[默认未导出]";
            continue;
        }
        result[key] = sanitizeDiagnosticValue(item, includePrompt, depth + 1);
    }
    return result;
}

export function sanitizeDiagnosticText(value: string) {
    let next = value.replace(DATA_URL, "[素材内容已隐藏]").replace(LONG_BASE64, "[大段数据已隐藏]").replace(BEARER_TOKEN, "Bearer [已隐藏]").replace(COMMON_API_KEY, "[疑似密钥已隐藏]").replace(SENSITIVE_ASSIGNMENT, "$1=[已隐藏]").replace(LOCAL_PATH, "[本地路径已隐藏]");
    next = next.replace(/https?:\/\/[^\s"']+/gi, (url) => sanitizeUrl(url));
    return next.length > 12000 ? next.slice(0, 12000) + "\n[内容过长，已截断]" : next;
}

export function diagnosticExportLooksSafe(value: unknown) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (!text) return true;
    return (
        !unsafePatternTest(DATA_URL, text) &&
        !unsafePatternTest(LONG_BASE64, text) &&
        !unsafePatternTest(BEARER_TOKEN, text) &&
        !unsafePatternTest(COMMON_API_KEY, text) &&
        !unsafePatternTest(SENSITIVE_ASSIGNMENT, text) &&
        !/"(?:apiKey|authorization|cookie|password|secret)"\s*:\s*"(?!\[已隐藏\])/i.test(text)
    );
}

function unsafePatternTest(pattern: RegExp, value: string) {
    pattern.lastIndex = 0;
    const matched = pattern.test(value);
    pattern.lastIndex = 0;
    return matched;
}

function sanitizeUrl(value: string) {
    try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
    } catch {
        return "[链接已隐藏]";
    }
}
