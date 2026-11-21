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

## 三、当前 42 题无头基准矩阵（v3：全 15 个一级 Skill × 完整 CRUD + 6 高难聪明度/遵守度题）

| ID | 类别 | `optimalSteps` | 测试意图与核心校验点 |
| --- | --- | --- | --- |
| `01_direct_time_query` | `environment-read` | 1 | 直接回答当前时间/天气/季节（零多余调用） |
| `02_environment_sunset_rain` | `environment-write` | 4 | 修改时间、季节与下雪天气（`1.0x` 标杆） |
| `03_building_simple_house` | `building-single` | 5 | 建筑 C：两层红砖斜顶木屋（朝向、色号、防过度验证） |
| `04_building_compound_courtyard` | `building-compound` | 5 | 建筑 C：围墙大门小院与圆塔石屋（高密度批量 `execute`） |
| `05_water_dig_river` | `water-river` | 5 | 水体 C：玩家前方挖河并验证河道状态 |
| `06_water_edit_lake_material` | `water-native` | 5 | 水体 U：编辑原生湖泊水面材质颜色与波浪参数 |
| `07_terrain_hill_sculpt` | `terrain` | 4 | 地形 C：创建半径 18m 高 8m 缓坡小山丘 |
| `08_vegetation_forest_cluster` | `vegetation` | 4 | 植被 C：种植 10 棵松树与灌木林 |
| `09_world_objects_query_delete` | `world-objects` | 5 | 世界对象 R+U(tag)+D：查询树木、打标并删除 |
| `10_world_parameters_animals_distance` | `world-parameters` | 5 | 规划参数 R+U：动物激活距离调为 320m |
| `11_spatial_search_and_teleport` | `spatial` | 5 | 空间搜索 + 传送玩家 |
| `12_animals_catalog_and_spawn` | `animals` | 5 | 动物目录 + 生成 + 命令 |
| `13_farming_inspect_and_irrigate` | `farming` | 5 | 农场地块检查与浇水验证 |
| `14_scene_nodes_and_components` | `scene-nodes-and-components` | 5 | Scene 节点 C + 组件 C：创建节点并挂发光立方体 |
| `15_assets_cloud_search_import_place` | `assets-cloud` | 6 | 资产云端检索 + 导入 + 放置 |
| `16_scripting_rotating_lantern` | `scripting` | 5 | 脚本 C：编写 TS 旋转脚本并挂载（真实 TS+esbuild） |
| `17_history_undo_previous_edit` | `history` | 4 | 历史 Undo：撤销预置修改 |
| `18_multi_turn_reuse` | `multi-turn` | 8 | 多轮复用：验证跨轮 `.d.ts` 复用与零重读 |
| `19_compound_lakeside_homestead` | `compound` | 7 | 跨领域复合：湖边建木屋 + 种松树 + 放小狗 + 调黄昏 |
| `20_compound_farm_and_decor` | `compound` | 7 | 跨领域复合：农田浇水 + 创建节点并挂旋转脚本 |
| `21_voice_typo_and_vague_edit` | `voice-intent` | 5 | 语音同音字纠错（小鱼→小雨、小三丘→小山丘）+ 零误伤 |
| `22_multi_turn_coreference_refine` | `multi-turn-coreference` | 9 | 三轮连续指代微调（建蓝立方体→右移改红→抬高保红） |
| `23_strict_scope_and_non_destructive` | `compliance-scope` | 5 | 范围红线：仅删指定松树，其余树与岩石 0 误伤 |
| `24_capability_boundary_and_reply_hygiene` | `compliance-honesty` | 4 | 诚实边界（无大象/无音效如实回报）+ 0 内部 API/ID 泄露 |
| `25_environment_wind_fog_cloud_update` | `environment-write` | 4 | 环境 U：风速、轻雾与云量修改 |
| `26_building_inspect_update_delete` | `building-crud` | 8 | 建筑 R+U+D：建小屋 → 移位 → 删除 |
| `27_water_sample_and_delete` | `water-crud` | 5 | 水体 R+D：采样湖泊水深高程并移除水体组件 |
| `28_terrain_query_update_patch_delete` | `terrain-crud` | 8 | 地形 C+U+D：建山丘 → 调高 → 删除 |
| `29_vegetation_inspect_update_tree_shape` | `vegetation-crud` | 5 | 植被 R+U：查松树详情并改共享树形缩放与叶色 |
| `30_world_objects_selection_and_inspect` | `world-objects-crud` | 5 | 世界对象 R+选区：查询树木、inspect 详情并保存选区 |
| `31_world_parameters_reset` | `world-parameters` | 5 | 规划参数 R+Reset：重置动物激活距离回默认值 |
| `32_spatial_resolve_and_check` | `spatial-read` | 4 | 空间 R：`spatial.resolve` + `spatial.check`（零修改） |
| `33_animals_query_describe_receipt` | `animals-crud` | 6 | 动物全链路：spawn → query → describe → command → receipt |
| `34_farming_plot_crud_plant_delete` | `farming-crud` | 5 | 农场地块 CRUD：查地块/目录并更新或新建地块 |
| `35_farming_inventory_and_items` | `farming-read` | 5 | 农场 R：库存、容器、道具统计与携带物只读查询 |
| `36_scene_nodes_read_reparent_delete` | `scene-nodes-crud` | 7 | Scene 节点 R+U(reparent)+D：读取、换父并删除 |
| `37_components_read_update_remove` | `components-crud` | 7 | 组件 R+U+D：查询、更新禁用并移除临时组件 |
| `38_assets_crud_create_read_update_delete` | `assets-crud` | 7 | 资产 C+R+U+D：创建材质、读取、改色、查引用并删除 |
| `39_assets_prefab_create_and_instantiate` | `assets-prefab` | 5 | 资产 Prefab：创建 Prefab 并实例化多个节点 |
| `40_scripting_read_update_delete` | `scripting-crud` | 7 | 脚本 R+U+D：读取预置脚本、修改转速重编、查引用并删除 |
| `41_engine_knowledge_script_lifecycle_material` | `engine-knowledge` | 5 | Engine 知识：编写 `onAwake`/`onUpdate` 正弦浮动旋转脚本 |
| `42_history_undo_and_redo` | `history-crud` | 7 | 历史 Undo + Redo：撤销后再重做恢复 |

### 扩展新用例原则
每当新增一个世界引擎领域（如道路、NPC、任务、UI、音频）时，在 `benchmark-cases.ts` 同步追加 1–2 个端到端用例，明确填写 `expectedSkills`、`expectedDeclares`、`optimalSteps` 和确定性的 `verify()` 状态断言（严禁只检查文本回复）。
