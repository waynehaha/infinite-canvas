import { AIHUB_DEFAULT_MODELS, aihubModelAdapter, setAIHubRuntimeModelCatalog, clearAIHubRuntimeModelCatalog, type AIHubModelAdapter, type AIHubModelCapability } from "@/lib/aihub-models";
import { clearAIHubRuntimeCapabilities, getAIHubModelCapability, setAIHubRuntimeCapabilities, type AIHubCapabilityStatus, type AIHubModelCapability as AIHubCapability } from "@/lib/aihub-model-capabilities";
import { AIHUB_BUILT_IN_REQUEST_PROFILE_ASSIGNMENTS, AIHUB_BUILT_IN_REQUEST_PROFILES, clearAIHubRuntimeRequestProfiles, setAIHubRuntimeRequestProfiles, type AIHubRequestField, type AIHubRequestProfile, type AIHubTaskProtocol } from "@/lib/aihub-request-profile";

export const AIHUB_MODEL_CATALOG_SCHEMA_VERSION = 1;
export const AIHUB_MODEL_CATALOG_STORAGE_KEY = "infinite-canvas:aihub-model-catalog";

export type AIHubModelCatalogEntry = {
    model: string;
    kind: AIHubModelCapability;
    enabled: boolean;
    adapter: AIHubModelAdapter;
    requestProfile?: string;
    capability?: AIHubCapability;
    displayName?: string;
    description?: string;
    documentationUrl?: string;
};

export type AIHubModelCatalog = {
    schemaVersion: typeof AIHUB_MODEL_CATALOG_SCHEMA_VERSION;
    catalogId: "aihub-model-catalog";
    updatedAt: string;
    source: string;
    requestProfiles: Record<string, AIHubRequestProfile>;
    models: AIHubModelCatalogEntry[];
};

const adaptersByKind: Record<AIHubModelCapability, AIHubModelAdapter[]> = {
    text: ["text-generic"],
    image: ["image-generic", "image-gpt", "image-async", "image-chat", "image-reference", "image-gemini"],
    video: ["video-generic", "video-omni", "video-seedance", "video-seedance-edit", "video-grok-fixed", "video-grok", "video-h3", "video-clean"],
    audio: ["audio-chat"],
};

export function buildBuiltInAIHubModelCatalog(): AIHubModelCatalog {
    return {
        schemaVersion: AIHUB_MODEL_CATALOG_SCHEMA_VERSION,
        catalogId: "aihub-model-catalog",
        updatedAt: "2026-08-25T00:00:00.000Z",
        source: "https://aihubcc.cc/pricing",
        requestProfiles: AIHUB_BUILT_IN_REQUEST_PROFILES,
        models: AIHUB_DEFAULT_MODELS.map((model) => {
            const capability = getAIHubModelCapability(model);
            const kind = (capability?.kind || inferKind(model)) as AIHubModelCapability;
            const requestProfile = AIHUB_BUILT_IN_REQUEST_PROFILE_ASSIGNMENTS[model.toLowerCase()];
            return { model, kind, enabled: true, adapter: aihubModelAdapter(model) || defaultAdapter(kind), ...(requestProfile ? { requestProfile } : {}), ...(capability ? { capability, description: capability.fixedSummary.join(" · ") } : {}), documentationUrl: documentationUrl(model) };
        }),
    };
}

export function parseAIHubModelCatalog(text: string): AIHubModelCatalog {
    if (text.length > 2_000_000) throw new Error("模型配置文件不能超过 2MB");
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        throw new Error("模型配置文件不是有效的 JSON");
    }
    validateNoSecrets(value);
    return validateCatalog(value);
}

export function applyAIHubModelCatalog(catalog: AIHubModelCatalog, persist = true) {
    setAIHubRuntimeCapabilities(catalog.models.flatMap((entry) => (entry.capability ? [entry.capability] : [])));
    setAIHubRuntimeModelCatalog(catalog.models.map(({ model, kind, adapter }) => ({ model, kind, adapter })));
    setAIHubRuntimeRequestProfiles(catalog.requestProfiles, catalog.models);
    if (persist && typeof window !== "undefined") window.localStorage.setItem(AIHUB_MODEL_CATALOG_STORAGE_KEY, JSON.stringify(catalog));
}

export function loadPersistedAIHubModelCatalog() {
    if (typeof window === "undefined") return null;
    const text = window.localStorage.getItem(AIHUB_MODEL_CATALOG_STORAGE_KEY);
    if (!text) return null;
    try {
        const catalog = parseAIHubModelCatalog(text);
        applyAIHubModelCatalog(catalog, false);
        return catalog;
    } catch {
        window.localStorage.removeItem(AIHUB_MODEL_CATALOG_STORAGE_KEY);
        return null;
    }
}

export function clearPersistedAIHubModelCatalog() {
    clearAIHubRuntimeCapabilities();
    clearAIHubRuntimeModelCatalog();
    clearAIHubRuntimeRequestProfiles();
    if (typeof window !== "undefined") window.localStorage.removeItem(AIHUB_MODEL_CATALOG_STORAGE_KEY);
}

export function catalogModelsByKind(catalog: AIHubModelCatalog, kind: AIHubModelCapability) {
    return catalog.models.filter((entry) => entry.kind === kind && entry.enabled).map((entry) => entry.model);
}

function validateCatalog(value: unknown): AIHubModelCatalog {
    if (!isRecord(value)) throw new Error("模型配置必须是对象");
    if (value.schemaVersion !== AIHUB_MODEL_CATALOG_SCHEMA_VERSION) throw new Error(`不支持的模型配置版本：${String(value.schemaVersion || "未知")}`);
    if (value.catalogId !== "aihub-model-catalog") throw new Error("不是 AIHub 模型配置文件");
    if (typeof value.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value.updatedAt)) throw new Error("模型配置缺少有效更新时间");
    if (typeof value.source !== "string" || value.source.length > 500) throw new Error("模型配置来源无效");
    if (value.source && !/^https:\/\//i.test(value.source)) throw new Error("模型配置来源必须是 HTTPS 地址");
    if (!Array.isArray(value.models) || !value.models.length || value.models.length > 200) throw new Error("模型配置数量必须在 1–200 个之间");
    const names = new Set<string>();
    const requestProfiles = validateRequestProfiles(value.requestProfiles);
    const models = value.models.map((entry) => validateEntry(entry, names, requestProfiles));
    return { schemaVersion: AIHUB_MODEL_CATALOG_SCHEMA_VERSION, catalogId: "aihub-model-catalog", updatedAt: value.updatedAt, source: value.source, requestProfiles, models };
}

function validateEntry(value: unknown, names: Set<string>, requestProfiles: Record<string, AIHubRequestProfile>): AIHubModelCatalogEntry {
    if (!isRecord(value)) throw new Error("模型条目格式无效");
    const model = value.model;
    const kind = value.kind;
    const adapter = value.adapter;
    if (typeof model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(model)) throw new Error("模型名称格式无效");
    const normalized = model.toLowerCase();
    if (names.has(normalized)) throw new Error(`模型重复：${model}`);
    names.add(normalized);
    if (!isModelCapability(kind) || typeof value.enabled !== "boolean") throw new Error(`模型 ${model} 的分类或启用状态无效`);
    if (!adaptersByKind[kind].includes(adapter as AIHubModelAdapter)) throw new Error(`模型 ${model} 的适配器与分类不匹配`);
    const requestProfile = value.requestProfile;
    if (requestProfile !== undefined && (typeof requestProfile !== "string" || !requestProfiles[requestProfile] || requestProfiles[requestProfile].kind !== kind)) throw new Error(`模型 ${model} 的请求协议无效`);
    const metadata = validateMetadata(value, model);
    const protocol = requestProfile ? { requestProfile } : {};
    if (kind === "text" || kind === "audio") return { model, kind, enabled: value.enabled, adapter: adapter as AIHubModelAdapter, ...protocol, ...metadata };
    if (!isRecord(value.capability)) throw new Error(`模型 ${model} 缺少能力配置`);
    const capability = validateCapability(value.capability, model, kind);
    return { model, kind, enabled: value.enabled, adapter: adapter as AIHubModelAdapter, capability, ...protocol, ...metadata };
}

function validateRequestProfiles(value: unknown) {
    if (value === undefined) return {};
    if (!isRecord(value) || Object.keys(value).length > 50) throw new Error("模型请求协议集合无效");
    return Object.fromEntries(Object.entries(value).map(([id, profile]) => [validateProfileId(id), validateRequestProfile(profile, id)]));
}

function validateProfileId(id: string) {
    if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(id)) throw new Error("模型请求协议名称无效");
    return id;
}

function validateRequestProfile(value: unknown, id: string): AIHubRequestProfile {
    if (!isRecord(value) || value.kind !== "video" || value.method !== "POST" || !["json", "multipart"].includes(String(value.bodyType))) throw new Error(`请求协议 ${id} 的基础信息无效`);
    validateEndpoint(value.endpoint, id);
    if (!Array.isArray(value.fields) || !value.fields.length || value.fields.length > 32) throw new Error(`请求协议 ${id} 的字段无效`);
    const fields = value.fields.map((field) => validateRequestField(field, id));
    const task = value.task === undefined ? undefined : validateTaskProtocol(value.task, id);
    return { kind: "video", method: "POST", endpoint: value.endpoint as string, bodyType: value.bodyType as "json" | "multipart", fields, ...(task ? { task } : {}) };
}

function validateRequestField(value: unknown, id: string): AIHubRequestField {
    const sources = ["model", "prompt", "seconds", "aspectRatio", "resolution", "references", "videoReferences", "audioReferences", "firstFrame", "lastFrame"];
    const types = ["string", "number", "boolean", "string-array"];
    if (!isRecord(value) || !sources.includes(String(value.source)) || !types.includes(String(value.type))) throw new Error(`请求协议 ${id} 包含无效字段`);
    validateFieldPath(value.target, id);
    if (value.singleTarget !== undefined) validateFieldPath(value.singleTarget, id);
    if (value.required !== undefined && typeof value.required !== "boolean") throw new Error(`请求协议 ${id} 的必填规则无效`);
    if (value.singleTarget !== undefined && value.type !== "string-array") throw new Error(`请求协议 ${id} 的单值字段规则无效`);
    return value as AIHubRequestField;
}

function validateTaskProtocol(value: unknown, id: string): AIHubTaskProtocol {
    if (!isRecord(value)) throw new Error(`请求协议 ${id} 的任务规则无效`);
    validateEndpoint(value.pollEndpoint, id, true);
    for (const key of ["idFields", "statusFields", "resultUrlFields", "errorFields", "completedStatuses", "failedStatuses"] as const) {
        if (!isStringArray(value[key]) || !value[key].length || value[key].length > 16) throw new Error(`请求协议 ${id} 的 ${key} 无效`);
        value[key].forEach((item) => validateFieldPath(item, id));
    }
    return value as AIHubTaskProtocol;
}

function validateEndpoint(value: unknown, id: string, requireId = false) {
    if (typeof value !== "string" || !/^\/[A-Za-z0-9._~{}/-]+$/.test(value) || value.includes("..") || (requireId && !value.includes("{id}"))) throw new Error(`请求协议 ${id} 的接口地址无效`);
}

function validateFieldPath(value: unknown, id: string) {
    if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_.]{0,79}$/.test(value) || ["__proto__", "prototype", "constructor"].some((part) => value.split(".").includes(part))) throw new Error(`请求协议 ${id} 的字段路径无效`);
}

function validateMetadata(value: Record<string, unknown>, model: string) {
    const metadata: Pick<AIHubModelCatalogEntry, "displayName" | "description" | "documentationUrl"> = {};
    if (value.displayName !== undefined) {
        if (typeof value.displayName !== "string" || !value.displayName.trim() || value.displayName.length > 120) throw new Error(`模型 ${model} 的显示名称无效`);
        metadata.displayName = value.displayName.trim();
    }
    if (value.description !== undefined) {
        if (typeof value.description !== "string" || value.description.length > 500) throw new Error(`模型 ${model} 的说明无效`);
        metadata.description = value.description.trim();
    }
    if (value.documentationUrl !== undefined) {
        if (typeof value.documentationUrl !== "string" || !/^https:\/\//i.test(value.documentationUrl) || value.documentationUrl.length > 500) throw new Error(`模型 ${model} 的文档地址无效`);
        metadata.documentationUrl = value.documentationUrl;
    }
    return metadata;
}

function validateCapability(value: Record<string, unknown>, model: string, kind: "image" | "video") {
    if (value.model !== model || value.kind !== kind) throw new Error(`模型 ${model} 的能力配置与模型名或分类不一致`);
    if (!isCapabilityStatus(value.status) || typeof value.verifiedAt !== "string" || typeof value.source !== "string" || typeof value.endpoint !== "string") throw new Error(`模型 ${model} 的能力元数据无效`);
    if (!/^https:\/\//i.test(value.source) || !value.endpoint.startsWith("/")) throw new Error(`模型 ${model} 的来源或接口地址无效`);
    if (!isStringArray(value.fixedSummary) || !isStringArray(value.hidden)) throw new Error(`模型 ${model} 的说明字段无效`);
    if (value.promptLengthHint !== undefined && (typeof value.promptLengthHint !== "number" || !Number.isInteger(value.promptLengthHint) || value.promptLengthHint <= 0)) throw new Error(`模型 ${model} 的提示词长度参考值无效`);
    if (value.promptMaxLength !== undefined && (typeof value.promptMaxLength !== "number" || !Number.isInteger(value.promptMaxLength) || value.promptMaxLength <= 0)) throw new Error(`模型 ${model} 的提示词长度上限无效`);
    for (const key of ["quality", "size", "aspectRatio", "duration", "resolution", "count"]) if (value[key] !== undefined) validateControl(value[key], model, key);
    if (value.references !== undefined) validateReferences(value.references, model);
    return value as AIHubCapability;
}

function validateControl(value: unknown, model: string, label: string) {
    if (!isRecord(value) || !["select", "range", "fixed"].includes(String(value.mode))) throw new Error(`模型 ${model} 的 ${label} 参数格式无效`);
    if (value.mode === "select" && (!isString(value.default) || !Array.isArray(value.options) || !value.options.length)) throw new Error(`模型 ${model} 的 ${label} 选项无效`);
    if (value.mode === "range" && (!["default", "min", "max", "step"].every((key) => typeof value[key] === "number") || value.min > value.max || value.step <= 0)) throw new Error(`模型 ${model} 的 ${label} 范围无效`);
    if (value.mode === "fixed" && typeof value.value !== "string" && typeof value.value !== "number") throw new Error(`模型 ${model} 的 ${label} 固定值无效`);
}

function validateReferences(value: unknown, model: string) {
    if (!isRecord(value)) throw new Error(`模型 ${model} 的参考素材配置无效`);
    for (const limit of Object.values(value)) {
        if (isRecord(limit) && limit.max !== undefined && (typeof limit.max !== "number" || limit.max < 0 || limit.max > 100)) throw new Error(`模型 ${model} 的参考素材数量无效`);
    }
}

function validateNoSecrets(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(validateNoSecrets);
    for (const [key, child] of Object.entries(value)) {
        if (/api[-_]?key|authorization|cookie|password|secret|token/i.test(key)) throw new Error("模型配置不能包含密钥或登录信息");
        validateNoSecrets(child);
    }
}

function inferKind(model: string): AIHubModelCapability {
    const value = model.toLowerCase();
    if (value.includes("video") || value.includes("seedance") || value.includes("veo") || value.includes("omni-fast")) return "video";
    if (value.includes("audio") || value.includes("music")) return "audio";
    if (value.includes("image") || value.includes("gemini-image")) return "image";
    return "text";
}

function defaultAdapter(kind: AIHubModelCapability): AIHubModelAdapter {
    return kind === "video" ? "video-generic" : kind === "image" ? "image-generic" : kind === "audio" ? "audio-chat" : "text-generic";
}

function documentationUrl(model: string) {
    const name = model.toLowerCase();
    const section = name.startsWith("omni-fast")
        ? "omni"
        : name.startsWith("minimax-h3")
          ? "minimax-h3-persec"
          : name.startsWith("doubao-seedream")
            ? "seedream"
            : name.startsWith("doubao-seedance-2.5")
              ? "seedance25"
              : name.startsWith("doubao-seedance-2.0")
                ? "seedance20-direct"
                : name.startsWith("official-seedance")
                  ? "seedance-official"
                  : name === "grok-imagine-video-6s"
                    ? "grok-6s"
                    : name.startsWith("grok-imagine-image")
                      ? "grok-image"
                      : name.startsWith("gpt-image-2-")
                        ? "gpt-image-tiers"
                        : name === "gpt-image-2"
                          ? "gpt-image"
                          : name.startsWith("gemini-image")
                            ? "gemini-image"
                            : name === "gemini-music"
                              ? "gemini-music"
                              : "common";
    return `https://aihubcc-docs.pages.dev/#${section}`;
}

function isModelCapability(value: unknown): value is AIHubModelCapability {
    return value === "text" || value === "image" || value === "video" || value === "audio";
}

function isCapabilityStatus(value: unknown): value is AIHubCapabilityStatus {
    return value === "verified" || value === "documented" || value === "unverified";
}

function isString(value: unknown): value is string {
    return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
