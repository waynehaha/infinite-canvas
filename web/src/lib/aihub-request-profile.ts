export type AIHubRequestSource = "model" | "prompt" | "seconds" | "aspectRatio" | "resolution" | "references" | "videoReferences" | "audioReferences" | "firstFrame" | "lastFrame";
export type AIHubRequestValueType = "string" | "number" | "boolean" | "string-array";

export type AIHubRequestField = {
    source: AIHubRequestSource;
    target: string;
    type: AIHubRequestValueType;
    required?: boolean;
    singleTarget?: string;
};

export type AIHubTaskProtocol = {
    pollEndpoint: string;
    idFields: string[];
    statusFields: string[];
    resultUrlFields: string[];
    errorFields: string[];
    completedStatuses: string[];
    failedStatuses: string[];
};

export type AIHubRequestProfile = {
    kind: "video";
    method: "POST";
    endpoint: string;
    bodyType: "json" | "multipart";
    fields: AIHubRequestField[];
    task?: AIHubTaskProtocol;
};

export type AIHubRequestInput = Record<AIHubRequestSource, unknown>;

export const AIHUB_BUILT_IN_REQUEST_PROFILES: Record<string, AIHubRequestProfile> = {
    "seedance-2.0-direct": {
        kind: "video",
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
            { source: "references", target: "reference_images", singleTarget: "image_url", type: "string-array" },
            { source: "videoReferences", target: "reference_videos", type: "string-array" },
            { source: "audioReferences", target: "reference_audios", type: "string-array" },
        ],
        task: {
            pollEndpoint: "/videos/{id}",
            idFields: ["id", "task_id", "video_id"],
            statusFields: ["status", "state"],
            resultUrlFields: ["video_url", "url", "output_url", "download_url"],
            errorFields: ["error.message", "message", "msg"],
            completedStatuses: ["completed", "complete", "done", "succeeded", "success"],
            failedStatuses: ["failed", "fail", "error", "cancelled", "canceled"],
        },
    },
};

export const AIHUB_BUILT_IN_REQUEST_PROFILE_ASSIGNMENTS: Record<string, string> = Object.fromEntries(
    [
        "Doubao-Seedance-2.0-mini-480p",
        "Doubao-Seedance-2.0-mini-720p",
        "Doubao-Seedance-2.0-fast-480p",
        "Doubao-Seedance-2.0-fast-720p",
        "Doubao-Seedance-2.0-480p",
        "Doubao-Seedance-2.0-720p",
        "Doubao-Seedance-2.0-1080p",
    ].map((model) => [model.toLowerCase(), "seedance-2.0-direct"]),
);

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
    const values: Record<string, unknown> = {};
    const form = profile.bodyType === "multipart" ? new FormData() : null;
    for (const field of profile.fields) {
        const converted = convertValue(input[field.source], field.type);
        if (isEmpty(converted)) {
            if (field.required) throw new Error(`在线模型请求缺少必填参数：${field.source}`);
            continue;
        }
        const target = Array.isArray(converted) && converted.length === 1 && field.singleTarget ? field.singleTarget : field.target;
        if (form) appendFormValue(form, target, converted);
        else values[target] = converted;
    }
    return form || values;
}

export function renderAIHubTaskEndpoint(template: string, id: string) {
    return template.replace("{id}", encodeURIComponent(id));
}

export function readAIHubProtocolValue(value: unknown, paths: string[]) {
    for (const path of paths) {
        let current = value;
        for (const key of path.split(".")) current = current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined;
        if (typeof current === "string" && current.trim()) return current.trim();
        if (typeof current === "number" && Number.isFinite(current)) return current;
    }
    return undefined;
}

function convertValue(value: unknown, type: AIHubRequestValueType) {
    if (value === undefined || value === null || value === "") return undefined;
    if (type === "string") return String(value);
    if (type === "number") {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error("在线模型请求包含无效数字");
        return number;
    }
    if (type === "boolean") return typeof value === "boolean" ? value : value === "true" || value === 1;
    if (!Array.isArray(value)) throw new Error("在线模型请求包含无效数组");
    if (!value.every((item) => typeof item === "string")) throw new Error("当前在线模型请求规则只允许公网素材地址");
    return value;
}

function appendFormValue(form: FormData, target: string, value: unknown) {
    if (Array.isArray(value)) value.forEach((item) => form.append(target, String(item)));
    else form.set(target, String(value));
}

function isEmpty(value: unknown) {
    return value === undefined || value === "" || (Array.isArray(value) && !value.length);
}
