import { resolveMediaUrl } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { channelIdForActiveModel, localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import { shouldUseAccountProxy } from "@/lib/user-auth-mode";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type ReferenceMedia = ReferenceImage | ReferenceVideo | ReferenceAudio;
type MediaUploadResponse = { success?: boolean; data?: { media_id: string; upload_url: string; upload_headers?: Record<string, string> } };
type MediaCompleteResponse = { success?: boolean; data?: { content_url?: string } };

function apiUrl(config: AiConfig, path: string) {
    const token = useUserStore.getState().token;
    if (shouldUseAccountProxy(config.channelMode, Boolean(token))) return `/api/v1${path}`;
    const base = (localChannelForActiveModel(config)?.baseUrl || config.baseUrl).replace(/\/+$/, "");
    return `${base}${path}`;
}

function authHeaders(config: AiConfig) {
    const token = useUserStore.getState().token;
    if (config.channelMode === "remote" && !token) throw new Error("请先登录后上传参考素材");
    const credential = shouldUseAccountProxy(config.channelMode, Boolean(token)) || token
        ? token
        : localChannelForActiveModel(config)?.apiKey || config.apiKey;
    return {
        Authorization: `Bearer ${credential}`,
        ...(channelIdForActiveModel(config) ? { "X-Model-Channel-ID": channelIdForActiveModel(config) } : {}),
    };
}

function isPublicUrl(value: unknown) {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
    try {
        const host = new URL(value).hostname.toLowerCase();
        return host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && !/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host);
    } catch { return false; }
}

async function referenceBlob(reference: ReferenceMedia): Promise<Blob> {
    if ("dataUrl" in reference) {
        const dataUrl = await imageToDataUrl(reference);
        const response = await fetch(dataUrl);
        return response.blob();
    }
    const url = await resolveMediaUrl(reference.storageKey, reference.url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`参考素材读取失败：${response.status}`);
    return response.blob();
}

function mediaType(reference: ReferenceMedia, mime: string) {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if ("dataUrl" in reference) return "image";
    return "video";
}

export async function resolveAIHubReferenceUrl(config: AiConfig, reference: ReferenceMedia): Promise<string> {
    const existing = "dataUrl" in reference ? reference.url : reference.url;
    if (isPublicUrl(existing)) return existing as string;
    const blob = await referenceBlob(reference);
    const contentType = blob.type || reference.type || "application/octet-stream";
    const init = await fetch(apiUrl(config, "/media/upload"), {
        method: "POST",
        headers: { ...authHeaders(config), "Content-Type": "application/json" },
        body: JSON.stringify({ file_name: reference.name || "reference", content_type: contentType, bytes: blob.size }),
    });
    const initialized = await init.json() as MediaUploadResponse;
    if (!init.ok || !initialized.data?.media_id || !initialized.data.upload_url) throw new Error(initialized.data ? "AIHub 参考素材上传授权失败" : "AIHub 参考素材上传接口不可用");
    const put = await fetch(initialized.data.upload_url, { method: "PUT", headers: initialized.data.upload_headers, body: blob });
    if (!put.ok) throw new Error(`参考素材直传失败：${put.status}`);
    const completed = await fetch(apiUrl(config, `/media/${encodeURIComponent(initialized.data.media_id)}/complete`), { method: "POST", headers: authHeaders(config) });
    const result = await completed.json() as MediaCompleteResponse;
    if (!completed.ok || !result.data?.content_url) throw new Error("AIHub 参考素材上传完成校验失败");
    return result.data.content_url;
}

export { isPublicUrl, mediaType };
