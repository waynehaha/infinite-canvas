import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Windows PowerShell 启动脚本保留 UTF-8 BOM", async () => {
    const bytes = await readFile(new URL("../../scripts/desktop/windows-launcher.ps1", import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.match(new TextDecoder().decode(bytes), /^param\(/);
});
