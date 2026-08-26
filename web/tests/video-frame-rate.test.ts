import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { frameRateMetadataFromSamples } from "../src/lib/video-frame-rate.ts";

test("恒定帧率计算支持常见整数和小数 FPS", () => {
    assert.deepEqual(frameRateMetadataFromSamples(Array(40).fill(500), 10000), {
        frameRate: 20,
        minFrameRate: 20,
        maxFrameRate: 20,
        frameRateMode: "constant",
        frameCount: 40,
        frameRateStatus: "measured",
    });
    assert.equal(frameRateMetadataFromSamples(Array(60).fill(1001), 30000).frameRate, 29.97);
    assert.equal(frameRateMetadataFromSamples(Array(120).fill(1000), 60000).frameRate, 60);
});

test("可变帧率会记录平均值、范围和模式", () => {
    const metadata = frameRateMetadataFromSamples([...Array(30).fill(1000), ...Array(30).fill(800)], 24000);
    assert.equal(metadata.frameRate, 26.667);
    assert.equal(metadata.minFrameRate, 24);
    assert.equal(metadata.maxFrameRate, 30);
    assert.equal(metadata.frameRateMode, "variable");
    assert.equal(metadata.frameCount, 60);
});

test("无有效帧信息时明确标记读取失败", () => {
    assert.deepEqual(frameRateMetadataFromSamples([], 1000), { frameRateStatus: "failed" });
    assert.deepEqual(frameRateMetadataFromSamples([40], 0), { frameRateStatus: "failed" });
});

test("视频上传使用后台线程并将 FPS 写入诊断日志", async () => {
    const webRoot = new URL("../", import.meta.url);
    const storage = await readFile(new URL("src/services/file-storage.ts", webRoot), "utf8");
    const worker = await readFile(new URL("src/workers/video-frame-rate-worker.ts", webRoot), "utf8");
    const diagnostic = await readFile(new URL("src/services/diagnostic-log.ts", webRoot), "utf8");
    assert.match(storage, /new Worker\(new URL\("\.\.\/workers\/video-frame-rate-worker\.ts"/);
    assert.match(worker, /analyzeVideoFrameRate/);
    assert.match(diagnostic, /平均 \$\{item\.frameRate\} FPS/);
    assert.match(diagnostic, /frameRateMode/);
    assert.match(diagnostic, /frameRateStatus/);
});
