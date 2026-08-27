export type AIHubRequestSource =
    | "model"
    | "prompt"
    | "seconds"
    | "aspectRatio"
    | "resolution"
    | "size"
    | "quality"
    | "count"
    | "references"
    | "videoReferences"
    | "audioReferences"
    | "firstFrame"
    | "lastFrame";
export type AIHubRequestValueType = "string" | "number" | "boolean" | "string-array" | "media-array" | "chat-messages";
export type AIHubProfileKind = "text" | "image" | "video" | "audio";

export type AIHubRequestCondition = {
    source: AIHubRequestSource;
    operator: "present" | "absent" | "equals" | "not-equals";
    value?: string | number | boolean;
};

export type AIHubRequestField = {
    source?: AIHubRequestSource;
    fallbackSources?: AIHubRequestSource[];
    target: string;
    type: AIHubRequestValueType;
    required?: boolean;
    omitEmpty?: boolean;
    singleTarget?: string;
    arrayMode?: "native" | "json" | "repeat";
    valueMap?: Record<string, string | number | boolean>;
    fixed?: string | number | boolean;
    default?: string | number | boolean;
    conditions?: AIHubRequestCondition[];
};

export type AIHubRequirementRule = {
    kind: "at-least-one" | "all-or-none" | "requires-any" | "mutually-exclusive" | "max-items";
    sources: AIHubRequestSource[];
    whenSources?: AIHubRequestSource[];
    max?: number;
    message: string;
};

export type AIHubTaskProtocol = {
    pollEndpoint: string;
    idFields: string[];
    statusFields: string[];
    progressFields?: string[];
    progressScale?: number;
    zeroMeansUnknown?: boolean;
    resultUrlFields: string[];
    errorFields: string[];
    queuedStatuses?: string[];
    processingStatuses?: string[];
    completedStatuses: string[];
    failedStatuses: string[];
};

export type AIHubResponseProtocol = {
    resultFields: string[];
    resultType: "url" | "base64" | "markdown" | "array";
};

export type AIHubDownloadProtocol = {
    mode: "direct" | "authenticated-content" | "candidates";
    endpoint?: string;
    idFields?: string[];
    acceptedMimeTypes?: string[];
};

export type AIHubErrorRule = {
    includesAny?: string[];
    includesAll?: string[];
    message: string;
    retryable?: boolean;
};

export type AIHubBillingProtocol = {
    unit: "request" | "second" | "token";
    minimum?: number;
    source: string;
};

export type AIHubRequestProfile = {
    kind: AIHubProfileKind;
    create: {
        method: "POST";
        endpoint: string;
        bodyType: "json" | "multipart" | "chat";
        fields: AIHubRequestField[];
    };
    validation?: { requirements: AIHubRequirementRule[] };
    response?: AIHubResponseProtocol;
    task?: AIHubTaskProtocol;
    download?: AIHubDownloadProtocol;
    errors?: AIHubErrorRule[];
    billing?: AIHubBillingProtocol;
};

export type AIHubRequestInput = Partial<Record<AIHubRequestSource, unknown>>;

const standardVideoTask: AIHubTaskProtocol = {
    pollEndpoint: "/videos/{id}",
    idFields: ["id", "task_id", "video_id"],
    statusFields: ["status", "state"],
    progressFields: ["progress", "data.progress"],
    progressScale: 100,
    zeroMeansUnknown: true,
    resultUrlFields: ["video_url", "url", "output_url", "download_url", "data.0.url"],
    errorFields: ["error.message", "error", "message", "msg"],
    queuedStatuses: ["queued", "pending"],
    processingStatuses: ["processing", "running", "in_progress"],
    completedStatuses: ["completed", "complete", "done", "succeeded", "success"],
    failedStatuses: ["failed", "fail", "error", "cancelled", "canceled"],
};

export const AIHUB_BUILT_IN_REQUEST_PROFILES: Record<string, AIHubRequestProfile> = {
    "image-gemini-json": {
        kind: "image",
        create: {
            method: "POST",
            endpoint: "/images/generations",
            bodyType: "json",
            fields: [
                { source: "model", target: "model", type: "string", required: true },
                { source: "prompt", target: "prompt", type: "string", required: true },
                { source: "size", target: "size", type: "string" },
                { source: "references", target: "image", singleTarget: "image", type: "string-array" },
            ],
        },
        response: { resultFields: ["data", "images", "output"], resultType: "array" },
        billing: { unit: "request", source: "https://aihubcc.cc/pricing" },
    },
    "image-seedream-json": {
        kind: "image",
        create: {
            method: "POST",
            endpoint: "/images/generations",
            bodyType: "json",
            fields: [
                { source: "model", target: "model", type: "string", required: true },
                { source: "prompt", target: "prompt", type: "string", required: true },
                { source: "size", target: "size", type: "string" },
                { source: "references", target: "image", singleTarget: "image", type: "string-array" },
            ],
        },
        response: { resultFields: ["data", "images", "output"], resultType: "array" },
        billing: { unit: "request", source: "https://aihubcc.cc/pricing" },
    },
    "image-grok-lite-json": {
        kind: "image",
        create: {
            method: "POST",
            endpoint: "/images/generations",
            bodyType: "json",
            fields: [
                { source: "model", target: "model", type: "string", required: true },
                { source: "prompt", target: "prompt", type: "string", required: true },
                { source: "size", target: "size", type: "string" },
            ],
        },
        response: { resultFields: ["data", "images", "output"], resultType: "array" },
        billing: { unit: "request", source: "https://aihubcc.cc/pricing" },
    },
    "image-gpt-json": {
        kind: "image",
        create: {
            method: "POST",
            endpoint: "/images/generations",
            bodyType: "json",
            fields: [
                { source: "model", target: "model", type: "string", required: true },
                { source: "prompt", target: "prompt", type: "string", required: true },
                { source: "count", target: "n", type: "number" },
                { source: "size", target: "size", type: "string" },
                { source: "quality", target: "quality", type: "string", conditions: [{ source: "quality", operator: "not-equals", value: "auto" }] },
            ],
        },
        response: { resultFields: ["data", "images", "output"], resultType: "array" },
        billing: { unit: "request", source: "https://aihubcc.cc/pricing" },
    },
    "image-gpt-1k-json": {
        kind: "image",
        create: {
            method: "POST",
            endpoint: "/images/generations",
            bodyType: "json",
            fields: [
                { source: "model", target: "model", type: "string", required: true },
                { source: "prompt", target: "prompt", type: "string", required: true },
                { source: "size", target: "size", type: "string" },
                { source: "references", target: "reference_image_urls", singleTarget: "image_url", type: "string-array" },
            ],
        },
        response: { resultFields: ["data", "images", "output"], resultType: "array" },
        billing: { unit: "request", source: "https://aihubcc.cc/pricing" },
    },
    "seedance-2.0-direct": {
        kind: "video",
        create: {
            method: "POST",
            endpoint: "/videos",
            bodyType: "json",
            fields: [
                { source: "model", target: "model", type: "string", required: true },
                { source: "prompt", target: "prompt", type: "string", required: true },
                { source: "seconds", target: "seconds", type: "string", required: true },
                { source: "aspectRatio", target: "aspect_ratio", type: "string", required: true },
                { source: "firstFrame", target: "first_image_url", type: "string" },
                { source: "lastFrame", target: "last_image_url", type: "string" },
                { source: "references", target: "reference_images", singleTarget: "image_url", type: "string-array", conditions: [{ source: "videoReferences", operator: "absent" }, { source: "audioReferences", operator: "absent" }] },
                { source: "references", target: "reference_images", type: "string-array", conditions: [{ source: "videoReferences", operator: "present" }] },
                { source: "references", target: "reference_images", type: "string-array", conditions: [{ source: "videoReferences", operator: "absent" }, { source: "audioReferences", operator: "present" }] },
                { source: "videoReferences", target: "reference_videos", type: "string-array" },
                { source: "audioReferences", target: "reference_audios", type: "string-array" },
            ],
        },
        task: standardVideoTask,
        download: { mode: "candidates", endpoint: "/videos/{id}/content", acceptedMimeTypes: ["video/", "image/"] },
        billing: { unit: "request", source: "https://aihubcc.cc/pricing" },
    },
};

export const AIHUB_BUILT_IN_REQUEST_PROFILE_ASSIGNMENTS: Record<string, string> = {
    ...Object.fromEntries([
        "Doubao-Seedance-2.0-mini-480p",
        "Doubao-Seedance-2.0-mini-720p",
        "Doubao-Seedance-2.0-fast-480p",
        "Doubao-Seedance-2.0-fast-720p",
        "Doubao-Seedance-2.0-480p",
        "Doubao-Seedance-2.0-720p",
        "Doubao-Seedance-2.0-1080p",
    ].map((model) => [model.toLowerCase(), "seedance-2.0-direct"])),
    "gemini-image": "image-gemini-json",
    "gemini-image-pro": "image-gemini-json",
    "doubao-seedream-4-5": "image-seedream-json",
    "doubao-seedream-5-0": "image-seedream-json",
    "doubao-seedream-5-0-pro": "image-seedream-json",
    "grok-imagine-image-lite": "image-grok-lite-json",
    "gpt-image-2": "image-gpt-json",
    "gpt-image-2-1k": "image-gpt-1k-json",
};

let runtimeProfiles = new Map<string, AIHubRequestProfile>();
let runtimeAssignments = new Map<string, string>();
let runtimeCatalogActive = false;

export function setAIHubRuntimeRequestProfiles(profiles: Record<string, AIHubRequestProfile>, assignments: Array<{ model: string; requestProfile?: string }>) {
    runtimeProfiles = new Map(Object.entries(profiles));
    runtimeAssignments = new Map(assignments.flatMap((entry) => (entry.requestProfile ? [[entry.model.trim().toLowerCase(), entry.requestProfile] as const] : [])));
    runtimeCatalogActive = true;
}

export function clearAIHubRuntimeRequestProfiles() {
    runtimeProfiles = new Map();
    runtimeAssignments = new Map();
    runtimeCatalogActive = false;
}

export function getAIHubRequestProfile(model: string) {
    const normalized = model.trim().toLowerCase();
    const profileId = runtimeCatalogActive ? runtimeAssignments.get(normalized) : AIHUB_BUILT_IN_REQUEST_PROFILE_ASSIGNMENTS[normalized];
    return profileId ? (runtimeCatalogActive ? runtimeProfiles.get(profileId) : undefined) || AIHUB_BUILT_IN_REQUEST_PROFILES[profileId] : undefined;
}

export function buildAIHubConfiguredRequestBody(profile: AIHubRequestProfile, input: AIHubRequestInput) {
    validateRequirements(profile, input);
    const values: Record<string, unknown> = {};
    const form = profile.create.bodyType === "multipart" ? new FormData() : null;
    for (const field of profile.create.fields) {
        if (field.conditions?.some((condition) => !matchesCondition(condition, input))) continue;
        const raw = field.fixed ?? readInputValue(field, input) ?? field.default;
        let converted = convertValue(raw, field.type, input);
        if (field.valueMap && converted !== undefined && !Array.isArray(converted)) converted = field.valueMap[String(converted)] ?? converted;
        if (isEmpty(converted)) {
            if (field.required) throw new Error(`在线模型请求缺少必填参数：${field.source || field.target}`);
            if (field.omitEmpty !== false) continue;
        }
        const useSingleTarget = Array.isArray(converted) && converted.length === 1 && Boolean(field.singleTarget);
        const target = useSingleTarget ? field.singleTarget! : field.target;
        const targetValue = useSingleTarget && Array.isArray(converted) ? converted[0] : converted;
        const output = Array.isArray(targetValue) && field.arrayMode === "json" ? JSON.stringify(targetValue) : targetValue;
        if (form) appendFormValue(form, target, output, field.arrayMode);
        else setPath(values, target, output);
    }
    return form || values;
}

export function renderAIHubTaskEndpoint(template: string, id: string) {
    return template.replaceAll("{id}", encodeURIComponent(id));
}

export function readAIHubProtocolValue(value: unknown, paths: string[]) {
    for (const path of paths) {
        let current = value;
        for (const key of path.split(".")) {
            if (Array.isArray(current) && /^\d+$/.test(key)) current = current[Number(key)];
            else current = current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined;
        }
        if (typeof current === "string" && current.trim()) return current.trim();
        if (typeof current === "number" && Number.isFinite(current)) return current;
        if (Array.isArray(current) && current.length) return current;
    }
    return undefined;
}

export function readAIHubTaskProgress(task: AIHubTaskProtocol | undefined, payload: unknown, status?: string) {
    if (!task?.progressFields?.length) return undefined;
    if (task.completedStatuses.includes((status || "").toLowerCase())) return 100;
    const raw = readAIHubProtocolValue(payload, task.progressFields);
    const number = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (!Number.isFinite(number)) return undefined;
    if (task.zeroMeansUnknown && number === 0) return undefined;
    const scale = task.progressScale || 100;
    return Math.max(0, Math.min(100, Math.round((number * 100) / scale)));
}

export function translateAIHubProtocolError(profile: AIHubRequestProfile | undefined, message: string) {
    const normalized = message.trim();
    const lower = normalized.toLowerCase();
    const rule = profile?.errors?.find((entry) => {
        const any = !entry.includesAny?.length || entry.includesAny.some((value) => lower.includes(value.toLowerCase()));
        const all = !entry.includesAll?.length || entry.includesAll.every((value) => lower.includes(value.toLowerCase()));
        return any && all;
    });
    return rule ? { message: rule.message, retryable: rule.retryable } : { message: normalized };
}

function readInputValue(field: AIHubRequestField, input: AIHubRequestInput) {
    for (const source of [field.source, ...(field.fallbackSources || [])]) if (source && !isEmpty(input[source])) return input[source];
    return undefined;
}

function matchesCondition(condition: AIHubRequestCondition, input: AIHubRequestInput) {
    const value = input[condition.source];
    if (condition.operator === "present") return !isEmpty(value);
    if (condition.operator === "absent") return isEmpty(value);
    if (condition.operator === "equals") return value === condition.value;
    return value !== condition.value;
}

function validateRequirements(profile: AIHubRequestProfile, input: AIHubRequestInput) {
    for (const rule of profile.validation?.requirements || []) {
        const present = rule.sources.filter((source) => !isEmpty(input[source]));
        const active = !rule.whenSources?.length || rule.whenSources.some((source) => !isEmpty(input[source]));
        const itemCount = rule.sources.reduce((sum, source) => sum + (Array.isArray(input[source]) ? input[source].length : isEmpty(input[source]) ? 0 : 1), 0);
        const invalid =
            active &&
            ((rule.kind === "at-least-one" && !present.length) ||
                (rule.kind === "all-or-none" && present.length > 0 && present.length < rule.sources.length) ||
                (rule.kind === "requires-any" && !present.length) ||
                (rule.kind === "mutually-exclusive" && present.length > 1) ||
                (rule.kind === "max-items" && itemCount > (rule.max || 0)));
        if (invalid) throw new Error(rule.message);
    }
}

function convertValue(value: unknown, type: AIHubRequestValueType, input: AIHubRequestInput) {
    if (value === undefined || value === null || value === "") return undefined;
    if (type === "string") return String(value);
    if (type === "number") {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error("在线模型请求包含无效数字");
        return number;
    }
    if (type === "boolean") return typeof value === "boolean" ? value : value === "true" || value === 1;
    if (type === "chat-messages") {
        const prompt = String(value);
        const references = Array.isArray(input.references) ? input.references : [];
        const content = references.length ? [{ type: "text", text: prompt }, ...references.map((url) => ({ type: "image_url", image_url: { url } }))] : prompt;
        return [{ role: "user", content }];
    }
    if (!Array.isArray(value)) throw new Error("在线模型请求包含无效数组");
    if (type === "string-array" && !value.every((item) => typeof item === "string")) throw new Error("当前在线模型请求规则只允许公网素材地址");
    if (type === "media-array" && !value.every((item) => typeof item === "string" || item instanceof File)) throw new Error("在线模型请求包含无效素材");
    return value;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
    const parts = path.split(".");
    let current = target;
    for (const part of parts.slice(0, -1)) {
        const next = current[part];
        current = next && typeof next === "object" && !Array.isArray(next) ? (next as Record<string, unknown>) : ((current[part] = {}) as Record<string, unknown>);
    }
    current[parts.at(-1)!] = value;
}

function appendFormValue(form: FormData, target: string, value: unknown, arrayMode?: AIHubRequestField["arrayMode"]) {
    if (Array.isArray(value) && arrayMode !== "json") value.forEach((item) => form.append(target, item instanceof Blob ? item : String(item)));
    else if (value instanceof Blob) form.set(target, value);
    else form.set(target, String(value ?? ""));
}

function isEmpty(value: unknown) {
    return value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length);
}
