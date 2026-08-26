import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { registerHooks } from "node:module";

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
        return nextResolve(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    },
});

const { buildBuiltInAIHubServiceConfig } = await import("../src/lib/aihub-service-config.ts");
const output = resolve(process.argv[2] || "../dist/aihub-service-config.json");
const config = buildBuiltInAIHubServiceConfig();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(config, null, 2) + "\n", "utf8");
console.log(`已导出 ${config.models.length} 个模型到 ${output}`);
