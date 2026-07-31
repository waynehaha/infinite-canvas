import assert from "node:assert/strict";
import test from "node:test";

import { classifyVideoPollingFailure, resolveVideoTaskIds, selectVideoPollId } from "../src/services/api/video-polling.ts";

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
