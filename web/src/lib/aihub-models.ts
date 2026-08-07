export type AIHubModelCapability = "text" | "image" | "video" | "audio";

export const AIHUB_BASE_URL = "https://aihubcc.cc/v1";

export const AIHUB_MODELS_BY_CAPABILITY: Record<AIHubModelCapability, string[]> = {
    text: [
        "gemini-3.5-flash",
        "gemini-3.1-pro",
        "gemini-3.1-flash-lite",
        "claude-sonnet-4-6",
        "claude-opus-4-6-thinking",
        "gemini-3.6-flash-high",
        "gemini-3.1-pro-low",
        "gemini-3-flash",
        "gemini-2.0-flash-thinking",
    ],
    image: ["gpt-image-2", "gpt-image-2-1k", "gpt-image-2-2k", "gpt-image-2-3.5k", "gemini-image", "gemini-image-pro", "gemini-3.1-flash-image-4k"],
    video: [
        "omni-fast",
        "omni-fast-no-water",
        "omni-fast-v2v",
        "omni-fast-v2v-no-water",
        "grok-imagine-video",
        "grok-imagine-video-1.5",
        "Seedance-2.0-mini-480p",
        "Seedance-2.0-fast-480p",
        "Seedance-2.0-480p",
        "Seedance-2.0-mini-720p",
        "Seedance-2.0-fast-720p",
        "Seedance-2.0-720p",
        "veo-clean",
    ],
    audio: ["gemini-music"],
};

export const AIHUB_DEFAULT_MODELS = Object.values(AIHUB_MODELS_BY_CAPABILITY).flat();

export const AIHUB_DEFAULT_MODEL = {
    text: "gemini-3.5-flash",
    image: "gpt-image-2",
    video: "omni-fast",
    audio: "gemini-music",
} satisfies Record<AIHubModelCapability, string>;

const AIHUB_MODEL_CAPABILITIES = new Map(Object.entries(AIHUB_MODELS_BY_CAPABILITY).flatMap(([capability, models]) => models.map((model) => [model.toLowerCase(), capability as AIHubModelCapability] as const)));
export type AIHubModelAdapter = "text-generic" | "image-generic" | "image-gpt" | "image-async" | "image-chat" | "image-gemini" | "video-generic" | "video-omni" | "video-seedance" | "video-grok" | "video-clean" | "audio-chat";

const AIHUB_MODEL_ADAPTERS = new Map<string, AIHubModelAdapter>();
for (const model of AIHUB_MODELS_BY_CAPABILITY.text) AIHUB_MODEL_ADAPTERS.set(model.toLowerCase(), "text-generic");
for (const model of AIHUB_MODELS_BY_CAPABILITY.image) {
    const normalized = model.toLowerCase();
    AIHUB_MODEL_ADAPTERS.set(normalized, normalized === "gpt-image-2-2k" || normalized === "gpt-image-2-3.5k" ? "image-async" : normalized === "gemini-3.1-flash-image-4k" ? "image-chat" : normalized.startsWith("gemini-") ? "image-gemini" : "image-gpt");
}
for (const model of AIHUB_MODELS_BY_CAPABILITY.video) {
    const normalized = model.toLowerCase();
    AIHUB_MODEL_ADAPTERS.set(normalized, normalized === "veo-clean" ? "video-clean" : normalized.startsWith("grok-imagine-video") ? "video-grok" : normalized.startsWith("seedance-") ? "video-seedance" : normalized.startsWith("omni-fast") ? "video-omni" : "video-generic");
}
for (const model of AIHUB_MODELS_BY_CAPABILITY.audio) AIHUB_MODEL_ADAPTERS.set(model.toLowerCase(), "audio-chat");

let runtimeModelCapabilities = new Map<string, AIHubModelCapability>();
let runtimeModelAdapters = new Map<string, AIHubModelAdapter>();

export function setAIHubRuntimeModelCatalog(entries: Array<{ model: string; kind: AIHubModelCapability; adapter: AIHubModelAdapter }>) {
    runtimeModelCapabilities = new Map(entries.map((entry) => [entry.model.trim().toLowerCase(), entry.kind]));
    runtimeModelAdapters = new Map(entries.map((entry) => [entry.model.trim().toLowerCase(), entry.adapter]));
}

export function clearAIHubRuntimeModelCatalog() {
    runtimeModelCapabilities = new Map();
    runtimeModelAdapters = new Map();
}

export function aihubModelCapability(model: string) {
    const normalized = model.trim().toLowerCase();
    return runtimeModelCapabilities.get(normalized) || AIHUB_MODEL_CAPABILITIES.get(normalized);
}

export function aihubModelAdapter(model: string): AIHubModelAdapter | undefined {
    const normalized = model.trim().toLowerCase();
    return runtimeModelAdapters.get(normalized) || AIHUB_MODEL_ADAPTERS.get(normalized);
}

export function isAIHubAsyncImageModel(model: string) {
    return aihubModelAdapter(model) === "image-async";
}

export function isAIHubChatImageModel(model: string) {
    return aihubModelAdapter(model) === "image-chat";
}

export function isAIHubGeminiImageModel(model: string) {
    return aihubModelAdapter(model) === "image-gemini";
}

export function isAIHubSeedanceModel(model: string) {
    return aihubModelAdapter(model) === "video-seedance";
}

export function isAIHubOmniModel(model: string) {
    return aihubModelAdapter(model) === "video-omni";
}
