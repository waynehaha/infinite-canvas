import localforage from "localforage";
import { nanoid } from "nanoid";

import { APP_VERSION } from "@/constant/env";
import { diagnosticExportLooksSafe, diagnosticTextStats, prepareDiagnosticValue, sanitizeDiagnosticText, sanitizeDiagnosticValue } from "@/lib/diagnostic-log-safety";
import { createZip } from "@/lib/zip";

export type DiagnosticMode = "image" | "video" | "audio" | "text" | "workflow";
export type DiagnosticScopeType = "canvas" | "image-workbench" | "video-workbench";
export type DiagnosticStatus = "running" | "success" | "failed";
export type DiagnosticEventStatus = "started" | "success" | "warning" | "failed" | "info";
export type DiagnosticStage = "config" | "input" | "reference" | "request" | "task" | "polling" | "result" | "storage" | "canvas";

export type DiagnosticReferenceSummary = {
    kind: "image" | "video" | "audio" | "first-frame" | "last-frame";
    count: number;
    totalBytes?: number;
    mimeTypes?: string[];
    source?: "local" | "remote" | "mixed";
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
};

const diagnosticStore = localforage.createInstance({ name: "infinite-canvas", storeName: "diagnostic_logs" });
const taskQueues = new Map<string, Promise<void>>();
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
    if (!scopeId) {
        await diagnosticStore.clear();
    } else {
        const tasks = await listDiagnosticTasks(scopeId);
        await Promise.all(tasks.map((task) => diagnosticStore.removeItem(task.id)));
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
    if (![timelineText, environmentText, summaryText].every(diagnosticExportLooksSafe)) throw new Error("安全检查未通过，诊断日志未导出");
    const blob = await createZip([
        { name: "诊断摘要.txt", data: summaryText },
        { name: "任务时间线.json", data: timelineText },
        { name: "运行环境.json", data: environmentText },
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

async function pruneDiagnosticTasks() {
    const tasks = await listDiagnosticTasks();
    const expiredBefore = Date.now() - RETENTION_MS;
    const removals = tasks.filter((task, index) => task.createdAt < expiredBefore || index >= MAX_TASKS);
    await Promise.all(removals.map((task) => diagnosticStore.removeItem(task.id)));
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
        "- 不包含 API Key、登录凭证、Cookie 或请求鉴权信息。",
        "- 不包含参考图片、参考视频、生成结果或 Base64 文件内容。",
        "- 完整本地路径和链接查询参数已隐藏。",
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
            ? task.references.map((item) => `- ${referenceLabel(item.kind)}：${item.count} 个${item.totalBytes ? `，共 ${formatBytes(item.totalBytes)}` : ""}${item.mimeTypes?.length ? `，${item.mimeTypes.join("、")}` : ""}`)
            : ["- 未记录参考素材"]),
        "",
        "任务时间线",
        ...task.events.map((event) => `- ${new Date(event.at).toLocaleTimeString("zh-CN", { hour12: false })} [${eventStatusLabel(event.status)}] ${event.title}${event.detail ? `：${event.detail}` : ""}`),
    ];
    return sanitizeDiagnosticValue(lines.join("\n"), true) as string;
}

export function diagnosticReferenceSummary(kind: DiagnosticReferenceSummary["kind"], items: Array<{ bytes?: number; type?: string; mimeType?: string; dataUrl?: string; url?: string; storageKey?: string }>): DiagnosticReferenceSummary | null {
    if (!items.length) return null;
    const sources = new Set(
        items.map((item) => {
            const value = item.dataUrl || item.url || "";
            if (/^https?:/i.test(value)) return "remote" as const;
            if (value.startsWith("data:") || item.storageKey) return "local" as const;
            return "mixed" as const;
        }),
    );
    const totalBytes = items.reduce((sum, item) => sum + (item.bytes || 0), 0);
    return {
        kind,
        count: items.length,
        totalBytes: totalBytes || undefined,
        mimeTypes: [...new Set(items.map((item) => item.mimeType || item.type || "").filter(Boolean))],
        source: sources.size === 1 ? Array.from(sources)[0] || "mixed" : "mixed",
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
