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
const { buildAIHubConfiguredRequestBody, clearAIHubRuntimeRequestProfiles, getAIHubRequestProfile, readAIHubTaskProgress } = await import("../src/lib/aihub-request-profile.ts");

test("内置模型配置可以导出并重新导入", () => {
    const catalog = buildBuiltInAIHubModelCatalog();
    const parsed = parseAIHubModelCatalog(JSON.stringify(catalog));
    assert.equal(parsed.schemaVersion, 1);
    assert.ok(parsed.models.some((entry) => entry.model === "grok-imagine-video-6s"));
    assert.equal(parsed.models.find((entry) => entry.model === "Doubao-Seedance-2.0-mini-480p")?.requestProfile, "seedance-2.0-direct");
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
    clearAIHubRuntimeRequestProfiles();
});

test("在线配置可以修改请求字段类型且拒绝不安全协议", () => {
    const catalog = buildBuiltInAIHubModelCatalog();
    const custom = {
        ...catalog,
        requestProfiles: {
            ...catalog.requestProfiles,
            "seedance-2.0-direct": {
                ...catalog.requestProfiles["seedance-2.0-direct"],
                create: {
                    ...catalog.requestProfiles["seedance-2.0-direct"].create,
                    fields: catalog.requestProfiles["seedance-2.0-direct"].create.fields.map((field) => (field.source === "seconds" ? { ...field, type: "number" } : field)),
                },
            },
        },
    };
    applyAIHubModelCatalog(parseAIHubModelCatalog(JSON.stringify(custom)), false);
    assert.equal(getAIHubRequestProfile("Doubao-Seedance-2.0-mini-480p")?.create.fields.find((field) => field.source === "seconds")?.type, "number");
    assert.throws(() => parseAIHubModelCatalog(JSON.stringify({ ...custom, requestProfiles: { bad: { ...custom.requestProfiles["seedance-2.0-direct"], create: { ...custom.requestProfiles["seedance-2.0-direct"].create, endpoint: "https://evil.example.com/videos" } } } })), /接口地址无效/);
    clearAIHubRuntimeRequestProfiles();
});

test("在线配置支持条件字段、嵌套进度和未知进度", () => {
    const profile = buildBuiltInAIHubModelCatalog().requestProfiles["seedance-2.0-direct"];
    const body = buildAIHubConfiguredRequestBody(profile, { model: "demo", prompt: "test", seconds: 4, aspectRatio: "16:9", references: ["https://example.com/a.png"] });
    assert.equal(body.seconds, "4");
    assert.equal(body.image_url, "https://example.com/a.png");
    assert.equal(readAIHubTaskProgress(profile.task, { data: { progress: 0 } }, "processing"), undefined);
    assert.equal(readAIHubTaskProgress(profile.task, { data: { progress: 37 } }, "processing"), 37);
    assert.equal(readAIHubTaskProgress(profile.task, { progress: 0 }, "completed"), 100);
    assert.equal(readAIHubTaskProgress(profile.task, {}, "completed"), 100);
});

test("在线配置拒绝脚本、外部接口和危险字段路径", () => {
    const catalog = buildBuiltInAIHubModelCatalog();
    const profile = catalog.requestProfiles["seedance-2.0-direct"];
    assert.throws(() => parseAIHubModelCatalog(JSON.stringify({ ...catalog, requestProfiles: { bad: { ...profile, create: { ...profile.create, endpoint: "https://evil.example.com/videos" } } } })), /接口地址无效/);
    assert.throws(() => parseAIHubModelCatalog(JSON.stringify({ ...catalog, requestProfiles: { bad: { ...profile, create: { ...profile.create, fields: [{ source: "prompt", target: "__proto__.polluted", type: "string" }] } } } })), /字段路径无效/);
    assert.throws(() => parseAIHubModelCatalog(JSON.stringify({ ...catalog, requestProfiles: { bad: { ...profile, script: "fetch('https://evil.example.com')" } } })), /请求协议|无效/);
});
