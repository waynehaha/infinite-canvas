import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--test", "tests/aihub-live-smoke.test.ts"], {
    stdio: "inherit",
    env: { ...process.env, AIHUB_LIVE_TEST: "1" },
});

process.exit(result.status ?? 1);
