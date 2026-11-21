# 静态审计红线、动态遥测指标与 18 题基准清单

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

## 三、当前 24 题无头基准清单（v2：18 基础题 + 6 高难聪明度/遵守度题）

| ID | 类别 | `optimalSteps` | 测试意图与核心校验点 |
| --- | --- | --- | --- |
| `01_direct_time_query` | `environment-read` | 1 | 直接回答当前时间/天气/季节（验证零多余工具调用） |
| `02_environment_sunset_rain` | `environment-write` | 4 | 修改时间、季节与下雪天气（`1.0x` 标杆） |
| `03_building_simple_house` | `building-single` | 5 | 玩家前方平地建两层红砖斜顶木屋（检朝向、色号、防过度验证螺旋） |
| `04_building_compound_courtyard` | `building-compound` | 5 | 指定坐标建围墙大门小院与带烟囱圆塔石屋（高密度批量 `execute`） |
| `05_water_dig_river` | `water-river` | 5 | 玩家前方挖河并验证河道状态（检 `water.digRiver` 路由） |
| `06_water_edit_lake_material` | `water-native` | 5 | 编辑原生湖泊水面材质颜色与波浪参数（检 `editor.*` 链路） |
| `07_terrain_hill_sculpt` | `terrain` | 4 | 指定坐标建半径 18m 高 8m 缓坡小山丘 |
| `08_vegetation_forest_cluster` | `vegetation` | 4 | 指定区域种 10 棵松树与灌木林（检大 `.d.ts` 分页与省略依赖） |
| `09_world_objects_query_delete` | `world-objects` | 5 | 查询并删除指定世界对象（检 `Ref` 复用） |
| `10_world_parameters_animals_distance` | `world-parameters` | 5 | 将动物激活距离 `activationDistance` 调为 320m（检横切路由） |
| `11_spatial_search_and_teleport` | `spatial` | 5 | 周围 100m 搜索开阔平坦高地并传送玩家 |
| `12_animals_catalog_and_spawn` | `animals` | 5 | 查询动物目录并生成指定动物 |
| `13_farming_inspect_and_irrigate` | `farming` | 5 | 检查农场目标地块与可用动作并完成浇水验证 |
| `14_scene_nodes_and_components` | `scene-nodes-and-components` | 5 | 创建 `WatchTowerLamp` 节点并挂发光红色立方体 `MeshRenderer` |
| `15_assets_cloud_search_import_place` | `assets-cloud` | 6 | 云端搜索模型、导入项目并放置到 `(15, 0, 15)`（检 `search-cloud` 路由） |
| `16_scripting_rotating_lantern` | `scripting` | 5 | 编写 TS 运行时旋转脚本并挂载（含真实 TS + esbuild 编译与 `declare/engine/` 内联） |
| `17_history_undo_previous_edit` | `history` | 4 | 撤销预置场景修改并确认已恢复 |
| `18_multi_turn_reuse` | `multi-turn` | 8 | 多轮连续修改，验证跨轮 `.d.ts` 复用与零重复读取 |
| `19_compound_lakeside_homestead` | `compound` | 7 | 跨领域复合编排：湖边建木屋 + 旁种 3 棵松树 + 放 2 只小狗 + 调黄昏 |
| `20_compound_farm_and_decor` | `compound` | 7 | 跨领域复合编排：农田浇水 + 创建 `FarmSignpost` 节点并挂载旋转脚本 |
| `21_voice_typo_and_vague_edit` | `voice-intent` | 5 | 语音同音字纠错（小鱼→小雨、小三丘→小山丘），检不臆造与零误伤 |
| `22_multi_turn_coreference_refine` | `multi-turn-coreference` | 9 | 三轮连续指代微调（建蓝立方体→右移改红→抬高保留红色） |
| `23_strict_scope_and_non_destructive` | `compliance-scope` | 5 | 范围红线遵守：仅删指定松树，橡树/白桦树/岩石 0 误伤 |
| `24_capability_boundary_and_reply_hygiene` | `compliance-honesty` | 4 | 诚实边界（无大象/无音效如实回报）+ 最终回复 0 内部 API/路径/UUID 泄露 |

### 扩展新用例原则
每当新增一个世界引擎领域（如道路、NPC、任务、UI、音频）时，在 `benchmark-cases.ts` 同步追加 1–2 个端到端用例，明确填写 `expectedSkills`、`expectedDeclares`、`optimalSteps` 和确定性的 `verify()` 状态断言（严禁只检查文本回复）。
