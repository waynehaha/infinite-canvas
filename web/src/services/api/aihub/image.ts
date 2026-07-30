import { isAIHubGeminiImageModel } from "@/lib/aihub-models";

export type AIHubImageOptions = {
    model: string;
    prompt: string;
    n?: number;
    size?: string;
    quality?: string;
    references?: string[];
};

export function createAIHubImageGenerationBody({ model, prompt, n, size, quality, references = [] }: AIHubImageOptions) {
    const body: Record<string, unknown> = { model, prompt };
    if (n && n > 1) body.n = model.toLowerCase().startsWith("gpt-image-2") ? Math.min(n, 4) : n;
    if (size) body.size = normalizeAIHubImageSize(model, size);
    if (quality && quality !== "auto") body.quality = quality;
    if (references.length) {
        if (isAIHubGeminiImageModel(model)) body.image = references.length === 1 ? references[0] : references;
        else if (model.toLowerCase() === "gpt-image-2-1k") body.reference_image_urls = references.slice(0, 6);
    }
    return body;
}

export function createAIHubImageEditForm({ model, prompt, n, size, quality }: AIHubImageOptions, files: File[]) {
    const body = new FormData();
    body.set("model", model);
    body.set("prompt", prompt);
    if (n && n > 1) body.set("n", String(Math.min(n, 4)));
    if (size) body.set("size", normalizeAIHubImageSize(model, size));
    if (quality && quality !== "auto") body.set("quality", quality);
    files.forEach((file) => body.append("image", file));
    return body;
}

function normalizeAIHubImageSize(model: string, size: string) {
    if (!model.toLowerCase().startsWith("gpt-image-2")) return size;
    const match = size.match(/^(\d+)x(\d+)$/);
    if (!match) return size;
    const ratio = Number(match[1]) / Number(match[2]);
    if (ratio > 1.15) return "1536x1024";
    if (ratio < 0.87) return "1024x1536";
    return "1024x1024";
}

export function createAIHubChatImageBody(model: string, prompt: string, references: string[]) {
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
