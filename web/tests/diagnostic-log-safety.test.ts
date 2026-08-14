import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createDiagnosticRequestSnapshot, diagnosticExportLooksSafe, prepareDiagnosticValue, sanitizeDiagnosticReferenceUrl, sanitizeDiagnosticValue } from "../src/lib/diagnostic-log-safety.ts";

test("诊断日志隐藏密钥、鉴权信息和素材内容", () => {
    const sanitized = sanitizeDiagnosticValue(
        {
            apiKey: "sk-this-is-a-secret-key-123456",
            Authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
            request: { image: "data:image/png;base64," + "A".repeat(800) },
            url: "https://example.com/media.png?signature=private-value",
            error: "provider echoed api_key=arbitrarySecretValue123456",
        },
        false,
    );
    const text = JSON.stringify(sanitized);
    assert.equal(text.includes("this-is-a-secret"), false);
    assert.equal(text.includes("abcdefghijklmnopqrstuvwxyz"), false);
    assert.equal(text.includes("signature=private-value"), false);
    assert.equal(text.includes("A".repeat(100)), false);
    assert.equal(text.includes("arbitrarySecretValue"), false);
    assert.equal(diagnosticExportLooksSafe(text), true);
});

test("提示词可在存储态隐藏，导出正文时仍执行密钥扫描", () => {
    const hidden = sanitizeDiagnosticValue({ prompt: "私人提示词" }, false) as Record<string, unknown>;
    assert.deepEqual(hidden.prompt, { included: false, characterCount: 5, utf8Bytes: 15, text: "[默认未导出]" });

    const included = sanitizeDiagnosticValue({ prompt: "使用 sk-secret-value-1234567890" }, true) as Record<string, unknown>;
    assert.equal(String(included.prompt).includes("secret-value"), false);
});

test("诊断导出固定包含提示词并在界面明确说明安全范围", async () => {
    const webRoot = new URL("../", import.meta.url);
    const modal = await readFile(new URL("src/components/layout/diagnostic-log-modal.tsx", webRoot), "utf8");
    const service = await readFile(new URL("src/services/diagnostic-log.ts", webRoot), "utf8");
    assert.doesNotMatch(modal, /includePrompt|默认不选/);
    assert.match(modal, /本次任务的提示词正文/);
    assert.match(modal, /本地参考图原文件、原文件名及图片元数据/);
    assert.match(modal, /公网参考图只记录链接/);
    assert.match(modal, /不会额外写入 API Key/);
    assert.match(modal, /不会自动上传/);
    assert.match(modal, /useState\(true\)/);
    assert.match(modal, /下次不再提醒/);
    assert.match(modal, /DIAGNOSTIC_EXPORT_NOTICE_KEY/);
    assert.match(service, /createDiagnosticExport\(taskId: string\)/);
    assert.match(service, /sanitizeDiagnosticValue\(\{ \.\.\.task, prompt: task\.prompt \}, true\)/);
});

test("参考图诊断记录尺寸并区分本地原文件与公网链接", async () => {
    const webRoot = new URL("../", import.meta.url);
    const service = await readFile(new URL("src/services/diagnostic-log.ts", webRoot), "utf8");
    assert.match(service, /DiagnosticReferenceItemSummary/);
    assert.match(service, /width\?: number/);
    assert.match(service, /height\?: number/);
    assert.match(service, /includedInRequest/);
    assert.match(service, /exportType: "original-file"/);
    assert.match(service, /exportType: "public-url"/);
    assert.match(service, /参考素材\/素材信息\.json/);
    assert.match(service, /getImageBlob/);
});

test("公网参考图链接保留普通参数并隐藏鉴权参数", () => {
    const sanitized = sanitizeDiagnosticReferenceUrl("https://cdn.example.com/reference.png?w=1600&signature=private-signature&token=secret-token#preview");
    assert.match(sanitized, /w=1600/);
    assert.doesNotMatch(sanitized, /signature|private-signature|token|secret-token|preview/);
    assert.equal(diagnosticExportLooksSafe(sanitized), true);
});

test("生图与视频工作台在结果标题旁接入独立诊断范围", async () => {
    const webRoot = new URL("../", import.meta.url);
    const imagePage = await readFile(new URL("src/app/(user)/image/page.tsx", webRoot), "utf8");
    const videoPage = await readFile(new URL("src/app/(user)/video/page.tsx", webRoot), "utf8");
    const diagnosticService = await readFile(new URL("src/services/diagnostic-log.ts", webRoot), "utf8");
    assert.match(imagePage, /<WorkbenchDiagnosticLogButton scopeId="image-workbench" scopeTitle="生图工作台" \/>/);
    assert.match(videoPage, /<WorkbenchDiagnosticLogButton scopeId="video-workbench" scopeTitle="视频创作台" \/>/);
    assert.match(imagePage, /scopeType: "image-workbench"/);
    assert.match(videoPage, /scopeType: "video-workbench"/);
    assert.match(imagePage, /diagnosticTaskId: pendingLog\.diagnosticTaskId/);
    assert.match(videoPage, /diagnosticTaskId: pendingLog\.diagnosticTaskId/);
    assert.match(diagnosticService, /diagnosticTaskScope\(task\)\.id === scopeId/);
});

test("三个日志入口不显示异常红点", async () => {
    const webRoot = new URL("../", import.meta.url);
    const modal = await readFile(new URL("src/components/layout/diagnostic-log-modal.tsx", webRoot), "utf8");
    const canvas = await readFile(new URL("src/app/(user)/canvas/[id]/canvas-client-page.tsx", webRoot), "utf8");
    const userStatus = await readFile(new URL("src/components/layout/user-status-actions.tsx", webRoot), "utf8");
    assert.doesNotMatch(modal, /Badge|attention/);
    assert.doesNotMatch(canvas, /diagnosticAttention/);
    assert.doesNotMatch(userStatus, /diagnosticAttention|最近任务失败/);
});

test("生图工作台记录结果不可显示异常并支持历史补充日志", async () => {
    const webRoot = new URL("../", import.meta.url);
    const imagePage = await readFile(new URL("src/app/(user)/image/page.tsx", webRoot), "utf8");
    const diagnosticService = await readFile(new URL("src/services/diagnostic-log.ts", webRoot), "utf8");
    assert.match(imagePage, /diagnosticTaskId: log\.diagnosticTaskId/);
    assert.match(imagePage, /availabilityIssue/);
    assert.match(imagePage, /ensureReconstructedDiagnosticTask/);
    assert.match(imagePage, /dedupeKey: `image-availability:/);
    assert.match(diagnosticService, /历史补充日志/);
    assert.match(diagnosticService, /reconstructed: true/);
});

test("画布图片重试会立即接收已返回结果并结束诊断任务", async () => {
    const webRoot = new URL("../", import.meta.url);
    const canvas = await readFile(new URL("src/app/(user)/canvas/[id]/canvas-client-page.tsx", webRoot), "utf8");
    assert.match(canvas, /const hasImageResult = Boolean\(task\.image_url \|\| task\.url\)/);
    assert.match(canvas, /图片重试结果已写入画布/);
    assert.match(canvas, /finishDiagnosticTask\(retryDiagnosticTaskId, "success", "图片重试结果已显示在画布中"\)/);
    assert.match(canvas, /图片重试完成但没有返回结果/);
});

test("安全说明只用黄色强调标题并使用中性容器", async () => {
    const webRoot = new URL("../", import.meta.url);
    const modal = await readFile(new URL("src/components/layout/diagnostic-log-modal.tsx", webRoot), "utf8");
    assert.match(modal, /text-amber-500 dark:text-amber-400/);
    assert.match(modal, /font-medium text-amber-600 dark:text-amber-400/);
    assert.match(modal, /border-stone-200 bg-stone-50\/80/);
    assert.match(modal, /text-stone-600 dark:text-stone-400/);
});

test("请求体保留完整参数结构并按开关处理提示词", () => {
    const snapshot = createDiagnosticRequestSnapshot({
        model: "gpt-image-2",
        size: "1024x1024",
        quality: "high",
        n: 1,
        prompt: "生成一朵玫瑰花🌹",
        apiKey: "sk-this-must-never-export-123456",
        extra_body: { image: ["data:image/png;base64," + "A".repeat(800)] },
    });
    const stored = prepareDiagnosticValue({ request: snapshot });
    const hidden = sanitizeDiagnosticValue(stored, false) as { request: { body: Record<string, unknown> } };
    assert.equal(hidden.request.body.model, "gpt-image-2");
    assert.equal(hidden.request.body.size, "1024x1024");
    assert.equal(hidden.request.body.quality, "high");
    assert.equal(hidden.request.body.apiKey, "[已隐藏]");
    assert.equal(JSON.stringify(hidden).includes("生成一朵玫瑰花"), false);
    assert.equal(JSON.stringify(hidden).includes("A".repeat(100)), false);
    assert.match(JSON.stringify(hidden.request.body.prompt), /characterCount/);

    const included = sanitizeDiagnosticValue(stored, true);
    assert.equal(JSON.stringify(included).includes("生成一朵玫瑰花"), true);
    assert.equal(diagnosticExportLooksSafe(included), true);
});

test("表单请求保留参数并只记录素材文件概况", () => {
    const body = new FormData();
    body.set("model", "gpt-image-2");
    body.set("prompt", "参考图生图");
    body.set("quality", "medium");
    body.set("image", "data:image/png;base64," + "B".repeat(800));
    const hidden = sanitizeDiagnosticValue(prepareDiagnosticValue(createDiagnosticRequestSnapshot(body)), false);
    const text = JSON.stringify(hidden);
    assert.equal(text.includes("gpt-image-2"), true);
    assert.equal(text.includes("medium"), true);
    assert.equal(text.includes("参考图生图"), false);
    assert.equal(text.includes("B".repeat(100)), false);
    assert.equal(diagnosticExportLooksSafe(text), true);
});
