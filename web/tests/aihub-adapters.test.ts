import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

import { AIHUB_DEFAULT_MODELS, AIHUB_MODELS_BY_CAPABILITY, aihubModelCapability } from "../src/lib/aihub-models.ts";
import { createAIHubMusicBody, extractAIHubAudioSource } from "../src/services/api/aihub/audio.ts";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    },
});

const { createAIHubImageEditForm, createAIHubImageGenerationBody } = await import("../src/services/api/aihub/image.ts");
const { aiHubTaskContentId, aiHubTaskContentIds, aiHubTaskContentProxyUrl, aiHubVideoFailureMessage, createAIHubVideoBody, resolveAIHubTaskResultUrl } = await import("../src/services/api/aihub/video.ts");

test("AIHub 默认模型完整且不重复", () => {
    assert.equal(AIHUB_DEFAULT_MODELS.length, 35);
    assert.equal(new Set(AIHUB_DEFAULT_MODELS).size, 35);
    assert.deepEqual(
        Object.fromEntries(Object.entries(AIHUB_MODELS_BY_CAPABILITY).map(([key, models]) => [key, models.length])),
        { text: 9, image: 7, video: 18, audio: 1 },
    );
    assert.equal(aihubModelCapability("gemini-3.1-flash-lite"), "text");
    assert.equal(aihubModelCapability("gemini-3.1-flash-image-4k"), "image");
    assert.equal(aihubModelCapability("grok-imagine-video-1.5"), "video");
    assert.equal(aihubModelCapability("minimax-h3-pro-2k"), "video");
});

test("Gemini Music 使用 Chat Completions 请求", () => {
    assert.deepEqual(createAIHubMusicBody("gemini-music", "轻快电子音乐"), {
        model: "gemini-music",
        messages: [{ role: "user", content: "轻快电子音乐" }],
    });
});

test("音乐响应支持字段和 Markdown 地址", () => {
    assert.equal(extractAIHubAudioSource({ data: { audio_url: "https://cdn.example.com/a.mp3" } }), "https://cdn.example.com/a.mp3");
    assert.equal(extractAIHubAudioSource({ choices: [{ message: { content: "[下载](https://cdn.example.com/b.wav)" } }] }), "https://cdn.example.com/b.wav");
});

test("AIHub 图片字段和 GPT 图片限制正确", () => {
    const gemini = createAIHubImageGenerationBody({ model: "gemini-image", prompt: "融合", references: ["a", "b"] });
    const gpt = createAIHubImageGenerationBody({ model: "gpt-image-2", prompt: "生成", n: 10, size: "1824x1024" });
    assert.deepEqual(gemini.image, ["a", "b"]);
    assert.equal(gpt.n, 4);
    assert.equal(gpt.size, "1824x1024");
    for (const size of ["1360x1024", "1024x1360", "1824x1024", "1024x1824", "1568x672"]) {
        assert.equal(createAIHubImageGenerationBody({ model: "gpt-image-2", prompt: "生成", size }).size, size);
    }
    assert.equal(createAIHubImageEditForm({ model: "gpt-image-2", prompt: "编辑", size: "1568x672" }, []).get("size"), "1568x672");
    assert.equal(createAIHubImageGenerationBody({ model: "gpt-image-2-1k", prompt: "生成", size: "1824x1024" }).size, "1536x1024");
});

test("Omni 单图字段和相对任务地址正确", () => {
    const body = createAIHubVideoBody({
        model: "omni-fast",
        prompt: "生成视频",
        seconds: "10",
        aspectRatio: "16:9",
        resolution: "720p",
        references: ["data:image/png;base64,AA=="],
        videoReferences: [],
        audioReferences: [],
    });
    assert.deepEqual(body, {
        model: "omni-fast",
        prompt: "生成视频",
        seconds: "10",
        aspect_ratio: "16:9",
        image_url: "data:image/png;base64,AA==",
    });
    assert.equal(resolveAIHubTaskResultUrl("/v1/videos/task/content", (path) => `/api/v1${path}`), "/api/v1/videos/task/content");
    assert.equal(resolveAIHubTaskResultUrl("/v1/videos/vid-internal/content", (path) => `/api/v1${path}`, "task-public"), "/api/v1/videos/vid-internal/content");
    assert.equal(resolveAIHubTaskResultUrl("https://download.example.com/v1/videos/vid-result/content", (path) => `/api/v1${path}`, "task-public"), "/api/v1/videos/vid-result/content");
    assert.equal(aiHubTaskContentId("/v1/videos/vid-result/content"), "vid-result");
    assert.equal(aiHubTaskContentId("https://cdn.example.com/result.mp4"), "");
    assert.deepEqual(aiHubTaskContentIds("/v1/videos/vid-result/content", "task-public"), ["task-public", "vid-result"]);
    assert.equal(aiHubTaskContentProxyUrl("task/a b"), "/api/aihub/video-content?taskId=task%2Fa%20b");
    const publicImage = createAIHubVideoBody({
        model: "omni-fast",
        prompt: "生成视频",
        seconds: "10",
        aspectRatio: "16:9",
        resolution: "720p",
        references: ["https://cdn.example.com/reference.png"],
        videoReferences: [],
        audioReferences: [],
    });
    assert.equal((publicImage as Record<string, unknown>).image_url, "https://cdn.example.com/reference.png");
    assert.equal(aiHubVideoFailureMessage("omni-fast", "bad_reference_image: failed to fetch reference image: HTTP 403"), "参考图片的源站拒绝了 AIHub 读取（403），请将图片下载后重新上传再试");
});

test("Omni 会拦截超过 8MB 的本地参考图", () => {
    assert.throws(
        () =>
            createAIHubVideoBody({
                model: "omni-fast",
                prompt: "生成视频",
                seconds: "10",
                aspectRatio: "16:9",
                resolution: "720p",
                references: [`data:image/png;base64,${"A".repeat(11_184_812)}`],
                videoReferences: [],
                audioReferences: [],
            }),
        /不能超过 8MB/,
    );
});

test("Seedance 素材边界会提前拦截", () => {
    assert.throws(
        () =>
            createAIHubVideoBody({
                model: "Seedance-2.0-720p",
                prompt: "生成视频",
                seconds: "6",
                aspectRatio: "16:9",
                resolution: "720p",
                references: [],
                videoReferences: ["https://cdn.example.com/a.mp4"],
                audioReferences: [],
            }),
        /至少一张主图/,
    );
});
