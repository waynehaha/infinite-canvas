export type VideoTaskIds = {
    id?: string;
    task_id?: string;
    video_id?: string;
};

export function selectVideoPollId(model: string, task: VideoTaskIds) {
    if (model.toLowerCase().includes("agnes-video")) return task.video_id || task.id || task.task_id || "";
    return task.id || task.task_id || task.video_id || "";
}

export function resolveVideoTaskIds(model: string, task: VideoTaskIds, pollId = "") {
    const stablePollId = pollId || selectVideoPollId(model, task);
    const providerId = task.video_id || (task.task_id && task.task_id !== stablePollId ? task.task_id : "");
    return { pollId: stablePollId, providerId };
}

export function classifyVideoPollingFailure(status: number, code: string | undefined, message: string) {
    const taskMissing = code === "task_not_exist" || /task_not_exist/i.test(message);
    return {
        message: taskMissing ? "视频任务不存在或任务编号无效，请重新生成" : message,
        retryable: !status || status === 408 || status === 429 || status >= 500,
    };
}
