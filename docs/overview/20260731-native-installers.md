# 免 Docker 原生安装包

原生安装包已内置前端、后端和 Node.js 运行环境。使用安装包时，电脑不需要安装 Docker Desktop、Go、Bun 或 Node.js。

## 支持平台

| 平台 | 安装包 |
| --- | --- |
| Windows 10/11 x64 | `Infinite-Canvas-*-Windows-x64-Setup.exe` |
| macOS 12 及以上 Apple Silicon | `AI-Creative-Workbench-*-macOS-Apple-Silicon.dmg` |

Windows ARM64、macOS Intel 暂未提供。

## 下载

前往 [GitHub Releases](https://github.com/waynehaha/infinite-canvas/releases) 下载对应系统的最新安装包。同名 `.sha256` 文件可用于校验下载完整性。

## Windows

1. 双击 `Windows-x64-Setup.exe` 完成安装。
2. 双击桌面的“AI创作工作台”。
3. 程序会自动启动服务并打开默认浏览器。
4. 需要结束时，从开始菜单运行“停止AI创作工作台”。

## macOS

1. 打开 `.dmg`，将“AI创作工作台”和“停止AI创作工作台”拖入 Applications。
2. 打开“AI创作工作台”，程序会自动启动服务并打开浏览器。
3. 需要结束时，打开“停止AI创作工作台”。

当前开源安装包没有商业代码签名和 Apple 公证。系统首次运行可能显示安全提示，macOS 可以右键应用并选择“打开”。

## 数据与日志

- Windows：`%LOCALAPPDATA%\AI创作工作台`
- macOS：`~/Library/Application Support/AI创作工作台`

停止服务、升级或普通卸载不会自动删除该目录中的数据。如果启动失败，可以查看其中的 `logs` 目录。

## Docker 备用方案

源码 ZIP 中的 Windows/macOS 双击脚本仍保留，该方案需要 Docker Desktop。对普通用户优先推荐原生安装包。
