import assert from "node:assert/strict";
import test from "node:test";

import { mergeWithoutOverwrite } from "../src/services/desktop-data-protection.ts";

test("恢复时保留目标值并补充缺失字段", () => {
    assert.deepEqual(mergeWithoutOverwrite({ config: { apiKey: "current", model: "current-model" }, layout: "current" }, { config: { apiKey: "backup", baseUrl: "https://example.com" }, layout: "backup" }), {
        config: { apiKey: "current", model: "current-model", baseUrl: "https://example.com" },
        layout: "current",
    });
});

test("相同 ID 且内容相同的数据不会重复", () => {
    const project = { id: "project-1", title: "画布", nodes: [] };
    assert.deepEqual(mergeWithoutOverwrite([project], [project]), [project]);
});

test("相同 ID 但内容不同的数据保留为恢复副本", () => {
    const merged = mergeWithoutOverwrite([{ id: "project-1", title: "当前画布", nodes: [1] }], [{ id: "project-1", title: "旧画布", nodes: [2] }]) as Array<{ id: string; title: string; nodes: number[] }>;
    assert.equal(merged.length, 2);
    assert.deepEqual(merged[0], { id: "project-1", title: "当前画布", nodes: [1] });
    assert.notEqual(merged[1].id, "project-1");
    assert.equal(merged[1].title, "旧画布（恢复副本）");
    assert.deepEqual(merged[1].nodes, [2]);
});

test("无 ID 列表只补充不重复的值", () => {
    assert.deepEqual(mergeWithoutOverwrite(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
});
