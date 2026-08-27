import { getAIHubImageCapability, getAIHubVideoCapability, getAIHubVideoImageLimit, type AIHubMediaCapability } from "@/lib/aihub-model-capabilities";

export type AIHubReferenceLike = {
    bytes?: number;
    width?: number;
    height?: number;
    durationMs?: number;
    dataUrl?: string;
    url?: string;
    storageKey?: string;
};

export type AIHubVideoReferenceSelection = {
    images: AIHubReferenceLike[];
    videos: AIHubReferenceLike[];
    audios: AIHubReferenceLike[];
    firstFrame?: AIHubReferenceLike | null;
    lastFrame?: AIHubReferenceLike | null;
    resolution?: string;
    aspectRatio?: string;
};

export function getAIHubImageReferenceError(model: string, references: AIHubReferenceLike[]) {
    const capability = getAIHubImageCapability(model);
    return capability ? mediaError(capability.model, "参考图", references, capability.references?.images) : "";
}

export function getAIHubVideoReferenceError(model: string, selection: AIHubVideoReferenceSelection) {
    const capability = getAIHubVideoCapability(model);
    if (!capability) return "";

    const errors = [
        mediaError(capability.model, "参考图", selection.images, capability.references?.images, getAIHubVideoImageLimit(model, selection.resolution)),
        mediaError(capability.model, "参考视频", selection.videos, capability.references?.videos),
        mediaError(capability.model, "参考音频", selection.audios, capability.references?.audios),
    ].filter(Boolean);
    const hasFirstFrame = Boolean(selection.firstFrame);
    const hasLastFrame = Boolean(selection.lastFrame);
    const hasAnyFrame = hasFirstFrame || hasLastFrame;
    const frameCapability = capability.references?.frames;

    if (hasAnyFrame && !frameCapability) errors.push(`${capability.model} 不支持首尾帧`);
    if (frameCapability?.mode === "pair" && hasFirstFrame !== hasLastFrame) errors.push("首尾帧必须同时提供");
    if (frameCapability?.exclusive && hasFirstFrame && hasLastFrame && (selection.images.length || selection.videos.length || selection.audios.length)) {
        errors.push("首尾帧模式不能同时添加其他参考素材");
    }
    if (frameCapability?.exclusiveWith?.some((kind) => selection[kind].length) && hasFirstFrame && hasLastFrame) {
        errors.push(`首尾帧模式不能同时添加${frameCapability.exclusiveWith.includes("images") ? "普通参考图" : "其他参考素材"}`);
    }
    if (capability.model.startsWith("Doubao-Seedance-2.0-") && selection.audios.length && !selection.images.length && !selection.videos.length) {
        errors.push(`${capability.model} 使用参考音频时需要至少 1 张参考图或 1 个参考视频`);
    } else if (!capability.model.startsWith("Doubao-Seedance-2.0-") && capability.requiresImageWith?.some((kind) => selection[kind].length) && !selection.images.length && !hasAnyFrame) {
        errors.push(`${capability.model} 使用视频或音频参考时需要至少 1 张主图`);
    }
    if (selection.aspectRatio === "adaptive" && !selection.images.length && !selection.videos.length && !hasAnyFrame) {
        errors.push(`${capability.model} 文生视频不支持自适应比例，请选择明确画幅或添加参考素材`);
    }

    return errors.join("；");
}

export function assertAIHubVideoReferences(model: string, selection: AIHubVideoReferenceSelection) {
    const error = getAIHubVideoReferenceError(model, selection);
    if (error) throw new Error(error);
}

export function isAIHubVideoPromptRequired(model: string) {
    return getAIHubVideoCapability(model)?.promptRequired !== false;
}

function mediaError(model: string, label: string, values: AIHubReferenceLike[], limit: AIHubMediaCapability | undefined, maximum = limit?.max) {
    if (!limit) return values.length ? `${model} 不支持${label}` : "";
    const minimum = limit.required ?? limit.min ?? 0;
    if (values.length < minimum) return `${model} 需要至少 ${minimum} 个${label}`;
    if (maximum !== undefined && values.length > maximum) return maximum === limit.max ? `${label}最多支持 ${maximum} 个` : `${model} 当前配置的${label}最多支持 ${maximum} 个`;

    const bytes = values.map(referenceBytes).filter((value): value is number => typeof value === "number");
    if (limit.maxBytes && bytes.some((value) => value > limit.maxBytes!)) return `${label}单个不能超过 ${formatMB(limit.maxBytes)}`;
    if (limit.maxTotalBytes && bytes.reduce((sum, value) => sum + value, 0) > limit.maxTotalBytes) return `${label}总大小不能超过 ${formatMB(limit.maxTotalBytes)}`;
    if (limit.localOnly && values.some((value) => !value.storageKey)) return `${model} 需要本地上传的${label}`;

    for (const value of values) {
        if (limit.minWidth && value.width && value.width < limit.minWidth) return `${label}宽度不能小于 ${limit.minWidth}px`;
        if (limit.minHeight && value.height && value.height < limit.minHeight) return `${label}高度不能小于 ${limit.minHeight}px`;
        if (limit.maxWidth && value.width && value.width > limit.maxWidth) return `${label}宽度不能超过 ${limit.maxWidth}px`;
        if (limit.maxHeight && value.height && value.height > limit.maxHeight) return `${label}高度不能超过 ${limit.maxHeight}px`;
        if (limit.maxLongEdge && value.width && value.height && Math.max(value.width, value.height) > limit.maxLongEdge) return `${label}长边不能超过 ${limit.maxLongEdge}px`;
        if (limit.maxShortEdge && value.width && value.height && Math.min(value.width, value.height) > limit.maxShortEdge) return `${label}分辨率不能高于 ${limit.maxShortEdge}p（当前为 ${value.width}×${value.height}）`;
        if (limit.minDurationMs && value.durationMs && value.durationMs < limit.minDurationMs) return `${label}时长不能少于 ${formatSeconds(limit.minDurationMs)}`;
        if (limit.maxDurationMs && value.durationMs && value.durationMs > limit.maxDurationMs) return `${label}时长不能超过 ${formatSeconds(limit.maxDurationMs)}`;
    }
    if (limit.maxTotalDurationMs) {
        const totalDuration = values.reduce((sum, value) => sum + (value.durationMs || 0), 0);
        if (totalDuration > limit.maxTotalDurationMs) return `${label}总时长不能超过 ${formatSeconds(limit.maxTotalDurationMs)}`;
    }
    return "";
}

function referenceBytes(reference: AIHubReferenceLike) {
    if (reference.bytes) return reference.bytes;
    const match = reference.dataUrl?.match(/^data:[^;]+;base64,([\s\S]+)$/i) || reference.url?.match(/^data:[^;]+;base64,([\s\S]+)$/i);
    if (!match) return undefined;
    const base64 = match[1].replace(/\s/g, "");
    return Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
}

function formatMB(bytes: number) {
    return `${Math.floor(bytes / 1024 / 1024)}MB`;
}

function formatSeconds(durationMs: number) {
    return `${durationMs / 1000} 秒`;
}
