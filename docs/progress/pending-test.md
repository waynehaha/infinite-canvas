---
title: 待测试
description: 当前版本已实现但仍需人工验证的变更项
---

# 待测试

## AIHub 默认渠道

- 新用户默认提供 `AIHub` 渠道，Base URL 为 `https://aihubcc.cc/v1`，填写个人 API Key 后即可使用预置模型。
- 默认模型按文本、图片和视频分类，默认分别使用 `gemini-3.5-flash`、`gpt-image-2` 和 `omni-fast`。
- AIHub 图生图使用平台实际参考图字段；`omni-fast`、Grok 视频及 GPT Image 高清异步模型按各自接口参数提交。
- 旧版未配置过任何模型渠道的浏览器会自动升级到 AIHub 默认渠道，已有自定义渠道保持不变。

## 桌面双击启动

- Windows 和 macOS 均提供“启动或打开”和“停止”双击入口。
- 启动时自动检查 Docker Desktop、创建本地环境配置，并从 `3001`～`3099` 自动选择可用端口。
- 服务已运行时重复双击会直接打开现有页面；停止服务不会删除数据库、画布或素材。
