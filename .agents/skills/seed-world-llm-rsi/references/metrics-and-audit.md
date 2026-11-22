# 静态审计红线、动态遥测指标与 89 题全能力基准清单（v4）

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

## 三、当前 89 题无头全能力基准矩阵（v4：按系统能力驱动，零凑数、零遗漏）

> 源码拆分：`01`–`43` 位于 `resources/llm-benchmark/benchmark-cases.ts`，`44`–`89` 位于 `resources/llm-benchmark/benchmark-cases-v4.ts`，统一导出为 `BENCHMARK_CASES`（共 89 题），支持 `BENCH_SUITE=smoke|crud|hard|domain:<name>|full` 分层执行。
> 注：视觉视口像素拾取（`snapshot` / `pick`）依赖真实 WebGL 画面，归入浏览器视觉验收，不在纯无头文本夹具中伪造。

### Part A：全 12 系统原子能力与 CRUD 矩阵（`01`–`18`, `25`–`68`，共 62 题）

- **`01`–`18`**（18 题）：核心基线与历史对照回归（环境、建筑、水体、地形、植被、世界对象、规划参数、空间、动物、农耕、场景节点/组件、云端资产、脚本、历史、多轮复用）。
- **`25`–`43`**（19 题）：15 个一级 Skill 完整 CRUD（含环境 `skyColor`/`lightning`、规划参数 `reset`+`receipt`、空间 `viewer`/`resolve`/`check`、农耕成熟收获流 `43`）。
- **`44`–`68`**（25 题）：覆齐全部 23 个一级/二级 Skill、全部非视觉公开接口与独立 Schema 分支：
  - `44` 环境只读（`time.get`/`atmosphere.get`）；`45`–`46` 建筑子生成器（`buildTower`/`buildWall`/`buildFence`/`buildSteps`）；
  - `47`–`49` 水体 `capabilities`/`sampleDrops`、手动建 `WaterBodyComponent`、实例独立克隆材质；
  - `50`–`51` 地形 `patch lower`、非 `hill` 语义地貌（`plateau`）创建/修改 + `patch raise`；
  - `52`–`55` 植被草/花、单棵树(`single`)+水草(`aquatic-grass`)+玩家树移位(`vegetation.update`)、共享材质改色与重置(`world.parameters.materials.inspect/apply`)、删除玩家林区；
  - `56`–`57` 世界对象选区保存/取回+标签增删(`tag.update`)、删自然岩石(`rock`)与不可编辑自然河道边界(`NOT_EDITABLE`)；
  - `58`–`60` 农耕开垦与删地块(`inspectCultivation`/`hoe`/`deletePlot`)、毁苗清未成熟作物(`damageCrop`)、物品/容器写流转与诊断(`getDiagnostics`/`getEnvironment`/`generateItems`/`setContainerCount`)；
  - `61`–`68` 运行时节点树与组件读取(`runtime.entity.*`/`runtime.component.*`)、资产 `list/info/inspect`/`mesh-material`/`use-image`、Prefab `entity.revert`/`component.revert`、`history.read`、项目文档外层 `write/edit/delete`。

### Part B：真实玩家高难场景与红线矩阵（`19`–`24` + `69`–`89`，共 27 题）

- **`19`–`24`**（6 题）：首批复合编排、语音错字、多轮指代、范围红线、能力诚实边界。
- **`69`–`73`**（5 题，`spatial-hard`）：左右身后相对偏移、两树中点、湖内点自动避水、朝向玩家放置、多点坡度/水面只读评估。
- **`74`–`76`**（3 题，`multi-turn-hard`）：左右二选一精准删、撤二保一、脚本增量改写重编。
- **`77`–`79`**（3 题，`voice-hard`，`inputSource: "voice"`）：跨系统歧义（松鼠→松树/小核→小河）、技术参数词（鸡活距离→激活距离）、口语填充词（测回→撤回）。
- **`80`–`84`**（5 题，`compound-hard`）：农庄复合布置、夜晚灯笼路+脚本、秋日迷雾林+共享叶色、云端直升机+悬停脚本、收获重播闭环。
- **`85`–`89`**（5 题，`compliance-hard`）：纯盘点严格零修改、共享材质防误伤、被引用 Prefab 先解绑再删、`preview` 影响估算零删除、只删 authored 树保自然树。

### 扩展新用例原则
每当新增一个世界引擎领域（如道路、NPC、任务、UI、音频）时，在 `benchmark-cases-v4.ts` 同步追加对应原子 CRUD 与高难用例，明确填写 `expectedSkills`、`expectedDeclares`、`optimalSteps` 和确定性的 `verify()` 状态断言（严禁只检查文本回复）。
