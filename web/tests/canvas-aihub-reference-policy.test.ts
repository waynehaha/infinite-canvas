import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    },
});

const { buildCanvasImageReferencePolicy, buildCanvasVideoReferencePolicy, isCanvasVideoReferenceInputSupported, resolveCanvasVideoImageReferences } = await import("../src/app/(user)/canvas/utils/canvas-generation-reference-policy.ts");

const image = { nodeId: "image", type: "image", title: "图片", image: { id: "image", name: "image.png", type: "image/png", dataUrl: "data:image/png;base64,AA==" } } as const;
const video = { nodeId: "video", type: "video", title: "视频", video: { id: "video", name: "video.mp4", type: "video/mp4", url: "data:video/mp4;base64,AA==" } } as const;
const audio = { nodeId: "audio", type: "audio", title: "音频", audio: { id: "audio", name: "audio.mp3", type: "audio/mpeg", url: "data:audio/mpeg;base64,AA==" } } as const;

test("omni-fast 只允许图片参考", () => {
    assert.equal(isCanvasVideoReferenceInputSupported("omni-fast", image), true);
    assert.equal(isCanvasVideoReferenceInputSupported("omni-fast", video), false);
    assert.equal(buildCanvasVideoReferencePolicy("omni-fast", [image], "").error, "");
    assert.match(buildCanvasVideoReferencePolicy("omni-fast", [image, video], "").error, /不支持参考视频/);
});

test("omni-fast-v2v 允许可选 1 张图片和必需 1 至 2 个视频", () => {
    assert.equal(isCanvasVideoReferenceInputSupported("omni-fast-v2v", image), true);
    assert.equal(isCanvasVideoReferenceInputSupported("omni-fast-v2v", video), true);
    assert.match(buildCanvasVideoReferencePolicy("omni-fast-v2v", [image], "").error, /需要至少 1 个参考视频/);
    assert.equal(buildCanvasVideoReferencePolicy("omni-fast-v2v", [video], "").error, "");
    assert.equal(buildCanvasVideoReferencePolicy("omni-fast-v2v", [image, video], "").error, "");
    assert.match(buildCanvasVideoReferencePolicy("omni-fast-v2v", [image, { ...image, nodeId: "image-2" }, video], "").error, /参考图最多支持 1 个/);
    assert.match(buildCanvasVideoReferencePolicy("omni-fast-v2v", [video, { ...video, nodeId: "video-2" }, { ...video, nodeId: "video-3" }], "").error, /最多支持 2 个/);
});

test("omni-fast-v2v 不会把切换模型前残留的首尾帧带入请求", () => {
    const resolved = resolveCanvasVideoImageReferences("omni-fast-v2v", [image.image], image.image, image.image);
    assert.deepEqual(resolved, { references: [image.image], firstFrame: null, lastFrame: null });

    const omni = resolveCanvasVideoImageReferences("omni-fast", [image.image], image.image, null);
    assert.deepEqual(omni, { references: [image.image], firstFrame: image.image, lastFrame: null });
});

test("组装提示词只校验真正引用的素材", () => {
    const imageOnly = buildCanvasVideoReferencePolicy("omni-fast", [image, video], "使用 @[node:image]");
    assert.equal(imageOnly.error, "");
    assert.deepEqual(imageOnly.activeInputs.map((input) => input.nodeId), ["image"]);
    assert.equal(imageOnly.unsupportedConnectedTypes.has("video"), true);

    const videoOnly = buildCanvasVideoReferencePolicy("omni-fast-v2v", [image, video], "使用 @[node:video]");
    assert.equal(videoOnly.error, "");
    assert.deepEqual(videoOnly.activeInputs.map((input) => input.nodeId), ["video"]);
});

test("Doubao Seedance 参考音频需要搭配图片或视频", () => {
    assert.match(buildCanvasVideoReferencePolicy("Doubao-Seedance-2.0-720p", [audio], "").error, /参考图或 1 个参考视频/);
    assert.equal(buildCanvasVideoReferencePolicy("Doubao-Seedance-2.0-720p", [video, audio], "").error, "");
    assert.equal(buildCanvasVideoReferencePolicy("Doubao-Seedance-2.0-720p", [image, audio], "").error, "");
});

test("画布图片模式按能力库限制参考图", () => {
    assert.match(buildCanvasImageReferencePolicy("gemini-3.1-flash-image-4k", [image], "").error, /不支持参考图/);
    assert.match(buildCanvasImageReferencePolicy("gpt-image-2", [image, { ...image, nodeId: "image-2" }], "").error, /最多支持 1 个/);
});

test("画布 Seedance 首尾帧必须成对且不能混用普通素材", () => {
    assert.match(buildCanvasVideoReferencePolicy("Doubao-Seedance-2.0-720p", [image], "", { firstFrameNodeId: "image" }).error, /首尾帧必须同时提供/);
    assert.equal(buildCanvasVideoReferencePolicy("Doubao-Seedance-2.0-720p", [image, { ...image, nodeId: "image-2" }], "", { firstFrameNodeId: "image", lastFrameNodeId: "image-2" }).error, "");
    const withOther = buildCanvasVideoReferencePolicy("Doubao-Seedance-2.0-720p", [image, { ...image, nodeId: "image-2" }, { ...image, nodeId: "image-3" }], "", { firstFrameNodeId: "image", lastFrameNodeId: "image-2" });
    assert.match(withOther.error, /不能同时添加其他参考素材/);
});

test("画布限制 Grok 6 秒参考图数量，并校验 H3 自适应比例", () => {
    const images = Array.from({ length: 8 }, (_, index) => ({ ...image, nodeId: `image-${index}` }));
    assert.equal(buildCanvasVideoReferencePolicy("grok-imagine-video-6s", images.slice(0, 7), "").error, "");
    assert.match(buildCanvasVideoReferencePolicy("grok-imagine-video-6s", images, "").error, /最多支持 7 个/);
    assert.match(buildCanvasVideoReferencePolicy("minimax-h3-2k", [], "提示词", { aspectRatio: "adaptive" }).error, /文生视频不支持自适应比例/);
    assert.equal(buildCanvasVideoReferencePolicy("minimax-h3-2k", [image], "", { aspectRatio: "adaptive" }).error, "");
});
