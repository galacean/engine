# 静态审计红线、动态遥测指标与 100 题基准清单（v4）

## 一、静态审计指标（`static-audit.spec.ts`）

纯离线、秒级执行，覆盖当前工作树真实组装后的 `AgentNativeFiles` VFS：

1. **VFS 规模与首屏上下文成本**：
   - `counts`：总文件数、一级 Skill 数、Skill Markdown 总数、`declare/editor` 与 `declare/engine` 数量。
   - `initialPayload`：`systemPromptBytes` + `messagesBreakdown`（`host_environment` / `skills` / `task_context` / `world_state`）+ `toolsTotalBytes`（监控单一工具定义膨胀，例如历史 `pick` 单体 3.5 KB 占工具总字节 21.5%）。
2. **知识图谱可达性（红线：`unreachable === 0`）**：
   - 从顶层 `skills/*/SKILL.md` 做 BFS 遍历 Markdown 链接，任何 `hopDepth === -1` 的文档均为不可达孤岛。
3. **关键工具索引覆盖（红线：注册工具 100% 可路由）**：
   - 核对宿主拼装是否意外裁剪工具（如历史 `water.digRiver` 在正文出现但被宿主 `WATER_QUERY_CONTRACTS` 从 `API_INDEX` 漏掉）。
4. **`.d.ts` 自动依赖内联健康度**：
   - 冷读全部 `declare/editor/**/*.d.ts` 及核心 `declare/engine/**/*.d.ts`，记录 `inlinedDeps`、`skippedModuleDeps`、`paginatedNext`。
   - 关注大 `.d.ts` 是否因单文件字节上限或分页触发跳过，以及 `<omitted_dependencies>` 是否准确透传。
5. **陈旧术语扫描**：
   - 扫描 `APISearch`、`AssetCatalog`、`/assets` 等历史残留术语。

---

## 二、动态遥测指标（`benchmark-cases.ts`）

每道题落盘独立 `<caseId>.json`（含 `metrics` + 完整 `turns` 事件流）并汇总到 `summary.json`：

| 指标 | 定义 | 优化方向与健康阈值 |
| --- | --- | --- |
| `taskCompleted` / `passRate` | 所有功能 `verify()` 断言通过且无致命错误 | 越高越好（目标 `100%`） |
| `modelVerified` | 每个 turn 捕获的 `modelsSeen` 均命中 `BENCH_EXPECTED_MODEL` | **硬门禁 `true`**（防静默降级/路由漂移） |
| `firstSkillHitRate` | 模型首跳读取的 Skill 命中 `expectedSkills` 比例 | 目标 `≥ 95%` |
| `overheadRatio`（步数膨胀比） | `llmTurns / optimalSteps` | 越接近 `1.0x` 越好；复杂任务健康区间 `≤ 2.5x` |
| `firstPassScriptRate` | `execute` 首次提交即通过 TS 静态检查与执行的比例 | 越高越好 |
| `typecheckRepairCount` | `execute` 触发 TS 类型检查报错并返工的次数 | 越低越好（关注未覆盖的 TS 诊断码） |
| `runtimeErrorCount` | 脚本编译通过但运行期抛错次数 | 目标 `0`（常见根因：三层 ID 混用） |
| `explicitLimitOnDeclareReads` | 读取 `declare/` 时传了数字 `limit` 导致截断/破坏去重的次数 | 目标 `0` |
| `duplicateReadPaths` | 同一会话中重复全量读取同一路径的次数 | 目标 `0` |
| `grep/glob` 次数 | `outerToolCallsByName.grep + glob` | 越低越好（高值说明 Skill/Declare 路由断链或隐性规则缺失） |
| `compliance.replyHygieneViolations` | 最终回复泄露内部 API 名（`tools.*`/`editor.*`）、VFS 路径、UUID 或堆栈的次数 | **硬红线 `0`** |
| `compliance.scopeViolations` | 受保护对象被误删/误改的次数（由 `scope_*` 校验项汇总） | **硬红线 `0`** |
| `compliance.parallelReadRatio` | 同轮并行发起（≥2 个）的 `read` 调用占总 `read` 调用的比例 | 复合任务越高越好（减少串行往返） |
| `usageSummary.totalTokens` / `totalDurationMs` | 端到端 Token 与串行耗时 | 每多 1 轮往返呈近二次方膨胀，压轮次即降本提速 |

### 常见 `detourFlags` 解读
- `wrong_skill_first`：首跳 Skill 选偏 → 检查一级 Skill 摘要或横切能力交叉链接。
- `grep_or_glob_fallback`：被迫退化为搜索 → 查具体搜索关键词，补链接或 `references/` 速查表。
- `explicit_limit_broke_batch_dedup`：读 `.d.ts` 传了 `limit` → 检查 `read` 工具描述或并发预去重逻辑。
- `duplicate_read`：同文件重读 → 检查去重集合或 Compaction 后上下文丢失。
- `script_check_repair`：TS 检查返工 → 统计 TS 错误码分布，扩展 `agent-script-checker.ts` 的 `repairContext()`。
- `script_runtime_error`：运行期报错 → 核对三层 ID（`world Ref` / `editor {scene,id}` / `runtime number`）或 API 契约。
- `exceeded_optimal_steps`：`llmTurns > optimalSteps` → 结合完整 Trace 判断多余轮次落在“找路 / 读声明 / 修错 / 提交后过度验证”哪一段。

---

## 三、当前 100 题无头基准矩阵（v4：全 23 个一级/二级 Skill × 70 公开 API 全量 CRUD + 35 高难场景）

> 源码拆分：`01`–`43` 位于 `resources/llm-benchmark/benchmark-cases.ts`，`44`–`100` 位于 `resources/llm-benchmark/benchmark-cases-v4.ts`，统一导出为 `BENCHMARK_CASES`（共 100 题），支持 `BENCH_SUITE=smoke|crud|hard|domain:<name>|full` 分层执行。

### Part A：基础与全量原子 CRUD 矩阵（`01`–`18`, `25`–`65`，共 59 题）

- **`01`–`18`**（18 题）：原基础回归与多轮复用基线（环境、建筑、水体、地形、植被、世界对象、规划参数、空间、动物、农耕、场景节点/组件、云端资产、脚本、历史、多轮复用）。
- **`25`–`43`**（19 题）：15 个一级 Skill 完整 CRUD 补齐（含 `43_farming_harvest_mature_crops` 农耕成熟收获流）。
- **`44`–`65`**（22 题）：补齐全部 8 个二级 Skill 与 70 个公开接口（100% 覆齐）：
  - `44` 环境只读（`time.get`/`atmosphere.get`）；`45`–`46` 建筑子生成器（`buildTower`/`buildWall`/`buildFence`/`buildSteps`）；
  - `47`–`49` 水体 `capabilities`/`sampleDrops`、手动创建 `WaterBodyComponent`、实例独立克隆材质；
  - `50`–`51` 地形 `patch` 挖坑/整平；`52`–`54` 植被草/花、共享材质改色与重置（`world.parameters.materials.inspect/apply`）、删除林区；
  - `55`–`56` 世界对象选区取回+打标（`selection.get`/`tag.update`）、规划参数 `query`/`apply`/`receipt`；
  - `57`–`59` 空间 `viewer`/`resolve`、运行时节点树与组件读取（`runtime.entity.{children,inspect}`、`runtime.component.{query,read}`）；
  - `60`–`65` 资产 `list/info/inspect`、`mesh-material`、`use-image`、Prefab `entity.revert`/`component.revert`、`history.read`、项目文档外层 `write/edit/delete`。

### Part B：真实玩家高难场景与红线矩阵（`19`–`24` + `66`–`100`，共 41 题）

- **`19`–`24`**（6 题）：首批复合编排、语音错字、多轮指代、范围红线、能力诚实边界。
- **`66`–`71`**（6 题，`spatial-hard`）：左右身后相对偏移、两树中点、湖内点自动避水、高地搜索传送、朝向玩家放置、多点坡度/水面只读评估。
- **`72`–`79`**（8 题，`multi-turn-hard`）：2–3 轮连续口语追改（山高微调、天气演进、节点移位改名缩放、两柱择一删除、撤二保一、脚本升速加浮动、动物召唤后发令、农耕播种浇水闭环）。
- **`80`–`85`**（6 题，`voice-hard`，`inputSource: "voice"`）：高频同音错字（松鼠→松树、小核→小河、红专→红砖、鸡活距离→激活距离、小血→小雪、第一快地交水→第一块地浇水、测回→撤回）。
- **`86`–`93`**（8 题，`compound-hard`）：溪畔小屋、围栏农庄、夜晚灯笼路+脚本、秋日迷雾林+共享叶色、山顶瞭望塔、云端直升机+悬停脚本、收获重播闭环、建改撤重删全生命周期。
- **`94`–`100`**（7 题，`compliance-hard`）：纯盘点严格零修改、拒绝 16 人联机/爆破、共享材质防误伤、被引用 Prefab 先解绑再删、`preview` 影响估算零删除、只删 authored 树保自然树、回复零内部 API/路径/UUID 泄露。

### 扩展新用例原则
每当新增一个世界引擎领域（如道路、NPC、任务、UI、音频）时，在 `benchmark-cases-v4.ts` 同步追加对应原子 CRUD 与高难用例，明确填写 `expectedSkills`、`expectedDeclares`、`optimalSteps` 和确定性的 `verify()` 状态断言（严禁只检查文本回复）。
