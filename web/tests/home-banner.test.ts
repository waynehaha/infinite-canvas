import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const webRoot = new URL("../", import.meta.url);

test("首页 Banner 使用本地素材并展示能力说明", async () => {
    const page = await readFile(new URL("src/app/(user)/page.tsx", webRoot), "utf8");
    assert.doesNotMatch(page, /gcore\.jsdelivr\.net|tigerowo\/infinite-canvas@/);
    for (const [asset, title, description] of [
        ["agent.webp", "Agent 创作", "一句话启动完整创作流程"],
        ["panorama.webp", "全景空间", "生成可环视的 360° 场景"],
        ["3ddirector.webp", "3D 导演台", "设计镜头、机位和场景构图"],
    ]) {
        assert.match(page, new RegExp(`/banners/${asset.replace(".", "\\.")}`));
        assert.match(page, new RegExp(title));
        assert.match(page, new RegExp(description));
        assert.ok((await stat(new URL(`public/banners/${asset}`, webRoot))).size > 0);
    }
    assert.ok((await stat(new URL("public/banners/agent.webm", webRoot))).size > 0);
});
