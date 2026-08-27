import { aihubModelAdapter, isAIHubGeminiImageModel } from "@/lib/aihub-models";
import { getAIHubImageCapability, normalizeAIHubSelectValue } from "@/lib/aihub-model-capabilities";
import { buildAIHubConfiguredRequestBody, getAIHubRequestProfile } from "@/lib/aihub-request-profile";

export type AIHubImageOptions = {
    model: string;
    prompt: string;
    n?: number;
    size?: string;
    quality?: string;
    references?: string[];
};

export function isAIHubMultipartImageEdit(model: string, referenceCount: number) {
    return referenceCount > 0 && model.trim().toLowerCase() === "gpt-image-2";
}

export function getAIHubImageRequestEndpoint(model: string, referenceCount = 0) {
    if (isAIHubMultipartImageEdit(model, referenceCount)) return "/images/edits";
    return getAIHubRequestProfile(model)?.create.endpoint || (referenceCount ? "/images/edits" : "/images/generations");
}

export function createAIHubImageGenerationBody({ model, prompt, n, size, quality, references = [] }: AIHubImageOptions) {
    const capability = getAIHubImageCapability(model);
    const profile = getAIHubRequestProfile(model);
    if (profile) {
        assertReferenceLimit(capability, references);
        const count = Math.min(Math.max(1, n || 1), capability?.count?.max || 1);
        const normalizedSize = capability?.size ? normalizeAIHubSelectValue(capability.size, normalizeAIHubImageSize(model, size || capability.size.default)) : undefined;
        const normalizedQuality = capability?.quality && quality && quality !== "auto" ? normalizeAIHubSelectValue(capability.quality, quality) : undefined;
        return buildAIHubConfiguredRequestBody(profile, { model, prompt, count, size: normalizedSize, quality: normalizedQuality, references });
    }
    const body: Record<string, unknown> = { model, prompt };
    const count = Math.min(Math.max(1, n || 1), capability?.count?.max || 1);
    if (count > 1) body.n = count;
    if (capability?.size) body.size = normalizeAIHubSelectValue(capability.size, normalizeAIHubImageSize(model, size || capability.size.default));
    if (capability?.quality && quality && quality !== "auto") body.quality = normalizeAIHubSelectValue(capability.quality, quality);
    const imageLimit = capability?.references?.images.max || references.length;
    assertReferenceLimit(capability, references);
    const safeReferences = references.slice(0, imageLimit);
    if (safeReferences.length) {
        if (isAIHubGeminiImageModel(model) || aihubModelAdapter(model) === "image-reference") body.image = safeReferences.length === 1 ? safeReferences[0] : safeReferences;
        else if (model.toLowerCase() === "gpt-image-2") body.image = safeReferences.length === 1 ? safeReferences[0] : safeReferences;
        else if (model.toLowerCase() === "gpt-image-2-1k") body.reference_image_urls = safeReferences;
    }
    return body;
}

export function createAIHubImageEditForm({ model, prompt, n, size, quality }: AIHubImageOptions, files: File[]) {
    const capability = getAIHubImageCapability(model);
    const body = new FormData();
    body.set("model", model);
    body.set("prompt", prompt);
    const count = Math.min(Math.max(1, n || 1), capability?.count?.max || 1);
    if (count > 1) body.set("n", String(count));
    if (capability?.size) body.set("size", normalizeAIHubSelectValue(capability.size, normalizeAIHubImageSize(model, size || capability.size.default)));
    if (capability?.quality && quality && quality !== "auto") body.set("quality", normalizeAIHubSelectValue(capability.quality, quality));
    assertReferenceFileLimit(capability, files);
    files.forEach((file) => body.append("image", file));
    return body;
}

function assertReferenceLimit(capability: ReturnType<typeof getAIHubImageCapability>, references: string[]) {
    const limit = capability?.references?.images;
    if (!limit) {
        if (references.length) throw new Error(`${capability?.model || "当前模型"} 不支持参考图`);
        return;
    }
    if (references.length > limit.max) throw new Error(`${capability?.model} 最多支持 ${limit.max} 张参考图`);
    const bytes = references.map(dataImageBytes).filter((value): value is number => typeof value === "number");
    if (limit.maxBytes && bytes.some((value) => value > limit.maxBytes!)) throw new Error(`${capability?.model} 单张参考图不能超过 ${formatMB(limit.maxBytes)}`);
    if (limit.maxTotalBytes && bytes.reduce((sum, value) => sum + value, 0) > limit.maxTotalBytes) throw new Error(`${capability?.model} 参考图总大小不能超过 ${formatMB(limit.maxTotalBytes)}`);
}

function assertReferenceFileLimit(capability: ReturnType<typeof getAIHubImageCapability>, files: File[]) {
    const limit = capability?.references?.images;
    if (!limit) {
        if (files.length) throw new Error(`${capability?.model || "当前模型"} 不支持参考图`);
        return;
    }
    if (files.length > limit.max) throw new Error(`${capability?.model} 最多支持 ${limit.max} 张参考图`);
    if (limit.maxBytes && files.some((file) => file.size > limit.maxBytes!)) throw new Error(`${capability?.model} 单张参考图不能超过 ${formatMB(limit.maxBytes)}`);
    if (limit.maxTotalBytes && files.reduce((sum, file) => sum + file.size, 0) > limit.maxTotalBytes) throw new Error(`${capability?.model} 参考图总大小不能超过 ${formatMB(limit.maxTotalBytes)}`);
}

function dataImageBytes(value: string) {
    const match = value.match(/^data:image\/[\w.+-]+;base64,([\s\S]+)$/i);
    if (!match) return undefined;
    const base64 = match[1].replace(/\s/g, "");
    return Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
}

function formatMB(bytes: number) {
    return `${Math.floor(bytes / 1024 / 1024)}MB`;
}

function normalizeAIHubImageSize(model: string, size: string) {
    const normalizedModel = model.toLowerCase();
    if (normalizedModel === "gpt-image-2" || !normalizedModel.startsWith("gpt-image-2")) return size;
    const match = size.match(/^(\d+)x(\d+)$/);
    if (!match) return size;
    const ratio = Number(match[1]) / Number(match[2]);
    if (ratio > 1.15) return "1536x1024";
    if (ratio < 0.87) return "1024x1536";
    return "1024x1024";
}

export function createAIHubChatImageBody(model: string, prompt: string, references: string[]) {
    assertReferenceLimit(getAIHubImageCapability(model), references);
    const profile = getAIHubRequestProfile(model);
    if (profile) return buildAIHubConfiguredRequestBody(profile, { model, prompt, references });
    const content: string | Array<Record<string, unknown>> = references.length ? [{ type: "text", text: prompt }, ...references.map((url) => ({ type: "image_url", image_url: { url } }))] : prompt;
    return { model, messages: [{ role: "user", content }] };
}

export function extractAIHubChatImageUrls(payload: unknown) {
    const urls = new Set<string>();
    const visit = (value: unknown, depth = 0) => {
        if (depth > 7 || value == null) return;
        if (typeof value === "string") {
            for (const match of value.matchAll(/(?:https?:\/\/[^\s)"']+|data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+)/gi)) urls.add(match[0]);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((item) => visit(item, depth + 1));
            return;
        }
        if (typeof value !== "object") return;
        const record = value as Record<string, unknown>;
        const imageUrl = record.image_url;
        if (typeof imageUrl === "string") visit(imageUrl, depth + 1);
        else if (imageUrl && typeof imageUrl === "object") visit((imageUrl as Record<string, unknown>).url, depth + 1);
        for (const key of ["choices", "message", "images", "content", "data", "result", "output", "url", "b64_json"]) visit(record[key], depth + 1);
    };
    visit(payload);
    return [...urls];
}
