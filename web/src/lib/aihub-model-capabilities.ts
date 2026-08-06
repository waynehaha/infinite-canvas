export type AIHubCapabilityStatus = "verified" | "documented" | "unverified";

export type AIHubOption = {
    value: string;
    label: string;
    detail?: string;
};

export type AIHubSelectCapability = {
    mode: "select";
    default: string;
    options: readonly AIHubOption[];
};

export type AIHubRangeCapability = {
    mode: "range";
    default: number;
    min: number;
    max: number;
    step: number;
    unit: string;
    quick?: readonly number[];
};

export type AIHubFixedCapability = {
    mode: "fixed";
    value: string | number;
    label: string;
};

export type AIHubMediaCapability = {
    min?: number;
    max: number;
    maxBytes?: number;
    maxTotalBytes?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    maxLongEdge?: number;
    minDurationMs?: number;
    maxDurationMs?: number;
    maxTotalDurationMs?: number;
    localOnly?: boolean;
    required?: number;
    note?: string;
};

export type AIHubFrameCapability = {
    mode: "pair";
    exclusive?: boolean;
};

type AIHubCapabilityBase = {
    model: string;
    status: AIHubCapabilityStatus;
    verifiedAt: string;
    source: string;
    endpoint: string;
    fixedSummary: readonly string[];
    hidden: readonly string[];
};

export type AIHubImageCapability = AIHubCapabilityBase & {
    kind: "image";
    quality?: AIHubSelectCapability;
    size?: AIHubSelectCapability;
    count?: AIHubRangeCapability;
    references?: { images: AIHubMediaCapability };
};

export type AIHubVideoCapability = AIHubCapabilityBase & {
    kind: "video";
    promptRequired?: boolean;
    promptFallback?: string;
    aspectRatio?: AIHubSelectCapability;
    duration?: AIHubSelectCapability | AIHubRangeCapability | AIHubFixedCapability;
    resolution?: AIHubFixedCapability | AIHubSelectCapability;
    references?: {
        images?: AIHubMediaCapability;
        videos?: AIHubMediaCapability;
        audios?: AIHubMediaCapability;
        frames?: AIHubFrameCapability;
    };
    requiresImageWith?: readonly ("videos" | "audios")[];
};

export type AIHubAudioCapability = AIHubCapabilityBase & {
    kind: "audio";
    promptOnly: boolean;
};

export type AIHubModelCapability = AIHubImageCapability | AIHubVideoCapability | AIHubAudioCapability;

export const AIHUB_CAPABILITY_SOURCE = "https://oq2vmod9er.feishu.cn/docx/KUyVd0qmdotG0Hx2v5SczraGnbc";
export const AIHUB_CAPABILITY_VERIFIED_AT = "2026-07-31";

const qualityOptions = [
    { value: "auto", label: "自动" },
    { value: "high", label: "高" },
    { value: "medium", label: "中" },
    { value: "low", label: "低" },
] as const;

const gptImageLegacySizeOptions = [
    { value: "auto", label: "自动", detail: "模型决定" },
    { value: "1024x1024", label: "方形", detail: "1:1" },
    { value: "1536x1024", label: "横屏", detail: "3:2" },
    { value: "1024x1536", label: "竖屏", detail: "2:3" },
] as const;

const gptImage2SizeOptions = [
    ...gptImageLegacySizeOptions,
    { value: "1360x1024", label: "标准横屏", detail: "4:3" },
    { value: "1024x1360", label: "标准竖屏", detail: "3:4" },
    { value: "1824x1024", label: "宽屏", detail: "16:9" },
    { value: "1024x1824", label: "长竖屏", detail: "9:16" },
    { value: "1568x672", label: "宽银幕", detail: "21:9" },
] as const;

const highResolutionRatios = [
    { value: "1:1", label: "方形" },
    { value: "16:9", label: "横屏" },
    { value: "9:16", label: "竖屏" },
    { value: "4:3", label: "标准横屏" },
    { value: "3:4", label: "标准竖屏" },
    { value: "3:2", label: "经典横屏" },
    { value: "2:3", label: "经典竖屏" },
    { value: "5:4", label: "紧凑横屏" },
    { value: "4:5", label: "紧凑竖屏" },
] as const;

const omniRatios = [
    { value: "16:9", label: "横屏", detail: "16:9" },
    { value: "9:16", label: "竖屏", detail: "9:16" },
] as const;

const seedanceRatios = [
    { value: "16:9", label: "横屏" },
    { value: "9:16", label: "竖屏" },
    { value: "1:1", label: "方形" },
    { value: "21:9", label: "宽银幕" },
    { value: "4:3", label: "标准横屏" },
    { value: "3:4", label: "标准竖屏" },
] as const;

const grokRatios = [
    { value: "16:9", label: "横屏" },
    { value: "9:16", label: "竖屏" },
    { value: "1:1", label: "方形" },
    { value: "4:3", label: "标准横屏" },
    { value: "3:4", label: "标准竖屏" },
    { value: "2:3", label: "经典竖屏" },
    { value: "3:2", label: "经典横屏" },
] as const;

const grokResolutions = [
    { value: "480p", label: "480p" },
    { value: "720p", label: "720p" },
] as const;

const imageCountFour = { mode: "range", default: 1, min: 1, max: 4, step: 1, unit: "张", quick: [1, 2, 3, 4] } as const;
const singleImage = { mode: "range", default: 1, min: 1, max: 1, step: 1, unit: "张" } as const;
const source = AIHUB_CAPABILITY_SOURCE;
const verifiedAt = AIHUB_CAPABILITY_VERIFIED_AT;

const imageCapabilities: readonly AIHubImageCapability[] = [
    {
        kind: "image",
        model: "gpt-image-2",
        status: "verified",
        verifiedAt,
        source,
        endpoint: "/images/generations · /images/edits",
        fixedSummary: ["尺寸表示画幅，实际像素由模型分配"],
        hidden: ["自定义宽高", "2K/4K 快捷尺寸"],
        quality: { mode: "select", default: "auto", options: qualityOptions },
        size: { mode: "select", default: "auto", options: gptImage2SizeOptions },
        count: imageCountFour,
        references: { images: { max: 1, note: "图生图使用 /images/edits" } },
    },
    {
        kind: "image",
        model: "gpt-image-2-1k",
        status: "verified",
        verifiedAt,
        source,
        endpoint: "/images/generations",
        fixedSummary: ["固定约 1K", "单次生成 1 张"],
        hidden: ["质量", "自定义宽高", "生成张数"],
        size: { mode: "select", default: "1024x1024", options: gptImageLegacySizeOptions.slice(1) },
        count: singleImage,
        references: { images: { max: 6, maxTotalBytes: 5 * 1024 * 1024, note: "所有参考图合计不超过 5MB" } },
    },
    ...(["gpt-image-2-2k", "gpt-image-2-3.5k"] as const).map((model) => ({
        kind: "image" as const,
        model,
        status: "verified" as const,
        verifiedAt,
        source,
        endpoint: "/videos",
        fixedSummary: [model.endsWith("2k") ? "固定约 2K" : "固定约 3.5K", "单次生成 1 张"],
        hidden: ["质量", "自定义宽高", "生成张数"],
        size: { mode: "select" as const, default: "1:1", options: highResolutionRatios },
        count: singleImage,
        references: { images: { max: 6, maxTotalBytes: 5 * 1024 * 1024, note: "所有参考图合计不超过 5MB" } },
    })),
    ...(["gemini-image", "gemini-image-pro"] as const).map((model) => ({
        kind: "image" as const,
        model,
        status: "verified" as const,
        verifiedAt,
        source,
        endpoint: "/images/generations",
        fixedSummary: ["尺寸由模型决定", "已验证单次生成 1 张"],
        hidden: ["质量", "自定义宽高", "宽高比", "生成张数"],
        count: singleImage,
        references: { images: { max: 5, maxBytes: 5 * 1024 * 1024, note: "每张不超过 5MB" } },
    })),
    {
        kind: "image",
        model: "gemini-3.1-flash-image-4k",
        status: "verified",
        verifiedAt,
        source,
        endpoint: "/chat/completions",
        fixedSummary: ["固定输出 5632×3072", "单次生成 1 张"],
        hidden: ["质量", "尺寸", "宽高比", "生成张数"],
        count: singleImage,
    },
];

const omniBase = {
    kind: "video" as const,
    status: "verified" as const,
    verifiedAt,
    source,
    endpoint: "/videos",
    fixedSummary: ["720p", "约 10 秒"],
    hidden: ["清晰度", "自由时长", "生成音频", "水印"],
    aspectRatio: { mode: "select" as const, default: "16:9", options: omniRatios },
    duration: { mode: "fixed" as const, value: 10, label: "约 10 秒" },
    resolution: { mode: "fixed" as const, value: "720p", label: "720p" },
};

const seedanceModels = ["Seedance-2.0-mini-480p", "Seedance-2.0-fast-480p", "Seedance-2.0-480p", "Seedance-2.0-mini-720p", "Seedance-2.0-fast-720p", "Seedance-2.0-720p"] as const;

const videoCapabilities: readonly AIHubVideoCapability[] = [
    ...(["omni-fast", "omni-fast-no-water"] as const).map((model) => ({
        ...omniBase,
        model,
        references: { images: { max: 5, maxBytes: 8 * 1024 * 1024, note: "每张不超过 8MB" }, frames: { mode: "pair" as const } },
    })),
    ...(["omni-fast-v2v", "omni-fast-v2v-no-water"] as const).map((model) => ({
        ...omniBase,
        model,
        fixedSummary: [...omniBase.fixedSummary, "图片+视频混合为实验能力，请避开写实真人、知名角色和品牌素材"],
        hidden: [...omniBase.hidden, "首尾帧", "参考音频"],
        references: {
            images: { max: 1, maxBytes: 8 * 1024 * 1024, note: "可选 1 张，每张不超过 8MB" },
            videos: { min: 1, max: 2, maxBytes: 8 * 1024 * 1024, maxWidth: 1920, maxHeight: 1080, required: 1, note: "每个不超过 8MB、1920×1080" } as AIHubMediaCapability,
        },
    })),
    ...seedanceModels.map((model) => ({
        kind: "video" as const,
        model,
        status: "documented" as const,
        verifiedAt,
        source,
        endpoint: "/videos",
        fixedSummary: [`分辨率由模型锁定为 ${model.toLowerCase().endsWith("480p") ? "480p" : "720p"}`],
        hidden: ["分辨率选择", "自适应比例", "生成音频", "水印"],
        aspectRatio: { mode: "select" as const, default: "16:9", options: seedanceRatios },
        duration: { mode: "range" as const, default: 5, min: 4, max: 15, step: 1, unit: "秒", quick: [4, 5, 6, 8, 10, 12, 15] },
        resolution: { mode: "fixed" as const, value: model.toLowerCase().endsWith("480p") ? "480p" : "720p", label: model.toLowerCase().endsWith("480p") ? "480p" : "720p" },
        references: {
            images: { max: 9, maxBytes: 30 * 1024 * 1024, minWidth: 300, minHeight: 300, maxLongEdge: 4000, note: "JPEG/PNG/WEBP，每边至少 300px、长边不超过 4000px" },
            videos: { max: 3, maxBytes: 50 * 1024 * 1024, minDurationMs: 2_000, maxDurationMs: 15_000, maxTotalDurationMs: 15_000, note: "mp4/mov，单条 2–15 秒，多条总时长不超过 15 秒" },
            audios: { max: 3, note: "使用视频或音频参考时必须同时提供至少 1 张主图" },
            frames: { mode: "pair" as const, exclusive: true },
        },
        requiresImageWith: ["videos", "audios"] as const,
    })),
    {
        kind: "video",
        model: "veo-clean",
        status: "documented",
        verifiedAt,
        source,
        endpoint: "/videos",
        fixedSummary: ["只处理一个本地视频文件", "提示词可留空，默认 remove watermark"],
        promptRequired: false,
        promptFallback: "remove watermark",
        hidden: ["清晰度", "尺寸", "宽高比", "时长", "生成音频", "水印", "参考图", "参考音频"],
        references: { videos: { max: 1, maxBytes: 20 * 1024 * 1024, required: 1, localOnly: true, note: "必须是本地视频文件" } },
    },
    ...(["grok-imagine-video", "grok-imagine-video-1.5"] as const).map((model) => ({
        kind: "video" as const,
        model,
        status: "documented" as const,
        verifiedAt,
        source,
        endpoint: "/videos",
        fixedSummary: ["按次计费", "支持 480p / 720p"],
        hidden: ["生成音频", "水印", "参考视频", "参考音频"],
        aspectRatio: { mode: "select" as const, default: "16:9", options: grokRatios },
        duration: { mode: "range" as const, default: 6, min: 1, max: 15, step: 1, unit: "秒", quick: [6, 10, 15] },
        resolution: { mode: "select" as const, default: "720p", options: grokResolutions },
        references: { images: { max: 1, required: model.includes("1.5") ? 1 : undefined, maxBytes: 20 * 1024 * 1024 } },
    })),
];

const audioCapabilities: readonly AIHubAudioCapability[] = [
    {
        kind: "audio",
        model: "gemini-music",
        status: "verified",
        verifiedAt,
        source,
        endpoint: "/chat/completions",
        fixedSummary: ["只需填写音乐描述", "输出格式与时长由模型决定"],
        hidden: ["声音", "格式", "语速", "声音指令"],
        promptOnly: true,
    },
];

export const AIHUB_MODEL_CAPABILITIES = [...imageCapabilities, ...videoCapabilities, ...audioCapabilities] as const satisfies readonly AIHubModelCapability[];

const capabilityMap = new Map<string, AIHubModelCapability>(AIHUB_MODEL_CAPABILITIES.map((capability) => [capability.model.toLowerCase(), capability]));

export function getAIHubModelCapability(model: string) {
    const normalized = model.trim().toLowerCase() === "grok-imagine-video-1.5-preview" ? "grok-imagine-video-1.5" : model.trim().toLowerCase();
    return capabilityMap.get(normalized);
}

export function getAIHubImageCapability(model: string) {
    const capability = getAIHubModelCapability(model);
    return capability?.kind === "image" ? capability : undefined;
}

export function getAIHubVideoCapability(model: string) {
    const capability = getAIHubModelCapability(model);
    return capability?.kind === "video" ? capability : undefined;
}

export function getAIHubAudioCapability(model: string) {
    const capability = getAIHubModelCapability(model);
    return capability?.kind === "audio" ? capability : undefined;
}

export function normalizeAIHubSelectValue(capability: AIHubSelectCapability, value: string | undefined) {
    return capability.options.some((option) => option.value === value) ? String(value) : capability.default;
}

export function normalizeAIHubVideoAspectRatio(capability: AIHubVideoCapability | undefined, value: string | undefined) {
    if (!capability?.aspectRatio) return value || "";
    const legacyRatio: Record<string, string> = {
        "720x1280": "9:16",
        "1280x720": "16:9",
        "1024x1024": "1:1",
        "1024x1792": "2:3",
        "1792x1024": "3:2",
    };
    return normalizeAIHubSelectValue(capability.aspectRatio, legacyRatio[value || ""] || value);
}

export function normalizeAIHubRangeValue(capability: AIHubRangeCapability, value: string | number | undefined) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) ? Math.max(capability.min, Math.min(capability.max, number)) : capability.default;
}

export function aiHubCapabilitySummary(capability: AIHubModelCapability | undefined) {
    if (!capability) return "";
    if (capability.kind === "image") {
        const parts = [...capability.fixedSummary];
        if (capability.size) parts.push(capability.size.options.find((option) => option.value === capability.size?.default)?.label || capability.size.default);
        if (capability.count && capability.count.max > 1) parts.push(`1–${capability.count.max} 张`);
        return parts.join(" · ");
    }
    if (capability.kind === "video") {
        return [...capability.fixedSummary, capability.aspectRatio?.options.find((option) => option.value === capability.aspectRatio?.default)?.label || ""].filter(Boolean).join(" · ");
    }
    return capability.fixedSummary.join(" · ");
}
