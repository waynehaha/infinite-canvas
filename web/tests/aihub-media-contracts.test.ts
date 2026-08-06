import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    },
});

const { AIHUB_DEFAULT_MODELS, aihubModelCapability } = await import("../src/lib/aihub-models.ts");
const { AIHUB_MODEL_CAPABILITIES, getAIHubModelCapability, normalizeAIHubRangeValue, normalizeAIHubSelectValue } = await import("../src/lib/aihub-model-capabilities.ts");
const { createAIHubChatImageBody, createAIHubImageGenerationBody, extractAIHubChatImageUrls } = await import("../src/services/api/aihub/image.ts");
const { createAIHubVideoBody } = await import("../src/services/api/aihub/video.ts");
const { getAIHubImageReferenceError, getAIHubVideoReferenceError, isAIHubVideoPromptRequired } = await import("../src/lib/aihub-reference-policy.ts");

const videoInput = (overrides: Record<string, unknown> = {}) => ({
    model: "omni-fast",
    prompt: "生成视频",
    seconds: "6",
    aspectRatio: "16:9",
    resolution: "720p",
    references: [],
    videoReferences: [],
    audioReferences: [],
    ...overrides,
});

test("默认媒体模型都有能力定义，专用分组模型可以只存在于能力库", () => {
    for (const capability of AIHUB_MODEL_CAPABILITIES) {
        assert.ok(capability.source.startsWith("https://"));
        assert.match(capability.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
    }
    for (const model of AIHUB_DEFAULT_MODELS.filter((item) => aihubModelCapability(item) !== "text")) {
        assert.ok(getAIHubModelCapability(model), `${model} 缺少能力定义`);
    }
    assert.equal(AIHUB_DEFAULT_MODELS.includes("grok-imagine-video"), false);
    assert.ok(getAIHubModelCapability("grok-imagine-video"));
});

test("模型能力查找不区分大小写", () => {
    assert.equal(getAIHubModelCapability("OMNI-FAST")?.model, "omni-fast");
    assert.equal(getAIHubModelCapability("grok-imagine-video-1.5-preview")?.model, "grok-imagine-video-1.5");
});

test("Grok 文生视频使用 JSON 协议和文档字段", () => {
    assert.deepEqual(
        createAIHubVideoBody(videoInput({ model: "grok-imagine-video", aspectRatio: "1280x720", seconds: "99", resolution: "480p" })),
        {
            model: "grok-imagine-video",
            prompt: "生成视频",
            seconds: "15",
            aspect_ratio: "16:9",
            resolution: "480p",
        },
    );
});

test("Grok 图生视频使用单图 image 字段并兼容 1.5 旧模型名", () => {
    assert.deepEqual(
        createAIHubVideoBody(videoInput({ model: "grok-imagine-video-1.5-preview", references: ["https://cdn.example.com/ref.png"], aspectRatio: "720x1280" })),
        {
            model: "grok-imagine-video-1.5",
            prompt: "生成视频",
            seconds: "6",
            aspect_ratio: "9:16",
            resolution: "720p",
            image: "https://cdn.example.com/ref.png",
        },
    );
});

test("无效枚举和越界数值会回落到能力库允许范围", () => {
    const omni = getAIHubModelCapability("omni-fast");
    const seedance = getAIHubModelCapability("Seedance-2.0-720p");
    assert.ok(omni?.kind === "video" && omni.aspectRatio);
    assert.ok(seedance?.kind === "video" && seedance.duration?.mode === "range");
    assert.equal(normalizeAIHubSelectValue(omni.aspectRatio, "invalid"), omni.aspectRatio.default);
    assert.equal(normalizeAIHubRangeValue(seedance.duration, "999"), seedance.duration.max);
});

test("不支持参考图的图片模型会在请求前拦截", () => {
    assert.throws(() => createAIHubImageGenerationBody({ model: "grok-imagine-image", prompt: "生成", references: ["https://cdn.example.com/a.png"] }), /不支持参考图/);
});

test("Gemini 4K Chat 图片模型只发送文本并拒绝未开放的参考图", () => {
    assert.deepEqual(createAIHubChatImageBody("gemini-3.1-flash-image-4k", "生成", []), {
        model: "gemini-3.1-flash-image-4k",
        messages: [{ role: "user", content: "生成" }],
    });
    assert.throws(() => createAIHubChatImageBody("gemini-3.1-flash-image-4k", "融合", ["https://cdn.example.com/a.png"]), /不支持参考图/);
});

test("图片响应会递归提取并去重媒体地址", () => {
    assert.deepEqual(extractAIHubChatImageUrls({ choices: [{ message: { content: "![图](https://cdn.example.com/a.png)" } }], data: [{ image_url: { url: "https://cdn.example.com/a.png" } }, { url: "data:image/png;base64,AA==" }] }), [
        "https://cdn.example.com/a.png",
        "data:image/png;base64,AA==",
    ]);
});

test("Grok Imagine 1.5 必须提供参考图", () => {
    assert.throws(() => createAIHubVideoBody(videoInput({ model: "grok-imagine-video-1.5-preview" })), /至少一张参考图/);
});

test("Seedance 首尾帧必须成对且不能混用其他素材", () => {
    assert.throws(() => createAIHubVideoBody(videoInput({ model: "Seedance-2.0-720p", firstFrame: "https://cdn.example.com/first.png" })), /首尾帧必须同时提供/);
    assert.throws(
        () => createAIHubVideoBody(videoInput({ model: "Seedance-2.0-720p", firstFrame: "https://cdn.example.com/first.png", lastFrame: "https://cdn.example.com/last.png", references: ["https://cdn.example.com/other.png"] })),
        /不能同时添加其他参考素材/,
    );
});

test("Omni 首尾帧也必须成对", () => {
    assert.throws(() => createAIHubVideoBody(videoInput({ firstFrame: "https://cdn.example.com/first.png" })), /同时提供/);
    const body = createAIHubVideoBody(videoInput({ firstFrame: "https://cdn.example.com/first.png", lastFrame: "https://cdn.example.com/last.png" }));
    assert.equal(body.first_image_url, "https://cdn.example.com/first.png");
    assert.equal(body.last_image_url, "https://cdn.example.com/last.png");
});

test("共享视频规则覆盖 Seedance 素材依赖和 Omni V2V 规格", () => {
    assert.match(getAIHubVideoReferenceError("Seedance-2.0-720p", { images: [], videos: [], audios: [], firstFrame: { dataUrl: "first" } }), /首尾帧必须同时提供/);
    assert.match(getAIHubVideoReferenceError("Seedance-2.0-720p", { images: [{ dataUrl: "other" }], videos: [], audios: [], firstFrame: { dataUrl: "first" }, lastFrame: { dataUrl: "last" } }), /不能同时添加其他参考素材/);
    assert.match(getAIHubVideoReferenceError("Seedance-2.0-720p", { images: [], videos: [{ durationMs: 3_000 }], audios: [] }), /需要至少 1 张主图/);
    assert.match(getAIHubVideoReferenceError("omni-fast-v2v", { images: [], videos: [{ width: 1921, height: 1080 }], audios: [] }), /宽度不能超过 1920px/);
});

test("图片文件大小和 Veo 提示词要求由能力库统一判断", () => {
    assert.match(getAIHubImageReferenceError("gemini-image", [{ bytes: 5 * 1024 * 1024 + 1 }]), /单个不能超过 5MB/);
    assert.match(getAIHubImageReferenceError("gpt-image-2-1k", [{ bytes: 3 * 1024 * 1024 }, { bytes: 3 * 1024 * 1024 }]), /总大小不能超过 5MB/);
    assert.equal(isAIHubVideoPromptRequired("veo-clean"), false);
    assert.equal(isAIHubVideoPromptRequired("omni-fast"), true);
});

test("Omni V2V 必须提供参考视频并使用正确字段", () => {
    assert.throws(() => createAIHubVideoBody(videoInput({ model: "omni-fast-v2v" })), /至少一个参考视频/);
    const body = createAIHubVideoBody(videoInput({ model: "omni-fast-v2v", references: ["https://cdn.example.com/person.png"], videoReferences: ["https://cdn.example.com/a.mp4", "https://cdn.example.com/b.mp4"] }));
    assert.deepEqual(body, {
        model: "omni-fast-v2v",
        prompt: "生成视频",
        seconds: "10",
        aspect_ratio: "16:9",
        image_url: "https://cdn.example.com/person.png",
        video_url: "https://cdn.example.com/a.mp4",
        videos: ["https://cdn.example.com/a.mp4", "https://cdn.example.com/b.mp4"],
    });
});

test("Veo-Clean 只接受本地视频文件", () => {
    assert.throws(() => createAIHubVideoBody(videoInput({ model: "veo-clean", videoReferences: ["https://cdn.example.com/a.mp4"] })), /本地视频文件/);
    const file = new File([new Uint8Array([1, 2, 3])], "source.mp4", { type: "video/mp4" });
    const body = createAIHubVideoBody(videoInput({ model: "veo-clean", prompt: "", videoReferences: [file] }));
    assert.equal(body.get("input_video"), file);
    assert.equal(body.get("prompt"), "remove watermark");
});
