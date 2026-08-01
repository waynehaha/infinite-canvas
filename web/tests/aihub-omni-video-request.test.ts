import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    },
});

const { aiHubVideoFailureMessage, createAIHubVideoBody } = await import("../src/services/api/aihub/video.ts");

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

test("Omni 文生视频使用 JSON 请求", () => {
    assert.deepEqual(createAIHubVideoBody(videoInput()), {
        model: "omni-fast",
        prompt: "生成视频",
        seconds: "10",
        aspect_ratio: "16:9",
    });
});

test("Omni 单图使用标量字段，多图使用真正的字符串数组", () => {
    const first = "https://cdn.example.com/first.jpg";
    const second = "https://cdn.example.com/second.jpg";
    const third = "https://cdn.example.com/third.jpg";

    assert.deepEqual(createAIHubVideoBody(videoInput({ references: [first] })), {
        model: "omni-fast",
        prompt: "生成视频",
        seconds: "10",
        aspect_ratio: "16:9",
        image_url: first,
    });
    assert.deepEqual(createAIHubVideoBody(videoInput({ references: [first, second, third] })), {
        model: "omni-fast",
        prompt: "生成视频",
        seconds: "10",
        aspect_ratio: "16:9",
        image_url: first,
        images: [first, second, third],
    });
});

test("Omni V2V 公网视频使用 JSON，本地文件保留 multipart", () => {
    const first = "https://cdn.example.com/first.mp4";
    const second = "https://cdn.example.com/second.mp4";
    assert.deepEqual(createAIHubVideoBody(videoInput({ model: "omni-fast-v2v", videoReferences: [first, second] })), {
        model: "omni-fast-v2v",
        prompt: "生成视频",
        seconds: "10",
        aspect_ratio: "16:9",
        video_url: first,
        videos: [first, second],
    });

    const file = new File([new Uint8Array([1, 2, 3])], "source.mp4", { type: "video/mp4" });
    const multipart = createAIHubVideoBody(videoInput({ model: "omni-fast-v2v", videoReferences: [file] }));
    assert.ok(multipart instanceof FormData);
    assert.equal(multipart.get("input_video"), file);
});

test("AIHub 嵌套错误会转换为可读中文", () => {
    const invalidImages = JSON.stringify({
        code: "fail_to_fetch_task",
        message: JSON.stringify({ error: { type: "invalid_request_error", message: "json: cannot unmarshal string into Go struct field Alias.images of type []string" } }),
    });
    assert.equal(aiHubVideoFailureMessage("omni-fast", invalidImages), "多张参考图的参数格式不正确，请重新生成");
    assert.equal(
        aiHubVideoFailureMessage("omni-fast", "I can't generate the video you requested right now due to interests of third-party content providers."),
        "内容触发了视频模型的安全限制，请更换可识别真人、受保护角色或相关描述后重新生成",
    );
});
