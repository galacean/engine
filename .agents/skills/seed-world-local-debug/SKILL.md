---
name: seed-world-local-debug
description: 准备并启动 Seed World 与 ASAP 的本地 LLM 联调环境，生成带 Agent Trace 的 Wrapper 预览，核对工作树、模型路由和原生 Tool 链路。用于同事首次安装、启动或重启本地 AI Chat 调试；不用于线上发布或批量指令评测。
---

# Seed World 本地 LLM 联调

把 Engine 与 ASAP checkout 接成：Seed World → 本地 Flash App Wrapper/CandyJar → 本地 ASAP → 远端模型服务。
本地联调不等于离线模型，也不证明手机原生壳的 ASR 行为。

## 两阶段入口

1. **环境准备**：首次使用、缺依赖或切换基线时，完整阅读 [环境准备](references/prepare.md)，按用户机器上的实际路径准备。
2. **启动调试**：环境已就绪时，完整阅读 [启动与验收](references/start.md)，启动服务、生成地址并完成最小链路核验。

默认 Engine 来源是 `git@github.com:galacean/engine.git` 的远端 `experimental/engine-next`。
默认 ASAP 来源是 `git@code.alipay.com:recneptune-tenants/asap-service.git` 的远端 **`codex/seed-world-master-sync`**。
该分支是 ASAP PR !12752 的源分支；是否包含最新 `master` 必须在 fetch 后核对，不能由分支名推断。
确认 PR 已合并且 `master` 包含本 Skill 所需的模型路由与协议后，再更新默认 ASAP 来源。
默认 ASAP 分支只在这里写明；其他文件引用这里。
不固定 commit；启动时获取所选远端分支，记录实际 HEAD、同步差距和工作树状态。
用户明确要调试未提交改动时保留它们，并在交付中说明，不宣称它们是干净远端代码。

默认端口前端 `4173`、后端 `8082`，两侧使用同一个主机名 `127.0.0.1`。
目录、解释器、端口均可调整；不写死个人用户名、共享虚拟环境或历史 commit。
环境准备包含按 [环境准备第 4 节](references/prepare.md#4-模型与协议前置检查) 补齐 dev 本地模型路由配置，无需为此再次请求授权；保留已有配置。
不修改共享或生产白名单、生产配置、壳实现或信封协议；超出上述本地准备范围的权限或版本缺失需报告具体阻塞。
不自动提交、推送、部署，也不运行批量评测或全局单测。

## 辅助脚本

`scripts/preview.py` 只读检查所选 checkout、生成 URL，并可选探测两个 HTTP 入口；不会启动、停止、拉取或改写服务。
它不证明端口对应的进程来自所选目录，也不证明实际模型或 3D 已就绪；这些必须按启动阶段核对。

## 交付

报告两个仓库的实际路径、分支、commit、脏状态、进程/终端、端口、可点击预览 URL，以及模型/Tool 核验结果。
区分“服务启动”“页面可见”“模型及 Tool 实测通过”；没完成的项目明确写未验证。
不要把凭据、完整 `.env` 或包含个人数据的 Trace 放进 Skill 或共享包。
