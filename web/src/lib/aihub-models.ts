export type AIHubModelCapability = "text" | "image" | "video" | "audio";

export const AIHUB_BASE_URL = "https://aihubcc.cc/v1";

export const AIHUB_MODELS_BY_CAPABILITY: Record<AIHubModelCapability, string[]> = {
    text: [
        "gemini-3.5-flash",
        "gemini-3.1-pro",
        "gemini-3.1-flash-lite",
        "gpt-5-5",
        "gpt-5-3",
        "gpt-5-3-mini",
        "gpt-5-2",
        "claude-sonnet-4-6",
        "claude-opus-4-6-thinking",
        "gemini-3.6-flash-high",
        "gemini-3.1-pro-low",
        "gemini-3-flash",
        "gemini-2.0-flash-thinking",
    ],
    image: ["gpt-image-2", "gpt-image-2-1k", "gpt-image-2-2k", "gpt-image-2-3.5k", "gemini-image", "gemini-image-pro", "gemini-3.1-flash-image-4k", "nano-banana-pro-4K"],
    video: [
        "omni-fast",
        "omni-fast-no-water",
        "omni-fast-v2v",
        "omni-fast-v2v-no-water",
        "Seedance-2.0-mini-480p",
        "Seedance-2.0-fast-480p",
        "Seedance-2.0-480p",
        "Seedance-2.0-mini-720p",
        "Seedance-2.0-fast-720p",
        "Seedance-2.0-720p",
        "Seedance-2.0-1080p",
        "Seedance-2.0-4k",
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

export function aihubModelCapability(model: string) {
    return AIHUB_MODEL_CAPABILITIES.get(model.trim().toLowerCase());
}

export function isAIHubAsyncImageModel(model: string) {
    return ["gpt-image-2-2k", "gpt-image-2-3.5k"].includes(model.trim().toLowerCase());
}

export function isAIHubChatImageModel(model: string) {
    return ["gemini-3.1-flash-image-4k", "nano-banana-pro-4k"].includes(model.trim().toLowerCase());
}

export function isAIHubGeminiImageModel(model: string) {
    return ["gemini-image", "gemini-image-pro"].includes(model.trim().toLowerCase());
}

export function isAIHubSeedanceModel(model: string) {
    return model.trim().toLowerCase().startsWith("seedance-2.0-");
}

export function isAIHubOmniModel(model: string) {
    return model.trim().toLowerCase().startsWith("omni-fast");
}
