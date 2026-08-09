import assert from "node:assert/strict";
import test from "node:test";

import { assertChatRequestSafety } from "../src/lib/chat-request-guard.ts";

test("聊天请求会拦截超大的 Base64 参考图", () => {
    assert.throws(() => assertChatRequestSafety({ messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${"A".repeat(7_000_000)}` } }] }] }), /单张参考图超过/);
});

test("聊天请求会拦截过大的累计文本上下文", () => {
    assert.throws(() => assertChatRequestSafety({ messages: [{ role: "user", content: "x".repeat(260_000) }] }), /文本输入超过约/);
});

test("公网图片链接不会被当作本地素材拦截", () => {
    assert.doesNotThrow(() => assertChatRequestSafety({ messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://cdn.example.com/reference.png" } }] }] }));
});
