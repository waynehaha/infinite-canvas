import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { GET } from "../src/app/api/aihub/video-content/route.ts";

function request(taskId: string, authorization = "") {
    return {
        nextUrl: new URL(`http://localhost/api/aihub/video-content?taskId=${encodeURIComponent(taskId)}`),
        headers: new Headers(authorization ? { authorization } : {}),
    };
}

test("结果代理拒绝非法任务 ID 且不会请求上游", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response());
    const response = await GET(request("../invalid", "Bearer placeholder") as never);
    assert.equal(response.status, 400);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("结果代理要求提供 AIHub 鉴权", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response());
    const response = await GET(request("task_public") as never);
    assert.equal(response.status, 401);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("结果代理使用公开任务 ID 和原鉴权下载媒体", async () => {
    const media = new Uint8Array([0, 1, 2, 3]);
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response(media, { status: 200, headers: { "content-type": "video/mp4", "content-length": "4", "content-encoding": "gzip" } }));
    const response = await GET(request("task_public", "Bearer key-placeholder") as never);
    assert.equal(fetchMock.mock.callCount(), 1);
    const [url, options] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(url, "https://aihubcc.cc/v1/videos/task_public/content");
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer key-placeholder");
    assert.equal(options.cache, "no-store");
    assert.equal(options.signal instanceof AbortSignal, true);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.equal(response.headers.get("content-length"), null);
    assert.equal(response.headers.get("content-encoding"), null);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), media);
});

test("结果代理保留上游失败状态但不暴露请求信息", async () => {
    mock.method(globalThis, "fetch", async () => Response.json({ message: "not found" }, { status: 404 }));
    const response = await GET(request("task_missing", "Bearer key-placeholder") as never);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { message: "not found" });
});

test("结果代理将网络异常转换为稳定的 502 响应", async () => {
    mock.method(globalThis, "fetch", async () => {
        throw new Error("network details must not leak");
    });
    const response = await GET(request("task_public", "Bearer key-placeholder") as never);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { message: "AIHub 视频结果下载失败" });
});
