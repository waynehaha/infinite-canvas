import { applyAIHubModelCatalog } from "@/lib/aihub-model-catalog";
import { AIHUB_BASE_URL } from "@/lib/aihub-models";
import { parseAIHubServiceConfig, serviceConfigCatalog, type AIHubServiceConfig } from "@/lib/aihub-service-config";
import { buildApiUrl, normalizeLocalChannels, type AiConfig } from "@/stores/use-config-store";

export const AIHUB_REMOTE_BOOTSTRAP_URL = "https://aihubcc-config.pages.dev/infinite-canvas/bootstrap.json";
export const AIHUB_REMOTE_CONFIG_STATUS_KEY = "infinite-canvas:aihub-remote-config-status";
export const AIHUB_REMOTE_CONFIG_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const CONFIG_PROTOCOL_VERSION = 1;

export type AIHubRemoteConfigStatus = {
    checkedAt: string;
    updatedAt?: string;
    version?: string;
    state: "current" | "updated" | "offline" | "invalid" | "unsupported";
    message: string;
};

type AIHubRemoteBootstrap = {
    schemaVersion: 1;
    configId: "infinite-canvas-bootstrap";
    version: string;
    publishedAt: string;
    serviceConfigUrl: string;
    serviceConfigSha256: string;
    minConfigProtocol: number;
};

export async function fetchAIHubRemoteServiceConfig(force = false) {
    const bootstrap = await fetchJson(AIHUB_REMOTE_BOOTSTRAP_URL, force);
    const parsedBootstrap = validateBootstrap(bootstrap);
    if (parsedBootstrap.minConfigProtocol > CONFIG_PROTOCOL_VERSION) {
        const status = saveStatus({ checkedAt: new Date().toISOString(), version: parsedBootstrap.version, state: "unsupported", message: "在线模型配置需要更新客户端后才能使用" });
        return { config: null, status };
    }
    assertTrustedConfigUrl(parsedBootstrap.serviceConfigUrl);
    const configText = await fetchText(parsedBootstrap.serviceConfigUrl, force);
    const digest = await sha256(configText);
    if (digest !== parsedBootstrap.serviceConfigSha256.toLowerCase()) throw new Error("在线模型配置校验失败");
    const config = parseAIHubServiceConfig(configText);
    if (config.service.baseUrl !== AIHUB_BASE_URL) throw new Error("在线模型配置包含非预期的 AIHub 服务地址");
    const previous = readAIHubRemoteConfigStatus();
    const changed = previous?.version !== parsedBootstrap.version;
    const status = saveStatus({
        checkedAt: new Date().toISOString(),
        updatedAt: config.updatedAt,
        version: parsedBootstrap.version,
        state: changed ? "updated" : "current",
        message: changed ? `已自动更新到 ${parsedBootstrap.version}` : `模型配置已是最新版本 ${parsedBootstrap.version}`,
    });
    return { config, status };
}

export async function fetchAIHubVisibleModels(baseUrl: string, apiKey: string) {
    if (!apiKey.trim()) return null;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
        const response = await fetch(buildApiUrl(baseUrl, "/models"), { headers: { Authorization: `Bearer ${apiKey.trim()}` }, cache: "no-store", signal: controller.signal });
        if (!response.ok) return null;
        const payload = (await response.json()) as { data?: Array<{ id?: string }> };
        const models = (payload.data || []).map((item) => item.id?.trim()).filter((value): value is string => Boolean(value));
        return models.length ? new Set(models.map((model) => model.toLowerCase())) : null;
    } catch {
        return null;
    } finally {
        window.clearTimeout(timeout);
    }
}

export function applyAIHubRemoteServiceConfig(current: AiConfig, serviceConfig: AIHubServiceConfig, visibleModels: Set<string> | null = null) {
    const catalog = serviceConfigCatalog(serviceConfig);
    const availableEntries = catalog.models.filter((entry) => entry.enabled && (!visibleModels || visibleModels.has(entry.model.toLowerCase())));
    if (!availableEntries.length) throw new Error("当前 Key 没有可用的 AIHub 模型");
    const models = availableEntries.map((entry) => entry.model);
    const byKind = (kind: (typeof availableEntries)[number]["kind"]) => availableEntries.filter((entry) => entry.kind === kind).map((entry) => entry.model);
    const imageModels = byKind("image");
    const videoModels = byKind("video");
    const textModels = byKind("text");
    const audioModels = byKind("audio");
    const channels = normalizeLocalChannels(current).map((channel) => (channel.id === "aihub" ? { ...channel, baseUrl: serviceConfig.service.baseUrl, models } : channel));
    const select = (currentModel: string, options: string[], fallback: string) => (options.includes(currentModel) ? currentModel : options.includes(fallback) ? fallback : options[0] || "");
    const imageModel = select(current.imageModel, imageModels, serviceConfig.defaults.image);
    const videoModel = select(current.videoModel, videoModels, serviceConfig.defaults.video);
    const textModel = select(current.textModel, textModels, serviceConfig.defaults.text);
    const audioModel = select(current.audioModel, audioModels, serviceConfig.defaults.audio);
    applyAIHubModelCatalog({ ...catalog, models: catalog.models.map((entry) => ({ ...entry, enabled: models.includes(entry.model) })) });
    return {
        baseUrl: serviceConfig.service.baseUrl,
        localChannels: channels,
        models,
        imageModels,
        videoModels,
        textModels,
        audioModels,
        imageModel,
        videoModel,
        textModel,
        audioModel,
        model: models.includes(current.model) ? current.model : textModel,
    } satisfies Partial<AiConfig>;
}

export function readAIHubRemoteConfigStatus(): AIHubRemoteConfigStatus | null {
    if (typeof window === "undefined") return null;
    try {
        return JSON.parse(window.localStorage.getItem(AIHUB_REMOTE_CONFIG_STATUS_KEY) || "null") as AIHubRemoteConfigStatus | null;
    } catch {
        return null;
    }
}

export function saveAIHubRemoteConfigFailure(error: unknown) {
    const offline = error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError");
    return saveStatus({ checkedAt: new Date().toISOString(), state: offline ? "offline" : "invalid", message: offline ? "暂时无法连接模型配置中心，已继续使用本地配置" : error instanceof Error ? error.message : "在线模型配置无效，已继续使用本地配置" });
}

function validateBootstrap(value: unknown): AIHubRemoteBootstrap {
    if (!isRecord(value) || value.schemaVersion !== 1 || value.configId !== "infinite-canvas-bootstrap") throw new Error("在线模型配置入口无效");
    for (const key of ["version", "publishedAt", "serviceConfigUrl", "serviceConfigSha256"] as const) if (typeof value[key] !== "string" || !value[key]) throw new Error("在线模型配置入口信息不完整");
    if (typeof value.minConfigProtocol !== "number" || !Number.isInteger(value.minConfigProtocol) || value.minConfigProtocol < 1) throw new Error("在线模型配置协议无效");
    if (!/^[a-f0-9]{64}$/i.test(value.serviceConfigSha256)) throw new Error("在线模型配置校验值无效");
    return value as AIHubRemoteBootstrap;
}

function assertTrustedConfigUrl(value: string) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "aihubcc-config.pages.dev" || !url.pathname.startsWith("/infinite-canvas/versions/")) throw new Error("在线模型配置地址不可信");
}

async function fetchJson(url: string, force: boolean) {
    return JSON.parse(await fetchText(url, force)) as unknown;
}

async function fetchText(url: string, force: boolean) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
        const response = await fetch(url, { cache: force ? "reload" : "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`模型配置中心返回 ${response.status}`);
        const text = await response.text();
        if (text.length > 2_000_000) throw new Error("在线模型配置文件过大");
        return text;
    } finally {
        window.clearTimeout(timeout);
    }
}

async function sha256(value: string) {
    const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function saveStatus(status: AIHubRemoteConfigStatus) {
    if (typeof window !== "undefined") window.localStorage.setItem(AIHUB_REMOTE_CONFIG_STATUS_KEY, JSON.stringify(status));
    return status;
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
