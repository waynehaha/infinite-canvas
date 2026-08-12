import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const webRoot = process.cwd();
const registryPath = path.join(webRoot, "src/lib/aihub-model-capabilities.ts");
const modelsPath = path.join(webRoot, "src/lib/aihub-models.ts");
const documentPath = path.resolve(webRoot, "../项目资源-project-resources/文档-docs/开发文档-development/20260731-AIHub模型能力参数库.md");

const source = fs.readFileSync(registryPath, "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const runtimeModule = { exports: {} };
new Function("exports", "module", output)(runtimeModule.exports, runtimeModule);
const { AIHUB_MODEL_CAPABILITIES, AIHUB_CAPABILITY_SOURCE, AIHUB_CAPABILITY_VERIFIED_AT } = runtimeModule.exports;

validateRegistry(AIHUB_MODEL_CAPABILITIES);
validateDefaultModels(AIHUB_MODEL_CAPABILITIES, fs.readFileSync(modelsPath, "utf8"));

const markdown = renderDocument(AIHUB_MODEL_CAPABILITIES, AIHUB_CAPABILITY_SOURCE, AIHUB_CAPABILITY_VERIFIED_AT);
if (process.argv.includes("--write")) {
    fs.mkdirSync(path.dirname(documentPath), { recursive: true });
    fs.writeFileSync(documentPath, markdown);
    console.log(`已同步 ${documentPath}`);
} else if (fs.existsSync(documentPath)) {
    const current = fs.readFileSync(documentPath, "utf8");
    if (current !== markdown) throw new Error("AIHub 模型能力文档与代码版不一致，请运行 npm run capabilities:sync");
    console.log(`模型能力库检查通过，共 ${AIHUB_MODEL_CAPABILITIES.length} 个模型，文档已同步`);
} else {
    console.log(`模型能力库结构检查通过，共 ${AIHUB_MODEL_CAPABILITIES.length} 个模型；当前环境没有本地文档，已跳过文档比对`);
}

function validateRegistry(capabilities) {
    const names = new Set();
    for (const capability of capabilities) {
        const key = capability.model.toLowerCase();
        if (names.has(key)) throw new Error(`模型能力重复：${capability.model}`);
        names.add(key);
        if (!capability.source || !capability.verifiedAt || !capability.status) throw new Error(`模型缺少来源、核对日期或测试状态：${capability.model}`);
        for (const control of [capability.quality, capability.size, capability.aspectRatio, capability.duration]) {
            if (control?.mode === "select" && !control.options.some((option) => option.value === control.default)) throw new Error(`${capability.model} 的默认值 ${control.default} 不在可选项中`);
            if (control?.mode === "range" && (control.default < control.min || control.default > control.max)) throw new Error(`${capability.model} 的默认值超出范围`);
        }
    }
}

function validateDefaultModels(capabilities, modelsSource) {
    const registered = new Set(capabilities.map((item) => item.model.toLowerCase()));
    for (const section of ["image", "video", "audio"]) {
        const match = modelsSource.match(new RegExp(`${section}:\\s*\\[([\\s\\S]*?)\\](?:,|\\n\\})`));
        if (!match) throw new Error(`无法读取默认 ${section} 模型列表`);
        const models = [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
        const missing = models.filter((model) => !registered.has(model.toLowerCase()));
        if (missing.length) throw new Error(`默认 ${section} 模型缺少能力定义：${missing.join("、")}`);
    }
}

function renderDocument(capabilities, sourceUrl, verifiedAt) {
    const sections = [
        ["图片模型", capabilities.filter((item) => item.kind === "image")],
        ["视频模型", capabilities.filter((item) => item.kind === "video")],
        ["音频模型", capabilities.filter((item) => item.kind === "audio")],
    ];
    const lines = [
        "# AIHub 模型能力参数库",
        "",
        "> 本文档由 TypeScript 模型能力库生成。修改模型参数时先更新代码版，再运行 `npm run capabilities:sync`，不要手工维护本表。",
        "",
        `- 参数来源：${sourceUrl}`,
        `- 最后核对：${verifiedAt}`,
        "- 模型是否存在及名称：以 https://aihubcc.cc/pricing 实时展示为准",
        "- 状态说明：`verified` 已真实请求验证；`documented` 已按文档核对；`unverified` 尚无充分依据",
        "",
    ];
    for (const [title, items] of sections) {
        lines.push(`## ${title}`, "", "| 模型 | 状态 | 接口 | 可调参数 | 固定能力 | 参考素材 | 隐藏参数 |", "| --- | --- | --- | --- | --- | --- | --- |");
        for (const item of items) lines.push(`| \`${item.model}\` | ${item.status} | \`${item.endpoint}\` | ${adjustableText(item)} | ${join(item.fixedSummary)} | ${referenceText(item)} | ${join(item.hidden)} |`);
        lines.push("");
    }
    lines.push("## 维护规则", "", "1. 定价页确认模型是否存在及准确名称。", "2. 飞书文档确认接口、字段、默认值、取值范围和素材限制。", "3. 更新 TypeScript 代码版并运行同步命令。", "4. 运行 `npm run capabilities:check` 和项目构建。", "5. 真实调用验证后，才把状态改为 `verified`。", "");
    return lines.join("\n");
}

function adjustableText(item) {
    const values = [];
    if (item.promptLengthHint) values.push(`提示词参考上限：约 ${item.promptLengthHint} 字符（仅提醒，不拦截）`);
    if (item.promptMaxLength) values.push(`提示词上限：${item.promptMaxLength} 字符`);
    if (item.quality) values.push(`质量：${optionText(item.quality)}`);
    if (item.size) values.push(`画幅：${optionText(item.size)}`);
    if (item.aspectRatio) values.push(`${item.model.startsWith("grok-") ? "尺寸" : "比例"}：${optionText(item.aspectRatio)}`);
    if (item.resolution?.mode === "select") values.push(`清晰度：${optionText(item.resolution)}`);
    if (item.count?.max > 1) values.push(`数量：${item.count.min}–${item.count.max} ${item.count.unit}`);
    if (item.duration?.mode === "select") values.push(`时长：${optionText(item.duration)}`);
    if (item.duration?.mode === "range") values.push(`时长：${item.duration.min}–${item.duration.max} ${item.duration.unit}`);
    return values.length ? values.join("<br>") : "—";
}

function optionText(control) {
    return control.options.map((item) => `\`${item.value}\``).join("、");
}

function referenceText(item) {
    if (!item.references) return "—";
    const values = [];
    for (const [key, label] of [["images", "图片"], ["videos", "视频"], ["audios", "音频"]]) {
        const limit = item.references[key];
        if (!limit) continue;
        const required = limit.required ? `${limit.required}–` : "最多 ";
        const details = [];
        if (limit.maxBytes) details.push(`单个 ≤${Math.floor(limit.maxBytes / 1024 / 1024)}MB`);
        if (limit.maxTotalBytes) details.push(`合计 ≤${Math.floor(limit.maxTotalBytes / 1024 / 1024)}MB`);
        if (limit.minWidth || limit.minHeight) details.push(`最小 ${limit.minWidth || "—"}×${limit.minHeight || "—"}px`);
        if (limit.maxWidth || limit.maxHeight) details.push(`最大 ${limit.maxWidth || "—"}×${limit.maxHeight || "—"}px`);
        if (limit.maxLongEdge) details.push(`长边 ≤${limit.maxLongEdge}px`);
        if (limit.minDurationMs || limit.maxDurationMs) details.push(`单条 ${limit.minDurationMs ? limit.minDurationMs / 1000 : 0}–${limit.maxDurationMs ? limit.maxDurationMs / 1000 : "—"} 秒`);
        if (limit.maxTotalDurationMs) details.push(`总时长 ≤${limit.maxTotalDurationMs / 1000} 秒`);
        if (limit.maxByResolution) details.push(Object.entries(limit.maxByResolution).map(([resolution, max]) => `${resolution} 最多 ${max} 个`).join("，"));
        if (limit.localOnly) details.push("仅限本地上传");
        if (limit.note) details.push(limit.note);
        values.push(`${label}${required}${limit.max}${details.length ? `，${details.join("，")}` : ""}`);
    }
    if (item.references.frames?.mode === "pair") {
        const exclusiveLabels = item.references.frames.exclusiveWith?.map((kind) => ({ images: "普通参考图", videos: "参考视频", audios: "参考音频" })[kind]).join("、");
        values.push(`首尾帧必须成对${item.references.frames.exclusive ? "，且不能混用其他参考素材" : exclusiveLabels ? `，不能混用${exclusiveLabels}` : ""}`);
    }
    return values.length ? values.join("<br>") : "—";
}

function join(values) {
    return values?.length ? values.join("<br>") : "—";
}
