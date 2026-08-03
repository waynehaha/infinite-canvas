import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createDiagnosticRequestSnapshot, diagnosticExportLooksSafe, prepareDiagnosticValue, sanitizeDiagnosticValue } from "../src/lib/diagnostic-log-safety.ts";

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
    assert.doesNotMatch(modal, /Checkbox|includePrompt|默认不选/);
    assert.match(modal, /日志会包含本次任务的提示词正文/);
    assert.match(modal, /不会包含 API Key/);
    assert.match(modal, /不会自动上传/);
    assert.match(service, /createDiagnosticExport\(taskId: string\)/);
    assert.match(service, /sanitizeDiagnosticValue\(\{ \.\.\.task, prompt: task\.prompt \}, true\)/);
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
