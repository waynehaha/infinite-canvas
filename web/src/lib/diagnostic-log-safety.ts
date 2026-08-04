const SENSITIVE_KEY = /(api[-_]?key|authorization|cookie|token|password|secret|credential|access[-_]?key|private[-_]?key)/i;
const PROMPT_KEY = /(prompt|instruction|content|text)/i;
const MEDIA_KEY = /(image|video|audio|reference|frame|file|mask)/i;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const COMMON_API_KEY = /\b(?:sk|sess|key|token)[-_][A-Za-z0-9_-]{12,}\b/gi;
const SENSITIVE_ASSIGNMENT = /\b(api[-_ ]?key|authorization|cookie|password|secret|access[-_ ]?key)\s*[:=]\s*(?!\[已隐藏\])[^\s,;]{6,}/gi;
const DATA_URL = /data:[^;,\s]+(?:;[^,\s]+)*;base64,[A-Za-z0-9+/=\r\n]+/gi;
const LONG_BASE64 = /\b[A-Za-z0-9+/]{512,}={0,2}\b/g;
const LOCAL_PATH = /(?:[A-Za-z]:\\|\/(?:Users|home|private|var|tmp)\/)[^\s"']+/g;
const PROMPT_VALUE_MARKER = "__diagnosticPromptValue";

type DiagnosticPromptValue = {
    [PROMPT_VALUE_MARKER]: true;
    value: string;
};

export function sanitizeDiagnosticValue(value: unknown, includePrompt = false, depth = 0): unknown {
    if (depth > 8) return "[内容层级过深，已隐藏]";
    if (value == null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return sanitizeDiagnosticText(value);
    if (isDiagnosticPromptValue(value)) return diagnosticPromptOutput(value, includePrompt);
    if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitizeDiagnosticValue(item, includePrompt, depth + 1));
    if (typeof value !== "object") return String(value);

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_KEY.test(key)) {
            result[key] = "[已隐藏]";
            continue;
        }
        if (!includePrompt && PROMPT_KEY.test(key)) {
            result[key] = diagnosticPromptOutput(item, false);
            continue;
        }
        if (includePrompt && PROMPT_KEY.test(key)) {
            result[key] = diagnosticPromptOutput(item, true);
            continue;
        }
        result[key] = sanitizeDiagnosticValue(item, includePrompt, depth + 1);
    }
    return result;
}

export function prepareDiagnosticValue(value: unknown, depth = 0): unknown {
    if (depth > 8) return "[内容层级过深，已隐藏]";
    if (value == null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return sanitizeDiagnosticText(value);
    if (isDiagnosticPromptValue(value)) return value;
    if (Array.isArray(value)) return value.slice(0, 200).map((item) => prepareDiagnosticValue(item, depth + 1));
    if (typeof value !== "object") return String(value);

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_KEY.test(key)) {
            result[key] = "[已隐藏]";
        } else if (PROMPT_KEY.test(key) && typeof item === "string") {
            result[key] = diagnosticPromptValue(item);
        } else {
            result[key] = prepareDiagnosticValue(item, depth + 1);
        }
    }
    return result;
}

export function createDiagnosticRequestSnapshot(value: unknown) {
    return {
        bodyType: isFormData(value) ? "form-data" : typeof value === "string" ? "json-string" : value && typeof value === "object" ? "json" : value == null ? "empty" : typeof value,
        body: isFormData(value) ? snapshotFormData(value) : snapshotRequestValue(parseJsonString(value)),
    };
}

export function diagnosticTextStats(value: string) {
    return {
        characterCount: Array.from(value).length,
        utf8Bytes: new TextEncoder().encode(value).length,
    };
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

export function sanitizeDiagnosticReferenceUrl(value: string) {
    if (!/^https?:/i.test(value)) return "[公网链接不可用]";
    try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        url.hash = "";
        for (const key of [...url.searchParams.keys()]) {
            if (/(?:api[-_]?key|token|signature|authorization|credential|access[-_]?key|secret|password|x-amz-|x-goog-signature)/i.test(key)) url.searchParams.delete(key);
        }
        return url.toString();
    } catch {
        return "[公网链接不可用]";
    }
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

function diagnosticPromptValue(value: string): DiagnosticPromptValue {
    return { [PROMPT_VALUE_MARKER]: true, value };
}

function isDiagnosticPromptValue(value: unknown): value is DiagnosticPromptValue {
    return Boolean(value && typeof value === "object" && (value as Record<string, unknown>)[PROMPT_VALUE_MARKER] === true && typeof (value as Record<string, unknown>).value === "string");
}

function diagnosticPromptOutput(value: unknown, includePrompt: boolean) {
    const text = isDiagnosticPromptValue(value) ? value.value : typeof value === "string" ? value : "";
    if (!text && typeof value !== "string" && !isDiagnosticPromptValue(value)) return sanitizeDiagnosticValue(value, includePrompt);
    return {
        included: includePrompt,
        ...diagnosticTextStats(text),
        text: includePrompt ? sanitizeDiagnosticText(text) : "[默认未导出]",
    };
}

function parseJsonString(value: unknown) {
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return value;
    }
}

function isFormData(value: unknown): value is FormData {
    return typeof FormData !== "undefined" && value instanceof FormData;
}

function isFile(value: unknown): value is File {
    return typeof File !== "undefined" && value instanceof File;
}

function snapshotFormData(value: FormData) {
    const fields: Record<string, unknown[]> = {};
    value.forEach((item, key) => {
        fields[key] = [...(fields[key] || []), isFile(item) ? fileSummary(item) : snapshotRequestValue(String(item), key)];
    });
    return { fields };
}

function snapshotRequestValue(value: unknown, key = "", depth = 0): unknown {
    if (depth > 10) return "[内容层级过深，已隐藏]";
    if (SENSITIVE_KEY.test(key)) return "[已隐藏]";
    if (value == null || typeof value === "number" || typeof value === "boolean") return value;
    if (isFile(value)) return fileSummary(value);
    if (typeof Blob !== "undefined" && value instanceof Blob) return { hidden: true, valueType: "file", size: value.size, mimeType: value.type || "unknown" };
    if (typeof value === "string") {
        if (PROMPT_KEY.test(key)) return diagnosticPromptValue(value);
        if (MEDIA_KEY.test(key) || /^(?:https?:|blob:|data:)/i.test(value) || value.length > 512) return hiddenStringSummary(value, MEDIA_KEY.test(key) ? "media" : "text");
        return sanitizeDiagnosticText(value);
    }
    if (Array.isArray(value)) return value.slice(0, 200).map((item) => snapshotRequestValue(item, key, depth + 1));
    if (typeof value !== "object") return String(value);

    const result: Record<string, unknown> = {};
    for (const [childKey, item] of Object.entries(value as Record<string, unknown>)) result[childKey] = snapshotRequestValue(item, childKey, depth + 1);
    return result;
}

function hiddenStringSummary(value: string, valueType: "media" | "text") {
    const mimeType = value.startsWith("data:") ? value.slice(5, value.indexOf(";", 5) > 0 ? value.indexOf(";", 5) : value.indexOf(",", 5)) : undefined;
    return { hidden: true, valueType, ...diagnosticTextStats(value), ...(mimeType ? { mimeType } : {}) };
}

function fileSummary(value: File) {
    return { hidden: true, valueType: "file", size: value.size, mimeType: value.type || "unknown" };
}
