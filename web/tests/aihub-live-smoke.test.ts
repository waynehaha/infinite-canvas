import assert from "node:assert/strict";
import test from "node:test";

const enabled = process.env.AIHUB_LIVE_TEST === "1";

test("可选真实冒烟测试只读取 AIHub 模型列表", { skip: !enabled }, async () => {
    const apiKey = process.env.AIHUB_API_KEY?.trim() || "";
    assert.ok(apiKey, "运行真实冒烟测试前必须设置 AIHUB_API_KEY");
    const response = await fetch("https://aihubcc.cc/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
    });
    assert.equal(response.ok, true, `AIHub /models 返回 ${response.status}`);
    const payload = (await response.json()) as { data?: Array<{ id?: string }> };
    assert.ok(Array.isArray(payload.data));
    assert.ok(payload.data.some((model) => typeof model.id === "string" && model.id.length > 0));
});
