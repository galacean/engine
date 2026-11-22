# Seed World 局内 LLM RSI（递归自改进）闭环流程

本手册定义每一轮 LLM 遵循度优化的 6 阶段闭环：**准备与探活 → 静态审计 → 无头基准采集 → Trace 五类归因 → ROI 分层改造 → A/B 验证与工程收口**。

---

## 阶段 0：隔离工作树与环境探活

原则：**绝不污染用户正在开发的主工作区**（除非用户明确要求直接评测当前脏工作区的未提交改动）。

1. 若基于远端基线评测，先拉隔离 worktree（可放在本次会话 scratch 或仓库外临时目录）：
   ```bash
   git fetch origin experimental/engine-next
   git worktree add "$WORKTREE" origin/experimental/engine-next
   ```
   若缺少构建产物或刚切换基线，安装并刷新引擎编译产物：
   ```bash
   cd "$WORKTREE"
   pnpm install --frozen-lockfile
   pnpm b:module
   pnpm --dir world prepare:engine
   ```
2. 执行探活脚本，确认工作树、构建产物、本地 ASAP 8082 以及上游模型网关 DNS/TCP 可达：
   ```bash
   python3 .agents/skills/seed-world-llm-rsi/scripts/preflight.py --worktree "$WORKTREE"
   ```
   - 仅跑静态审计时加 `--offline`。
   - 若 `[asap]` 失败，参考 `seed-world-local-debug` 启动本地 ASAP（务必带 `ASAP_DISABLE_SLS_LOGGING=1` 并将日志重定向到文件）。
   - 若 `[net]` 失败（如 `antchat.alipay.com` DNS 超时），立刻停止并提示用户检查内网 VPN，不要盲跑浪费超时时间。
3. 将本 Skill 的 `resources/llm-benchmark/` 拷贝到 `$WORKTREE/world/tests/seed-world/llm-benchmark/`（临时运行目录，**严禁随业务 commit 提交**，除非用户明确要求合入测试套件）。

---

## 阶段 1：静态图谱审计（纯离线）

每次改动前/后都必须先跑静态审计，离线拦截结构性断点：

```bash
cd "$WORKTREE"
STATIC_AUDIT_OUT_PATH="$OUT_DIR/static-audit-before.json" \
  pnpm exec vitest run --config world/tests/seed-world/vitest.config.mjs \
  world/tests/seed-world/llm-benchmark/static-audit.spec.ts
```

核对 5 条静态红线（详见 [metrics-and-audit.md](metrics-and-audit.md)）：
1. 不可达 Skill/Reference 文档数（`hopDepth === -1`）必须为 `0`。
2. 所有已注册工具必须出现在所属 Skill 的 `API_INDEX` 或正文显式链接中。
3. 涉及 `editor.*` 的 `SKILL.md` 必须链接 `declare/editor/native/api.d.ts`。
4. 高频 `.d.ts` 不得因单文件预算或分页静默丢弃核心依赖（无法内联时须通过 `<omitted_dependencies>` 显式暴露）。
5. 不允许遗留陈旧术语（如 `AssetCatalog`、`APISearch`、`/assets`）继续扩散。

---

## 阶段 2：分层无头压测（串行模拟真实 ASAP 8082）

由于本地 8082 上游模型并发与速率受限，**始终串行执行**，并按场景选档，避免动辄耗时 40 分钟：

| 档位 | `BENCH_SUITE` / `BENCH_CASES` | 预计耗时 | 适用时机 |
| --- | --- | --- | --- |
| **Smoke（快速 A/B）** | `BENCH_SUITE=smoke`（13 题：`03,05,06,08,10,15,16,19..24`） | ~10–15 分钟 | 每轮 RSI 改造的快速 Before vs After A/B 对照 |
| **Domain Slice（单域定向）** | `BENCH_SUITE=domain:<name>`（如 `water`/`farming`/`assets`） | ~3–6 分钟 | 单模块 Skill / Knowledge / Declare 调整验证 |
| **CRUD Matrix（全接口 CRUD）** | `BENCH_SUITE=crud`（59 题：`01–18, 25–65`，覆齐 23 Skill + 70+ 公开 API） | ~40–55 分钟 | API 契约调整或新增工具回归 |
| **Hard（聪明度/合规专项）** | `BENCH_SUITE=hard`（41 题：空间/多轮/语音/复合/红线） | ~30–45 分钟 | 提示词协议、上下文压缩、语音与红线专项压测 |
| **Full Matrix（全量 100 题）** | `BENCH_SUITE=full` 或留空（**全部 100 题**） | ~75–110 分钟（支持断点续跑） | 换模型、大改协议/契约或大版本架构重构前后黄金基线 |

运行命令（支持 `BENCH_SKIP_EXISTING=1` 断点续跑）：

```bash
cd "$WORKTREE"
BENCH_CASES="03,05,06,08,10,15,16" \
BENCH_OUT_DIR="$OUT_DIR/before-traces" \
BENCH_SUMMARY_PATH="$OUT_DIR/before-summary.json" \
BENCH_SKIP_EXISTING=1 \
BENCH_COOLDOWN_MS=1500 \
BENCH_EXPECTED_MODEL="DeepSeek-V4.1-Flash" \
  pnpm exec vitest run --config world/tests/seed-world/vitest.config.mjs \
  world/tests/seed-world/llm-benchmark/run-benchmark.spec.ts
```

---

## 阶段 3：Trace 拆账与五类归因（严禁混为一谈）

拿到 `summary.json` 与单题 trace JSON 后，按 **overheadRatio（步数膨胀比）**、**detourFlags** 和 **failureReasons** 排序，把每个异常严格归入以下五类之一：

| 归因类别 | 典型特征 | 处理方式 |
| --- | --- | --- |
| **1. Transport / 网络故障** | `ConnectTimeout`、DNS 失败、`HTTP 429/5xx`、`modelsSeen` 为空或路由偏离目标模型 | **不算 LLM 缺陷**。修通道/恢复 VPN，用 `BENCH_SKIP_EXISTING=1` 仅重跑受影响用例 |
| **2. Fixture 夹具漂移** | Node 无头加载资源报错（GLB/KTX2/`blob:`）、与最新 `SeedWorldDemo.ts` 宿主组装不一致 | 先修 `seed-world-headless-fixture.ts` 并单独重跑该题，**严禁当 LLM 缺陷去改 Prompt** |
| **3. 公共链路断点（最高 ROI）** | 跨域反复出现：`.d.ts` 依赖未内联/静默跳过、显式 `limit` 破坏去重、`repairContext` 漏覆盖某类 TS 诊断码、提交后连续只读排查螺旋、Compaction 洗掉关键锚点 | 改 `@galacean/engine-ai-chat` 公共底盘（一次加固，全领域零成本受益） |
| **4. 知识网络断链 / 隐性语义缺口** | 某域频繁 `grep/glob` 或 404 幻觉读；类型签名看不出来的隐性规则缺失（坐标手性、色板号、三层 ID 边界、完成停机判据）；宿主拼装漏注册工具 | 补 Skill 链接、`API_INDEX`、或 `references/*.md` 决策速查表；**禁止在 Markdown 里重复手抄 `.d.ts` 字段** |
| **5. 模型能力上限 / 偶发抖动** | 文档与工具回执均已明确给出，但弱模型仍偶发算术或空间推理失误 | 记录为模型边界；仅当可通过确定性工具/校验器前移兜底时才改设计，绝不堆冗长负面 Prompt |

---

## 阶段 4：按 ROI 分层实施改造

改造严格遵守 **“公共链路 > 宿主组装 > 领域知识 > 单点特判”** 的优先级，并守住 4 层单一事实源（SSOT）分工：

- **L0 协议与工具定义（`packages/ai-chat`）**：只放跨域硬不变量、极简工具 Schema、依赖内联/去重、TS 静态检查 `repairContext`、循环收敛护栏。
- **L1 一级 Skill 目录**：按用户高频意图路由，保证 1 跳直达；横切能力（如 `world.parameters`）须在关联 Skill 首段交叉链接。
- **L2 Skill 正文 & `references/`**：只写**决策知识**（何时选哪条链路、坐标系/手性、色板、默认值、避坑、完成停止判据），统一用项目根路径链接。
- **L3 Declare（`.d.ts`）**：**唯一类型真相源**，既给 LLM 按需读，又驱动 `execute` 前的 TS 静态检查。

---

## 阶段 5：A/B 实测对照与工程收口

1. **离线快验**：
   - 重跑 `static-audit.spec.ts` 到 `static-audit-after.json`，核对 5 条红线。
   - 跑受影响单测套件：
     ```bash
     pnpm --dir packages/ai-chat test
     pnpm exec vitest run --config world/tests/seed-world/vitest.config.mjs \
       world/tests/seed-world/AgentSkillsVfs.spec.ts \
       world/tests/seed-world/BuildingAgentGeneration.spec.ts \
       world/tests/seed-world/SeedWorldAnimalTools.spec.ts
     ```
2. **在线 A/B 回归**：
   - 使用与基线**完全相同的 `BENCH_CASES`、夹具版本、模型与参数**，写入 `after-traces/` 与 `after-summary.json`。
   - 运行对比脚本生成标准 Markdown 报表：
     ```bash
     python3 .agents/skills/seed-world-llm-rsi/scripts/compare_bench.py \
       --before "$OUT_DIR/before-summary.json" \
       --after "$OUT_DIR/after-summary.json" \
       --audit-before "$OUT_DIR/static-audit-before.json" \
       --audit-after "$OUT_DIR/static-audit-after.json"
     ```
3. **CR + 验真收口**：
   - 对全部产品改动执行 `galacean-code-review`；对发现的中高风险项用 `diagnose-issue` 构造最小复现并补入永久单元测试。
   - **重要**：如果 CR 修复改到了 `agent-loop` / `agent-native-files` / `agent-script-checker` 运行逻辑，补跑一遍 Smoke 回归（如 `03,08,16`）确认线上链路无退化，不能只靠离线单测收尾。
4. **交付与清理**：
   - 提交前确认未将临时 `world/tests/seed-world/llm-benchmark/` 或任何 trace/凭据带入 commit。
   - 若用户要求提交，先无冲突 rebase 远端目标分支并跑完相关单测再 push。
