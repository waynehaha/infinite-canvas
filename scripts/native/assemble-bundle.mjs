import { chmod, cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const options = parseArgs(process.argv.slice(2));
const target = required("target");
const output = resolve(required("output"));
const server = resolve(required("server"));
const launcher = resolve(required("launcher"));
const node = resolve(required("node"));
if (!new Set(["windows", "macos"]).has(target)) throw new Error(`Unsupported target: ${target}`);

await rm(output, { recursive: true, force: true });
await mkdir(join(output, "web", ".next"), { recursive: true });
await cp(join(root, "web", ".next", "standalone"), join(output, "web"), { recursive: true });
await cp(join(root, "web", ".next", "static"), join(output, "web", ".next", "static"), { recursive: true });
await cp(join(root, "web", "public"), join(output, "web", "public"), { recursive: true });
await cp(join(root, "VERSION"), join(output, "VERSION"));
await cp(join(root, "CHANGELOG.md"), join(output, "CHANGELOG.md"));
await cp(join(root, "LICENSE"), join(output, "LICENSE"));
await cp(join(root, "web", "src", "app", "favicon.ico"), join(output, "app.ico"));

if (target === "windows") {
    await cp(server, join(output, "server.exe"));
    await cp(launcher, join(output, "launcher.exe"));
    await mkdir(join(output, "runtime"), { recursive: true });
    await cp(node, join(output, "runtime", "node.exe"), { dereference: true });
} else {
    await cp(server, join(output, "server"));
    await cp(launcher, join(output, "launcher"));
    await mkdir(join(output, "runtime", "bin"), { recursive: true });
    await cp(node, join(output, "runtime", "bin", "node"), { dereference: true });
    await Promise.all(["server", "launcher", join("runtime", "bin", "node")].map((path) => chmod(join(output, path), 0o755)));
}

for (const path of [join(output, "web", "server.js"), join(output, "VERSION")]) {
    const info = await stat(path);
    if (!info.isFile()) throw new Error(`Bundle file is missing: ${path}`);
}
const version = (await readFile(join(output, "VERSION"), "utf8")).trim();
console.log(JSON.stringify({ output, target, version, node: basename(node) }));

function parseArgs(args) {
    const result = new Map();
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index]?.replace(/^--/, "");
        const value = args[index + 1];
        if (!key || !value) throw new Error(`Invalid arguments: ${args.join(" ")}`);
        result.set(key, value);
    }
    return result;
}

function required(name) {
    const value = options.get(name);
    if (!value) throw new Error(`Missing --${name}`);
    return value;
}
