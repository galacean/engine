# engine-next 原仓库失败诊断（2026-11-04）

> 后续修复与干净旧主线复验：Day/Night 已确认是引擎升级回归，现由 engine-modify 恢复旧加载行为，并补齐失败材质清理；另两页、58 条相关 Vitest 失败、Masonry 4 条和 shared 建筑 4 条失败已在 `039cbdcf + bd34daa` 实际复现。下面保留此前实验工作区诊断，不能将其“三个 Demo”结论当作干净旧主线结论。最新方法、结果和修复见 [来源版本复核](source-baseline-failure-review-2026-11-04.md)。

> 后续版本核对更正：本文“原仓库直接运行”指实验分支合并后的有效工作区，并非干净的 engine-next/dev/2.0@039cbdcf。两者使用不同引擎基线。Day/Night 的 Select 异常由新版 MaterialLoader 的严格拒绝行为触发，旧主线加载器忽略该字段，不会抛出同一异常。不能把该项统称为原 dev/2.0 已有失败。完整证据和结论边界见 [来源版本复核](source-baseline-failure-review-2026-11-04.md)。

## 结论与范围

三个 Demo 均在原仓库正常开发服务直接复现；原正式 Vitest 配置复现了此前同名的 51 条失败。不能把此前全部建筑失败算作原仓库问题：6 个 ENOENT 失败记录来自验收工作目录错误，其中 junction 用例修正目录后继续暴露原测试接口不匹配。

本轮没有修改产品逻辑、原测试、夹具或预期；只执行诊断、写隔离诊断脚本和本报告。测试失败意味着当前源码与测试之间存在冲突，不自动证明产品行为应按旧测试回退。

来源是当前 engine-next 工作区（含用户已有未提交修改），分支 dev/engine-next-experimental，HEAD 0963b42d76040e8587a07b6837c3f4091f4cf332；不是 GitHub 上该 commit 的全新干净检出结论。目标为 engine 的 dev/engine-next。

## 排除验收注入的方法

- 从来源根通过原 world/scripts/run-engine.mjs 启动原 world-gallery dev 和 test:terrain-project；原有 stamp 校验通过、Gallery 同步完成。物化目录是来源官方运行结构，不是另造的验收项目。
- 使用已安装的 pnpm 9.3.0、Vite 4.5.14、Vitest 3.2.6，Node 24.21.0。引擎 baseCommit 5cac8daa6fbc6060a01d829a333f688df177cc25，overlaySHA d12fa8e5ea0dce7f7084beefa048eb7b0b2bc0e525c58171de25292bd3887d30。
- 开发服务 http://127.0.0.1:5211 使用来源 vite.config.js，无 engineProbe、迁移插件、时钟/随机数/RAF 替换。浏览器仅记录日志、响应、页面状态和截图。
- Vitest 使用原 demos/terrain/project-tests/vitest.config.ts 与原 SeedWorldProjectTestSetup.ts（串行文件、15 秒单例超时），不使用验收 unit-setup 或目标修改层。
- 首次裸 pnpm 被 PATH 中 fallback 包管理器截获，出现依赖 bootstrap 错误；其追加的 pnpm-workspace.yaml allowBuilds 段已精确撤回。这不是产品失败，正式结论使用随后指定版本的命令。原根 node_modules 可能受该安装尝试影响；正式 Gallery 测试消费原物化工作区工具链。相关 bootstrap 日志单独保留。

## 三个 Demo

| Demo / 原入口 | 原仓库直接运行结果 | 根因 |
| --- | --- | --- |
| Cute Zoo：/demos/animals/cute-zoo/index.html | Invalid animal species: bull；HTTP 错误 0，失败请求 0 | registrations.json 的 bull.autonomy 仍含 cycles:6 / cycles:4；AnimalRegistration 当前校验明确拒绝 cycles 字段。启动校验 catalog 即失败，尚未进入模型加载。 |
| Day/Night：/demos/day-night-system/index.html | MaterialLoader: unsupported shader data type "Select"；HTTP 错误 0，失败请求 0 | 远端 Internal/Material/SkyMat.mat 返回 HTTP 200，shaderData.sunMode={type:"Select",value:2}；原 MaterialLoader 不支持 Select。属于 Demo 外部资产格式与当前加载器不匹配，不能描述为下载失败或迁移 Shader 修复。 |
| Metrics Zoo：/demos/terrain/seed-world-planner/metrics-zoo/index.html | OceanWaterCompileError: $.wetSource: Ocean render field has no wet texels.；canvas terrainStatus=failed；HTTP 错误 0，失败请求 0 | Demo 的 160×160 全陆地/空 waters 计划经 WorldPlanning3DView 进入 PlanningWaterRuntime.prepare。requests() 在首次发布无条件构建 oceanRequest，之后才应用可见性；ocean=false 只影响显示，不阻止编译。planningOceanDescriptor 的 wet mask 要求域外且地高<0，该场景没有湿像素，海洋校验器拒绝。 |

代码定位：

- [registrations.json](/Users/zhanyingwei/Downloads/AntGroup/Galacean/engine-next/world/gallery/demos/animals/cute-zoo/registrations.json)；[AnimalRegistration.ts](/Users/zhanyingwei/Downloads/AntGroup/Galacean/engine-next/world/gallery/shared/gameplay/animal/AnimalRegistration.ts:151)。
- [main.ts](/Users/zhanyingwei/Downloads/AntGroup/Galacean/engine-next/world/gallery/demos/day-night-system/main.ts)；来源加载器 [MaterialLoader.ts](/Users/zhanyingwei/Downloads/AntGroup/Galacean/engine-next/world/.materialized/engine/packages/loader/src/MaterialLoader.ts)。
- [PlanningWaterRuntime.ts](/Users/zhanyingwei/Downloads/AntGroup/Galacean/engine-next/world/gallery/demos/terrain/seed-world-planner/spatial/runtime/PlanningWaterRuntime.ts:655)；[PlanningOceanSource.ts](/Users/zhanyingwei/Downloads/AntGroup/Galacean/engine-next/world/gallery/demos/terrain/seed-world-planner/semantic-study/PlanningOceanSource.ts:32)。

证据：original-direct/demos.json（只取 animals/cute-zoo 与 day-night-system 两项）、metrics-demo.json、select-materials.json 及截图。初次脚本误写 /demos/metrics-zoo/index.html 的记录无效，已用上表正确入口单独复测，不能将误写入口当产品错误。

## Vitest：51 条逐组归因

复跑范围是此前失败相关的 14 个文件，不是全仓全量重跑：140 条，89 通过、51 失败、0 pending。与旧记录按 fullName 比较，新增/消失失败均为 0，证据 failure-comparison.json。

| 测试文件 | 失败数 | 当前原因 |
| --- | ---: | --- |
| ContextLandscapeClusters.spec.ts | 7 | 当前 poi-layout.json 的 contexts.poi=0，landscape-contexts.json 的 openlandDensity=0。纯 POI/空地夹具的候选会被 reveal 阈值过滤，结果为 0；测试仍要求存在树、随密度增长。并非高度 90 超出上限（当前上限 160）。 |
| LandscapeInfluences.spec.ts | 4 | 3 条依赖 road 上的 ambient/tree，但当前 contexts.road=0，目标不存在，后续 sourceId 读取失败；另 1 条预期 herbs=1，当前 natural-vegetation.json 默认 herbs=0（不是 shrubs 失败）。 |
| LayoutRoadMigration.spec.ts | 2 | 测试枚举只允许 connected/courtyard，当前枚举还有 region。 |
| OffshoreConfiguration.spec.ts | 1 | 测试断言 outcrop 高度 [16,36]，当前配置为 [4,16]；不是主岛/离岛不一致。 |
| PlanningGrassTerrainBinding.spec.ts | 2 | 夹具 _grassRockAppearancePending 使用 Set，当前代码按 Map 调用 .set()。 |
| PlanningInspectorContent.spec.ts | 7 | 6 条因纯 POI 夹具没有可选树而失败；另 1 条混合材质/密度事务期望 worldUnchanged=false，当前无树、密度调整未改变派生渲染数据，preparePublication 的 renderState 比较返回 true。不能归因为农场请求导致 full rebuild。 |
| PlanningSeedRuntimeDebug.spec.ts | 10 | 公共初始化夹具 treeFolderHost={}，当前代码调用 treeFolderHost.folder()；10 条均在此提前失败，尚未执行各自主断言。 |
| PlanningStorage.spec.ts | 1 | 夹具把 Scene.json 写为非 JSON 文本 keep；clear() 经 planningSourceDocument 解析该文件时 JSON.parse 失败。 |
| PoiSpacingMigration.spec.ts | 1 | 旧配方测试期望 large.minM=500，当前默认是 650。 |
| SeedWorldParticleWarmup.spec.ts | 1 | 伪造的 shader pass 没有当前 warmup 查询使用的 getTagValue()。 |
| SeedWorldRockPickRouting.spec.ts | 9 | 测试通过 AST 抽取 pickWorldObject 并 new Function 执行，仅注入旧 farming 变量，漏注入当前闭包 farmingHost；不是实际页面的 farmingHost 未定义。 |
| SeedWorldVoiceHudController.spec.ts | 5 | 1 条 model_started 后期望继续显示原始需求，当前显示“正在分析请求”；2 条继续按钮夹具/断言仍用 continueSprite，当前代码使用 retrySprite；2 条错误断言只接受 HTTP 500，当前 Session 输出带任务结果和修改保存状态的完整错误文案。不是 viewer 所有权断言失败。 |
| SpatialReveal.spec.ts | 1 | 纯 POI/空地夹具的植被为 0，隐藏前后均为 0，测试要求隐藏后的数量严格更小。 |

TreeReconstructionPipeline.spec.ts 同批 9 条通过。完整逐用例结果、堆栈为 official-vitest.json；缺失 expected/actual 细节的 5 条另用原 runner 精确筛选复跑，见 official-details.log。该次筛选产生的 skip 是选用例行为，不计入上述 140 条。

植被因果链可直接核对 poi-layout.json（road/poi/landform=0）、landscape-contexts.json（openlandDensity=0）与 ContextLandscape.revealLandscapeBasemap 的 context → abundance → threshold；没有修改这些值来让测试通过。Voice HUD 的 5 条均在原模拟 Session/请求的测试中复现，不依赖真实 LLM 网络服务。

### AssetEntranceEffect：此前“120 秒未完成”的具体原因

原正式配置独立执行：10 条，3 通过、7 失败。其中 3 条进度断言失败，4 条各自到达原 15 秒超时。ASSET_ASSEMBLY_ENTRANCE_DURATION_MS 当前为 2000，测试仍按 one-second default 推进；0.5 秒实际进度 0.25，预期 0.5；推进到 1 秒后 await playback 的测试不会完成，因为后续没有再推进帧。

因此来源确有测试时长假设不一致，但旧验收侧 120 秒进程终止不能作为原失败的准确计数/类型。证据 official-entrance.json，保留原超时预算与全部断言。

## 建筑：更正旧 13 条失败记录

原官方命令 `node world/gallery/demos/terrain/seed-world-planner/masonry/tests/run.mjs` 从来源根执行，8 文件共 47 条：43 通过、4 失败。其内部 esbuild/glob 适配是来源自带 runner，本轮未改。

| 原官方 runner 剩余失败 | 根因 |
| --- | --- |
| appearance：merged decorations tint… | 测试构造旧 package，没有 nativeAssets；当前 appendDecorationRenderPackage 从 nativeAssets 读取 decorationMaterial。 |
| appearance：resident decoration geometry… | 同上，缺 nativeAssets。 |
| junction-binding：native junctions… | 测试仍以旧签名传入 library、asset loader、globals；当前 buildConstructionRenderPackage 第二参数要求 BuildingAssets，后续 assets.units[brick] 失败。旧 ENOENT 遮住了这个第二层错误。 |
| worker：failed module loads… | 测试要求错误消息含 ConstructionWorker.ts；当前 onerror 只拼接 e.message 或 module script unavailable，不带模块位置。是原实现与测试诊断契约不一致，不是浏览器真的加载 Worker 失败。 |

旧验收的 6 个路径错误记录：appearance 的 4 条原始材质/调色测试、gothic-binding 整文件加载、junction-binding 的 .bin 加载。旧 cwd 为物化 world-gallery，测试又拼 world/gallery/...，形成重复路径。原 runner 从来源根运行后，4 条 appearance 及 gothic-binding 正常；junction 继续暴露上述接口问题。因此“147 通过、13 失败全部都是来源既有错误”的说法撤回；不能简单减 6 得到新全量结果，因为 gothic-binding 原先根本未展开执行。

### shared/tiny-glade 的另外 4 条

两文件 construction-platform.test.mjs / decorations.test.mjs 不在上述原 masonry runner 的清单内：

- 按原 README 的裸 `node --experimental-transform-types --test ...` 运行，当前 Node 在源码的无扩展名 TS import 处报 ERR_MODULE_NOT_FOUND，未进入断言。该命令的模块解析障碍必须单列。
- 用隔离的 resolve-only loader 补 `.ts`/`index.ts`/`.js → .ts` 路径解析，在来源原物化 Gallery 中执行原文件（保证 engine-math 可按原工作区解析）；没有 load/transform hook、没有改 import.meta、断言、资产或算法。结果 22 条，18 通过、4 失败。
- 另用来源 runner 相同的 esbuild 工具链，在保持源 import.meta.url 的条件下复现同样 4 条。这是辅助诊断，不冒充原官方命令。

| 测试 | 原因 |
| --- | --- |
| flat rim derives alternating original periodic occupancy… | 原测试要求 occupied 数量严格等于总槽位数的一半；当前 BoundaryPlacement 输出 33 个 occupancy 片段，其中 18 个 occupied，18 != 16.5。当前列表由实体片段/空隙区间组成，不能直接推定严格一一交替。现有测试契约与输出矛盾，尚不据此决定改生成器还是改测试。 |
| one merged resident draw… | 测试的旧 package 缺 nativeAssets，当前读取 assets.decorations 失败。 |
| resident packing retains the window UV… | 同上。 |
| Cottage native collision holes… | 原 hole.centerY 取 pivotY，渲染 appearance center 经 recovered placement 的浮点运算路径；实际 4.299999952316284 与 4.300000190734863，相差约 2.38e-7。严格相等断言失败，属于当前数值路径与精确相等约定冲突，不是此次资源路径错误。未修改精度或容差。 |

这些 4 条已在原实现、真实原资源中排除目标验收 loader 后复现；但不能声称原 README 的裸 Node 命令可以无适配跑到这 4 个断言。证据 official-tiny-glade.log（裸命令失败）、materialized-tiny-glade-extension.log（resolve-only 运行）、diagnostic-tiny-glade.log（独立打包诊断）。以上相关子集合计 69 条，61 通过、8 失败，不能替代此前 160 条范围的全量新结果。

## 复现命令

以下从 engine-next 根运行，使用已安装依赖：

```sh
node world/scripts/run-engine.mjs node /Users/zhanyingwei/.cache/node/corepack/v1/pnpm/9.3.0/bin/pnpm.cjs --dir world-gallery dev --host 127.0.0.1 --port 5211 --strictPort
node world/scripts/run-engine.mjs node /Users/zhanyingwei/.cache/node/corepack/v1/pnpm/9.3.0/bin/pnpm.cjs --dir world-gallery test:terrain-project ContextLandscapeClusters.spec.ts LandscapeInfluences.spec.ts LayoutRoadMigration.spec.ts OffshoreConfiguration.spec.ts PlanningGrassTerrainBinding.spec.ts PlanningInspectorContent.spec.ts PlanningSeedRuntimeDebug.spec.ts PlanningStorage.spec.ts PoiSpacingMigration.spec.ts SeedWorldParticleWarmup.spec.ts SeedWorldRockPickRouting.spec.ts SeedWorldVoiceHudController.spec.ts SpatialReveal.spec.ts TreeReconstructionPipeline.spec.ts
node world/scripts/run-engine.mjs node /Users/zhanyingwei/.cache/node/corepack/v1/pnpm/9.3.0/bin/pnpm.cjs --dir world-gallery test:terrain-project AssetEntranceEffect.spec.ts
node world/gallery/demos/terrain/seed-world-planner/masonry/tests/run.mjs
node --experimental-transform-types --loader ../engine/world/.acceptance/original-direct/source-extension-loader.mjs --test world/.materialized/engine/world-gallery/shared/tiny-glade/tests/construction-platform.test.mjs world/.materialized/engine/world-gallery/shared/tiny-glade/tests/decorations.test.mjs
```

## 全部 51 条失败名称（正式原配置）

### ContextLandscapeClusters.spec.ts

- content-relative landscape clusters reveals only immutable candidates without terrain reads, candidate hashing or backfill
- content-relative landscape clusters supports raised POIs with a dense nearby cluster and an actual zero outside its radius
- content-relative landscape clusters starts the falloff at occupied content edges without planting in their footprint, water or roads
- content-relative landscape clusters keeps per-POI changes local, honours a deliberate altitude cap, and preserves retained positions
- content-relative landscape clusters reuses ground habitat after road or rock-height changes but invalidates changed terrain
- content-relative landscape clusters rechecks moved roads and invalidates cached static placement after water or coast changes
- content-relative landscape clusters preserves exact nearest-source ties across context-grid boundaries

### LandscapeInfluences.spec.ts

- changes only the selected road source band and preserves unrelated instances
- tunes the selected source's tree range through both full population and height-only paths
- supports source inheritance, reset, serialization and local density publication through Session
- persists natural vegetation controls through world, tier, local, base and reset

### LayoutRoadMigration.spec.ts

- retires scatter and the branch boolean in active and archived layouts without mutating input
- retires auto selection without exposing a different inherited organization or rewriting other fields

### OffshoreConfiguration.spec.ts

- uses the same initial dimensions on mainland and offshore for every POI tier and organization

### PlanningGrassTerrainBinding.spec.ts

- planning grass shares the published Terrain surface publishes matching near/vista fields to Terrain and grass (shared vista: false)
- planning grass shares the published Terrain surface publishes matching near/vista fields to Terrain and grass (shared vista: true)

### PlanningInspectorContent.spec.ts

- keeps the instance fast path after changing animal runtime settings
- publishes animal settings in a mixed instance transaction without entering the world planner
- keeps world and POI panel structure and hierarchy through density hide and restore
- keeps panel ownership, field structure and hierarchy through one tree move and undo
- keeps immutable planning inputs through material edits and undo before reveal and instance edits
- publishes presentation in mixed batches while keeping their layout computation incremental
- keeps a tree edit incremental after changing the farm save choice

### PlanningSeedRuntimeDebug.spec.ts

- Native planning debug surface binds physical grass density and surface controls to the published World
- Native planning debug surface mounts rock controls in the Rocks category and refreshes edits that retain the same World
- Native planning debug surface reveals a hidden or collapsed inspector only when a picked ID belongs to the rock panel
- Native planning debug surface replaces rock controls with the World and disposes each panel before its inspector exactly once
- Native planning debug surface rebinds only after publication and keeps one live performance provider
- Native planning debug surface recreates rock and farming views across publications, retaining one farming controller until final destruction
- Native planning debug surface samples farm aggregates only while expanded and only from the current active farm
- Native planning debug surface profiles terrain only while expanded and transfers the policy to the newly published World
- Native planning debug surface preserves the host camera, flight offset, input and Orbit policy during bind and teardown
- Native planning debug surface builds probe bounds from published decoded height samples rather than legacy world constants

### PlanningStorage.spec.ts

- stores planning data only in the project without browser-storage fallback

### PoiSpacingMigration.spec.ts

- compiles complete POI solver defaults from a legacy recipe without storing generated configuration

### SeedWorldParticleWarmup.spec.ts

- production particle warmup discovery collects inactive emitters, camera-owned snow and only reachable wind feedback variants

### SeedWorldRockPickRouting.spec.ts

- native rock click routing selects the rock controls with AI world selection switched off
- native rock click routing preserves baseline rock selection when scene selection is enabled, with debug panel true
- native rock click routing preserves baseline rock selection when scene selection is enabled, with debug panel false
- native rock click routing switches generic selection from a tree to a rock and also selects the rock panel
- native rock click routing preserves enabled generic selection for non-rock objects
- native rock click routing clears generic selection on an empty click when scene selection is enabled
- native rock click routing does not pick without a consumer or when another input owner blocks the click: {"consumed":true}
- native rock click routing leaves panel and AI selection alone on a miss while world selection is off
- native rock click routing reports a failed debug pick without publishing an AI selection change

### SeedWorldVoiceHudController.spec.ts

- SeedWorldVoiceHudController lifecycle shows the submitted requirement until actual commentary arrives and retains full details
- SeedWorldVoiceHudController lifecycle accepts steering and followups while executing and exposes stop/continue controls
- real Session stops preparing photos, restores the HUD on remount, and keeps viewer/trace ownership outside the HUD
- projects late outcomes solely from Session and releases photo leases: 'attached', failure=true
- projects late outcomes solely from Session and releases photo leases: 'detached', failure=true

### SpatialReveal.spec.ts

- landscape reveal publication changes one POI without sampling ground or replacing any upstream module

## 证据目录

[original-direct](/Users/zhanyingwei/Downloads/AntGroup/Galacean/engine/world/.acceptance/original-direct)。所有原始日志保留，产品及来源测试未做修复；未在本轮重做完整性能验收。
