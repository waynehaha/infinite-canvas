<p align="center">
  <img src="web/public/logo.svg" width="96" alt="infinite-canvas logo">
</p>

<h1 align="center">无限画布 (infinite-canvas)</h1>

<p align="center">
  <a href="https://github.com/waynehaha/infinite-canvas"><img src="https://img.shields.io/github/stars/waynehaha/infinite-canvas?style=flat-square&logo=github" alt="GitHub stars"></a>
  <a href="VERSION"><img src="https://img.shields.io/badge/version-v0.3.8-2563eb?style=flat-square" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-f97316?style=flat-square" alt="License"></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-ready-2496ed?style=flat-square&logo=docker&logoColor=white" alt="Docker ready"></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-16.2-000000?style=flat-square&logo=nextdotjs" alt="Next.js"></a>
  <a href="https://go.dev/"><img src="https://img.shields.io/badge/Go-1.25-00add8?style=flat-square&logo=go&logoColor=white" alt="Go"></a>
</p>

无限画布是一款面向图片，视频，音频，全能创作的开源工作台。它把画布编排、AI 图片、视频、音频生成、参考图编辑、对话助手、提示词库和素材沉淀放在同一个界面里，适合用来探索视觉方案并连续迭代图片结果

全量支持 APIMart 所有图片，视频模型，直接添加 APIMart Key 以及 URL 即可直接使用

APIMart 点此链接 [https://apimart.ai/register?aff=fWMrEv](https://apimart.ai/register?aff=fWMrEv) 注册后充值有积分奖励（支持主流 LLM，音频模型，视频模型）

本项目基于 [tigerowo/infinite-canvas](https://github.com/tigerowo/infinite-canvas) 持续开发，并保留其上游来源说明。上游项目基于 [basketikun(纯前端)](https://github.com/basketikun/infinite-canvas) 为底，合并 [HuFakai](https://github.com/HuFakai/infinite-canvas) 生图增强版基础上，针对视频和视频生成逻辑配置更加完善，完善后端云同步机制，不再依赖纯前端。

> [!CAUTION]
> 项目目前处于开发阶段，不保证历史数据兼容。各种数据库结构和存储格式都可能直接调整，欢迎关注后续更新
>
> 如果你需要稳定维护自己的分支，建议自行 fork 后独立开发。二次开发与 PR 请保留原作者信息和前端页面标识

## 核心功能

- 全景图：支持文字生成、参考图生成和本地 2:1 全景图导入，可作为导演台的场景环境背景
- 导演台：在独立 3D 场景中布置角色、模型、全景环境和机位，支持镜头管理、截图，并将机位画面自动发送为连线图片节点
- 摄像机控制：图片、视频和生成配置节点支持独立设置相机、镜头、焦距和光圈，将镜头参数自动写入生成提示词，并随节点保存和复制
- 无限画布：多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出
- AI 创作：支持 OpenAI 兼容接口的 Images API、Responses API、图生图、参考图编辑、流式接收、Base64 图片返回；Seedance 2.0 可通过火山方舟 Agent Plan 接入
- 生图工作台：支持侧边/悬浮底部工作台、多任务并发、历史结果合并展示、分类管理、失败详情、参考图缩略图、图片体积展示和“我的素材”复用
- 创作工作流：支持公开/个人模板、变量表单、AI 创建工作流、单图/多图系列工作流、参考图输入和结果自动进入生图历史
- 画布助手：围绕选中节点和上游节点对话、生图，并把结果插回画布
- 提示词库：抓取多个 GitHub 开源项目，按案例整理数百个图片提示词
- 提示词与素材：提示词库、服务器素材库和“我的素材”可在生图、画布 AI 和工作流中复用

完整功能说明见 [docs/features.md](docs/overview/features.md)

如果你在为担心没有合适的生图API来发愁，可以查看该免费生图项目：[chatgpt2api](https://github.com/basketikun/chatgpt2api)

## 技术栈

- 前端：Next.js、React、TypeScript、Tailwind CSS、Ant Design、Zustand、TanStack Query
- 后端：Go、Gin、GORM
- 存储：SQLite、本地 IndexedDB、S3 兼容对象存储、Cloudflare R2  
- 部署：Docker

## 快速开始

### 原生安装包（推荐新手）

前往 [GitHub Releases](https://github.com/waynehaha/infinite-canvas/releases) 下载 Windows x64 或 macOS Apple Silicon 安装包。安装包已内置完整运行环境，不需要 Docker Desktop、Node.js、Go 或 Bun。

- Windows：安装 `.exe` 后双击桌面的“AI创作工作台”。
- macOS：打开 `.dmg`，将“AI创作工作台”拖入 Applications；停止时使用菜单栏的“退出并停止服务”。
- 数据保存在系统用户目录，升级和普通卸载不会自动删除。

详细说明见 [免 Docker 原生安装包](docs/overview/20260731-native-installers.md)。

### macOS 开发预览

项目维护时，打开 `Mac用户` 文件夹并双击 `启动开发预览.command`。入口会显示运行横幅、启动当前源码的前后端服务并打开 `http://localhost:3000`；保持启动终端打开即可持续运行，关闭窗口会自动停止服务并清理进程记录。重复双击会直接打开已运行的页面，也可以使用 `停止开发预览.command` 主动结束。

- 开发预览不使用 Docker，需要本机已安装 Go，以及 Node.js 或 Bun。
- 首次运行缺少前端依赖时会自动安装，启动日志保存在 `data/dev-preview`。
- 停止入口只结束由开发预览入口启动的服务，不会结束其他程序占用的端口。

### Docker 双击启动（备用）

项目提供 Windows 和 macOS 双击入口。首次使用会检查 Docker Desktop；未安装时会提供自动安装或下载引导。

| 系统 | 启动或打开 | 停止服务 |
| --- | --- | --- |
| Windows | 打开 `Windows用户` 文件夹，双击 `启动AI创作工作台.bat` | 双击 `停止AI创作工作台.bat` |
| macOS | 打开 `Mac用户` 文件夹，双击 `Docker备用启动AI创作工作台.command` | 双击 `Docker备用停止AI创作工作台.command` |

- 启动入口可重复使用：未运行时启动服务，已经运行时直接打开网页。
- 默认从 `3001` 开始自动寻找空闲端口，端口冲突不需要手动处理。
- 首次启动会从 GitHub 下载约 120MB 的成品镜像，不会在用户电脑上编译项目；后续启动会明显更快。
- 下载暂时失败但电脑中已有镜像时，会自动使用现有版本离线启动；无法启动时会在 `data/launcher-logs` 保存诊断日志。
- 停止服务不会删除画布、数据库或素材。
- macOS 首次运行若被系统拦截，请右键启动文件并选择“打开”。

### 命令行启动

```bash
git clone https://github.com/waynehaha/infinite-canvas.git
cd infinite-canvas
cp .env.example .env
# 修改默认账号密码等信息
docker compose up -d --build
```

本地非 Docker 开发运行：
```bash
cp .env.example .env
go run .

# 另开一个终端窗口
cd web
bun install
bun run dev
```

本地源码构建运行：

```bash
cp .env.example .env
docker compose -f docker-compose.local.yml up -d --build
```

运行后默认端口3000，可访问 `http://localhost:3000`

如需要拉取提示词，可前往:`http://localhost:3000/admin/prompts`

## New API 自动配置

如果使用 New API，可在 `系统设置 -> 聊天方式 -> 添加聊天设置` 中填入：

```text
https://infinite-canvas-cpco.onrender.com?apiKey={key}&baseUrl={address}
```

跳转后会自动打开配置弹窗并填入 API Key 和 Base URL。
如果自己部署了，可以把 `https://infinite-canvas-cpco.onrender.com` 替换成你部署的地址。

## 效果展示

<table width="100%">
  <tr>
    <td width="50%"><img src="https://cdn3.ldstatic.com/original/4X/d/7/c/d7cecc7df20fcd935ce760757f8799cf4436c936.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://cdn3.ldstatic.com/original/4X/6/0/7/607af375f9182a86f31655b8326337a536f70e34.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://cdn3.ldstatic.com/original/4X/6/e/6/6e60f82eec3602151abccc60fc4b55d028ac8415.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://cdn3.ldstatic.com/original/4X/8/b/a/8bae005a727727c8d83e0e01b05fea90155e56a5.jpeg" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://cdn3.ldstatic.com/original/4X/e/b/e/ebe20a7cb4c4837495cdbd55b4327fa741ce2938.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://cdn3.ldstatic.com/original/4X/0/f/b/0fbe4f543ac554a7950cf011ceb4586d27e6d681.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/MxXZkWc7/1.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/5g46rH3L/2.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/NfHpv5q/3.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/svXg7dPp/4.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://cdn3.ldstatic.com/original/4X/8/6/7/867532c5c6dfff38cfa2b90ca0e0f76809b066d4.png" alt="5" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/BHjjXcV4/6.png" alt="image" border="0"></td>
  </tr>
</table>

## 文档

- [功能介绍](docs/overview/features.md)
- [部署说明](docs/overview/docker.md)
- [画布节点操作手册](docs/canvas/canvas-node-manual.md)
- [画布快捷键](docs/canvas/canvas-shortcuts.md)
- [待办事项](docs/progress/todo.md)
- [后端数据库说明](docs/backend/backend-database.md)
- [系统配置数据结构](docs/backend/system-settings.md)
- [接口响应约定](docs/backend/api-response.md)

## 赞助支持

<div align="center">

如果这个项目对你有帮助，欢迎赞助支持，你的每一份鼓励都是持续更新的动力！

</div>

## 社区支持

学 AI，上 L 站：[LinuxDO](https://linux.do/)

## 开源协议

本项目使用 GNU Affero General Public License v3.0，见 [LICENSE](LICENSE)。

## Star History

<a href="https://www.star-history.com/?repos=waynehaha%2Finfinite-canvas&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=waynehaha/infinite-canvas&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=waynehaha/infinite-canvas&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=waynehaha/infinite-canvas&type=date&legend=top-left" />
 </picture>
</a>
