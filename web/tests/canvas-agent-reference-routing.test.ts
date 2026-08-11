import assert from "node:assert/strict";
import test from "node:test";

import { shouldSendCanvasAgentVisualReferences } from "../src/app/(user)/canvas/agent/canvas-agent-reference-policy.ts";

test("普通画布操作不把参考图送进文本模型", () => {
    assert.equal(shouldSendCanvasAgentVisualReferences("根据选中的图片生成一段视频"), false);
    assert.equal(shouldSendCanvasAgentVisualReferences("把选中的节点整理成两列"), false);
});

test("明确视觉理解时才把参考图作为文本模型输入", () => {
    assert.equal(shouldSendCanvasAgentVisualReferences("分析这张图的主体和构图"), true);
    assert.equal(shouldSendCanvasAgentVisualReferences("描述图片中的服装和色彩"), true);
});
