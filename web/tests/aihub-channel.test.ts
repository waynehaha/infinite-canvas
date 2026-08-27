import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    },
});

const { AIHUB_BASE_URL, AIHUB_DEFAULT_MODELS } = await import("../src/lib/aihub-models.ts");
const { buildApiUrl, channelIdForActiveModel, defaultConfig, isAIHubConfig, localChannelForActiveModel, normalizeLocalChannels } = await import("../src/stores/use-config-store.ts");

test("新用户默认使用 AIHub 且不预置通用编程 GPT 模型", () => {
    assert.equal(defaultConfig.channelMode, "local");
    assert.equal(defaultConfig.baseUrl, "https://aihubcc.cc/v1");
    assert.equal(defaultConfig.localChannels[0]?.id, "aihub");
    assert.equal(defaultConfig.localChannels[0]?.name, "AIHub");
    assert.equal(defaultConfig.localChannels[0]?.apiKey, "");
    assert.deepEqual(defaultConfig.localChannels[0]?.models, AIHUB_DEFAULT_MODELS);
    for (const model of ["gpt-5-5", "gpt-5-3", "gpt-5-3-mini", "gpt-5-2"]) assert.equal(AIHUB_DEFAULT_MODELS.includes(model), false);
});

test("空的旧配置会升级为 AIHub 默认渠道", () => {
    assert.deepEqual(normalizeLocalChannels({ baseUrl: "https://api.openai.com", apiKey: "", models: [] }), [{ id: "aihub", name: "AIHub", baseUrl: AIHUB_BASE_URL, apiKey: "", models: AIHUB_DEFAULT_MODELS }]);
});

test("AIHub 旧地址会自动恢复为标准接口地址", () => {
    const [channel] = normalizeLocalChannels({ localChannels: [{ id: "aihub", name: "AIHub", baseUrl: "https://aihubcc.cc", apiKey: "secret-placeholder", models: ["omni-fast"] }] });
    assert.equal(channel.baseUrl, AIHUB_BASE_URL);
    assert.equal(channel.apiKey, "secret-placeholder");
});

test("旧 AIHub 默认列表会升级且保留用户 Key", () => {
    const legacyModels = ["gemini-3.5-flash", "gemini-3.1-pro", "gemini-3.1-flash-lite", "gpt-image-2", "gpt-image-2-1k", "grok-imagine-image", "omni-fast", "grok-imagine-video", "grok-imagine-video-1.5-preview"];
    const [channel] = normalizeLocalChannels({ localChannels: [{ id: "aihub", name: "AIHub", baseUrl: AIHUB_BASE_URL, apiKey: "secret-placeholder", models: legacyModels }] });
    assert.equal(channel.apiKey, "secret-placeholder");
    assert.deepEqual(channel.models, AIHUB_DEFAULT_MODELS);
});

test("上一版 35 个 AIHub 默认模型会升级为在线模型目录", () => {
    const previousModels = [
        "gemini-3.5-flash", "gemini-3.1-pro", "gemini-3.1-flash-lite", "claude-sonnet-4-6", "claude-opus-4-6-thinking", "gemini-3.6-flash-high", "gemini-3.1-pro-low", "gemini-3-flash", "gemini-2.0-flash-thinking",
        "gpt-image-2", "gpt-image-2-1k", "gpt-image-2-2k", "gpt-image-2-3.5k", "gemini-image", "gemini-image-pro", "gemini-3.1-flash-image-4k",
        "omni-fast", "omni-fast-no-water", "omni-fast-v2v", "omni-fast-v2v-no-water", "grok-imagine-video", "grok-imagine-video-1.5", "minimax-h3", "minimax-h3-768p", "minimax-h3-2k", "minimax-h3-pro-768p", "minimax-h3-pro-2k", "Seedance-2.0-mini-480p", "Seedance-2.0-fast-480p", "Seedance-2.0-480p", "Seedance-2.0-mini-720p", "Seedance-2.0-fast-720p", "Seedance-2.0-720p", "veo-clean", "gemini-music",
    ];
    assert.equal(previousModels.length, 35);
    const [channel] = normalizeLocalChannels({ localChannels: [{ id: "aihub", name: "AIHub", baseUrl: AIHUB_BASE_URL, apiKey: "", models: previousModels }] });
    assert.deepEqual(channel.models, AIHUB_DEFAULT_MODELS);
});

test("用户自定义的 AIHub 模型列表不会被覆盖", () => {
    const custom = ["my-private-model"];
    const [channel] = normalizeLocalChannels({ localChannels: [{ id: "aihub", name: "AIHub", baseUrl: AIHUB_BASE_URL, apiKey: "", models: custom }] });
    assert.deepEqual(channel.models, custom);
});

test("不同能力会选择各自配置的渠道", () => {
    const config = { ...defaultConfig, model: defaultConfig.videoModel, activeChannelId: "fallback", videoChannelId: "video-channel" };
    assert.equal(channelIdForActiveModel(config), "video-channel");
});

test("模型所属渠道优先于无关的当前渠道", () => {
    const config = {
        ...defaultConfig,
        model: "private-image",
        imageModel: "private-image",
        imageChannelId: "missing",
        localChannels: [
            { id: "other", name: "其他", baseUrl: "https://other.example/v1", apiKey: "", models: ["other-model"] },
            { id: "private", name: "自定义", baseUrl: "https://private.example/v1", apiKey: "", models: ["private-image"] },
        ],
    };
    assert.equal(localChannelForActiveModel(config)?.id, "private");
});

test("AIHub 识别同时支持渠道 ID、名称和 Base URL", () => {
    assert.equal(isAIHubConfig(defaultConfig), true);
    const custom = {
        ...defaultConfig,
        model: "custom-model",
        localChannels: [{ id: "custom", name: "自定义", baseUrl: "https://example.com/v1", apiKey: "", models: ["custom-model"] }],
        textChannelId: "custom",
    };
    assert.equal(isAIHubConfig(custom), false);
});

test("API 地址不会重复追加版本路径", () => {
    assert.equal(buildApiUrl("https://aihubcc.cc/v1/", "/models"), "https://aihubcc.cc/v1/models");
    assert.equal(buildApiUrl("https://example.com", "/models"), "https://example.com/v1/models");
});
