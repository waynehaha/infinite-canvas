import { AIHUB_BASE_URL, AIHUB_DEFAULT_MODEL } from "@/lib/aihub-models";
import { buildBuiltInAIHubModelCatalog, parseAIHubModelCatalog, type AIHubModelCatalog, type AIHubModelCatalogEntry } from "@/lib/aihub-model-catalog";

export const AIHUB_SERVICE_CONFIG_SCHEMA_VERSION = 1;

export type AIHubServiceConfigDefaults = {
    image: string;
    video: string;
    text: string;
    audio: string;
};

export type AIHubServiceConfig = {
    schemaVersion: typeof AIHUB_SERVICE_CONFIG_SCHEMA_VERSION;
    configId: "aihub-service-config";
    updatedAt: string;
    source: string;
    service: {
        providerId: "aihub";
        name: "AIHub";
        baseUrl: string;
    };
    defaults: AIHubServiceConfigDefaults;
    models: AIHubModelCatalogEntry[];
};

export type AIHubServiceConfigDiff = {
    added: number;
    updated: number;
    disabled: number;
    baseUrlChanged: boolean;
    previousBaseUrl: string;
    nextBaseUrl: string;
};

export function buildBuiltInAIHubServiceConfig(): AIHubServiceConfig {
    return buildAIHubServiceConfig(buildBuiltInAIHubModelCatalog(), AIHUB_BASE_URL, AIHUB_DEFAULT_MODEL);
}

export function buildAIHubServiceConfig(catalog: AIHubModelCatalog, baseUrl: string, defaults: AIHubServiceConfigDefaults): AIHubServiceConfig {
    return {
        schemaVersion: AIHUB_SERVICE_CONFIG_SCHEMA_VERSION,
        configId: "aihub-service-config",
        updatedAt: catalog.updatedAt,
        source: catalog.source,
        service: { providerId: "aihub", name: "AIHub", baseUrl: normalizeBaseUrl(baseUrl) },
        defaults,
        models: catalog.models,
    };
}

export function serviceConfigCatalog(config: AIHubServiceConfig): AIHubModelCatalog {
    return {
        schemaVersion: 1,
        catalogId: "aihub-model-catalog",
        updatedAt: config.updatedAt,
        source: config.source,
        models: config.models,
    };
}

export function parseAIHubServiceConfig(text: string, fallback?: { baseUrl: string; defaults: AIHubServiceConfigDefaults }): AIHubServiceConfig {
    if (text.length > 2_000_000) throw new Error("AIHub 服务配置文件不能超过 2MB");
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        throw new Error("AIHub 服务配置文件不是有效的 JSON");
    }
    validateNoSecrets(value);
    if (!isRecord(value)) throw new Error("AIHub 服务配置必须是对象");
    if (value.catalogId === "aihub-model-catalog") {
        const catalog = parseAIHubModelCatalog(text);
        return buildAIHubServiceConfig(catalog, fallback?.baseUrl || AIHUB_BASE_URL, defaultsForCatalog(catalog.models, fallback?.defaults || AIHUB_DEFAULT_MODEL));
    }
    if (value.schemaVersion !== AIHUB_SERVICE_CONFIG_SCHEMA_VERSION || value.configId !== "aihub-service-config") throw new Error("不是有效的 AIHub 服务配置文件");
    if (!isRecord(value.service) || value.service.providerId !== "aihub" || value.service.name !== "AIHub") throw new Error("AIHub 服务标识无效");
    const baseUrl = validateBaseUrl(value.service.baseUrl);
    if (typeof value.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value.updatedAt) || typeof value.source !== "string") throw new Error("AIHub 服务配置的版本信息无效");
    const catalog = parseAIHubModelCatalog(JSON.stringify({ schemaVersion: 1, catalogId: "aihub-model-catalog", updatedAt: value.updatedAt, source: value.source, models: value.models }));
    const defaults = validateDefaults(value.defaults, catalog.models);
    return buildAIHubServiceConfig(catalog, baseUrl, defaults);
}

export function diffAIHubServiceConfig(current: AIHubServiceConfig, next: AIHubServiceConfig): AIHubServiceConfigDiff {
    const currentModels = new Map(current.models.map((entry) => [entry.model.toLowerCase(), entry]));
    const nextModels = new Map(next.models.map((entry) => [entry.model.toLowerCase(), entry]));
    let added = 0;
    let updated = 0;
    let disabled = 0;
    for (const [name, entry] of nextModels) {
        const previous = currentModels.get(name);
        if (!previous) added += 1;
        else if (JSON.stringify(previous) !== JSON.stringify(entry)) updated += 1;
        if (previous?.enabled && !entry.enabled) disabled += 1;
    }
    for (const [name, entry] of currentModels) if (entry.enabled && !nextModels.has(name)) disabled += 1;
    const previousBaseUrl = normalizeBaseUrl(current.service.baseUrl);
    const nextBaseUrl = normalizeBaseUrl(next.service.baseUrl);
    return { added, updated, disabled, baseUrlChanged: previousBaseUrl !== nextBaseUrl, previousBaseUrl, nextBaseUrl };
}

function validateDefaults(value: unknown, models: AIHubModelCatalogEntry[]): AIHubServiceConfigDefaults {
    if (!isRecord(value)) throw new Error("AIHub 服务配置缺少默认模型");
    const defaults = { image: value.image, video: value.video, text: value.text, audio: value.audio };
    for (const [kind, model] of Object.entries(defaults)) {
        if (typeof model !== "string" || !models.some((entry) => entry.enabled && entry.kind === kind && entry.model === model)) throw new Error(`默认${kindLabel(kind)}模型无效`);
    }
    return defaults as AIHubServiceConfigDefaults;
}

function defaultsForCatalog(models: AIHubModelCatalogEntry[], preferred: AIHubServiceConfigDefaults): AIHubServiceConfigDefaults {
    return {
        image: preferredModel(models, "image", preferred.image),
        video: preferredModel(models, "video", preferred.video),
        text: preferredModel(models, "text", preferred.text),
        audio: preferredModel(models, "audio", preferred.audio),
    };
}

function preferredModel(models: AIHubModelCatalogEntry[], kind: AIHubModelCatalogEntry["kind"], preferred: string) {
    return models.some((entry) => entry.enabled && entry.kind === kind && entry.model === preferred) ? preferred : models.find((entry) => entry.enabled && entry.kind === kind)?.model || preferred;
}

function validateBaseUrl(value: unknown) {
    if (typeof value !== "string") throw new Error("AIHub Base URL 无效");
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password) throw new Error();
        return normalizeBaseUrl(url.toString());
    } catch {
        throw new Error("AIHub Base URL 必须是安全的 HTTPS 地址");
    }
}

function normalizeBaseUrl(value: string) {
    return value.trim().replace(/\/+$/, "");
}

function validateNoSecrets(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(validateNoSecrets);
    for (const [key, child] of Object.entries(value)) {
        if (/api[-_]?key|authorization|cookie|password|secret|token/i.test(key)) throw new Error("AIHub 服务配置不能包含密钥或登录信息");
        validateNoSecrets(child);
    }
}

function kindLabel(kind: string) {
    return kind === "image" ? "生图" : kind === "video" ? "视频" : kind === "text" ? "文本" : "音频";
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
