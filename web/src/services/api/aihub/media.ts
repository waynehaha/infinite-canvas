import { resolveMediaUrl } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { sanitizeDiagnosticText, sanitizeDiagnosticValue } from "@/lib/diagnostic-log-safety";
import { AIHUB_BASE_URL, buildApiUrl, channelIdForActiveModel, localChannelForActiveModel, type AiConfig } from "@/stores/use-config-store";
import { shouldUseAccountProxy } from "@/lib/user-auth-mode";
import { appendDiagnosticEvent, type DiagnosticReferenceKind } from "@/services/diagnostic-log";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type ReferenceMedia = ReferenceImage | ReferenceVideo | ReferenceAudio;
type MediaUploadResponse = { success?: boolean; data?: { media_id: string; upload_url: string; upload_headers?: Record<string, string> } };
type MediaCompleteResponse = { success?: boolean; message?: string; data?: { content_url?: string } };
type InitializedMediaUpload = { data: { media_id: string; upload_url: string; upload_headers?: Record<string, string> } };
type AIHubResponseDiagnostics = { responseMimeType?: string; responseFormat: "json" | "html" | "text" | "empty"; responseBytes: number; responsePreview?: string; retryAfter?: string; requestId?: string; rateLimited: boolean };
export type AIHubMediaUploadStage = "read" | "authorize" | "upload" | "complete";
export type AIHubMediaDiagnosticOptions = { diagnosticTaskId?: string; kind?: DiagnosticReferenceKind; index?: number };

const mediaUploadStageLabels: Record<AIHubMediaUploadStage, string> = {
    read: "参考素材读取",
    authorize: "参考素材上传授权",
    upload: "参考素材文件直传",
    complete: "参考素材上传完成确认",
};
let activeCompleteRequests = 0;

class AIHubResponseError extends Error {
    readonly diagnostics: AIHubResponseDiagnostics;

    constructor(message: string, diagnostics: AIHubResponseDiagnostics) {
        super(message);
        this.diagnostics = diagnostics;
    }
}

function apiUrl(config: AiConfig, path: string) {
    const token = useUserStore.getState().token;
    if (shouldUseAccountProxy(config.channelMode, Boolean(token))) return `/api/v1${path}`;
    return buildApiUrl(localChannelForActiveModel(config)?.baseUrl || config.baseUrl, path);
}

function safeResponsePreview(text: string) {
    if (!text.trim()) return undefined;
    try {
        return JSON.stringify(sanitizeDiagnosticValue(JSON.parse(text), false)).slice(0, 500);
    } catch {
        return sanitizeDiagnosticText(text).replace(/\s+/g, " ").trim().slice(0, 500);
    }
}

export function aiHubResponseDiagnostics(response: Response, text: string): AIHubResponseDiagnostics {
    const responseMimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() || undefined;
    const preview = safeResponsePreview(text);
    const requestId = ["x-request-id", "x-trace-id", "cf-ray"].map((name) => response.headers.get(name)).find(Boolean);
    let responseFormat: AIHubResponseDiagnostics["responseFormat"] = "empty";
    if (text.trim()) {
        if (/^\s*</.test(text)) responseFormat = "html";
        else {
            try {
                JSON.parse(text);
                responseFormat = "json";
            } catch {
                responseFormat = "text";
            }
        }
    }
    return {
        responseMimeType,
        responseFormat,
        responseBytes: new TextEncoder().encode(text).length,
        ...(preview ? { responsePreview: preview } : {}),
        ...(response.headers.get("retry-after") ? { retryAfter: response.headers.get("retry-after")! } : {}),
        ...(requestId ? { requestId } : {}),
        rateLimited: response.status === 429,
    };
}

function rateLimitMessage(diagnostics: AIHubResponseDiagnostics) {
    const value = diagnostics.retryAfter;
    const wait = value ? `，建议 ${/^\d+$/.test(value) ? `${value} 秒` : value}后重试` : "";
    return `素材服务请求过于频繁（HTTP 429${wait}）`;
}

async function parseAIHubJson<T>(response: Response): Promise<{ payload: T; diagnostics: AIHubResponseDiagnostics }> {
    const text = await response.text();
    const diagnostics = aiHubResponseDiagnostics(response, text);
    try {
        return { payload: JSON.parse(text) as T, diagnostics };
    } catch {
        if (response.status === 429) throw new AIHubResponseError(rateLimitMessage(diagnostics), diagnostics);
        if (/^\s*</.test(text)) throw new AIHubResponseError(`接口返回了网页内容，请确认 AIHub Base URL 为 ${AIHUB_BASE_URL}`, diagnostics);
        throw new AIHubResponseError(`接口返回的数据格式不正确（HTTP ${response.status}）`, diagnostics);
    }
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

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : typeof error === "string" ? error : "未知错误";
}

export function aiHubMediaUploadFailureMessage(stage: AIHubMediaUploadStage, error: unknown) {
    const reason = errorMessage(error);
    const label = mediaUploadStageLabels[stage];
    if (reason.startsWith(label)) return reason;
    const network = /failed to fetch|networkerror|load failed|fetch failed/i.test(reason);
    return `${label}${network ? "网络失败" : "失败"}：${reason}`;
}

function diagnosticData(options: AIHubMediaDiagnosticOptions, extra: Record<string, unknown> = {}) {
    return { kind: options.kind || "unknown", index: options.index, ...extra };
}

function mediaUploadFailure(stage: AIHubMediaUploadStage, error: unknown, options: AIHubMediaDiagnosticOptions, startedAt: number, data: Record<string, unknown> = {}) {
    const message = aiHubMediaUploadFailureMessage(stage, error);
    const responseData = error instanceof AIHubResponseError ? error.diagnostics : {};
    appendDiagnosticEvent(options.diagnosticTaskId, {
        stage: "reference",
        status: "failed",
        title: `${mediaUploadStageLabels[stage]}失败`,
        detail: message,
        data: diagnosticData(options, { step: stage, durationMs: Date.now() - startedAt, ...responseData, ...data }),
    });
    return new Error(message);
}

export async function resolveAIHubReferenceUrl(config: AiConfig, reference: ReferenceMedia, options: AIHubMediaDiagnosticOptions = {}): Promise<string> {
    const existing = "dataUrl" in reference ? reference.url : reference.url;
    if (isPublicUrl(existing)) {
        appendDiagnosticEvent(options.diagnosticTaskId, { stage: "reference", status: "info", title: "参考素材使用公网地址", data: diagnosticData(options, { transport: "public-url" }) });
        return existing as string;
    }
    appendDiagnosticEvent(options.diagnosticTaskId, { stage: "reference", status: "started", title: "开始处理本地参考素材", data: diagnosticData(options, { transport: "aihub-temporary-media" }) });
    const readStartedAt = Date.now();
    let blob: Blob;
    try {
        blob = await referenceBlob(reference);
    } catch (error) {
        throw mediaUploadFailure("read", error, options, readStartedAt);
    }
    const contentType = blob.type || reference.type || "application/octet-stream";
    const baseData = { bytes: blob.size, mimeType: contentType, mediaType: mediaType(reference, contentType) };
    appendDiagnosticEvent(options.diagnosticTaskId, { stage: "reference", status: "success", title: "参考素材读取完成", data: diagnosticData(options, { step: "read", durationMs: Date.now() - readStartedAt, ...baseData }) });

    const authorizeStartedAt = Date.now();
    let authorizeStatus = 0;
    let initialized: InitializedMediaUpload;
    try {
        const response = await fetch(apiUrl(config, "/media/upload"), {
            method: "POST",
            headers: { ...authHeaders(config), "Content-Type": "application/json" },
            body: JSON.stringify({ file_name: reference.name || "reference", content_type: contentType, bytes: blob.size }),
        });
        authorizeStatus = response.status;
        const { payload, diagnostics } = await parseAIHubJson<MediaUploadResponse>(response);
        if (!response.ok || !payload.data?.media_id || !payload.data.upload_url) {
            throw new AIHubResponseError(response.status === 429 ? rateLimitMessage(diagnostics) : `HTTP ${response.status}，接口未返回有效上传信息`, diagnostics);
        }
        initialized = payload as InitializedMediaUpload;
        appendDiagnosticEvent(options.diagnosticTaskId, {
            stage: "reference",
            status: "success",
            title: "参考素材上传授权成功",
            data: diagnosticData(options, { step: "authorize", httpStatus: response.status, durationMs: Date.now() - authorizeStartedAt, ...baseData }),
        });
    } catch (error) {
        throw mediaUploadFailure("authorize", error, options, authorizeStartedAt, { httpStatus: authorizeStatus, ...baseData });
    }

    const uploadStartedAt = Date.now();
    let uploadStatus = 0;
    try {
        const response = await fetch(initialized.data.upload_url, { method: "PUT", headers: initialized.data.upload_headers, body: blob });
        uploadStatus = response.status;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        appendDiagnosticEvent(options.diagnosticTaskId, {
            stage: "reference",
            status: "success",
            title: "参考素材文件直传成功",
            data: diagnosticData(options, { step: "upload", httpStatus: response.status, durationMs: Date.now() - uploadStartedAt, ...baseData }),
        });
    } catch (error) {
        throw mediaUploadFailure("upload", error, options, uploadStartedAt, { httpStatus: uploadStatus, ...baseData });
    }

    const completeStartedAt = Date.now();
    let completeStatus = 0;
    activeCompleteRequests += 1;
    const concurrentCompleteRequests = activeCompleteRequests;
    try {
        const response = await fetch(apiUrl(config, `/media/${encodeURIComponent(initialized.data.media_id)}/complete`), { method: "POST", headers: authHeaders(config) });
        completeStatus = response.status;
        const { payload: result, diagnostics } = await parseAIHubJson<MediaCompleteResponse>(response);
        if (!response.ok || !result.data?.content_url) {
            const detail = response.status === 429 ? rateLimitMessage(diagnostics) : typeof result.message === "string" && result.message.trim() ? result.message.trim() : `HTTP ${response.status}，接口未返回素材地址`;
            throw new AIHubResponseError(detail, diagnostics);
        }
        appendDiagnosticEvent(options.diagnosticTaskId, {
            stage: "reference",
            status: "success",
            title: "参考素材上传完成",
            data: diagnosticData(options, { step: "complete", httpStatus: response.status, durationMs: Date.now() - completeStartedAt, concurrentCompleteRequests, ...diagnostics, ...baseData }),
        });
        return result.data.content_url;
    } catch (error) {
        throw mediaUploadFailure("complete", error, options, completeStartedAt, { httpStatus: completeStatus, concurrentCompleteRequests, ...baseData });
    } finally {
        activeCompleteRequests = Math.max(0, activeCompleteRequests - 1);
    }
}

export { isPublicUrl, mediaType };
