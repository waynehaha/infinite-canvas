"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { apiGet } from "@/services/api/request";
import type { AdminPublicSettings } from "@/services/api/admin";
import { AIHUB_BASE_URL, AIHUB_DEFAULT_MODEL, AIHUB_DEFAULT_MODELS, aihubModelCapability } from "@/lib/aihub-models";
import { USER_LOGIN_ENABLED } from "@/lib/user-auth-mode";
import { useUserStore } from "@/stores/use-user-store";

export type LocalModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    models: string[];
};

export { AIHUB_BASE_URL, AIHUB_DEFAULT_MODELS } from "@/lib/aihub-models";
const AIHUB_DEFAULT_CHANNEL: LocalModelChannel = {
    id: "aihub",
    name: "AIHub",
    baseUrl: AIHUB_BASE_URL,
    apiKey: "",
    models: AIHUB_DEFAULT_MODELS,
};
const AIHUB_LEGACY_DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3.1-pro", "gemini-3.1-flash-lite", "gpt-image-2", "gpt-image-2-1k", "grok-imagine-image", "omni-fast", "grok-imagine-video", "grok-imagine-video-1.5-preview"];
const AIHUB_PRE_H3_DEFAULT_MODELS = AIHUB_DEFAULT_MODELS.filter((model) => !model.startsWith("minimax-h3"));
const AIHUB_PRIOR_DEFAULT_MODELS = AIHUB_PRE_H3_DEFAULT_MODELS.filter((model) => !["grok-imagine-video", "grok-imagine-video-1.5"].includes(model));
const AIHUB_PREVIOUS_DEFAULT_MODELS = [...AIHUB_PRIOR_DEFAULT_MODELS, "gpt-5-5", "gpt-5-3", "gpt-5-3-mini", "gpt-5-2"];

export type VideoMultiPromptItem = { prompt: string; duration: string };
export type VideoElementReference = { id: string; kind: "image" | "video" | "audio"; name: string; type: string; dataUrl?: string; url?: string; storageKey?: string; bytes?: number; width?: number; height?: number; durationMs?: number };
export type VideoElementItem = { name: string; description: string; references: VideoElementReference[] };

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    videoMode: string;
    videoNegativePrompt: string;
    videoMultiShot: string;
    videoShotType: string;
    videoMultiPrompt: VideoMultiPromptItem[];
    videoElementList: VideoElementItem[];
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoCharacterOrientation: string;
    systemPrompt: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    quality: string;
    size: string;
    videoSize: string;
    count: string;
    canvasImageCount: string;
    timeout: string;
    apiMode: string;
    streamImages: string;
    streamPartialImages: string;
    responseFormatB64Json: string;
    codexCli: string;
    systemPrompts: {
        image: string;
        video: string;
        text: string;
        workflow: string;
        workflowAgent: string;
    };
    localChannels: LocalModelChannel[];
    publicChannels: Array<{ id?: string; name?: string; baseUrl?: string; models?: string[]; weight?: number; timeout?: number; enabled?: boolean; remark?: string }>;
    syncModelConfig: boolean;
    syncStorageConfig: boolean;
    activeChannelId: string;
    imageChannelId: string;
    videoChannelId: string;
    textChannelId: string;
    audioChannelId: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export type ModelCapability = "image" | "video" | "text" | "audio";

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: AIHUB_BASE_URL,
    apiKey: "",
    model: AIHUB_DEFAULT_MODEL.text,
    imageModel: AIHUB_DEFAULT_MODEL.image,
    videoModel: AIHUB_DEFAULT_MODEL.video,
    textModel: AIHUB_DEFAULT_MODEL.text,
    audioModel: AIHUB_DEFAULT_MODEL.audio,
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "6",
    videoMode: "std",
    videoNegativePrompt: "",
    videoMultiShot: "false",
    videoShotType: "intelligence",
    videoMultiPrompt: [{ prompt: "", duration: "1" }],
    videoElementList: [{ name: "", description: "", references: [] }],
    vquality: "720",
    videoGenerateAudio: "false",
    videoWatermark: "false",
    videoCharacterOrientation: "video",
    systemPrompt: "",
    models: AIHUB_DEFAULT_MODELS,
    imageModels: [...AIHUB_DEFAULT_MODELS.filter((model) => aihubModelCapability(model) === "image")],
    videoModels: [...AIHUB_DEFAULT_MODELS.filter((model) => aihubModelCapability(model) === "video")],
    textModels: [...AIHUB_DEFAULT_MODELS.filter((model) => aihubModelCapability(model) === "text")],
    audioModels: [...AIHUB_DEFAULT_MODELS.filter((model) => aihubModelCapability(model) === "audio")],
    quality: "auto",
    size: "1:1",
    videoSize: "1280x720",
    count: "1",
    canvasImageCount: "1",
    timeout: "600",
    apiMode: "images",
    streamImages: "",
    streamPartialImages: "1",
    responseFormatB64Json: "",
    codexCli: "",
    systemPrompts: {
        image: "",
        video: "",
        text: "",
        workflow: "",
        workflowAgent: "",
    },
    localChannels: [AIHUB_DEFAULT_CHANNEL],
    publicChannels: [],
    syncModelConfig: false,
    syncStorageConfig: false,
    activeChannelId: "",
    imageChannelId: "aihub",
    videoChannelId: "aihub",
    textChannelId: "aihub",
    audioChannelId: "",
};

type ConfigStore = {
    config: AiConfig;
    publicSettings: AdminPublicSettings | null;
    isPublicSettingsLoading: boolean;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    loadPublicSettings: () => Promise<void>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

function resolveEffectiveConfig(config: AiConfig, modelChannel: AdminPublicSettings["modelChannel"] | null, canUseRemoteChannel: boolean) {
    const channelMode = canUseRemoteChannel ? (modelChannel?.allowCustomChannel ? config.channelMode : "remote") : "local";
    if (channelMode === "local" || !modelChannel) {
        const localChannels = normalizeLocalChannels(config);
        return {
            ...config,
            channelMode,
            localChannels,
            models: normalizeModelList(localChannels.flatMap((channel) => channel.models)),
            publicChannels: modelChannel?.channels || [],
        };
    }
    const models = modelChannel.availableModels;
    const textModels = filterModelsByCapability(models, "text");
    const imageModels = filterModelsByCapability(models, "image");
    const videoModels = filterModelsByCapability(models, "video");
    const audioModels = filterModelsByCapability(models, "audio");
    const fallbackTextModel = validDefault(modelChannel.defaultTextModel, textModels) || preferredModel(textModels, isTextModelName);
    const fallbackModel = validDefault(modelChannel.defaultModel, textModels) || fallbackTextModel;
    const fallbackImageModel = validDefault(modelChannel.defaultImageModel, imageModels) || preferredModel(imageModels, isImageModelName);
    const fallbackVideoModel = validDefault(modelChannel.defaultVideoModel, videoModels) || preferredModel(videoModels, isVideoModelName);
    const fallbackAudioModel = preferredModel(audioModels, isAudioModelName);
    return {
        ...config,
        channelMode,
        models,
        imageModels,
        videoModels,
        textModels,
        audioModels,
        model: textModels.includes(config.model) ? config.model : fallbackModel,
        imageModel: imageModels.includes(config.imageModel) ? config.imageModel : fallbackImageModel,
        videoModel: videoModels.includes(config.videoModel) ? config.videoModel : fallbackVideoModel,
        textModel: textModels.includes(config.textModel) ? config.textModel : fallbackTextModel || fallbackModel,
        audioModel: audioModels.includes(config.audioModel) ? config.audioModel : fallbackAudioModel,
        systemPrompt: modelChannel.systemPrompt,
        publicChannels: modelChannel.channels || [],
    };
}

function validDefault(model: string, models: string[]) {
    return models.includes(model) ? model : "";
}

function preferredModel(models: string[], predicate: (model: string) => boolean) {
    return models.find(predicate) || "";
}

function isVideoModelName(model: string) {
    const value = model.toLowerCase();
    return (
        value.includes("video") ||
        value.includes("seedance") ||
        value.includes("sora") ||
        value.includes("veo") ||
        value.includes("kling") ||
        value.includes("hailuo") ||
        value.includes("minimax") ||
        value.includes("skyreels") ||
        value.includes("happyhorse") ||
        value.includes("runway") ||
        value.includes("aleph") ||
        value.includes("vidu") ||
        value.includes("pixverse") ||
        value.includes("omni-flash") ||
        value.includes("omni-fast") ||
        value.includes("gemini-omni-video") ||
        value.includes("veo3.1") ||
        value.includes("veo-3.1") ||
        value.includes("infinitalk") ||
        value.includes("wan2-5") ||
        value.includes("wan2.5") ||
        value.includes("wan2-6") ||
        value.includes("wan2.6") ||
        value.includes("wan2-7") ||
        value.includes("wan2.7") ||
        value.includes("wan2-7-r2v") ||
        value.includes("wan2.7-r2v") ||
        value.includes("wan2-7-videoedit") ||
        value.includes("wan2.7-videoedit") ||
        value.includes("wan/2-5") ||
        value.includes("wan/2-6") ||
        value.includes("wan/2-7-text-to-video") ||
        value.includes("wan/2-7-image-to-video") ||
        value.includes("wan/2-7-videoedit") ||
        value.includes("wan/2-7-r2v") ||
        (value.includes("grok-imagine") && (value.includes("/upscale") || value.includes("/extend")))
    );
}

function isImageModelName(model: string) {
    const value = model.toLowerCase();
    return (
        !isVideoModelName(model) &&
        !isAudioModelName(model) &&
        (value.includes("image") ||
            value.includes("nano-banana") ||
            value.includes("seedream") ||
            value.includes("gpt-image") ||
            value.includes("dall-e") ||
            value.includes("dalle") ||
            value.includes("imagen") ||
            value.includes("gemini-2.5-flash") ||
            value.includes("gemini-3-pro") ||
            value.includes("gemini-3.1-flash") ||
            value.includes("flux") ||
            value.includes("kontext") ||
            value.includes("4o-image") ||
            value.includes("4o image") ||
            value.includes("gpt-4o-image") ||
            value.includes("z-image") ||
            value.includes("qwen/image") ||
            value.includes("qwen2/image") ||
            value.includes("qwen/text-to-image") ||
            value.includes("qwen2/text-to-image") ||
            value.includes("ideogram") ||
            value.includes("recraft") ||
            value.includes("sdxl") ||
            value.includes("stable-diffusion") ||
            value.includes("midjourney") ||
            value.includes("wan2-7-image") ||
            value.includes("wan2.7-image") ||
            value.includes("wan/2-7-image") ||
            value.includes("topaz/image") ||
            value.includes("gemini-omni-character") ||
            (value.includes("grok-imagine") && !value.includes("video")))
    );
}

function isAudioModelName(model: string) {
    const value = model.toLowerCase();
    return (
        value.includes("audio") ||
        value.includes("tts") ||
        value.includes("speech") ||
        value.includes("voice") ||
        value.includes("music") ||
        value.includes("sound") ||
        value.includes("elevenlabs") ||
        value.includes("suno") ||
        value.includes("lyrics") ||
        value.includes("vocal") ||
        value.includes("midi") ||
        value.includes("wav")
    );
}

function isTextModelName(model: string) {
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}

export function modelMatchesCapability(model: string, capability?: ModelCapability) {
    if (!capability) return true;
    const aihubCapability = aihubModelCapability(model);
    if (aihubCapability) return aihubCapability === capability;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ModelCapability) {
    return capability ? models.filter((model) => modelMatchesCapability(model, capability)) : models;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    return filterModelsByCapability(config.models, capability);
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = localChannelForActiveModel({ ...config, model });
    return Boolean(model.trim()) && (config.channelMode === "remote" || Boolean(channel?.baseUrl.trim() && channel?.apiKey.trim()));
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            publicSettings: null,
            isPublicSettingsLoading: false,
            isConfigOpen: false,
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            loadPublicSettings: async () => {
                if (get().isPublicSettingsLoading) return;
                set({ isPublicSettingsLoading: true });
                try {
                    set({ publicSettings: await apiGet<AdminPublicSettings>("/api/settings") });
                } finally {
                    set({ isPublicSettingsLoading: false });
                }
            },
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                const localChannels = normalizeLocalChannels(config);
                const localModels = normalizeModelList(localChannels.flatMap((channel) => channel.models));
                const imageModels = filterModelsByCapability(localModels, "image");
                const videoModels = filterModelsByCapability(localModels, "video");
                const textModels = filterModelsByCapability(localModels, "text");
                const audioModels = filterModelsByCapability(localModels, "audio");
                return {
                    ...current,
                    config: {
                        ...config,
                        localChannels,
                        models: localModels,
                        baseUrl: localChannels[0]?.baseUrl || config.baseUrl,
                        apiKey: localChannels[0]?.apiKey || config.apiKey,
                        imageChannelId: config.imageChannelId || localChannels[0]?.id || "",
                        videoChannelId: config.videoChannelId || localChannels[0]?.id || "",
                        textChannelId: config.textChannelId || localChannels[0]?.id || "",
                        audioChannelId: config.audioChannelId || localChannels[0]?.id || "",
                        activeChannelId: config.activeChannelId || "",
                        syncModelConfig: config.syncModelConfig === true,
                        syncStorageConfig: config.syncStorageConfig === true,
                        channelMode: config.channelMode || "remote",
                        imageModel: imageModels.includes(config.imageModel) ? config.imageModel : imageModels[0] || "",
                        videoModel: videoModels.includes(config.videoModel) ? config.videoModel : videoModels[0] || "",
                        textModel: textModels.includes(config.textModel) ? config.textModel : textModels[0] || "",
                        audioModel: audioModels.includes(config.audioModel) ? config.audioModel : audioModels[0] || "",
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        systemPrompts: config.systemPrompts?.image ? config.systemPrompts : defaultConfig.systemPrompts,
                        audioInstructions: config.audioInstructions || "",
                        videoSeconds: config.videoSeconds || "6",
                        videoMode: config.videoMode || "std",
                        videoNegativePrompt: config.videoNegativePrompt || "",
                        videoMultiShot: config.videoMultiShot || "false",
                        videoShotType: config.videoShotType || "intelligence",
                        videoMultiPrompt: Array.isArray(config.videoMultiPrompt) && config.videoMultiPrompt.length ? config.videoMultiPrompt : defaultConfig.videoMultiPrompt,
                        videoElementList: Array.isArray(config.videoElementList) && config.videoElementList.length ? config.videoElementList : defaultConfig.videoElementList,
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "false",
                        videoWatermark: config.videoWatermark || "false",
                        videoCharacterOrientation: config.videoCharacterOrientation === "image" ? "image" : "video",
                        canvasImageCount: config.canvasImageCount || "1",
                        imageModels,
                        videoModels,
                        textModels,
                        audioModels,
                    },
                };
            },
        },
    ),
);

function normalizeModelList(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    const modelChannel = useConfigStore((state) => state.publicSettings?.modelChannel || null);
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const canUseRemoteChannel = USER_LOGIN_ENABLED && Boolean(token && user && (user.role === "admin" || modelChannel?.allowUserRemoteChannel === true));
    return useMemo(() => resolveEffectiveConfig(config, modelChannel, canUseRemoteChannel), [canUseRemoteChannel, config, modelChannel]);
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}

export function normalizeLocalChannels(config: Partial<AiConfig>) {
    const channels = Array.isArray(config.localChannels) ? config.localChannels : [];
    const legacyEmptyConfig = !channels.length && !config.apiKey && !(config.models || []).length && (!config.baseUrl || config.baseUrl === "https://api.openai.com");
    if (legacyEmptyConfig) return [{ ...AIHUB_DEFAULT_CHANNEL, models: [...AIHUB_DEFAULT_CHANNEL.models] }];
    const normalized = channels.map((channel, index) => {
        const models = Array.isArray(channel.models) ? channel.models.filter(Boolean) : [];
        const managedAIHub = channel.id === "aihub" && [AIHUB_LEGACY_DEFAULT_MODELS, AIHUB_PRIOR_DEFAULT_MODELS, AIHUB_PREVIOUS_DEFAULT_MODELS, AIHUB_PRE_H3_DEFAULT_MODELS].some((defaults) => sameModelSet(models, defaults));
        return {
            id: channel.id || `local-${index + 1}`,
            name: typeof channel.name === "string" ? channel.name : `本地渠道 ${index + 1}`,
            baseUrl: channel.baseUrl || "",
            apiKey: channel.apiKey || "",
            models: managedAIHub ? [...AIHUB_DEFAULT_MODELS] : models,
        };
    });
    if (!normalized.length) {
        normalized.push({ id: "local-default", name: "本地直连", baseUrl: config.baseUrl || defaultConfig.baseUrl, apiKey: config.apiKey || "", models: Array.isArray(config.models) ? config.models.filter(Boolean) : [] });
    }
    return normalized;
}

function sameModelSet(left: string[], right: string[]) {
    if (left.length !== right.length) return false;
    const values = new Set(left);
    return right.every((model) => values.has(model));
}

export function channelIdForActiveModel(config: AiConfig) {
    if (modelMatchesCapability(config.model, "image") && config.imageChannelId) return config.imageChannelId;
    if (modelMatchesCapability(config.model, "video") && config.videoChannelId) return config.videoChannelId;
    if (modelMatchesCapability(config.model, "audio") && config.audioChannelId) return config.audioChannelId;
    if (modelMatchesCapability(config.model, "text") && config.textChannelId) return config.textChannelId;
    if (config.activeChannelId) return config.activeChannelId;
    if (config.model === config.videoModel) return config.videoChannelId;
    if (config.model === config.textModel) return config.textChannelId;
    if (config.model === config.audioModel) return config.audioChannelId;
    return config.imageChannelId;
}

export function localChannelForActiveModel(config: AiConfig) {
    const channels = normalizeLocalChannels(config);
    const preferredId = channelIdForActiveModel(config);
    return channels.find((channel) => channel.id === preferredId && channel.models.includes(config.model)) || channels.find((channel) => channel.models.includes(config.model)) || channels.find((channel) => channel.id === preferredId) || channels[0];
}

export function isAIHubConfig(config: AiConfig) {
    const scopedConfig = { ...config, model: config.model || config.imageModel || config.videoModel || config.textModel };
    const channelId = channelIdForActiveModel(scopedConfig);
    const channels = config.channelMode === "remote" ? config.publicChannels : normalizeLocalChannels(config);
    const channel = channels.find((item) => (item.id || "") === channelId) || channels.find((item) => (item.models || []).includes(scopedConfig.model)) || channels[0];
    return [channel?.id, channel?.name, channel?.baseUrl].filter(Boolean).join(" ").toLowerCase().includes("aihub");
}
