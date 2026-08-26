import { aihubModelAdapter, isAIHubOmniModel, isAIHubSeedanceModel } from "@/lib/aihub-models";
import { getAIHubImageCapability, getAIHubVideoCapability, getAIHubVideoImageLimit, normalizeAIHubRangeValue, normalizeAIHubSelectValue, normalizeAIHubVideoAspectRatio } from "@/lib/aihub-model-capabilities";
import { buildAIHubConfiguredRequestBody, getAIHubRequestProfile, translateAIHubProtocolError } from "@/lib/aihub-request-profile";

export type AIHubMediaValue = string | File;

export type AIHubVideoBuildInput = {
    model: string;
    prompt: string;
    seconds: string;
    aspectRatio: string;
    resolution: string;
    references: string[];
    videoReferences: AIHubMediaValue[];
    audioReferences: AIHubMediaValue[];
    firstFrame?: string;
    lastFrame?: string;
};

export function createAIHubVideoBody(input: AIHubVideoBuildInput) {
    const model = input.model.toLowerCase();
    const normalizedModel = model === "grok-imagine-video-1.5-preview" ? "grok-imagine-video-1.5" : model;
    const adapter = aihubModelAdapter(normalizedModel);
    const capability = getAIHubVideoCapability(normalizedModel);
    const imageCapability = getAIHubImageCapability(input.model);
    const aspectRatio = capability?.aspectRatio ? normalizeAIHubVideoAspectRatio(capability, input.aspectRatio) : imageCapability?.size ? normalizeAIHubSelectValue(imageCapability.size, input.aspectRatio) : input.aspectRatio;
    const seconds =
        capability?.duration?.mode === "fixed"
            ? String(capability.duration.value)
            : capability?.duration?.mode === "range"
              ? String(normalizeAIHubRangeValue(capability.duration, input.seconds))
              : capability?.duration?.mode === "select"
                ? normalizeAIHubSelectValue(capability.duration, input.seconds)
                : input.seconds;
    if (capability?.promptMaxLength && Array.from(input.prompt).length > capability.promptMaxLength) {
        throw new Error(`${capability.model} 提示词最多支持 ${capability.promptMaxLength} 个字符`);
    }
    const requestProfile = getAIHubRequestProfile(input.model);
    if (requestProfile) {
        assertConfiguredVideoInput(capability, input);
        return buildAIHubConfiguredRequestBody(requestProfile, {
            model: input.model,
            prompt: input.prompt,
            seconds,
            aspectRatio,
            resolution: input.resolution,
            references: input.references,
            videoReferences: input.videoReferences,
            audioReferences: input.audioReferences,
            firstFrame: input.firstFrame,
            lastFrame: input.lastFrame,
        });
    }
    if (adapter === "video-grok") {
        const resolution = capability?.resolution?.mode === "select" ? normalizeAIHubSelectValue(capability.resolution, input.resolution) : String(capability?.resolution?.value || input.resolution);
        const imageLimit = getAIHubVideoImageLimit(normalizedModel, resolution) || 1;
        if (input.references.length > imageLimit) throw new Error(`${capability?.model || normalizedModel} 当前清晰度最多支持 ${imageLimit} 张参考图`);
        const references = input.references.slice(0, imageLimit);
        if (normalizedModel === "grok-imagine-video-1.5" && !references.length) throw new Error("Grok Imagine 1.5 需要至少一张参考图");
        return {
            model: normalizedModel,
            prompt: input.prompt,
            seconds,
            aspect_ratio: aspectRatio,
            resolution,
            ...(references.length === 1 ? { image: references[0] } : references.length > 1 ? { reference_images: references } : {}),
        };
    }

    if (adapter === "video-grok-fixed") {
        const sizeByRatio: Record<string, string> = { "9:16": "720x1280", "16:9": "1280x720", "1:1": "960x960" };
        const imageLimit = capability?.references?.images?.max || 0;
        if (input.references.length > imageLimit) throw new Error(`${capability?.model || normalizedModel} 最多支持 ${imageLimit} 张参考图`);
        const references = input.references.slice(0, imageLimit);
        return {
            model: input.model,
            prompt: input.prompt,
            size: sizeByRatio[aspectRatio] || "720x1280",
            ...(references.length === 1 ? { image_url: references[0] } : references.length > 1 ? { images: references } : {}),
        };
    }

    if (adapter === "video-seedance-edit") {
        if (!input.videoReferences.length) throw new Error("Seedance 2.5 必须提供至少一个参考视频");
        assertMediaLimit("参考图", capability?.references?.images, input.references);
        assertMediaLimit("参考视频", capability?.references?.videos, input.videoReferences);
        assertMediaLimit("参考音频", capability?.references?.audios, input.audioReferences);
        if (![...input.videoReferences, ...input.audioReferences].every((value) => typeof value === "string")) throw new Error("Seedance 2.5 的参考视频和音频需要使用公网地址");
        return {
            model: input.model,
            prompt: input.prompt,
            seconds: Number(seconds),
            reference_videos: input.videoReferences,
            ...(input.references.length ? { reference_images: input.references } : {}),
            ...(input.audioReferences.length ? { reference_audios: input.audioReferences } : {}),
        };
    }

    if (adapter === "video-h3") {
        const hasFrames = Boolean(input.firstFrame || input.lastFrame);
        if (hasFrames && (!input.firstFrame || !input.lastFrame)) throw new Error("MiniMax H3 首尾帧必须同时提供");
        if (hasFrames && input.references.length) throw new Error("MiniMax H3 首尾帧模式不能同时添加普通参考图");
        if (input.references.length > (capability?.references?.images?.max || 0)) throw new Error(`参考图最多支持 ${capability?.references?.images?.max || 0} 个`);
        if (input.audioReferences.length > (capability?.references?.audios?.max || 0)) throw new Error(`参考音频最多支持 ${capability?.references?.audios?.max || 0} 个`);
        if (input.videoReferences.length > (capability?.references?.videos?.max || 0)) throw new Error(`参考视频最多支持 ${capability?.references?.videos?.max || 0} 个`);
        if (input.audioReferences.length && !input.references.length && !hasFrames) throw new Error("MiniMax H3 使用参考音频时需要至少一张参考图或一组首尾帧");
        if (aspectRatio === "adaptive" && !input.references.length && !input.videoReferences.length && !hasFrames) throw new Error("MiniMax H3 文生视频不支持自适应比例");
        return {
            model: input.model,
            prompt: input.prompt,
            duration: Number(seconds),
            ratio: aspectRatio,
            ...(input.references.length ? { referenceImages: input.references } : {}),
            ...(input.audioReferences.length ? { referenceAudios: input.audioReferences } : {}),
            ...(input.videoReferences.length ? { referenceVideos: input.videoReferences } : {}),
            ...(input.firstFrame ? { first_image: input.firstFrame } : {}),
            ...(input.lastFrame ? { last_image: input.lastFrame } : {}),
        };
    }

    if (isAIHubSeedanceModel(input.model) && [...input.videoReferences, ...input.audioReferences].every((value) => typeof value === "string")) {
        const hasFrames = Boolean(input.firstFrame || input.lastFrame);
        if (hasFrames && (!input.firstFrame || !input.lastFrame)) throw new Error("Seedance 首尾帧模式必须同时提供首帧和尾帧");
        if (hasFrames && (input.references.length || input.videoReferences.length || input.audioReferences.length)) throw new Error("Seedance 首尾帧模式不能同时添加其他参考素材");
        assertMediaLimit("参考图", capability?.references?.images, input.references);
        assertMediaLimit("参考视频", capability?.references?.videos, input.videoReferences);
        assertMediaLimit("参考音频", capability?.references?.audios, input.audioReferences);
        if (input.audioReferences.length && !input.references.length && !input.videoReferences.length) throw new Error("Seedance 参考音频需要同时提供参考图或参考视频");
        const official = normalizedModel.startsWith("official-seedance-");
        if (official) assertPublicUrls("官方 Seedance 参考素材", [...input.references, ...input.videoReferences, ...input.audioReferences, ...(input.firstFrame ? [input.firstFrame] : []), ...(input.lastFrame ? [input.lastFrame] : [])] as string[]);
        return {
            model: input.model,
            prompt: input.prompt,
            ...(official ? { duration: Number(seconds) } : { seconds: Number(seconds) }),
            aspect_ratio: aspectRatio,
            ...(input.firstFrame ? { first_image_url: input.firstFrame } : {}),
            ...(input.lastFrame ? { last_image_url: input.lastFrame } : {}),
            ...(!hasFrames && input.references.length === 1 ? { image_url: input.references[0] } : {}),
            ...(!hasFrames && input.references.length > 1 ? { reference_images: input.references } : {}),
            ...(input.videoReferences.length ? { reference_videos: input.videoReferences } : {}),
            ...(input.audioReferences.length ? { reference_audios: input.audioReferences } : {}),
        };
    }

    const body = new FormData();
    body.set("model", input.model);
    body.set("prompt", input.prompt);
    if (capability) {
        const hasFirstFrame = Boolean(input.firstFrame);
        const hasLastFrame = Boolean(input.lastFrame);
        const frameCapability = capability.references?.frames;
        if ((hasFirstFrame || hasLastFrame) && !frameCapability) throw new Error(`${capability.model} 不支持首尾帧`);
        if (frameCapability?.mode === "pair" && hasFirstFrame !== hasLastFrame) throw new Error("首尾帧必须同时提供");
        if (frameCapability?.exclusive && hasFirstFrame && hasLastFrame && (input.references.length || input.videoReferences.length || input.audioReferences.length)) {
            throw new Error("首尾帧模式不能同时添加其他参考素材");
        }
        assertMediaLimit("参考图", capability.references?.images, [...input.references, ...(input.firstFrame ? [input.firstFrame] : []), ...(input.lastFrame ? [input.lastFrame] : [])]);
        assertMediaLimit("参考视频", capability.references?.videos, input.videoReferences);
        assertMediaLimit("参考音频", capability.references?.audios, input.audioReferences);
    }
    if (imageCapability) assertMediaLimit("参考图", imageCapability.references?.images, input.references);

    if (["gpt-image-2-1k-async", "gpt-image-2-2k", "gpt-image-2-3.5k", "gpt-image-2-4k"].includes(model)) {
        const maxReferences = imageCapability?.references?.images.max || 0;
        body.set("aspect_ratio", aspectRatio);
        if (input.references[0]) body.set("image_url", input.references[0]);
        if (input.references.length > 1) body.set("reference_image_urls", JSON.stringify(input.references.slice(0, maxReferences)));
        return body;
    }

    if (adapter === "video-clean") {
        const source = input.videoReferences[0];
        if (!source) throw new Error("Veo-Clean 需要上传一个待去水印视频");
        if (!(source instanceof File)) throw new Error("Veo-Clean 需要上传本地视频文件");
        body.set("prompt", input.prompt || "remove watermark");
        body.set("input_video", source);
        return body;
    }

    if (isAIHubSeedanceModel(input.model)) {
        body.set("duration", seconds);
        body.set("aspect_ratio", aspectRatio);
        if (input.firstFrame || input.lastFrame) {
            if (!input.firstFrame || !input.lastFrame) throw new Error("Seedance 首尾帧模式必须同时提供首帧和尾帧");
            if (input.references.length || input.videoReferences.length || input.audioReferences.length) throw new Error("Seedance 首尾帧模式不能同时添加其他参考素材");
            body.set("first_image_url", input.firstFrame);
            body.set("last_image_url", input.lastFrame);
            return body;
        }
        const references = input.references.slice(0, capability?.references?.images?.max || 0);
        if ((input.videoReferences.length || input.audioReferences.length) && !references.length) throw new Error("Seedance 视频或音频参考必须同时提供至少一张主图");
        if (references.length) body.set("reference_image_urls", JSON.stringify(references));
        appendMedia(body, "reference_videos", input.videoReferences.slice(0, capability?.references?.videos?.max || 0));
        appendMedia(body, "reference_audios", input.audioReferences.slice(0, capability?.references?.audios?.max || 0));
        return body;
    }

    if (isAIHubOmniModel(input.model)) {
        const values: Record<string, unknown> = {
            model: input.model,
            prompt: input.prompt,
            seconds,
            aspect_ratio: aspectRatio,
        };
        if (model.includes("v2v")) {
            if (!input.videoReferences.length) throw new Error("Omni V2V 需要至少一个参考视频");
            const references = input.references.slice(0, capability?.references?.images?.max || 0);
            if (input.videoReferences.every((value) => typeof value === "string")) {
                if (references[0]) values.image_url = references[0];
                values.video_url = input.videoReferences[0];
                if (input.videoReferences.length > 1) values.videos = input.videoReferences;
                return values;
            }
            body.set("seconds", seconds);
            body.set("aspect_ratio", aspectRatio);
            if (references[0]) body.set("image_url", references[0]);
            appendOmniVideos(body, input.videoReferences.slice(0, capability?.references?.videos?.max || 0));
            return body;
        }
        const references = input.references.slice(0, capability?.references?.images?.max || 0);
        if (input.firstFrame) values.first_image_url = input.firstFrame;
        if (input.lastFrame) values.last_image_url = input.lastFrame;
        if (!input.firstFrame && references[0]) values.image_url = references[0];
        if (references.length > 1) values.images = references;
        return values;
    }

    body.set("seconds", seconds);
    body.set("aspect_ratio", aspectRatio);
    body.set("resolution", input.resolution);
    if (input.references[0]) body.set("image_url", input.references[0]);
    if (input.references.length > 1) body.set("images", JSON.stringify(input.references));
    return body;
}

function assertConfiguredVideoInput(capability: ReturnType<typeof getAIHubVideoCapability>, input: AIHubVideoBuildInput) {
    if (!capability) return;
    const hasFirstFrame = Boolean(input.firstFrame);
    const hasLastFrame = Boolean(input.lastFrame);
    const frames = capability.references?.frames;
    if ((hasFirstFrame || hasLastFrame) && !frames) throw new Error(`${capability.model} 不支持首尾帧`);
    if (frames?.mode === "pair" && hasFirstFrame !== hasLastFrame) throw new Error("必须同时提供首帧和尾帧");
    if (frames?.exclusive && hasFirstFrame && hasLastFrame && (input.references.length || input.videoReferences.length || input.audioReferences.length)) throw new Error("首尾帧模式不能同时添加其他参考素材");
    assertMediaLimit("参考图", capability.references?.images, input.references);
    assertMediaLimit("参考视频", capability.references?.videos, input.videoReferences);
    assertMediaLimit("参考音频", capability.references?.audios, input.audioReferences);
    if (capability.requiresImageWith?.includes("audios") && input.audioReferences.length && !input.references.length && !input.videoReferences.length) throw new Error("参考音频需要同时提供参考图或参考视频");
}

export function aiHubVideoFailureMessage(model: string, message: string) {
    const normalized = unwrapAIHubErrorMessage(message);
    const configured = translateAIHubProtocolError(getAIHubRequestProfile(model), normalized);
    if (configured.message !== normalized) return configured.message;
    if (isAIHubOmniModel(model) && /bad_reference_image|failed to fetch reference image|reference upload failed/i.test(normalized) && /403|forbidden/i.test(normalized)) {
        return "参考图片的源站拒绝了 AIHub 读取（403），请将图片下载后重新上传再试";
    }
    if (/cannot unmarshal string into Go struct field .*images.*\[\]string|invalid request body must be valid json/i.test(normalized)) {
        return "多张参考图的参数格式不正确，请重新生成";
    }
    if (
        /(?:bad_reference_image|reference image|image reference|input image|uploaded image)/i.test(normalized) &&
        /protected IP|identifiable real person|third-party content providers|content (?:policy|safety)|safety (?:policy|filter)|refus(?:e|ed|al)/i.test(normalized)
    ) {
        return "参考图片触发了内容安全策略，视频模型无法处理。请更换不含可识别真人、知名角色、品牌标志或其他敏感内容的图片后重新生成；直接重试通常无效";
    }
    if (/protected IP|identifiable real person|third-party content providers|I can(?:not|'t) generate (?:the|that) video|Gemini couldn't generate (?:a|the) video/i.test(normalized)) {
        return "本次生成触发了内容安全策略。请更换参考素材或调整提示词后重新生成，直接重试通常无效";
    }
    return normalized;
}

function unwrapAIHubErrorMessage(message: string) {
    let current = message.trim();
    for (let depth = 0; depth < 4; depth += 1) {
        try {
            const parsed = JSON.parse(current) as { message?: unknown; error?: unknown };
            const error = parsed?.error;
            const next = (error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "") || (typeof error === "string" ? error : "") || (typeof parsed?.message === "string" ? parsed.message : "");
            if (!next || next.trim() === current) break;
            current = next.trim();
        } catch {
            break;
        }
    }
    return current;
}

function assertMediaLimit(label: string, limit: { max: number; maxBytes?: number; maxTotalBytes?: number } | undefined, values: AIHubMediaValue[]) {
    if (!limit) {
        if (values.length) throw new Error(`当前模型不支持${label}`);
        return;
    }
    if (values.length > limit.max) throw new Error(`${label}最多支持 ${limit.max} 个`);
    const sizes = values.map((value) => (value instanceof File ? value.size : dataMediaBytes(value))).filter((value): value is number => typeof value === "number");
    if (limit.maxBytes && sizes.some((size) => size > limit.maxBytes!)) throw new Error(`${label}单个不能超过 ${Math.floor(limit.maxBytes / 1024 / 1024)}MB`);
    if (limit.maxTotalBytes && sizes.reduce((sum, size) => sum + size, 0) > limit.maxTotalBytes) throw new Error(`${label}总大小不能超过 ${Math.floor(limit.maxTotalBytes / 1024 / 1024)}MB`);
}

function assertPublicUrls(label: string, values: string[]) {
    if (values.some((value) => !/^https?:\/\//i.test(value))) throw new Error(`${label}必须使用无需登录即可访问的公网 URL`);
}

function dataMediaBytes(value: string) {
    const match = value.match(/^data:[^;]+;base64,([\s\S]+)$/i);
    if (!match) return undefined;
    const base64 = match[1].replace(/\s/g, "");
    return Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
}

function appendMedia(body: FormData, field: string, values: AIHubMediaValue[]) {
    const strings = values.filter((value): value is string => typeof value === "string");
    if (strings.length) body.set(field, JSON.stringify(strings));
    values.filter((value): value is File => value instanceof File).forEach((file) => body.append(field, file));
}

function appendOmniVideos(body: FormData, values: AIHubMediaValue[]) {
    const strings = values.filter((value): value is string => typeof value === "string");
    if (strings[0]) body.set("video_url", strings[0]);
    if (strings.length > 1) body.set("videos", JSON.stringify(strings));
    values.filter((value): value is File => value instanceof File).forEach((file, index) => body.set(index === 0 ? "input_video" : "input_video2", file));
}

export function resolveAIHubTaskResultUrl(value: string, resolveApiPath: (path: string) => string, taskId = "") {
    const normalized = value.trim();
    if (!normalized) return "";
    const contentId = aiHubTaskContentId(normalized);
    if (contentId) return resolveApiPath(`/videos/${encodeURIComponent(contentId)}/content`);
    if (taskId && /^[A-Za-z0-9_-]{1,160}$/.test(taskId) && /^\/?v1\/videos\//i.test(normalized)) return resolveApiPath(`/videos/${encodeURIComponent(taskId)}/content`);
    if (/^https?:\/\//i.test(normalized)) return normalized;
    const apiPath = normalized.replace(/^\/v1(?=\/)/, "");
    return resolveApiPath(apiPath.startsWith("/") ? apiPath : `/${apiPath}`);
}

export function aiHubTaskContentIds(value: string, fallbackId: string) {
    return Array.from(new Set([/^[A-Za-z0-9_-]{1,160}$/.test(fallbackId) ? fallbackId : "", aiHubTaskContentId(value)].filter(Boolean)));
}

export function aiHubTaskContentId(value: string) {
    const normalized = value.trim();
    if (!normalized) return "";
    let pathname = normalized;
    if (/^https?:\/\//i.test(normalized)) {
        try {
            pathname = new URL(normalized).pathname;
        } catch {
            return "";
        }
    }
    const match = pathname.match(/^\/?v1\/videos\/([^/?#]+)\/content(?:\/|$)/i);
    if (!match) return "";
    try {
        const id = decodeURIComponent(match[1]);
        return /^[A-Za-z0-9_-]{1,160}$/.test(id) ? id : "";
    } catch {
        return "";
    }
}

export function aiHubTaskContentProxyUrl(taskId: string) {
    return `/api/aihub/video-content?taskId=${encodeURIComponent(taskId)}`;
}
