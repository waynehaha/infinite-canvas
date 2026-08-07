import assert from "node:assert/strict";
import test from "node:test";

import { registerHooks } from "node:module";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    },
});

const { buildBuiltInAIHubServiceConfig, diffAIHubServiceConfig, parseAIHubServiceConfig } = await import("../src/lib/aihub-service-config.ts");
const { buildBuiltInAIHubModelCatalog } = await import("../src/lib/aihub-model-catalog.ts");

test("AIHub 服务配置包覆盖服务、模型和默认绑定", () => {
    const config = buildBuiltInAIHubServiceConfig();
    const parsed = parseAIHubServiceConfig(JSON.stringify(config));
    assert.equal(parsed.service.providerId, "aihub");
    assert.equal(parsed.service.baseUrl, "https://aihubcc.cc/v1");
    assert.ok(parsed.models.some((entry) => entry.model === parsed.defaults.video));
});

test("旧模型目录可以兼容导入且保留当前服务设置", () => {
    const catalog = buildBuiltInAIHubModelCatalog();
    const parsed = parseAIHubServiceConfig(JSON.stringify(catalog), {
        baseUrl: "https://example.com/v1",
        defaults: { image: "gpt-image-2", video: "omni-fast", text: "gemini-3.5-flash", audio: "gemini-music" },
    });
    assert.equal(parsed.service.baseUrl, "https://example.com/v1");
    assert.equal(parsed.defaults.video, "omni-fast");
});

test("服务配置拒绝密钥和不安全地址", () => {
    const config = buildBuiltInAIHubServiceConfig();
    assert.throws(() => parseAIHubServiceConfig(JSON.stringify({ ...config, apiKey: "secret" })), /密钥/);
    assert.throws(() => parseAIHubServiceConfig(JSON.stringify({ ...config, service: { ...config.service, baseUrl: "http://example.com/v1" } })), /HTTPS/);
});

test("服务配置差异统计模型与 Base URL 变化", () => {
    const current = buildBuiltInAIHubServiceConfig();
    const next = {
        ...current,
        service: { ...current.service, baseUrl: "https://new.example.com/v1" },
        models: [...current.models, { model: "custom-video", kind: "video", enabled: true, adapter: "video-generic", capability: current.models.find((entry) => entry.kind === "video")?.capability }],
    };
    const diff = diffAIHubServiceConfig(current, next);
    assert.equal(diff.added, 1);
    assert.equal(diff.baseUrlChanged, true);
});
