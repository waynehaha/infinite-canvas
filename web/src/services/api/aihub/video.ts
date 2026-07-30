import { isAIHubOmniModel, isAIHubSeedanceModel } from "@/lib/aihub-models";

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
    const body = new FormData();
    body.set("model", input.model);
    body.set("prompt", input.prompt);

    if (model === "gpt-image-2-2k" || model === "gpt-image-2-3.5k") {
        if (input.references.length > 6) throw new Error("GPT-Image 高清模型最多支持 6 张参考图");
        body.set("aspect_ratio", input.aspectRatio);
        if (input.references[0]) body.set("image_url", input.references[0]);
        if (input.references.length > 1) body.set("reference_image_urls", JSON.stringify(input.references.slice(0, 6)));
        return body;
    }

    if (model.startsWith("grok-imagine-video")) {
        if (input.references.length > 7) throw new Error("Grok 视频最多支持 7 张参考图");
        const references = input.references.slice(0, 7);
        if (model.includes("1.5") && !references.length) throw new Error("Grok Imagine 1.5 需要至少一张参考图");
        body.set("seconds", input.seconds);
        body.set("size", input.aspectRatio);
        if (references[0]) body.set("image_reference", references[0]);
        if (references.length > 1) body.set("images", JSON.stringify(references));
        return body;
    }

    if (model === "veo-clean") {
        const source = input.videoReferences[0];
        if (!source) throw new Error("Veo-Clean 需要上传一个待去水印视频");
        if (!(source instanceof File)) throw new Error("Veo-Clean 需要上传本地视频文件");
        if (source.size > 20 * 1024 * 1024) throw new Error("Veo-Clean 视频不能超过 20MB");
        body.set("prompt", input.prompt || "remove watermark");
        body.set("input_video", source);
        return body;
    }

    if (isAIHubSeedanceModel(input.model)) {
        if (input.references.length > 9) throw new Error("Seedance 最多支持 9 张参考图");
        if (input.videoReferences.length > 3) throw new Error("Seedance 最多支持 3 个参考视频");
        if (input.audioReferences.length > 3) throw new Error("Seedance 最多支持 3 个参考音频");
        body.set("duration", input.seconds);
        body.set("aspect_ratio", input.aspectRatio);
        if (input.firstFrame || input.lastFrame) {
            if (!input.firstFrame || !input.lastFrame) throw new Error("Seedance 首尾帧模式必须同时提供首帧和尾帧");
            if (input.references.length || input.videoReferences.length || input.audioReferences.length) throw new Error("Seedance 首尾帧模式不能同时添加其他参考素材");
            body.set("first_image_url", input.firstFrame);
            body.set("last_image_url", input.lastFrame);
            return body;
        }
        const references = input.references.slice(0, 9);
        if ((input.videoReferences.length || input.audioReferences.length) && !references.length) throw new Error("Seedance 视频或音频参考必须同时提供至少一张主图");
        if (references.length) body.set("reference_image_urls", JSON.stringify(references));
        appendMedia(body, "reference_videos", input.videoReferences.slice(0, 3));
        appendMedia(body, "reference_audios", input.audioReferences.slice(0, 3));
        return body;
    }

    if (isAIHubOmniModel(input.model)) {
        if (input.references.length > 5) throw new Error("Omni 最多支持 5 张参考图");
        if (input.videoReferences.length > 2) throw new Error("Omni V2V 最多支持 2 个参考视频");
        [...input.references, input.firstFrame, input.lastFrame].forEach(assertAIHubOmniImageSize);
        body.set("seconds", input.seconds);
        body.set("aspect_ratio", input.aspectRatio);
        if (model.includes("v2v")) {
            if (!input.videoReferences.length) throw new Error("Omni V2V 需要至少一个参考视频");
            appendOmniVideos(body, input.videoReferences.slice(0, 2));
            return body;
        }
        const references = input.references.slice(0, 5);
        if (input.firstFrame) body.set("first_image_url", input.firstFrame);
        if (input.lastFrame) body.set("last_image_url", input.lastFrame);
        if (!input.firstFrame && references[0]) body.set("image_url", references[0]);
        if (references.length > 1) body.set("images", JSON.stringify(references));
        return body;
    }

    body.set("seconds", input.seconds);
    body.set("aspect_ratio", input.aspectRatio);
    body.set("resolution", input.resolution);
    if (input.references[0]) body.set("image_url", input.references[0]);
    if (input.references.length > 1) body.set("images", JSON.stringify(input.references));
    return body;
}

export function aiHubVideoFailureMessage(model: string, message: string) {
    if (isAIHubOmniModel(model) && /bad_reference_image|failed to fetch reference image|reference upload failed/i.test(message) && /403|forbidden/i.test(message)) {
        return "参考图片的源站拒绝了 AIHub 读取（403），请将图片下载后重新上传再试";
    }
    return message;
}

function assertAIHubOmniImageSize(value?: string) {
    const match = value?.match(/^data:image\/[\w.+-]+;base64,([\s\S]+)$/i);
    if (!match) return;
    const base64 = match[1].replace(/\s/g, "");
    const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
    if (bytes > 8 * 1024 * 1024) throw new Error("Omni 单张参考图片不能超过 8MB");
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
    if (/^https?:\/\//i.test(value)) return value;
    const normalized = value.trim();
    if (!normalized) return "";
    if (taskId && /^\/?v1\/videos\/[^/]+\/content(?:\?|$)/i.test(normalized)) {
        return resolveApiPath(`/videos/${encodeURIComponent(taskId)}/content`);
    }
    const apiPath = normalized.replace(/^\/v1(?=\/)/, "");
    return resolveApiPath(apiPath.startsWith("/") ? apiPath : `/${apiPath}`);
}
