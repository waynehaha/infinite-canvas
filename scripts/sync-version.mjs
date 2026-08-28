import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const versionText = (await readFile(resolve(root, "VERSION"), "utf8")).trim();
const match = versionText.match(/^v(\d+\.\d+\.\d+)$/);
if (!match) throw new Error("VERSION 格式错误，应为 v0.0.0");

const version = match[1];
const packagePath = resolve(root, "web/package.json");
const readmePath = resolve(root, "README.md");
const changelogPath = resolve(root, "CHANGELOG.md");
let packageText = await readFile(packagePath, "utf8");
let readmeText = await readFile(readmePath, "utf8");

if (write) {
    packageText = replaceRequired(packageText, /("version"\s*:\s*")[^"]+("\s*,)/, `$1${version}$2`, "web/package.json 版本号");
    readmeText = replaceRequired(readmeText, /(img\.shields\.io\/badge\/version-)v?\d+\.\d+\.\d+(-2563eb)/, `$1v${version}$2`, "README 版本徽章");
    await Promise.all([writeFile(packagePath, packageText), writeFile(readmePath, readmeText)]);
}

const packageVersion = packageText.match(/"version"\s*:\s*"([^"]+)"/)?.[1];
const readmeVersion = readmeText.match(/img\.shields\.io\/badge\/version-(v?\d+\.\d+\.\d+)-2563eb/)?.[1];
const changelogText = await readFile(changelogPath, "utf8");
const changelogVersion = changelogText.match(/^## (v\d+\.\d+\.\d+) - \d{4}-\d{2}-\d{2}$/m)?.[1];
const mismatches = [
    packageVersion === version ? "" : `web/package.json=${packageVersion || "未找到"}`,
    readmeVersion === versionText ? "" : `README=${readmeVersion || "未找到"}`,
    changelogVersion === versionText ? "" : `CHANGELOG=${changelogVersion || "未找到"}`,
].filter(Boolean);

if (mismatches.length) throw new Error(`版本号不一致：VERSION=${versionText}；${mismatches.join("；")}。请运行 npm run version:sync`);
console.log(`版本号检查通过：${versionText}`);

function replaceRequired(source, pattern, replacement, label) {
    if (!pattern.test(source)) throw new Error(`找不到${label}`);
    return source.replace(pattern, replacement);
}
