# 农场公共编辑器接入

农场沿用 Water 的原生资源、Source 和运行时消费者接入方式。本文记录当前资源格式、编辑与运行行为，以及可重复的验证入口。

## 数据与职责

| 入口 | 唯一数据归属 | 公共能力 | 农场适配与恢复语义 |
| --- | --- | --- | --- |
| 面板生长倍数、Agent `component.update` | Source `FarmingSystem.cropGrowthMultiplier` | 同一事务、校验、激活和历史 | 旧速率先结算，再应用新值；普通属性更新保留实例，属性删除导致重建时从仓储恢复 |
| 共享作物目录和规则 | 原生 `JSONAsset` 的项目 `.json` | 原生 JSONLoader、`$ref` 依赖、草稿、历史 | `farmingCatalog` / `farmingRules` 解码为只读领域视图；不复制第二份作者模型 |
| 道具模板、几何、材质、贴图与动作 | 原生 Prefab / Mesh / Material / KTX2 / AnimationClip | 项目资源加载、原生引用和依赖维护 | 整个 PlanningFarmingRuntime 随相关资源变更退役重建，从仓储恢复进度，保持其他世界系统不变；注册默认资源不覆盖项目映射 |
| 作物、土壤、库存和初始化凭据 | `PlanningFarmRepository` 与 runtime-owned 状态资产 | 串行发布、`project` retention、最终保存 | 作者撤销不覆盖后来接受的玩法进度；区域/组件重建不等于新建游戏 |
| 程序化作物和土壤网格 | 运行时派生资源 | 原有渲染组件和资源生命周期 | 继续按确定性配方生成；不烘焙连续生长为阶段模型 |
| 地形、环境、水源、交互挂载 | Seed World 宿主 | 既有激活参与者 | Host 负责绑定与串行退役，不成为存档事实或作者状态的来源 |

运行资产采用项目期保护，使组件移除/替换后仍保留不可撤销进度。受控关闭沿用已有停止、checkpoint、排空、flush 和释放顺序。作者接受、运行激活、持久保存分别报告；不把接入成功等同于玩法就绪。

## 资产转换清单

| 来源 | 生产资产与消费者 | 转换及共享关系 | 验收 |
| --- | --- | --- | --- |
| 储物车、仓储篮、收获篮 GLB | 原路径 Prefab，`Farming/Native/{Storage,Harvest}/…/*.mesh`、`*.mat` | 离线展开对象结构，保留局部坐标、索引、法线、UV 与全部材质参数；原 KTX2 继续共享 | 真实 Loader、Renderer 数量、边界、SubMesh、材质参数、纹理绑定对照 |
| 种子袋 GLB | `Farming/Props/Sowing/seed-sack.prefab` 及独立 Mesh/Material | 种子标签使用原生 Material 私有变体，修改 ShaderData 的图集偏移；不依赖 GLTF PBRMaterial 子类 | 原生加载、种子标签切换与材质/纹理对照 |
| 锄头、耙子 GLB 和其中动作 | 原路径 Prefab、原生 Mesh/Material、`Hoe_Till.ani` / `Rake_Level.ani` | 引擎原生二进制 AnimationClip；保留原 LINEAR/STEP 曲线和组件路径；控制器直接引用 clip | 原生加载、时长及 0/20/50/80/100% 的变换矩阵对照 |
| 浇水壶 GLB | 既有原生 Prefab/AnimatorController 引用 GLTF | 暂保留这一导入容器：其水流含 7 个形变目标，当前原生 MeshDecoder 解码形变时未传递 deltaNormals，直接转换会改变动画法线；Source override 使用实际文件 SHA-256 | 本次未替换形变表示，不宣称已全部移除 GLB |
| 14 类作物的连续配方、器官着色曲线和规则表 | `.json` 目录、规则和程序化派生 Mesh/PBRMaterial | 连续生长、随机株型和颜色曲线仍是领域参数，不作为静态模型或第二份材质作者状态；原生不能把这组算法参数表达成单个 Mesh/Material | JSON 校验、引用、实际作物及存档恢复 |
| 图集、道具贴图 | 原有 KTX2/Texture | 不重编码已原生化的图片；目录内部引用改为 `$ref` | 公共依赖提取与真实加载 |

6 个道具产出 24 个原生资产：6 个实际使用的 Prefab，以及转换清单中的 18 个 Mesh/Material/AnimationClip 文件。原 GLB 仅保留作离线转换输入和测试对照；生产资源清单不注册这 6 个 GLB。生成器拒绝未支持的拓扑/通道，完成全部转换后统一写入，`--check` 检查产物是否一致，清理生成目录中的过期输出，不在失败中途发布部分结果。

```sh
python3 packages/farming/src/farming/tools/convert-native-props.py
python3 packages/farming/src/farming/tools/convert-native-props.py --check
node packages/farming/src/farming/tools/generate-host-declarations.mjs
```

原生 `AnimationClip` 已被 Engine Loader 支持。农场宿主通过已有格式注册点声明其无外部引用且只读，供项目依赖初始化消费；类型和二进制加载器保持引擎原生实现。当前改动不再修改公共 RuntimeEditor 格式表。

## Unity 参考与组件微调

参考 Unity 6.0 官方文档：[MonoBehaviour/ScriptableObject 的职责](https://docs.unity.com/en-us/engine/6000.0/manual/scripting/get-started/creating-scripts)、[ScriptableObject 数据资源](https://docs.unity.com/en-us/engine/6000.0/manual/scripting/get-started/fundamental-unity-types/class-scriptable-object)、[Inspector 修改脚本字段](https://docs.unity.com/en-us/engine/6000.0/manual/scripting/get-started/inspecting-scripts)。本次借鉴通用组件和值/资源引用的分工；农场行为是本项目领域实现，不声称存在 Unity 内置农场组件。

| 参考职责 | Galacean 对应 | 作者属性、范围与默认值 | 生效及失效范围 |
| --- | --- | --- | --- |
| MonoBehaviour 场景行为 | `FarmingSystem` | `enabled` 为原生组件开关；`cropGrowthMultiplier` 为 null 或有限数 0–100，null 继承共享规则（默认 1） | 0 只暂停作物生长；调整不加速水分/昼夜、不重建世界；重开保留，撤销恢复 |
| ScriptableObject 共享参数 | 原生 JSONAsset | `catalog` / `rules` 为项目资源引用；种子、作物与目录版本需合法 | 共享数据内容或引用变化触发整个农场运行时重建并恢复进度；不能使用改规则绕过存档兼容性 |
| GameObject/Prefab 的组合与值覆盖 | 原生 Prefab + MeshRenderer/Animator | Mesh、Material、纹理、AnimationClip 及原有 Transform | 私有表现副本只由农场创建/释放；依赖资源编辑生效后重建整个农场运行时并恢复进度 |
| 实际模拟区域 | `FarmingAreaComponent` | 稳定农场/布局身份与运行输入；玩家进度不作为作者微调值 | 领域服务维护快照和进度；不把每个算法步骤拆成组件 |

现有生长调试面板已经调用公共作者事务，提示文字同步改为可保存/可撤销。该值从原来的会话内调试旋钮变为项目持久化属性；本次只保留这一标量，不扩展微调面。组件 setter 自行同步各已初始化区域的串行队列，新区域初始化后也读取当前值；Host flush 为幂等补充。作者提交后激活失败提示“已提交；运行更新失败”，不会把已进入历史的值报告为修改失败。Agent 可通过相同 Source 属性契约操作。正式 Editor 仓库的完整 Inspector UI 不在本工作区，本次交付的是 Engine RuntimeEditor 与 Seed World 的接入。

## 当前格式与旧农场隔离

- 新项目使用 `World/Farming/Catalog.json`、`World/Farming/Rules.json`，文件类型都是原生 `JSON`。`JSONAsset.data` 保存领域 JSON 文档，调用方使用 `farmingCatalog(asset).data` / `farmingRules(asset).data` 读取，不依赖旧 ReferResource 的引用计数或结构。
- 新工程由初始清单注册原生道具，再通过常规 Source 和依赖初始化接入。旧工程开档时继续使用原清单。显式重建会在同一事务中补齐缺失的当前原生道具和依赖，保留同路径同类型的现有编辑，类型冲突时拒绝重建。
- Seed World 根据清单中的旧 `FarmingResource` 类型或旧农场预置执行隔离。普通 JSON 资产的文件名可以包含 `.farming`，重新打开仍保留原内容。隔离会按本地或 Prefab 实例的 Source 作用域摘除依赖已移除组件的消费者及关联覆盖，保留独立的 Script 资产，并在接受候选前编译受影响的 Scene 和 Prefab。隔离先尝试读取未加载的原资产。原清单、元数据、可读取的原始内容与受影响的 Source 原文收录在 Scene 对应的 `.farming-quarantine.json` 项目文档。无法读取的旧资产记录原因，世界其余内容仍可打开。原农场状态资产保持原路径与内容，其他场景内容可继续编辑。
- 旧农场被隔离后，3D 页的世界状态区会显示「旧农场已隔离 · 重建农场」。链接保留当前种子、模板和其他页面参数，并添加 `rebuildFarm=1`。新预置优先使用 `World/Farming/Rebuilt/`，若目录已被占用，就给目录、规则、贴图和状态整体分配下一个可用目录。已重建的工程再次打开会保留新组件身份和当前进度。原工程存储版本保持不变。
- JSONAsset 是 EngineObject。独立宿主创建的资源保留到宿主/Engine 释放，不再在 `configure` 后立即 destroy；项目资源由公共加载链管理。
- 宿主 Script 导出的运行类不变，原生农场模块的声明从当前源码重新生成，按当前 `packages/farming/src/farming/native/` 索引同步 Seed World；building-components 的旧声明消费者已在上游退役，不恢复已删除文件。不向 Script 声明导出生长倍数校验函数。
- 需要复用归档内的 Script 时，编辑者可提取原文，按当前 JSON 与组件接口更新后作为新的 Script 资产加入。归档内脚本不会参与项目编译。

## 资源失效、校验与旧存档清理

`PlanningFarmingRuntime` 持有公共 `RuntimeAssetChanges` 基线，并通过 `recordRead` 接受惰性读取的初始内容；`affected(pack)` 的依赖闭包与当前系统 catalog/rules 及实际道具 Prefab/AnimatorController 根集合求交。自定义目录中的材质和纹理同样触发重建；无关资产编辑与单纯读取不触发。重建覆盖整个农场运行时，保留项目仓储进度。

项目校验沿 FarmingSystem 的有效 catalog/rules 引用读取 JSON，包括 Prefab 覆盖。校验包括 kind、版本、容器规则和目录作物对应的存储映射，与运行时复用同一套定义校验。项目会话缓存最后一组校验通过的目录和规则，定期保存进度复用该结果，失败候选不替换缓存。

保留 `project` 存档策略。移除组件或切换 state 后，旧仓储释放也不会解除当前会话的路径保护，删除仍会报运行资产所有权错误。清理旧存档的顺序为：提交组件移除/引用切换，保存并完成受控关闭，重新打开项目；确认旧文件未被组件再次持有，查询资产引用后删除无引用文件并保存。不要在同一会话里重试“释放后删除”，也不要修改公共保护机制绕过限制。

## 资源所有权与工程完整性

- 播种缓存持有 mesh、平台 buffer 和材质的引用，过期或销毁时先解除 renderer 借用。种袋材质变体销毁前恢复原材质。篮筐内容材质在首次借用前可跨 GC 使用，释放时先解绑对应 renderer。
- 隔离事务尝试从原 URL 读取尚未加载的旧资产并保留原字节。读取失败的条目记录原因并保留清单和元数据，场景仍可开档。三种原生 nested Source 回归分别覆盖模板目标摘除、实例属性携带退役引用和实例新增农场组件。
- 两个独立 Demo 在初始化前登记自己创建的 JSONAsset。失败、提前离开及恢复都先结束系统消费再释放，恢复期间只借用 ResourceManager 加载得到的资源。

| 复验命令 | 2026-11-18 结果 |
| --- | --- |
| `pnpm exec vitest run --config packages/farming/vitest.config.mjs` | 77 条通过 |
| `pnpm exec vitest run --config world/tests/farming/vitest.config.mjs` | 49 条通过。含真实 HeadlessEngine 的 GC、帧尾更新、两个平台 buffer 的单次销毁，以及两个独立 Demo 入口的初始化失败、恢复和待完成任务释放 |
| `pnpm exec vitest run --config world/scripts/acceptance/seed-world-fixes.config.mjs seed-world-project.spec.ts FarmItemShaderPreparation FarmingOcclusionClick FarmingPointerPriority FarmingTargetIdentity PlanningPublishedFarmingGround FarmingComponentEditor AgentSkillsVfs ProjectWriteBoundary` | 102 条通过，工程入口 14 条 |
| `WORLD_DEMO=seed-world pnpm --dir world build` | 通过，仍有大 chunk 提示 |
| `python3 packages/farming/src/farming/tools/convert-native-props.py --check` | 24 个原生资产一致 |
| `node packages/farming/src/farming/scripts/generate-native-api.mjs --check` | 109 个声明通过 |
| `git diff --check` | 通过 |
| `node world/scripts/typecheck.mjs` | 未通过，仍为 26 项农场范围外诊断 |
| `node world/scripts/check-boundaries.mjs` | 未通过，仍为两处既有跨 Demo 引用 |

Paseo 的 WebGL 上下文创建失败，浏览器 GPU 验收未通过启动阶段。HeadlessEngine 回归经过正常帧尾销毁队列和平台 buffer 的实际销毁入口，尚未测得本机 WebGL 驱动下的资源释放。测试标签和临时服务已关闭。
