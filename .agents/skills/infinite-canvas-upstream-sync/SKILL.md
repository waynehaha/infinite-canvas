---
name: infinite-canvas-upstream-sync
description: Safely audit, compare, and integrate updates from tigerowo/infinite-canvas into waynehaha/infinite-canvas while preserving the project's AIHub channel, independent version line, local documentation boundaries, and user changes. Use whenever the user asks to inspect, pull, merge, synchronize, adopt, or evaluate upstream Infinite Canvas changes, including Chinese requests such as “检查上游更新”“拉取上游”“同步上游” or “合并上游代码”.
---

# Infinite Canvas 上游同步

安全吸收上游通用能力，同时保护本项目的 AIHub 渠道和本地业务定制。

## 1. 先确定授权范围

1. 完整读取仓库根目录的 `AGENTS.md` 和 `AGENTS.override.md`。
2. 区分“只检查上游”与“执行同步”：
   - 只检查时仅做只读分析；未经允许不要修改文件、创建分支或更新远端引用。
   - 执行同步属于需确认任务。先提交同步方案并等待用户回复 `1`，除非用户已经明确说“直接改”“不用确认”或同等授权。
3. 开始前定义完成标准：AIHub 行为保留、上游目标改动已吸收、测试通过、同步记录完整、没有自动提交或推送。

## 2. 同步前检查

在项目根目录检查：

```bash
git status --short --branch
git remote -v
git branch -vv
git check-ignore -v AGENTS.override.md 项目资源-project-resources
```

必须满足：

- `origin` 指向 `waynehaha/infinite-canvas`，`upstream` 指向 `tigerowo/infinite-canvas`；不一致时停止并报告，不擅自改远端。
- `upstream` 只用于获取更新，永远不向其推送；即使获得推送授权，也只能推送到 `origin`。
- `AGENTS.override.md` 与 `项目资源-project-resources/` 仍由 `.git/info/exclude` 忽略。
- 不回滚、覆盖、暂存或提交已有用户改动，不自动使用 `stash`。
- 工作区不干净时，优先从当前 `main` 提交创建独立 worktree；不要为了同步清理用户工作区。

获得执行授权后再运行：

```bash
git fetch --prune upstream
```

## 3. 审查上游变化

先找共同基础，再审查提交和文件，不直接在 `main` 上合并：

```bash
git merge-base main upstream/main
git log --oneline --decorate main..upstream/main
git diff --stat main...upstream/main
git diff --name-status main...upstream/main
```

按以下类别归纳上游变化：通用功能、修复、安全、依赖、数据结构、界面交互、发布配置、文档。明确哪些应吸收、哪些与本地定制重叠、哪些建议跳过。

## 4. 在隔离分支合并

- 使用 `codex/sync-upstream-YYYYMMDD` 命名临时分支；如重名，加简短序号。
- 工作区干净时可切换临时分支；工作区有用户改动时使用独立 worktree。
- 在临时分支执行 `git merge --no-commit --no-ff upstream/main`，保留提交前检查机会。
- 禁止在 `main` 上直接运行 `git pull upstream main`。
- 禁止对冲突文件整体使用 `ours`、`theirs`、批量覆盖或强制推送。

## 5. 识别两类冲突

### Git 冲突

只要出现冲突标记，立即停止自动处理，先向用户说明：

- 上游想改变什么；
- 本地当前行为及保留原因；
- 冲突位置和影响功能；
- 推荐保留本地、采用上游或融合双方；
- 推荐方案的验证方法。

等待用户确认后再解决，不自行猜测。

### AIHub 业务冲突

即使 Git 自动合并成功，出现以下任一情况也视为冲突并停止汇报：

- 新用户默认渠道不再是 `AIHub`，或 API Base 不再是 `https://aihubcc.cc/v1`；
- 用户需要填写 AIHub API Key 之外的渠道配置才能使用预置模型；
- AIHub 模型名称、默认模型、动态刷新、能力参数或素材限制被覆盖；
- 图片、视频、音频的 AIHub 请求字段、接口路径或响应适配被绕过；
- 视频公开任务编号、状态轮询、进度、结果地址或同源下载逻辑被破坏；
- 设置页、独立创作页或画布里的 AIHub 参数入口和有效控件被删除或替换；
- AIHub 专属适配器、路由、能力库、同步脚本或测试被删除、改名或失去调用链；
- `VERSION`、`CHANGELOG.md` 或发布标签被直接改成上游版本线；
- 内部资料被移入公开 `docs/`，或本地忽略边界失效。

重点审查但不要只依赖固定路径：

- `web/src/stores/use-config-store.ts`
- `web/src/lib/aihub-*.ts`
- `web/src/services/api/aihub/` 及图片、视频、音频公共适配层
- `web/src/components/*settings-panel.tsx`
- `web/src/app/(user)/canvas/`、图片页、视频页和 AIHub 路由
- `handler/canvas_task.go`、`config/config.go`
- AIHub 测试、能力库同步脚本、`VERSION`、`CHANGELOG.md`

保护的是实际行为，不是机械保留旧文件。上游重构可以吸收，但必须把 AIHub 能力迁移到新结构并验证。

## 6. 验证

本节明确覆盖 `AGENTS.md` 中“无需构建和测试”的通用规则。上游同步必须按实际影响验证，最低执行：

```bash
cd web
npm run capabilities:check
npm test
npm run build
cd ..
go test ./...
```

另外完成：

- 搜索默认渠道、API Base 和 AIHub 适配调用链，确认没有回退到上游默认渠道；
- 实际打开界面，检查配置入口、图片、视频、音频和画布的关键参数与交互；
- 检查 `git diff --check`、主要 diff、删除文件和新增依赖；
- 检查改动中没有 API Key、密码、SSH 信息或测试凭证；
- 默认只运行模拟或本地测试。真实 AIHub 请求可能计费，只有用户明确授权后才能执行，失败后不得自动重试。

任一必需验证失败时继续修复并重测；无法完成时说明阻碍和未验证风险，不得声称同步完成。

## 7. 记录和交付

- 更新 `项目资源-project-resources/文档-docs/开发文档-development/20260731-上游版本记录.md` 中的继承基础。
- 在同目录创建或更新带日期前缀的同步记录，写明上游起止提交、采用与跳过内容、冲突决定、验证结果和剩余风险。
- 检查 `docs/progress/todo.md` 与 `docs/progress/pending-test.md` 是否需要随实际产品变化更新。
- 汇报项目文件与本地忽略文件的 Git 状态时分开说明。
- 不自动提交、合入 `main`、打标签或推送。需要提交时提示用户回复 `2`；推送仍需用户明确授权，且只能推送到 `origin`。
