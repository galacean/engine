---
name: seed-world-local-debug
description: 准备 Engine、flash-app 壳和 ASAP 的 Seed World 本地 LLM 联调环境，生成带 Agent Trace 的 Wrapper 预览，核对工作树、模型路由和原生 Tool 链路。用于同事首次安装、启动或重启本地 AI Chat 调试；不用于线上发布或批量指令评测。
---

# Seed World 本地 LLM 联调

游戏通过壳 SDK 和 AppLoader 调用本地 Wrapper/CandyJar，再由 ASAP 请求模型。
本地联调不等于离线模型，也不证明手机原生壳的 ASR 行为。线上构建与发布灵光闪应用见 [seed-world-flash-publish](../seed-world-flash-publish/SKILL.md) 与 `world/demos/seed-world/FLASH_APP_PUBLISH.md`。

## 壳依赖

正式闪应用的 AI 对话要求壳 SDK 同时提供 `window.lingguang.ai.seedWorldStream` 和 `window.lingguang.ai.seedWorldStop`。
Engine 在发送前检查这两个方法，缺少任意一个就报“当前环境没有注入 Seed World 专用流式接口”。
完整联调需要 [ASAPlat/flash-app](https://code.alipay.com/ASAPlat/flash-app) 的读取权限。缺少权限时向仓库维护者申请。
壳 #279 的来源分支是 `codex/seed-world-action-probe`。
在[环境准备](references/prepare.md#5-壳仓库和-sdk)构建配套 SDK，按[启动与验收](references/start.md#壳-sdk-回归)运行壳仓库自带的浏览器回归。
用 `scripts/serve-shell.mjs` 启动 Engine 和本地壳，再给 `preview.py` 传入同一个 `--shell-root`。只需排查 Engine/ASAP 时，显式选择 `--direct`。

## 两阶段入口

1. **环境准备**：首次使用、缺依赖或切换基线时，完整阅读 [环境准备](references/prepare.md)，按用户机器上的实际路径准备。
2. **启动调试**：环境已就绪时，完整阅读 [启动与验收](references/start.md)，启动服务、生成地址并完成最小链路核验。

默认 Engine 来源是 `git@github.com:galacean/engine.git` 的远端 `codex/seed-world-action-probe`。
默认 ASAP 来源是 `git@code.alipay.com:recneptune-tenants/asap-service.git` 的远端 `codex/seed-world-dedicated-action`。
该分支对应 ASAP PR #13282，提供 Seed World 专用 action。
确认 PR 已合并且 `master` 包含本 Skill 所需的模型路由与协议后，再更新默认 ASAP 来源。
默认 ASAP 分支只在这里写明；其他文件引用这里。
最近一次核对的 ASAP、壳、SDK 和 Engine 版本见[本地联调版本记录](references/prepare.md#2026-11-26-本地联调版本记录)。
启动时获取所选远端分支，记录本次实际 HEAD、同步差距和工作树状态。
用户明确要调试未提交改动时保留它们，并在交付中说明，不宣称它们是干净远端代码。

壳开发入口使用 `localhost:5173`，ASAP 使用 `127.0.0.1:8082`。直连游戏预览默认使用 `127.0.0.1:4173`。本地启动 ASAP 时默认带 `ASAP_DISABLE_SLS_LOGGING=1`，避免离线 SLS 不可达时同步上报阻塞本地单进程请求；后台托管或长时间运行时同步将 `stdout/stderr` 重定向到文件，避免 `ScheduleJobDispatcher` 高频输出打满 IDE PTY 缓冲阻塞主线程 `print()`（详见 [启动与验收](references/start.md#终端-basap)）。
目录、解释器和 ASAP 端口可调整；不写死个人用户名、共享虚拟环境或历史 commit。
按[模型与协议前置检查](references/prepare.md#4-模型与协议前置检查)核对专用 action 和服务端模型。
不修改共享或生产白名单、生产配置、壳实现或信封协议；超出上述本地准备范围的权限或版本缺失需报告具体阻塞。
不自动提交、推送、部署，也不运行批量评测或全局单测。

## 辅助脚本

`scripts/preview.py` 只读检查所选 checkout、生成相应模式的 URL，并可选探测游戏、Wrapper 和选定的壳入口；不会启动、停止、拉取或改写服务。
它不证明端口对应的进程来自所选目录，也不证明实际模型或 3D 已就绪；这些必须按启动阶段核对。

## 交付

报告联调模式及参与仓库的实际路径、分支、commit、脏状态、进程/终端、端口、可点击预览 URL，以及模型/Tool 核验结果。
区分“服务启动”“页面可见”“模型及 Tool 实测通过”；没完成的项目明确写未验证。
不要把凭据、完整 `.env` 或包含个人数据的 Trace 放进 Skill 或共享包。
