export type VideoTaskIds = {
    id?: string;
    task_id?: string;
    video_id?: string;
};

export async function withVideoResultTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await run(controller.signal);
    } catch (error) {
        if (controller.signal.aborted) throw new Error("视频结果下载超时");
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

export async function requestVideoContentCandidates<T extends { ok: boolean; status: number }>(
    ids: string[],
    request: (id: string) => Promise<T>,
    shouldFallback: (status: number) => boolean,
) {
    let lastAttempt: { response?: T; error?: unknown } | undefined;
    for (const id of ids) {
        try {
            const response = await request(id);
            if (response.ok || !shouldFallback(response.status)) return response;
            lastAttempt = { response };
        } catch (error) {
            lastAttempt = { error };
        }
    }
    if (lastAttempt?.error) throw lastAttempt.error;
    if (lastAttempt?.response) return lastAttempt.response;
    throw new Error("视频结果地址无效");
}

export function selectVideoPollId(model: string, task: VideoTaskIds) {
    if (model.toLowerCase().includes("agnes-video")) return task.video_id || task.id || task.task_id || "";
    return task.id || task.task_id || task.video_id || "";
}

export function resolveVideoTaskIds(model: string, task: VideoTaskIds, pollId = "") {
    const stablePollId = pollId || selectVideoPollId(model, task);
    const providerId = [task.video_id, task.task_id, task.id].find((id) => id && id !== stablePollId) || "";
    return { pollId: stablePollId, providerId };
}

export function classifyVideoPollingFailure(status: number, code: string | undefined, message: string) {
    const taskMissing = code === "task_not_exist" || /task_not_exist/i.test(message);
    return {
        message: taskMissing ? "视频任务不存在或任务编号无效，请重新生成" : message,
        retryable: !status || status === 408 || status === 429 || status >= 500,
    };
}
