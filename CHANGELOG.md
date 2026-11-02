# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的写法，版本号遵循语义化版本。

## [0.1.0] - 2026-11-02

### 新增

- 离线命令 `generate`：由 YAML 生成多条中文闲鱼文案（专业 / 口语 / 短平快）、SVG 封面和价目表。
- 命令 `lint`：检查标题长度、正文长度、语气关键词、手机号和禁用词。
- 命令 `init-sample`，以及三份虚构示例（CAD 出图、短视频周包、n8n 自动化）。
- 默认中文禁用词表。可用 `banned_extra` / `banned_allow` 或外部词表增删。
