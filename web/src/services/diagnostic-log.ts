import localforage from "localforage";
import { nanoid } from "nanoid";

import { APP_VERSION } from "@/constant/env";
import { diagnosticExportLooksSafe, diagnosticTextStats, prepareDiagnosticValue, sanitizeDiagnosticReferenceUrl, sanitizeDiagnosticText, sanitizeDiagnosticValue } from "@/lib/diagnostic-log-safety";
import { createZip } from "@/lib/zip";
import { getImageBlob, imageToDataUrl } from "@/services/image-storage";

export type DiagnosticMode = "image" | "video" | "audio" | "text" | "workflow";
export type DiagnosticScopeType = "canvas" | "image-workbench" | "video-workbench";
export type DiagnosticStatus = "running" | "success" | "failed";
export type DiagnosticEventStatus = "started" | "success" | "warning" | "failed" | "info";
export type DiagnosticStage = "config" | "input" | "reference" | "request" | "task" | "polling" | "result" | "storage" | "canvas";
export type DiagnosticReferenceKind = "image" | "video" | "audio" | "first-frame" | "last-frame";

export type DiagnosticReferenceItemSummary = {
    index: number;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
    source: "local" | "remote" | "unknown";
    includedInRequest: boolean;
};

export type DiagnosticReferenceSummary = {
    kind: DiagnosticReferenceKind;
    count: number;
    totalBytes?: number;
    mimeTypes?: string[];
    source?: "local" | "remote" | "mixed";
    items?: DiagnosticReferenceItemSummary[];
};

export type DiagnosticReferenceAsset = DiagnosticReferenceItemSummary & {
    kind: DiagnosticReferenceKind;
    name?: string;
    url?: string;
    dataUrl?: string;
    storageKey?: string;
};

export type DiagnosticEvent = {
    id: string;
    at: number;
    stage: DiagnosticStage;
    status: DiagnosticEventStatus;
    title: string;
    detail?: string;
    data?: Record<string, unknown>;
    dedupeKey?: string;
};

export type DiagnosticTask = {
    schemaVersion: 1;
    id: string;
    scopeType?: DiagnosticScopeType;
    scopeId?: string;
    scopeTitle?: string;
    canvasId: string;
    canvasTitle: string;
    nodeId: string;
    mode: DiagnosticMode;
    model: string;
    channelMode: string;
    channelId: string;
    prompt: string;
    status: DiagnosticStatus;
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
    remoteTaskIds: string[];
    references: DiagnosticReferenceSummary[];
    events: DiagnosticEvent[];
    reconstructed?: boolean;
    sourceRecordId?: string;
};

type StartDiagnosticTaskInput = Pick<DiagnosticTask, "nodeId" | "mode" | "model" | "channelMode" | "channelId" | "prompt"> & {
    scopeType?: DiagnosticScopeType;
    scopeId?: string;
    scopeTitle?: string;
    canvasId?: string;
    canvasTitle?: string;
    references?: DiagnosticReferenceSummary[];
    referenceAssets?: DiagnosticReferenceAsset[];
};

const diagnosticStore = localforage.createInstance({ name: "infinite-canvas", storeName: "diagnostic_logs" });
const diagnosticReferenceAssetStore = localforage.createInstance({ name: "infinite-canvas", storeName: "diagnostic_reference_assets" });
const taskQueues = new Map<string, Promise<void>>();
const referenceAssetQueues = new Map<string, Promise<void>>();
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TASKS = 200;
const MAX_EVENTS = 160;
const DIAGNOSTIC_TASKS_CHANGED_EVENT = "infinite-canvas:diagnostic-tasks-changed";

export function startDiagnosticTask(input: StartDiagnosticTaskInput) {
    const id = `diagnostic_${nanoid(12)}`;
    const now = Date.now();
    const scopeType = input.scopeType || "canvas";
    const scopeId = input.scopeId || input.canvasId || scopeType;
    const scopeTitle = input.scopeTitle || input.canvasTitle || diagnosticScopeTypeLabel(scopeType);
    const task: DiagnosticTask = {
        schemaVersion: 1,
        id,
        scopeType,
        scopeId,
        scopeTitle,
        canvasId: input.canvasId || (scopeType === "canvas" ? scopeId : ""),
        canvasTitle: input.canvasTitle || (scopeType === "canvas" ? scopeTitle : ""),
        nodeId: input.nodeId,
        mode: input.mode,
        model: input.model,
        channelMode: input.channelMode,
        channelId: input.channelId,
        prompt: input.prompt,
        status: "running",
        createdAt: now,
        updatedAt: now,
        remoteTaskIds: [],
        references: input.references || [],
        events: [eventOf("config", "started", "开始诊断任务", "已建立本次提交的独立诊断记录")],
    };
    enqueueTask(id, async () => {
        await diagnosticStore.setItem(id, task);
        notifyDiagnosticTasksChanged();
    });
    if (input.referenceAssets?.length) void registerDiagnosticReferenceAssets(id, input.referenceAssets);
    setTimeout(() => void pruneDiagnosticTasks().catch(() => undefined), 0);
    return id;
}

export function appendDiagnosticEvent(taskId: string | undefined, event: Omit<DiagnosticEvent, "id" | "at">) {
    if (!taskId) return;
    enqueueTask(taskId, async () => {
        const task = await diagnosticStore.getItem<DiagnosticTask>(taskId);
        if (!task) return;
        const nextEvent = { ...event, id: nanoid(10), at: Date.now(), data: prepareDiagnosticValue(event.data) as Record<string, unknown> | undefined };
        if (nextEvent.dedupeKey && task.events.some((item) => item.dedupeKey === nextEvent.dedupeKey)) return;
        const previous = task.events[task.events.length - 1];
        if (previous && diagnosticEventFingerprint(previous) === diagnosticEventFingerprint(nextEvent)) return;
        task.events = [...task.events.slice(-(MAX_EVENTS - 1)), nextEvent];
        task.updatedAt = nextEvent.at;
        await diagnosticStore.setItem(taskId, task);
        notifyDiagnosticTasksChanged();
    });
}

export function attachDiagnosticRemoteTaskId(taskId: string | undefined, remoteTaskId: string | undefined) {
    const value = remoteTaskId?.trim();
    if (!taskId || !value) return;
    enqueueTask(taskId, async () => {
        const task = await diagnosticStore.getItem<DiagnosticTask>(taskId);
        if (!task || task.remoteTaskIds.includes(value)) return;
        task.remoteTaskIds = [...task.remoteTaskIds, value].slice(-20);
        task.updatedAt = Date.now();
        await diagnosticStore.setItem(taskId, task);
        notifyDiagnosticTasksChanged();
    });
}

export function updateDiagnosticReferences(taskId: string | undefined, references: DiagnosticReferenceSummary[]) {
    if (!taskId) return;
    enqueueTask(taskId, async () => {
        const task = await diagnosticStore.getItem<DiagnosticTask>(taskId);
        if (!task) return;
        task.references = references;
        task.updatedAt = Date.now();
        await diagnosticStore.setItem(taskId, task);
        notifyDiagnosticTasksChanged();
    });
}

export function diagnosticReferenceAssets(kind: DiagnosticReferenceKind, items: Array<{ name?: string; type?: string; mimeType?: string; dataUrl?: string; url?: string; storageKey?: string; bytes?: number; width?: number; height?: number }>, includedInRequest = true): DiagnosticReferenceAsset[] {
    return items.map((item, itemIndex) => {
        const value = item.url || item.dataUrl || "";
        const source = !item.storageKey && /^https?:/i.test(value) ? "remote" as const : item.storageKey || value ? "local" as const : "unknown" as const;
        return {
            kind,
            index: itemIndex + 1,
            name: item.name,
            mimeType: item.mimeType || item.type || undefined,
            bytes: item.bytes || estimateDataUrlBytes(item.dataUrl),
            width: item.width,
            height: item.height,
            source,
            includedInRequest,
            url: source === "remote" ? value : item.url,
            dataUrl: item.dataUrl,
            storageKey: item.storageKey,
        };
    });
}

export function registerDiagnosticReferenceAssets(taskId: string | undefined, assets: DiagnosticReferenceAsset[]) {
    if (!taskId || !assets.length) return Promise.resolve();
    const previous = referenceAssetQueues.get(taskId) || Promise.resolve();
    const next = previous.then(async () => {
        const current = await diagnosticReferenceAssetStore.getItem<DiagnosticReferenceAsset[]>(taskId) || [];
        const merged = new Map(current.map((item) => [`${item.kind}:${item.index}`, item]));
        assets.forEach((item) => merged.set(`${item.kind}:${item.index}`, item));
        await diagnosticReferenceAssetStore.setItem(taskId, [...merged.values()]);
    }).catch(() => undefined);
    referenceAssetQueues.set(taskId, next);
    void next.finally(() => {
        if (referenceAssetQueues.get(taskId) === next) referenceAssetQueues.delete(taskId);
    });
    return next;
}

export function finishDiagnosticTask(taskId: string | undefined, status: Exclude<DiagnosticStatus, "running">, detail?: string) {
    if (!taskId) return;
    enqueueTask(taskId, async () => {
        const task = await diagnosticStore.getItem<DiagnosticTask>(taskId);
        if (!task) return;
        if (task.status === status && task.completedAt) return;
        const now = Date.now();
        task.status = status;
        task.updatedAt = now;
        task.completedAt = now;
        if (detail) task.events = [...task.events.slice(-(MAX_EVENTS - 1)), eventOf(status === "success" ? "canvas" : "request", status === "success" ? "success" : "failed", status === "success" ? "任务已完成" : "任务已失败", detail)];
        await diagnosticStore.setItem(taskId, task);
        notifyDiagnosticTasksChanged();
    });
}

export type ReconstructedDiagnosticTaskInput = {
    sourceRecordId: string;
    scopeType: Exclude<DiagnosticScopeType, "canvas">;
    scopeId: string;
    scopeTitle: string;
    mode: DiagnosticMode;
    model: string;
    channelMode: string;
    channelId: string;
    prompt: string;
    createdAt: number;
    remoteTaskIds?: string[];
    references?: DiagnosticReferenceSummary[];
    issue: string;
    data?: Record<string, unknown>;
};

export async function ensureReconstructedDiagnosticTask(input: ReconstructedDiagnosticTaskInput) {
    const id = reconstructedTaskId(input.scopeId, input.sourceRecordId, input.createdAt);
    const queued = enqueueTask(id, async () => {
        const existing = await diagnosticStore.getItem<DiagnosticTask>(id);
        if (existing) return;
        const now = Date.now();
        const task: DiagnosticTask = {
            schemaVersion: 1,
            id,
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            scopeTitle: input.scopeTitle,
            canvasId: "",
            canvasTitle: "",
            nodeId: input.sourceRecordId,
            mode: input.mode,
            model: input.model,
            channelMode: input.channelMode,
            channelId: input.channelId,
            prompt: input.prompt,
            status: "failed",
            createdAt: input.createdAt,
            updatedAt: now,
            completedAt: now,
            remoteTaskIds: (input.remoteTaskIds || []).filter(Boolean).slice(-20),
            references: input.references || [],
            reconstructed: true,
            sourceRecordId: input.sourceRecordId,
            events: [
                eventOf("config", "warning", "历史补充日志", "该记录由已有生成记录还原，不包含当时完整的请求时间线和请求体"),
                { ...eventOf("storage", "failed", "生成结果不可显示", input.issue), data: prepareDiagnosticValue(input.data) as Record<string, unknown> | undefined },
            ],
        };
        await diagnosticStore.setItem(id, task);
        notifyDiagnosticTasksChanged();
    });
    await queued;
    return id;
}

export async function listDiagnosticTasks(scopeId?: string) {
    await Promise.all(taskQueues.values());
    const tasks: DiagnosticTask[] = [];
    await diagnosticStore.iterate<DiagnosticTask, void>((task) => {
        if (task?.schemaVersion === 1 && (!scopeId || diagnosticTaskScope(task).id === scopeId)) tasks.push(task);
    });
    return [...tasks].sort((a, b) => b.createdAt - a.createdAt);
}

export async function clearDiagnosticTasks(scopeId?: string) {
    await Promise.all(referenceAssetQueues.values());
    if (!scopeId) {
        await diagnosticStore.clear();
        await diagnosticReferenceAssetStore.clear();
    } else {
        const tasks = await listDiagnosticTasks(scopeId);
        await Promise.all(tasks.flatMap((task) => [diagnosticStore.removeItem(task.id), diagnosticReferenceAssetStore.removeItem(task.id)]));
    }
    notifyDiagnosticTasksChanged();
}

export function subscribeDiagnosticTasks(listener: () => void) {
    if (typeof window === "undefined") return () => undefined;
    window.addEventListener(DIAGNOSTIC_TASKS_CHANGED_EVENT, listener);
    return () => window.removeEventListener(DIAGNOSTIC_TASKS_CHANGED_EVENT, listener);
}

export async function createDiagnosticExport(taskId: string) {
    const tasks = await listDiagnosticTasks();
    const task = tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("找不到所选诊断任务");
    const nearby = tasks
        .filter((item) => diagnosticTaskScope(item).id === diagnosticTaskScope(task).id && item.id !== task.id)
        .slice(0, 4)
        .map(taskSummary);
    const safeTask = sanitizeDiagnosticValue({ ...task, prompt: task.prompt }, true);
    const timeline = { task: safeTask, nearbyTasks: sanitizeDiagnosticValue(nearby, false) };
    const environment = sanitizeDiagnosticValue(
        {
            appVersion: APP_VERSION,
            exportedAt: new Date().toISOString(),
            language: typeof navigator === "undefined" ? "unknown" : navigator.language,
            platform: typeof navigator === "undefined" ? "unknown" : navigator.platform,
            userAgent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
        },
        false,
    );
    const timelineText = JSON.stringify(timeline, null, 2);
    const environmentText = JSON.stringify(environment, null, 2);
    const summaryText = buildDiagnosticSummary(task);
    const referenceFiles = await createDiagnosticReferenceFiles(task);
    if (![timelineText, environmentText, summaryText].every(diagnosticExportLooksSafe)) throw new Error("安全检查未通过，诊断日志未导出");
    const blob = await createZip([
        { name: "诊断摘要.txt", data: summaryText },
        { name: "任务时间线.json", data: timelineText },
        { name: "运行环境.json", data: environmentText },
        ...referenceFiles.files,
    ]);
    return { blob, fileName: `AI创作工作台-诊断日志-${formatFileTime(task.createdAt)}.zip` };
}

function eventOf(stage: DiagnosticStage, status: DiagnosticEventStatus, title: string, detail?: string): DiagnosticEvent {
    return { id: nanoid(10), at: Date.now(), stage, status, title, detail };
}

function enqueueTask(taskId: string, mutate: () => Promise<void>) {
    const previous = taskQueues.get(taskId) || Promise.resolve();
    const next = previous.then(mutate, mutate).catch(() => undefined);
    taskQueues.set(taskId, next);
    void next.finally(() => {
        if (taskQueues.get(taskId) === next) taskQueues.delete(taskId);
    });
    return next;
}

function reconstructedTaskId(scopeId: string, sourceRecordId: string, createdAt: number) {
    let hash = 2166136261;
    for (const char of `${scopeId}:${sourceRecordId}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return `diagnostic_reconstructed_${createdAt}_${(hash >>> 0).toString(36)}`;
}

async function createDiagnosticReferenceFiles(task: DiagnosticTask) {
    await referenceAssetQueues.get(task.id);
    const assets = await diagnosticReferenceAssetStore.getItem<DiagnosticReferenceAsset[]>(task.id) || [];
    if (!assets.length && !task.references.length) return { files: [] as Array<{ name: string; data: BlobPart }>, manifestText: "" };
    const files: Array<{ name: string; data: BlobPart }> = [];
    const manifestItems: Array<Record<string, unknown>> = [];
    for (const asset of assets) {
        const base = {
            kind: asset.kind,
            index: asset.index,
            originalName: asset.name || undefined,
            width: asset.width,
            height: asset.height,
            bytes: asset.bytes,
            mimeType: asset.mimeType,
            source: asset.source,
            includedInRequest: asset.includedInRequest,
        };
        if (asset.source === "remote") {
            manifestItems.push({ ...base, exportType: "public-url", url: sanitizeDiagnosticReferenceUrl(asset.url || asset.dataUrl || ""), fileIncluded: false });
            continue;
        }
        try {
            const image = await readLocalDiagnosticReference(asset);
            if (!image) throw new Error("导出时无法读取本地参考图");
            const fileName = diagnosticReferenceFileName(asset, image.type);
            const filePath = `参考素材/${referenceFilePrefix(asset.kind)}-${String(asset.index).padStart(2, "0")}-${fileName}`;
            files.push({ name: filePath, data: image });
            manifestItems.push({ ...base, bytes: asset.bytes || image.size, mimeType: asset.mimeType || image.type || undefined, exportType: "original-file", fileIncluded: true, filePath });
        } catch (error) {
            manifestItems.push({ ...base, exportType: "original-file", fileIncluded: false, exportError: error instanceof Error ? sanitizeDiagnosticText(error.message) : "导出时无法读取本地参考图" });
        }
    }
    const manifest = {
        notice: "本目录可能包含本地参考图原文件、原文件名及图片元数据；公网参考图只记录链接。软件配置中的 API Key、鉴权信息和链接签名参数会自动隐藏，但参考图原文件内容不会扫描或修改。",
        taskReferenceSummary: task.references,
        items: manifestItems,
    };
    const manifestText = JSON.stringify(manifest, null, 2);
    files.unshift({ name: "参考素材/素材信息.json", data: manifestText });
    return { files, manifestText };
}

async function readLocalDiagnosticReference(asset: DiagnosticReferenceAsset) {
    if (asset.storageKey) {
        const stored = await getImageBlob(asset.storageKey).catch(() => null);
        if (stored) return stored;
    }
    const dataUrl = await imageToDataUrl({ storageKey: asset.storageKey, dataUrl: asset.dataUrl, url: asset.url }).catch(() => "");
    if (!dataUrl) return null;
    const response = await fetch(dataUrl);
    if (!response.ok) return null;
    return response.blob();
}

function diagnosticReferenceFileName(asset: DiagnosticReferenceAsset, blobMimeType: string) {
    const fallback = `reference.${imageExtension(asset.mimeType || blobMimeType)}`;
    const value = (asset.name || fallback).split(/[\\/]/).pop() || fallback;
    const safe = value.replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/^\.+/, "").trim() || fallback;
    return /\.[a-z0-9]{2,8}$/i.test(safe) ? safe : `${safe}.${imageExtension(asset.mimeType || blobMimeType)}`;
}

function referenceFilePrefix(kind: DiagnosticReferenceKind) {
    return ({ image: "参考图", "first-frame": "首帧", "last-frame": "尾帧", video: "参考视频", audio: "参考音频" } as const)[kind];
}

function imageExtension(mimeType?: string) {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/webp") return "webp";
    if (mimeType === "image/gif") return "gif";
    if (mimeType === "image/avif") return "avif";
    return "png";
}

function estimateDataUrlBytes(value?: string) {
    if (!value?.startsWith("data:")) return undefined;
    const comma = value.indexOf(",");
    if (comma < 0) return undefined;
    const payload = value.slice(comma + 1);
    return value.slice(0, comma).includes(";base64") ? Math.max(0, Math.floor(payload.length * 3 / 4) - (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0)) : new TextEncoder().encode(decodeURIComponent(payload)).length;
}

async function pruneDiagnosticTasks() {
    const tasks = await listDiagnosticTasks();
    await Promise.all(referenceAssetQueues.values());
    const expiredBefore = Date.now() - RETENTION_MS;
    const removals = tasks.filter((task, index) => task.createdAt < expiredBefore || index >= MAX_TASKS);
    await Promise.all(removals.flatMap((task) => [diagnosticStore.removeItem(task.id), diagnosticReferenceAssetStore.removeItem(task.id)]));
    if (removals.length) notifyDiagnosticTasksChanged();
}

function notifyDiagnosticTasksChanged() {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(DIAGNOSTIC_TASKS_CHANGED_EVENT));
}

function diagnosticEventFingerprint(event: Pick<DiagnosticEvent, "stage" | "status" | "title" | "detail" | "data">) {
    return JSON.stringify([event.stage, event.status, event.title, event.detail, event.data]);
}

function taskSummary(task: DiagnosticTask) {
    return { id: task.id, mode: task.mode, model: task.model, status: task.status, createdAt: task.createdAt, completedAt: task.completedAt };
}

function buildDiagnosticSummary(task: DiagnosticTask) {
    const failedEvent = [...task.events].reverse().find((event) => event.status === "failed");
    const diagnosis = classifyDiagnosticFailure(failedEvent);
    const promptStats = diagnosticTextStats(task.prompt);
    const scope = diagnosticTaskScope(task);
    const lines = [
        "AI 创作工作台诊断日志",
        "",
        "安全说明",
        "- 诊断文本不会写入软件配置中的 API Key、登录凭证、Cookie 或请求鉴权信息；参考图原文件内容不会扫描或修改。",
        "- 包含本次任务的提示词正文、本地参考图原文件、原文件名及图片元数据。",
        "- 公网参考图只记录链接，不重复下载；链接中的鉴权或签名参数会隐藏。",
        "- 不包含参考视频、参考音频、生成结果、完整本地路径或存储 Key。",
        "- 包含提示词正文，疑似密钥等敏感信息已自动隐藏。",
        "",
        "任务摘要",
        ...(task.reconstructed ? ["- 日志来源：根据历史生成记录补充，信息可能不完整"] : []),
        `- 任务编号：${task.id}`,
        `- ${scope.type === "canvas" ? "画布" : "来源"}：${scope.title}（${scope.id}）`,
        `- 类型：${modeLabel(task.mode)}`,
        `- 模型：${task.model || "未确定"}`,
        `- 状态：${statusLabel(task.status)}`,
        `- 开始时间：${new Date(task.createdAt).toLocaleString("zh-CN", { hour12: false })}`,
        `- 提示词长度：${promptStats.characterCount} 个字符，${promptStats.utf8Bytes} 字节`,
        `- 提示词正文：${sanitizeDiagnosticText(task.prompt)}`,
        `- 初步判断：${diagnosis}`,
        "",
        "参考素材",
        ...(task.references.length
            ? task.references.flatMap((item) => [
                `- ${referenceLabel(item.kind)}：${item.count} 个${item.totalBytes ? `，共 ${formatBytes(item.totalBytes)}` : ""}${item.mimeTypes?.length ? `，${item.mimeTypes.join("、")}` : ""}`,
                ...(item.items || []).map((detail) => `  - #${detail.index}：${detail.width && detail.height ? `${detail.width}×${detail.height}` : "尺寸未记录"}${detail.bytes ? `，${formatBytes(detail.bytes)}` : ""}${detail.mimeType ? `，${detail.mimeType}` : ""}，${detail.source === "remote" ? "公网链接" : detail.source === "local" ? "本地素材" : "来源未确定"}，${detail.includedInRequest ? "已进入本次请求" : "未进入请求"}`),
            ])
            : ["- 未记录参考素材"]),
        "",
        "任务时间线",
        ...task.events.map((event) => `- ${new Date(event.at).toLocaleTimeString("zh-CN", { hour12: false })} [${eventStatusLabel(event.status)}] ${event.title}${event.detail ? `：${event.detail}` : ""}`),
    ];
    return sanitizeDiagnosticValue(lines.join("\n"), true) as string;
}

export function diagnosticReferenceSummary(kind: DiagnosticReferenceKind, items: Array<{ bytes?: number; width?: number; height?: number; type?: string; mimeType?: string; dataUrl?: string; url?: string; storageKey?: string }>, includedInRequest = true): DiagnosticReferenceSummary | null {
    if (!items.length) return null;
    const sources = new Set(
        items.map((item) => {
            const value = item.dataUrl || item.url || "";
            if (item.storageKey || value.startsWith("data:") || value.startsWith("blob:")) return "local" as const;
            if (/^https?:/i.test(value)) return "remote" as const;
            return "mixed" as const;
        }),
    );
    const totalBytes = items.reduce((sum, item) => sum + (item.bytes || estimateDataUrlBytes(item.dataUrl) || 0), 0);
    return {
        kind,
        count: items.length,
        totalBytes: totalBytes || undefined,
        mimeTypes: [...new Set(items.map((item) => item.mimeType || item.type || "").filter(Boolean))],
        source: sources.size === 1 ? Array.from(sources)[0] || "mixed" : "mixed",
        items: diagnosticReferenceAssets(kind, items, includedInRequest).map(({ index, width, height, bytes, mimeType, source, includedInRequest: included }) => ({ index, width, height, bytes, mimeType, source, includedInRequest: included })),
    };
}

function diagnosticTaskScope(task: DiagnosticTask) {
    return {
        type: task.scopeType || "canvas",
        id: task.scopeId || task.canvasId,
        title: task.scopeTitle || task.canvasTitle || "未命名画布",
    };
}

function diagnosticScopeTypeLabel(scopeType: DiagnosticScopeType) {
    return ({ canvas: "未命名画布", "image-workbench": "生图工作台", "video-workbench": "视频创作台" } as const)[scopeType];
}

function classifyDiagnosticFailure(event?: DiagnosticEvent) {
    if (!event) return "当前日志没有发现明确失败步骤";
    if (["config", "input", "reference"].includes(event.stage)) return "更可能是软件配置、本地素材或提交前校验问题";
    if (event.stage === "polling") return "更可能是任务状态查询链路或上游任务问题";
    if (event.stage === "result") return "更可能是生成结果获取或下载链路问题";
    if (["storage", "canvas"].includes(event.stage)) return "更可能是结果保存或画布显示问题";
    const status = Number(event.data?.httpStatus || 0);
    if (status >= 400 && status < 500) return "更可能是请求参数、权限、余额、模型能力或素材问题";
    if (status >= 500) return "更可能是 AIHub、上游服务或网络问题";
    return "问题发生在请求提交阶段，需要结合错误信息进一步判断";
}

function modeLabel(mode: DiagnosticMode) {
    return ({ image: "图片生成", video: "视频生成", audio: "音频生成", text: "文本生成", workflow: "工作流" } as const)[mode];
}

function statusLabel(status: DiagnosticStatus) {
    return ({ running: "进行中", success: "成功", failed: "失败" } as const)[status];
}

function eventStatusLabel(status: DiagnosticEventStatus) {
    return ({ started: "开始", success: "成功", warning: "注意", failed: "失败", info: "信息" } as const)[status];
}

function referenceLabel(kind: DiagnosticReferenceSummary["kind"]) {
    return ({ image: "参考图", video: "参考视频", audio: "参考音频", "first-frame": "首帧", "last-frame": "尾帧" } as const)[kind];
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatFileTime(value: number) {
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
