import assert from "node:assert/strict";
import test from "node:test";

import { classifyVideoPollingFailure, selectVideoPollId } from "../src/services/api/video-polling.ts";

test("AIHub 双 ID 响应优先使用公开 task_id", () => {
    assert.equal(
        selectVideoPollId("omni-fast", true, {
            id: "task_upstream",
            task_id: "task_public",
            video_id: "task_upstream",
        }),
        "task_public",
    );
});

test("AIHub 只有 task_id 时可以正常轮询", () => {
    assert.equal(selectVideoPollId("omni-fast", true, { task_id: "task_public" }), "task_public");
});

test("普通渠道保持优先使用 id", () => {
    assert.equal(selectVideoPollId("veo-3", false, { id: "provider_id", task_id: "task_id" }), "provider_id");
});

test("Agnes 保持优先使用 video_id", () => {
    assert.equal(selectVideoPollId("agnes-video-1", false, { id: "task_id", video_id: "video_id" }), "video_id");
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
