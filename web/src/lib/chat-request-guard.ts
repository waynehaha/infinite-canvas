const MAX_CHAT_REQUEST_BYTES = 12 * 1024 * 1024;
const MAX_CHAT_INPUT_TOKENS = 64_000;
const MAX_DATA_URL_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_DATA_URL_BYTES = 10 * 1024 * 1024;

export function assertChatRequestSafety(body: unknown) {
    const stats = inspectChatValue(body);
    if (stats.requestBytes > MAX_CHAT_REQUEST_BYTES) {
        throw new Error(`文本请求过大（${formatMB(stats.requestBytes)}），已阻止发送。请缩小参考图或减少画布上下文后重试。`);
    }
    if (stats.maxDataUrlBytes > MAX_DATA_URL_BYTES) {
        throw new Error(`单张参考图超过 ${formatMB(MAX_DATA_URL_BYTES)}，已阻止发送。请压缩图片或改用公网图片链接。`);
    }
    if (stats.totalDataUrlBytes > MAX_TOTAL_DATA_URL_BYTES) {
        throw new Error(`参考素材总大小超过 ${formatMB(MAX_TOTAL_DATA_URL_BYTES)}，已阻止发送。请减少或压缩参考图。`);
    }
    if (stats.estimatedInputTokens > MAX_CHAT_INPUT_TOKENS) {
        throw new Error(`文本输入超过约 ${MAX_CHAT_INPUT_TOKENS.toLocaleString()} Token，已阻止发送。请缩短历史消息或画布上下文。`);
    }
}

type ChatValueStats = {
    requestBytes: number;
    estimatedInputTokens: number;
    maxDataUrlBytes: number;
    totalDataUrlBytes: number;
};

function inspectChatValue(value: unknown): ChatValueStats {
    const serialized = JSON.stringify(value) || "";
    const stats: ChatValueStats = {
        requestBytes: new TextEncoder().encode(serialized).length,
        estimatedInputTokens: 0,
        maxDataUrlBytes: 0,
        totalDataUrlBytes: 0,
    };
    visit(value, stats);
    return stats;
}

function visit(value: unknown, stats: ChatValueStats) {
    if (typeof value === "string") {
        const dataUrlBytes = estimateDataUrlBytes(value);
        if (dataUrlBytes !== undefined) {
            stats.maxDataUrlBytes = Math.max(stats.maxDataUrlBytes, dataUrlBytes);
            stats.totalDataUrlBytes += dataUrlBytes;
            stats.estimatedInputTokens += Math.ceil(value.length / 4);
        } else {
            stats.estimatedInputTokens += Math.ceil(Array.from(value).length / 4);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item) => visit(item, stats));
        return;
    }
    if (value && typeof value === "object") {
        Object.values(value as Record<string, unknown>).forEach((item) => visit(item, stats));
    }
}

function estimateDataUrlBytes(value: string) {
    const match = value.match(/^data:[^;]+;base64,([\s\S]+)$/i);
    if (!match) return undefined;
    const base64 = match[1].replace(/\s/g, "");
    return Math.max(0, Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0));
}

function formatMB(bytes: number) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
