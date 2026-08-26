import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    },
});

const { buildBuiltInAIHubServiceConfig } = await import("../src/lib/aihub-service-config.ts");
const { applyAIHubRemoteServiceConfig, AIHUB_REMOTE_MANIFEST_URL } = await import("../src/lib/aihub-remote-config.ts");
const { defaultConfig } = await import("../src/stores/use-config-store.ts");

test("远程配置使用产品无关的 AIHubCC 模型目录入口", () => {
    assert.equal(AIHUB_REMOTE_MANIFEST_URL, "https://aihubcc-config.pages.dev/v1/model-catalog/manifest.json");
});

test("远程配置按用户 Key 可见模型筛选并保留有效选择", () => {
    const config = buildBuiltInAIHubServiceConfig();
    const visible = new Set(["gpt-image-2", "omni-fast", "gemini-3-flash", "gemini-music"]);
    const patch = applyAIHubRemoteServiceConfig({ ...defaultConfig, imageModel: "gpt-image-2", videoModel: "omni-fast", textModel: "gemini-3-flash", audioModel: "gemini-music" }, config, visible);
    assert.deepEqual(patch.models, ["gemini-3-flash", "gpt-image-2", "omni-fast", "gemini-music"]);
    assert.equal(patch.imageModel, "gpt-image-2");
    assert.equal(patch.videoModel, "omni-fast");
    assert.equal(patch.localChannels?.[0]?.models.length, 4);
});

test("远程配置不会因为模型下架保留失效默认项", () => {
    const config = buildBuiltInAIHubServiceConfig();
    const visible = new Set(["doubao-seedream-5-0", "grok-imagine-video-6s", "gemini-3.7-flash-high", "gemini-music"]);
    const patch = applyAIHubRemoteServiceConfig(defaultConfig, config, visible);
    assert.equal(patch.imageModel, "doubao-seedream-5-0");
    assert.equal(patch.videoModel, "grok-imagine-video-6s");
    assert.equal(patch.textModel, "gemini-3.7-flash-high");
});
