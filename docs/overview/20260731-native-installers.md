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
3. 程序会自动启动服务、打开默认浏览器，并常驻系统托盘。
4. 关闭浏览器不会停止服务；可从托盘重新打开工作台、重启服务或退出并停止服务。

## macOS

1. 打开 `.dmg`，将“AI创作工作台”拖入 Applications。
2. 打开“AI创作工作台”，程序会自动启动服务、打开浏览器，并常驻系统顶部菜单栏。
3. 关闭浏览器不会停止服务；可从菜单栏重新打开工作台、重启服务或退出并停止服务。

当前开源安装包没有商业代码签名和 Apple 公证。系统首次运行可能显示安全提示，macOS 可以右键应用并选择“打开”。

## 数据与日志

- Windows：`%LOCALAPPDATA%\AI创作工作台`
- macOS：`~/Library/Application Support/AI创作工作台`

停止服务、升级或普通卸载不会自动删除该目录中的数据。如果启动失败，可以查看其中的 `logs` 目录。

原生启动器首次启动后会固定网页端口，后续停止、升级和重装继续使用同一地址，避免浏览器本地画布因端口变化而暂时不可见。端口被其他程序占用时，软件会明确提示并停止，不会静默换地址。

浏览器中的画布、素材、生成记录和本地配置会按应用版本备份到用户数据目录的 `backups/browser-data`。恢复只补充缺失数据；同 ID 但内容不同的画布或素材会保留为“恢复副本”，不会覆盖当前内容。

旧版已经停止且端口记录已经丢失时，可先从浏览器历史找到旧地址中的端口，再运行 `launcher.exe --action start --web-port 旧端口号`（macOS 使用应用包内的 `launcher`）恢复原地址。确认数据出现后，软件会永久沿用该端口并创建备份。

## Docker 备用方案

源码 ZIP 中的 Windows/macOS 双击脚本仍保留，该方案需要 Docker Desktop。对普通用户优先推荐原生安装包。
