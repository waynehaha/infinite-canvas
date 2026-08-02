import assert from "node:assert/strict";
import test from "node:test";

import { classifyVideoPollingFailure, requestVideoContentCandidates, resolveVideoTaskIds, selectVideoPollId, withVideoResultTimeout } from "../src/services/api/video-polling.ts";

test("AIHub 查询响应使用稳定的公开 id，不使用上游 task_id", () => {
    assert.equal(
        selectVideoPollId("omni-fast", {
            id: "task_public",
            task_id: "task_upstream",
        }),
        "task_public",
    );
});

test("AIHub 只有 task_id 时可以正常轮询", () => {
    assert.equal(selectVideoPollId("omni-fast", { task_id: "task_public" }), "task_public");
});

test("普通渠道保持优先使用 id", () => {
    assert.equal(selectVideoPollId("veo-3", { id: "provider_id", task_id: "task_id" }), "provider_id");
});

test("Agnes 保持优先使用 video_id", () => {
    assert.equal(selectVideoPollId("agnes-video-1", { id: "task_id", video_id: "video_id" }), "video_id");
});

test("连续轮询不会让上游 task_id 覆盖公开任务 ID", () => {
    const created = resolveVideoTaskIds("omni-fast", { id: "task_public", task_id: "task_public" });
    const polled = resolveVideoTaskIds("omni-fast", { id: "task_public", task_id: "task_upstream" }, created.pollId);
    assert.deepEqual(polled, { pollId: "task_public", providerId: "task_upstream" });
});

test("状态响应只返回内部 id 时仍保留公开任务 ID", () => {
    assert.deepEqual(resolveVideoTaskIds("omni-fast", { id: "task_upstream" }, "task_public"), {
        pollId: "task_public",
        providerId: "task_upstream",
    });
});

test("task_not_exist 会转换为明确且不可重试的错误", () => {
    assert.deepEqual(classifyVideoPollingFailure(400, "task_not_exist", "task_not_exist"), {
        message: "视频任务不存在或任务编号无效，请重新生成",
        retryable: false,
    });
});

test("短暂网络错误和服务端错误保留下一轮重试", () => {
    assert.equal(classifyVideoPollingFailure(0, undefined, "Network Error").retryable, true);
    assert.equal(classifyVideoPollingFailure(503, undefined, "Service Unavailable").retryable, true);
});

test("结果下载超时会中止当前请求", async () => {
    await assert.rejects(
        withVideoResultTimeout(5, (signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))),
        /视频结果下载超时/,
    );
});

test("首个结果地址挂起后会尝试备用编号", async () => {
    const attempts: string[] = [];
    const response = await requestVideoContentCandidates(
        ["task_public", "video_result"],
        async (id) => {
            attempts.push(id);
            if (id === "task_public") throw new Error("视频结果下载超时");
            return { ok: true, status: 200, id };
        },
        (status) => status === 404 || status >= 500,
    );
    assert.deepEqual(attempts, ["task_public", "video_result"]);
    assert.equal(response.id, "video_result");
});
