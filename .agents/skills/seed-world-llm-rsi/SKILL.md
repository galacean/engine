---
name: seed-world-llm-rsi
description: >-
  对 Seed World 局内 LLM 的 skill / knowledge / declare 与公共链路执行离线静态审计、
  基于本地 ASAP 8082 的无头串行基准评测、Trace 归因复盘与 A/B 递归自改进（RSI）。
  触发词：测试局内 LLM 遵循度、跑 LLM benchmark、静态审计 skill/declare、LLM RSI 迭代、复盘优化局内 AI。
  不用于首次搭建本地调试页面（见 seed-world-local-debug）或线上闪应用发布（见 seed-world-flash-publish）。
---

# Seed World 局内 LLM 评测与 RSI（递归自改进）

将局内 LLM 遵循度优化固化为可重复、可量化的工程闭环，避免凭感觉改 Prompt 或过拟合单个 Case。

> 仅要求修改、解释或更新本 Skill 时，不自动启动压测或改动业务代码。

## 核心闭环（6 步）

完整操作规范见 [RSI 闭环手册](references/rsi-loop.md)；指标与 18 题定义见 [指标与审计标准](references/metrics-and-audit.md)；实战避坑与待办见 [Harness 避坑与 Backlog](references/harness-and-pitfalls.md)。

1. **隔离工作树与探活**：
   - 默认不污染用户脏工作区；基于目标分支（默认 `origin/experimental/engine-next`）拉隔离 worktree，或按用户明确要求评测当前工作区。
   - 运行探活脚本确认构建产物、本地 ASAP 8082 与上游网关 DNS/TCP 可达（离线审计加 `--offline`）：
     ```bash
     python3 .agents/skills/seed-world-llm-rsi/scripts/preflight.py --worktree "$WORKTREE"
     ```
   - 将 [resources/llm-benchmark](resources/llm-benchmark) 拷贝至 `$WORKTREE/world/tests/seed-world/llm-benchmark/`（临时运行目录，不随业务 commit 提交）。
2. **静态图谱审计（纯离线）**：
   - 运行 `static-audit.spec.ts`（通过 `STATIC_AUDIT_OUT_PATH` 指定输出路径），校验 5 条红线：不可达文档为 `0`、注册工具 100% 入 `API_INDEX`/链接、`editor.*` 链路不漏 `native/api.d.ts`、大依赖不静默丢弃、无新陈旧术语回流。
3. **分层无头基准压测（串行）**：
   - 始终串行打本地 `127.0.0.1:8082`，强制校验 `BENCH_EXPECTED_MODEL`（默认 `DeepSeek-V4.1-Flash`），开启 `BENCH_SKIP_EXISTING=1` 断点续跑：
     - **冒烟**：`BENCH_CASES=01,03`
     - **高杠杆 A/B（推荐日常 RSI）**：`BENCH_CASES=03,05,06,08,10,15,16`
     - **全量基线**：留空（18 题，约 20–40 分钟）
4. **Trace 五类归因**：
   - 先严格区分 **Transport 故障 / Fixture 漂移 / 公共链路断点 / Skill&Knowledge 缺口 / 模型能力上限**，严禁把网络或夹具故障当 LLM 缺陷修。
5. **按 ROI 分层改造**：
   - 优先级：**`@galacean/engine-ai-chat` 公共链路 > 宿主组装（`SeedWorldKnowledge`/`SeedWorldDemo`）> 领域 Skill & `references/` > `.d.ts` 拆分**。
   - 守住 SSOT：`.d.ts` 是唯一类型真相源，`SKILL.md` / `references/` 只写意图路由与隐性语义（坐标系、色板、三层 ID 边界、完成停机判据）。
6. **A/B 实测对照与 CR 收口**：
   - 跑离线静态审计 + 单元测试 + 同口径无头 A/B 回归，用对比脚本生成量化报告：
     ```bash
     python3 .agents/skills/seed-world-llm-rsi/scripts/compare_bench.py \
       --before "$BEFORE_SUMMARY" --after "$AFTER_SUMMARY" \
       --audit-before "$BEFORE_AUDIT" --audit-after "$AFTER_AUDIT"
     ```
   - 走 `galacean-code-review` + `diagnose-issue` 验真；若 CR 修复触及运行时逻辑，补跑小集在线冒烟（如 `03,08,16`）确认无退化。

## 硬性约束

- **隔离与洁净**：不未经确认改动主仓库未提交工作；提交产品改动前确认未带入临时 `world/tests/seed-world/llm-benchmark/`、trace JSON 或任何凭据。
- **同口径比较**：A/B 必须保证相同 `BENCH_CASES`、相同夹具版本和已验证的同一目标模型；`modelVerified` 任一为 `false` 即判该批数据无效。
- **区分验收层次**：无头通过仅证明知识路由、工具调用、TS 编译与数据状态正确，不替代 WebGL 视觉渲染验收。

## 交付清单

每次 RSI 迭代完成后向用户汇报：
1. 评测对象（worktree 路径、分支、HEAD commit、目标模型与 `modelVerified` 状态）。
2. 静态审计前后对比与 5 条红线状态。
3. 动态 A/B 对比表（通过率、首跳命中率、总轮次、`overheadRatio`、耗时、Token、`grep/glob`、显式 `limit`、重复读、TS 返工、运行期报错）与分题拆解。
4. 本轮改动分布（公共链路 vs 领域知识 vs 宿主组装）、单测/CR/验真结论，以及下一轮最高 ROI 候选（同步维护 [Backlog](references/harness-and-pitfalls.md#四已知高价值-rsi-backlog按-roi-排序)）。
