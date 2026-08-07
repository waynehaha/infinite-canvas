import { AIHUB_DEFAULT_MODELS, aihubModelAdapter, setAIHubRuntimeModelCatalog, clearAIHubRuntimeModelCatalog, type AIHubModelAdapter, type AIHubModelCapability } from "@/lib/aihub-models";
import { clearAIHubRuntimeCapabilities, getAIHubModelCapability, setAIHubRuntimeCapabilities, type AIHubCapabilityStatus, type AIHubModelCapability as AIHubCapability } from "@/lib/aihub-model-capabilities";

export const AIHUB_MODEL_CATALOG_SCHEMA_VERSION = 1;
export const AIHUB_MODEL_CATALOG_STORAGE_KEY = "infinite-canvas:aihub-model-catalog";

export type AIHubModelCatalogEntry = {
    model: string;
    kind: AIHubModelCapability;
    enabled: boolean;
    adapter: AIHubModelAdapter;
    capability?: AIHubCapability;
};

export type AIHubModelCatalog = {
    schemaVersion: typeof AIHUB_MODEL_CATALOG_SCHEMA_VERSION;
    catalogId: "aihub-model-catalog";
    updatedAt: string;
    source: string;
    models: AIHubModelCatalogEntry[];
};

const adaptersByKind: Record<AIHubModelCapability, AIHubModelAdapter[]> = {
    text: ["text-generic"],
    image: ["image-generic", "image-gpt", "image-async", "image-chat", "image-gemini"],
    video: ["video-generic", "video-omni", "video-seedance", "video-grok", "video-clean"],
    audio: ["audio-chat"],
};

export function buildBuiltInAIHubModelCatalog(): AIHubModelCatalog {
    return {
        schemaVersion: AIHUB_MODEL_CATALOG_SCHEMA_VERSION,
        catalogId: "aihub-model-catalog",
        updatedAt: "2026-07-31T00:00:00.000Z",
        source: "https://aihubcc.cc/pricing",
        models: AIHUB_DEFAULT_MODELS.map((model) => {
            const capability = getAIHubModelCapability(model);
            const kind = (capability?.kind || inferKind(model)) as AIHubModelCapability;
            return { model, kind, enabled: true, adapter: aihubModelAdapter(model) || defaultAdapter(kind), ...(capability ? { capability } : {}) };
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
    const models = value.models.map((entry) => validateEntry(entry, names));
    return { schemaVersion: AIHUB_MODEL_CATALOG_SCHEMA_VERSION, catalogId: "aihub-model-catalog", updatedAt: value.updatedAt, source: value.source, models };
}

function validateEntry(value: unknown, names: Set<string>): AIHubModelCatalogEntry {
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
    if (kind === "text" || kind === "audio") return { model, kind, enabled: value.enabled, adapter: adapter as AIHubModelAdapter };
    if (!isRecord(value.capability)) throw new Error(`模型 ${model} 缺少能力配置`);
    const capability = validateCapability(value.capability, model, kind);
    return { model, kind, enabled: value.enabled, adapter: adapter as AIHubModelAdapter, capability };
}

function validateCapability(value: Record<string, unknown>, model: string, kind: "image" | "video") {
    if (value.model !== model || value.kind !== kind) throw new Error(`模型 ${model} 的能力配置与模型名或分类不一致`);
    if (!isCapabilityStatus(value.status) || typeof value.verifiedAt !== "string" || typeof value.source !== "string" || typeof value.endpoint !== "string") throw new Error(`模型 ${model} 的能力元数据无效`);
    if (!/^https:\/\//i.test(value.source) || !value.endpoint.startsWith("/")) throw new Error(`模型 ${model} 的来源或接口地址无效`);
    if (!isStringArray(value.fixedSummary) || !isStringArray(value.hidden)) throw new Error(`模型 ${model} 的说明字段无效`);
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
