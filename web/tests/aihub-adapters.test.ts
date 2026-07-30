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

const { createAIHubImageGenerationBody } = await import("../src/services/api/aihub/image.ts");
const { createAIHubVideoBody, resolveAIHubTaskResultUrl } = await import("../src/services/api/aihub/video.ts");

test("AIHub 默认模型完整且不重复", () => {
    assert.equal(AIHUB_DEFAULT_MODELS.length, 35);
    assert.equal(new Set(AIHUB_DEFAULT_MODELS).size, 35);
    assert.deepEqual(
        Object.fromEntries(Object.entries(AIHUB_MODELS_BY_CAPABILITY).map(([key, models]) => [key, models.length])),
        { text: 13, image: 8, video: 13, audio: 1 },
    );
    assert.equal(aihubModelCapability("gemini-3.1-flash-lite"), "text");
    assert.equal(aihubModelCapability("gemini-3.1-flash-image-4k"), "image");
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
    const gpt = createAIHubImageGenerationBody({ model: "gpt-image-2", prompt: "生成", n: 10, size: "2048x1024" });
    assert.deepEqual(gemini.image, ["a", "b"]);
    assert.equal(gpt.n, 4);
    assert.equal(gpt.size, "1536x1024");
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
    assert.equal(body.get("image_url"), "data:image/png;base64,AA==");
    assert.equal(body.get("first_image"), null);
    assert.equal(resolveAIHubTaskResultUrl("/v1/videos/task/content", (path) => `/api/v1${path}`), "/api/v1/videos/task/content");
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
