import assert from "node:assert/strict";
import test from "node:test";

import { registerHooks } from "node:module";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    },
});

const { applyAIHubModelCatalog, buildBuiltInAIHubModelCatalog, parseAIHubModelCatalog } = await import("../src/lib/aihub-model-catalog.ts");
const { clearAIHubRuntimeCapabilities, getAIHubVideoCapability } = await import("../src/lib/aihub-model-capabilities.ts");
const { aihubModelAdapter } = await import("../src/lib/aihub-models.ts");

test("内置模型配置可以导出并重新导入", () => {
    const catalog = buildBuiltInAIHubModelCatalog();
    const parsed = parseAIHubModelCatalog(JSON.stringify(catalog));
    assert.equal(parsed.schemaVersion, 1);
    assert.ok(parsed.models.some((entry) => entry.model === "grok-imagine-video-6s"));
});

test("模型配置拒绝密钥和重复模型", () => {
    const catalog = buildBuiltInAIHubModelCatalog();
    assert.throws(() => parseAIHubModelCatalog(JSON.stringify({ ...catalog, apiKey: "secret" })), /密钥/);
    const duplicate = { ...catalog, models: [...catalog.models, catalog.models[0]] };
    assert.throws(() => parseAIHubModelCatalog(JSON.stringify(duplicate)), /模型重复/);
});

test("导入配置后运行时能力和适配器立即生效", () => {
    const catalog = buildBuiltInAIHubModelCatalog();
    const grok = catalog.models.find((entry) => entry.model === "grok-imagine-video-6s");
    assert.ok(grok?.capability);
    const custom = {
        ...catalog,
        models: [...catalog.models, { ...grok, model: "grok-imagine-video-2", capability: { ...grok.capability, model: "grok-imagine-video-2" } }],
    };
    applyAIHubModelCatalog(parseAIHubModelCatalog(JSON.stringify(custom)), false);
    assert.equal(getAIHubVideoCapability("grok-imagine-video-2")?.model, "grok-imagine-video-2");
    assert.equal(aihubModelAdapter("grok-imagine-video-2"), "video-grok-fixed");
    clearAIHubRuntimeCapabilities();
});
