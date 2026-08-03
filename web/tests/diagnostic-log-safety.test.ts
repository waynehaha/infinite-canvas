import assert from "node:assert/strict";
import test from "node:test";

import { diagnosticExportLooksSafe, sanitizeDiagnosticValue } from "../src/lib/diagnostic-log-safety.ts";

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

test("提示词默认不导出，明确选择后仍执行密钥扫描", () => {
    const hidden = sanitizeDiagnosticValue({ prompt: "私人提示词" }, false) as Record<string, unknown>;
    assert.equal(hidden.prompt, "[默认未导出]");

    const included = sanitizeDiagnosticValue({ prompt: "使用 sk-secret-value-1234567890" }, true) as Record<string, unknown>;
    assert.equal(String(included.prompt).includes("secret-value"), false);
});
