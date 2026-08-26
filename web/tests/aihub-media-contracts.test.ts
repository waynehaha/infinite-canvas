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
const { AIHUB_MODEL_CAPABILITIES, getAIHubModelCapability, getAIHubVideoImageLimit, normalizeAIHubRangeValue, normalizeAIHubSelectValue } = await import("../src/lib/aihub-model-capabilities.ts");
const { createAIHubChatImageBody, createAIHubImageGenerationBody, extractAIHubChatImageUrls } = await import("../src/services/api/aihub/image.ts");
const { createAIHubVideoBody } = await import("../src/services/api/aihub/video.ts");
const { getAIHubImageReferenceError, getAIHubVideoReferenceError, isAIHubVideoPromptRequired } = await import("../src/lib/aihub-reference-policy.ts");
const { getVideoPromptLengthHint, videoPromptLengthHintText } = await import("../src/lib/video-prompt-length-hint.ts");

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

test("默认媒体模型都有能力定义，专用模型能力也可单独维护", () => {
    for (const capability of AIHUB_MODEL_CAPABILITIES) {
        assert.ok(capability.source.startsWith("https://"));
        assert.match(capability.verifiedAt, /^\d{4}-\d{2}-\d{2}$/);
    }
    for (const model of AIHUB_DEFAULT_MODELS.filter((item) => aihubModelCapability(item) !== "text")) {
        assert.ok(getAIHubModelCapability(model), `${model} 缺少能力定义`);
    }
    assert.equal(AIHUB_DEFAULT_MODELS.includes("grok-imagine-video-6s"), true);
    assert.equal(AIHUB_DEFAULT_MODELS.includes("Doubao-Seedance-2.5-720p"), true);
    assert.ok(getAIHubModelCapability("grok-imagine-video-6s"));
});

test("模型能力查找不区分大小写", () => {
    assert.equal(getAIHubModelCapability("OMNI-FAST")?.model, "omni-fast");
    assert.equal(getAIHubModelCapability("GROK-IMAGINE-VIDEO-6S")?.model, "grok-imagine-video-6s");
});

test("Grok 超长提示词只给参考提示，不形成硬限制", () => {
    assert.equal(getVideoPromptLengthHint("grok-imagine-video-6s", "A".repeat(4096)), null);
    const hint = getVideoPromptLengthHint("grok-imagine-video-6s", "A".repeat(4100));
    assert.deepEqual(hint, { current: 4100, hint: 4096, overBy: 4 });
    assert.match(videoPromptLengthHintText(hint!), /只是提交前提示，不会强制拦截/);
    assert.deepEqual(getVideoPromptLengthHint("grok-imagine-video-6s", "😀".repeat(4100)), { current: 4100, hint: 4096, overBy: 4 });
    assert.equal(getVideoPromptLengthHint("omni-fast", "A".repeat(5000)), null);
});

test("Grok 6 秒文生视频使用固定参数且不发送无效字段", () => {
    assert.deepEqual(
        createAIHubVideoBody(videoInput({ model: "grok-imagine-video-6s", aspectRatio: "1280x720", seconds: "99", resolution: "1080p" })),
        {
            model: "grok-imagine-video-6s",
            prompt: "生成视频",
            size: "1280x720",
        },
    );
});

test("Grok 6 秒图生视频使用 image_url 字段", () => {
    assert.deepEqual(
        createAIHubVideoBody(videoInput({ model: "grok-imagine-video-6s", references: ["https://cdn.example.com/ref.png"], aspectRatio: "720x1280" })),
        {
            model: "grok-imagine-video-6s",
            prompt: "生成视频",
            size: "720x1280",
            image_url: "https://cdn.example.com/ref.png",
        },
    );
});

test("Grok 6 秒最多支持 7 张参考图", () => {
    assert.equal(getAIHubVideoImageLimit("grok-imagine-video-6s", "480p"), 7);
    assert.throws(() => createAIHubVideoBody(videoInput({ model: "grok-imagine-video-6s", references: Array.from({ length: 8 }, (_, index) => `https://cdn.example.com/${index}.png`) })), /最多支持 7 张参考图/);
});

test("MiniMax H3 使用 AIHub 原生 JSON 字段和模型边界", () => {
    assert.deepEqual(
        createAIHubVideoBody(videoInput({ model: "minimax-h3-pro-2k", seconds: "99", aspectRatio: "adaptive", references: ["https://cdn.example.com/image.png"], videoReferences: ["https://cdn.example.com/video.mp4"], audioReferences: ["https://cdn.example.com/audio.mp3"] })),
        {
            model: "minimax-h3-pro-2k",
            prompt: "生成视频",
            duration: 15,
            ratio: "adaptive",
            referenceImages: ["https://cdn.example.com/image.png"],
            referenceAudios: ["https://cdn.example.com/audio.mp3"],
            referenceVideos: ["https://cdn.example.com/video.mp4"],
        },
    );
    assert.throws(() => createAIHubVideoBody(videoInput({ model: "minimax-h3-2k", aspectRatio: "adaptive" })), /文生视频不支持自适应比例/);
    assert.throws(() => createAIHubVideoBody(videoInput({ model: "minimax-h3", prompt: "A".repeat(2001) })), /最多支持 2000 个字符/);
    assert.throws(() => createAIHubVideoBody(videoInput({ model: "minimax-h3", audioReferences: ["https://cdn.example.com/audio.mp3"] })), /需要至少一张参考图或一组首尾帧/);
});

test("MiniMax H3 首尾帧使用成对字段且可搭配音频和 Pro 参考视频", () => {
    assert.deepEqual(
        createAIHubVideoBody(videoInput({ model: "minimax-h3-pro-768p", firstFrame: "https://cdn.example.com/first.png", lastFrame: "https://cdn.example.com/last.png", videoReferences: ["https://cdn.example.com/video.mp4"], audioReferences: ["https://cdn.example.com/audio.mp3"] })),
        {
            model: "minimax-h3-pro-768p",
            prompt: "生成视频",
            duration: 6,
            ratio: "16:9",
            referenceAudios: ["https://cdn.example.com/audio.mp3"],
            referenceVideos: ["https://cdn.example.com/video.mp4"],
            first_image: "https://cdn.example.com/first.png",
            last_image: "https://cdn.example.com/last.png",
        },
    );
    assert.throws(() => createAIHubVideoBody(videoInput({ model: "minimax-h3", firstFrame: "https://cdn.example.com/first.png" })), /必须同时提供/);
});

test("无效枚举和越界数值会回落到能力库允许范围", () => {
    const omni = getAIHubModelCapability("omni-fast");
    const seedance = getAIHubModelCapability("Doubao-Seedance-2.0-720p");
    assert.ok(omni?.kind === "video" && omni.aspectRatio);
    assert.ok(seedance?.kind === "video" && seedance.duration?.mode === "range");
    assert.equal(normalizeAIHubSelectValue(omni.aspectRatio, "invalid"), omni.aspectRatio.default);
    assert.equal(normalizeAIHubRangeValue(seedance.duration, "999"), seedance.duration.max);
});

test("不支持参考图的图片模型会在请求前拦截", () => {
    assert.throws(() => createAIHubImageGenerationBody({ model: "grok-imagine-image-lite", prompt: "生成", references: ["https://cdn.example.com/a.png"] }), /不支持参考图/);
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

test("Seedance 2.5 必须提供参考视频", () => {
    assert.throws(() => createAIHubVideoBody(videoInput({ model: "Doubao-Seedance-2.5-720p" })), /至少一个参考视频/);
});

test("Seedance 首尾帧必须成对且不能混用其他素材", () => {
    assert.throws(() => createAIHubVideoBody(videoInput({ model: "Doubao-Seedance-2.0-720p", firstFrame: "https://cdn.example.com/first.png" })), /必须同时提供首帧和尾帧/);
    assert.throws(
        () => createAIHubVideoBody(videoInput({ model: "Doubao-Seedance-2.0-720p", firstFrame: "https://cdn.example.com/first.png", lastFrame: "https://cdn.example.com/last.png", references: ["https://cdn.example.com/other.png"] })),
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
    assert.match(getAIHubVideoReferenceError("Doubao-Seedance-2.0-720p", { images: [], videos: [], audios: [], firstFrame: { dataUrl: "first" } }), /首尾帧必须同时提供/);
    assert.match(getAIHubVideoReferenceError("Doubao-Seedance-2.0-720p", { images: [{ dataUrl: "other" }], videos: [], audios: [], firstFrame: { dataUrl: "first" }, lastFrame: { dataUrl: "last" } }), /不能同时添加其他参考素材/);
    assert.match(getAIHubVideoReferenceError("Doubao-Seedance-2.0-720p", { images: [], videos: [], audios: [{ durationMs: 3_000 }] }), /参考图或 1 个参考视频/);
    assert.match(getAIHubVideoReferenceError("omni-fast-v2v", { images: [], videos: [{ width: 1921, height: 1080 }], audios: [] }), /宽度不能超过 1920px/);
});

test("图片文件大小和视频提示词要求由能力库统一判断", () => {
    assert.match(getAIHubImageReferenceError("gemini-image", [{ bytes: 5 * 1024 * 1024 + 1 }]), /单个不能超过 5MB/);
    assert.match(getAIHubImageReferenceError("gpt-image-2-1k", [{ bytes: 3 * 1024 * 1024 }, { bytes: 3 * 1024 * 1024 }]), /总大小不能超过 5MB/);
    assert.equal(isAIHubVideoPromptRequired("Doubao-Seedance-2.5-720p"), true);
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

test("Seedance 2.5 只接受公网参考视频并发送编辑字段", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "source.mp4", { type: "video/mp4" });
    assert.throws(() => createAIHubVideoBody(videoInput({ model: "Doubao-Seedance-2.5-720p", videoReferences: [file] })), /公网地址/);
    assert.deepEqual(createAIHubVideoBody(videoInput({ model: "Doubao-Seedance-2.5-720p", seconds: "8", references: ["https://cdn.example.com/style.png"], videoReferences: ["https://cdn.example.com/source.mp4"] })), {
        model: "Doubao-Seedance-2.5-720p",
        prompt: "生成视频",
        seconds: 8,
        reference_videos: ["https://cdn.example.com/source.mp4"],
        reference_images: ["https://cdn.example.com/style.png"],
    });
});
