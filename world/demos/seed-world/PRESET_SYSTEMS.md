# 预置农场与建筑接入

> 2026-10-21 合并 Farm09：本文后续的施肥、篮子展示/收起和收获直接入库描述属于 #83 历史验收记录。当前版本已移除施肥/肥力，收获进入持久篮子，通过 pickupItem/placeItem 管理携带、unloadBasket 手动入库；更新后的用例以 `tests/llm/cases/farming-atomic.json` 为准，本次合并未重跑真实 LLM 或浏览器验收。

当前模块所有权和版本边界见 [模块划分](MODULES.md)。

本期目标：农场与建筑通过同一套 Scene / Entity / Component / Asset 编辑流程供 UI 和 LLM 使用，系统自行管理状态；不实现系统召回、安装或从零生成。Worker 仅持有可序列化身份和异步代理，执行仍有超时/取消与调用预算。Engine Script 与 Editor execute 的声明和知识分开。

## 验收与当前证据（2026-10-18 更新）

以下为当前状态；后面的日期记录保留当时的过程和失败证据，不作为尚未完成事项清单。
本期预置接入目标已完成，逐项验收见 `output/preset-systems/completion-audit.json`，当前范围 CR 见 `closing-review.json`。后续包召回、安装与生成实验不属于本次通过结论。

| 要求 | 当前证据与边界 |
| --- | --- |
| 预置启动及本期范围 | Seed 直接注册农场、手工建筑、规划建筑；已移除 ResourcePackage 安装链路和系统创作 SDK，Agent 仅暴露当前版本的编辑能力。真实模型确认范围并完成只读查询，见 `llm-preset-only-summary.json`。 |
| 通用接入 | 三类系统通过相同的扩展注册、身份代理和 Tool dispatcher 接入；业务资产格式及保存校验由系统模块注册。通用代码中无业务名称分支，相关保存、激活与调用链已完成本期范围审查。 |
| Scene / Entity / Component | 已验证稳定身份、增删、禁用、重建及保存重开。手工建筑采用文档中的世界坐标，管理节点及祖先变换不挪动作品；实际 Engine 的变换/激活矩阵见 `masonry-transform-review.json` 及对应浏览器证据。 |
| Asset 与系统状态 | 农场目录/规则/存档和两类建筑作者数据均使用虚拟路径；领域所有者保存状态，普通草稿保留最新系统写入。切换独立资产、引用保护、释放后删除及重开已验证。 |
| 农场操作 | 29 项领域契约映射到 FarmingSystem 代理。真实模型已执行播种、施肥、浇水、自然成熟后收获、库存提取、篮子显示/隐藏、地块创建/修改/删除及锄地/耙地/除草；见 `llm-farm-actions-summary.json` 和各任务 Trace。 |
| 建筑操作 | 手工 11 项、规划 5 项方法均有真实模型调用证据；覆盖作品创建、完整文档和材料修改、局部隐藏/恢复、地形适配、定位、墙/屋顶/地基修改和保存重开。见 `llm-manual-summary.json`、`llm-planned-matrix-summary.json`。不宣称验证了所有参数组合。 |
| 混合编辑与撤销 | 真实模型在同一 execute 创建 Entity 并修改建筑；撤销移除了 Entity，同时保留独立系统命令的建筑改动。农场/建筑原绑定和原始作者数据已独立读库核对，临时文件、脚本和节点已清理。 |
| Editor / Engine 材料 | execute 使用 Editor 异步代理；Script 使用预置模块的真实 Engine 类。公开示例类型检查、生成声明一致性及真实模型创建/挂载/运行/清理 Script 均有证据，见 `llm-preset-script-summary.json`。 |
| 验收限制 | 真实模型曾发生编译、输出预算和结果读取错误，随后自行恢复；不计作零错误验收。最初一次输出超限的任务不计成功。视觉美感与移动端原生壳不在这些记录的证明范围内。 |

证据均位于仓库 `output/preset-systems/`；真实浏览器生命周期证据另位于 `output/playwright/`。
当前回归基线：Node 22 下 Runtime Editor 49 文件 / 514 测试通过；农场相关 65 项通过，最后一次说明改动后另复跑 6 项；Runtime Editor 类型检查及农场声明生成检查通过。
累计台账逐项记录完整阅读、定向阅读和生成/实验文件排除的边界；没有把全部历史文档或生成物宣称为逐行审查。

## 已实现：预置接入入口

- SeedWorldDemo 直接注册原生种植类型，创建 PlanningFarmingRuntime；不再读取/安装 farming package。
- 系统编辑能力通过 editorExtensions 注入。composeAgentConfiguration 同时组合模型可见能力、类型检查声明和 Worker 调用绑定，宿主保持事务/视觉观察的唯一所有者。
- 通用组合器验证注册冲突、代理方法是否暴露、暴露工具是否实现。相同 query 入口可有多个类型声明与检索条目。
- PlanningFarmingRuntime 保留上游建筑地面接入、种植业务和本地项目存档；销毁会尝试完成所有资源清理并汇总失败。

## 本期交付边界

1. 预置农场、手工建筑和规划建筑的接入、API、说明、声明与真实模型操作已验收；功能通过不等于所有参数组合或模型零错误。
2. 系统包召回、安装、从零生成留给下一版本；本地历史实验保留，但 Seed 不暴露这些能力。
3. 未提交、推送或部署。以后合入时按已记录的范围分类选择产品源码，排除本地 `output/` 和不属于本期的实验；人工审美与移动端原生语音不在本次功能验收范围。

2026-10-17 验证：通用扩展/世界农场混合 14 项，农场运行/访问发布/保存/面板 49 项，共 63 项通过；Terrain 类型检查通过。日志位于 output/preset-systems/。这是阶段进展，不是完整目标验收。


## 2026-10-18：通用组件身份与调用边界

- `tools.component.query({scene, entityId?, id?, type?})` 查询当前 Scene 草稿的持久化身份；`component.read` 读取当前作者属性。同次 execute 的创建、修改、删除都能立即查询，查询不把事务标为已修改。
- `RuntimeSceneProjection.queryComponents/resolveComponent` 用 `{scene, entityId, id, type}` 解析当前已激活实例，拒绝已删除/跨 Scene/错 owner/错类型的身份及需要恢复的投影。不缓存 Engine 实例，不使用显示名或 instanceId 作为编辑身份。
- 系统通过 `createRuntimeComponentExtension` 提供自己的输入/输出 schema、知识、声明、方法和命令回执分类。通用调用器每次重新校验并解析组件，注册工具与声明能力图绑定一致。它不自动把任意 Engine 方法开放给 Worker，也不接管系统持久化。
- 组合器提前拒绝“一个工具名称占用了另一个工具的命名空间”这种冲突，避免执行到 Worker 时才失败。

验证：7 文件 31 项（含世界/农场混合用例）通过，Terrain 类型检查通过。真实 Chromium + Engine + 生产 Worker 查询 DirectLight 身份并读回主线程值；Script 热替换后旧身份解析到新实例；从保存项目加载新 Scene 后身份相同而实例不同；删除真实组件后旧身份被拒绝。证据 `output/playwright/preset-component-identity/result.json`。这不替代农场/建筑业务接入、真实模型决策或全面功能验收。

下一步优先让系统现有的运行所有者成为可持久化 Scene 组件，再使用此通用入口注册业务方法；不能仅给现有旁路 API 加一层假组件身份。农场配置/目录/规则资产、建筑作者资产与组件关系仍须完成。

## 2026-10-18：农场使用真实 Scene 组件

- `preparePlanningFarmingScene` 首次给 Scene 增加原生 `FarmingSystem`，保存稳定 Entity/Component ID。初始化记录保存为同路径 `.farming-preset.json` 文档，不扩展 Editor Scene schema；删除组件后重开不自动重建。已存在的组件及禁用状态保留。
- SeedWorldDemo 从 RuntimeSceneProjection 解析实例交给 PlanningFarmingRuntime；Runtime 只拥有生成的 Farm/表现子树，不能销毁作者实体。通用 activation 完成后，宿主处理组件移除/替换，释放旧仓储所有权再绑定新实例；面板通过 getter 读取当前 Runtime。
- `createFarmingComponentExtension` 复用通用组件分发器，完整映射 FarmingAPI 的 29 项操作。Worker 仅持有 `{scene,entityId,id,type}`；`system.list()` 查询系统内区域，方法显式传 farmId。没有虚构的 systemId，也不以 farmId 冒充组件身份。
- API 输入 schema、命令分类、失败事实和回执由同一领域实现提供。声明从真实命令类型生成；新 `farming/system-editor.md` 与系统代理声明一致。旧预览 Demo/旧包原型仍消费旧区域代理，Seed World 已不使用该入口；不能将旧包原型视为本期安装功能。
- 修复原生 FarmingSystem 在 Engine 尚未分发旧实例 onDestroy 时拒绝替换实例的问题：发现已销毁 owner 时先结束其所有权，避免新组件被错误判为重复。

验证：新/既有农场原生接口 68 项通过；新组件身份下的世界/农场混合编辑 8 项通过；首次初始化、保留已有组件、删除后重开 3 项通过。现有发布、持久化、面板 49 项回归通过（随本次改动注入真实 owner）。真实 Chromium + 生产 Worker 完成 Scene 加载 → 发现系统与区域 → 播种/浇水/回执 → 删除拒绝旧代理 → 新组件恢复作物；再次加载保存项目，最终组件身份与作物实例 ID 相同。证据：`output/playwright/preset-farming-component/{initial,restored}.json` 与 `output/preset-systems/farming-component-*.log`。

仍未完成：目录/规则/状态资产与组件引用关系、完整 Seed World 页面生命周期验收、建筑组件及全部操作的接入、移除本期模型暴露的包安装/生成材料、两系统真实 LLM 指令验收。当前浏览器使用最小真实 Engine 农场测试场景，不代表完整 Seed World 渲染或真实 LLM 已验收。

类型检查：Terrain 与 Farming 均通过，生成声明一致性检查通过（89 项领域声明）。Runtime Editor 检查仍为原先 18 条 tiny-glade JavaScript 声明缺失，输出与本轮前基线逐字一致；没有新增类型错误。


## 2026-10-18：农场资产与 Scene 引用

- 预置 Scene 的 FarmingSystem 使用 `catalog`、`rules`、`state` 三个 `$ref` 属性；资产存入项目清单，目录中的植物图集使用虚拟路径。贴图仍可 URL 托管，不伪造本地二进制内容。FarmingResource 引用规则由领域模块注册，通用 VFS 不识别种植名称。
- 首次配置创建目录、规则和空存档；已有版本的组件保留身份、禁用状态和存档内容；删除后不复活组件。共享目录/规则由组件持有 Engine 引用，克隆获得独立引用，释放组件不会销毁其他使用者的资源。
- 仓储按 Scene 中 `state.$ref` 指定的虚拟路径持久化。真实浏览器证实 `ResourceManager.getAssetPath()` 返回加载 URL（可能为 blob），因此不能用于推导作者资产身份。通用 Projection 新增 `readComponent(identity)`，返回与当前激活实例一致的作者记录副本，宿主从中读取领域引用。
- URL 托管存档首次写入读取已加载 JSONAsset，保留其他农场记录；持久化成功后更新当前组件的资源数据，失败不改。资源重载后仓储从当前组件获取资源，避免持续更新旧 JSONAsset。
- 切换目录、规则或存档路径时重新绑定农场 Runtime；普通存档写入不重建作者组件。Runtime 只释放自己的区域/生成子树和依赖绑定；作者组件与共享资源由 Scene 生命周期管理。

验证：四个 Terrain 文件 37 项、四个 Farming 原生接口文件 70 项通过；Terrain 类型检查通过。真实 Chromium + Engine + Worker 加载虚拟目录/规则/存档和 512×512 KTX2 图集，验证组件克隆引用计数回收、播种/浇水/回执、删除拒绝旧代理、重建恢复作物；再次打开 IndexedDB 项目后组件身份、作物实例 ID、资产引用相同。证据 `output/playwright/preset-farming-assets/{initial,restored}.json` 和 `output/preset-systems/farming-assets-*.log`。该浏览器验证使用最小真实农场场景，完整 Seed 页面与真实 LLM 验收仍待完成。

建筑接入必须覆盖两条现存产品链路：`PlannedMasonryWorld` 的规划房屋/墙/围栏与局部编辑，以及 `MasonryPanel → MasonrySession` 的手工作品、完整作者参数、材料替换、UV 隐藏/恢复、地形适配和查看。不能只给规划建筑加代理就宣称全部功能接入；UI 当前自行拥有 MasonrySession，后续须把生命周期与调用入口收敛到作者组件。组件禁用/删除必须同时影响可见性、拾取、碰撞和宿主地面查询，不能只隐藏 Renderer。

本阶段补充检查：Farming 类型检查通过，生成声明检查通过（89 项）；Runtime Editor 仍为原先 18 条 tiny-glade JavaScript 声明缺失，输出与前一阶段基线逐字一致，没有新增类型错误。


## 2026-10-18：手工建筑组件与通用边界

- `MasonrySystem` 是已注册的 Scene Script 组件，以 `authoring.$ref` 指定虚拟作者资产。它拥有 MasonrySession 与生成子树；MasonryPanel 借用当前组件的方法，不再自行创建会话。首次预置保存空作者资产和初始化标记，显式删除后不复活组件。
- `MasonryComponentHost` 将真实已激活组件与其源虚拟路径配对。资源引用切换先释放旧会话再绑定；未完成的旧保存仍更新旧路径对应的 JSONAsset。农场仓储采用相同的资源配对规则，避免旧写入污染新存档。
- 11 项 Editor 方法覆盖读取、模板读取/创建、完整文档替换、绑定局部更新、表面 override 添加/移除、地形适配、放置及相机操作。声明从真实领域类型生成（12 项类型）；通用 Worker 代理保持身份与业务参数两个独立字段，业务参数允许使用 id 等名称。
- 原生资产创建接受已注册格式，并由格式自行校验。`validateCreate` 允许创建新作者资产而不开放绕过会话的 asset.update；手工建筑已允许独立空作品或完整作者 JSON。未知类型仍拒绝，包创建仍走原专用路径（本期移除模型包入口的工作尚未完成）。
- 活资产所有者防止旧草稿覆盖新写入；Editor 把实际删除清单带到持久化提交，仍被所有者持有的资产会明确拒绝，不能悄悄恢复文件后返回成功。完成组件移除和释放后，下一次 execute 可以删除无引用资产。该规则不识别业务名称。
- 扩展格式用 `contentEncoding:"utf8"` 声明文本内容；RuntimeEditor 为 VFS 注册并释放声明。远端自定义文本和已有 UTF-8 字节缓存均可阅读。农场与建筑的作者/状态读取也接受 UTF-8 字节，保留严格 JSON/领域校验；不在 VFS 增加业务类型白名单。
- 完整页面曾在两个扩展同时启用时因同名 `editor.component.query` 失败。API 目录现在以模块及名称识别符号，允许不同模块的合法重载，仍拒绝同模块重复项；组合测试实际构造 AgentLoop，避免仅验证配置数组。

验证：通用资产/代理/知识 40 项通过，农场与建筑绑定/持久化 41 项通过，扩展组合与 Agent 协议 23 项通过，既有 masonry runner 62 项通过。Terrain、Farming 类型检查通过；Runtime Editor 仍为既有 18 条 tiny-glade JS 声明缺失，与前一阶段基线逐字一致。生成声明检查通过；git diff --check 通过。

真实 Chromium + WebGLEngine（含 ShaderCompiler）+ 几何 Worker + Agent Worker 已验证模板创建、材料修改、组件禁用/删除/重建、独立作者资产创建与释放后删除。再次打开 IndexedDB 项目，组件身份与作者参数一致。证据：`output/playwright/preset-masonry-component/{initial,restored}.json`。完整 Seed 页面已修复双扩展启动失败并达到 ready，面板完成模板导入、木板材料修改及查看建筑；真实截图 `output/playwright/preset-masonry-component/full-page-focused.png` 已检查，建筑正常可见。完整页面刷新后再次 ready，作者参数与修改前逐项一致，木板材质保留；证据 `output/playwright/preset-masonry-component/full-page-{created,edited,restored}.json`。真实 Worker 验证不等同于真实 LLM 决策验证。

复审范围：当前手工建筑的新组件、会话、宿主、资产、面板、声明及上述共享边界；没有把历史 VFS 全量 diff 当作本轮已完整复审。已加载 general/engine 两个 Pack 的生命周期、异步、复制、序列化、API、状态失效、观察者、时序、依赖流、空间、资产加载、场景组件和渲染透镜；同时读取 Bug 修复/重构及风险、测试、文档证据协议。新增能力/事务一致性缺少独立透镜，按公开契约与存储测试审查。当前整体结论仍是未完成评估，不宣称目标已达成。

明确剩余项：规划房屋/墙/围栏的组件与代理接入；禁用/删除后的拾取、碰撞、地面支持和农场引用联动；作者实体及其父级变换与世界坐标放置/地形/相机之间的完整语义（当前仅验证单位变换场景）；Engine Script 的两系统专用声明与导出；清理模型可见的包安装/从零生成材料；真实 LLM 全量指令及两系统交叉编辑验收。仅凭最小场景通过不能关闭这些缺口。

复审逐文件台账：`output/preset-systems/masonry-review.json`，明确标注完整/定向读取和生成文件。范围审计返回 needs-scope-split：包含历史 output 构建/证据及先前召回样例 Coral.mat；尚未提交或合入，不将其记为通过。


## 2026-10-18：规划建筑的生命周期接入前置

本轮补齐 `PlannedMasonryWorld` 的组件宿主边界，尚未把规划建筑声明成 Scene 组件，不能把本轮验证计为完整接入。

- `enabled` 同步控制生成根节点、拾取、线段/胶囊查询、bounds 与新的农场地面 capture。有效性变化推进 `publicationRevision`，供既有农场 Runtime 重新采集；此前已发布的 capture 保持冻结语义。此状态与世界发布阶段临时隐藏父节点分开，候选世界仍可在隐藏阶段准备有效查询。
- `edit` 接受命令 AbortSignal；排队、等待共享细节与准备几何后都检查当前命令资格。保存前取消不写作者数据；保存期间取消不能撤销已提交作者，组件仍存活时继续发布对应几何。销毁则立即隐藏根节点并撤下 live 查询，等待同一份编辑/细节清理 Promise；重复销毁不会提前返回“已清完”。
- `list`、`documentFor`、`focusInfo` 返回独立数据，外部 Script 不能通过修改返回对象绕过保存和几何重建。销毁后的作者读取与新编辑明确拒绝。新增 `PlannedMasonryPatch` 命名类型，供后续组件方法及声明复用。
- 所有变化均在建筑领域模块；本轮未向通用 Editor/Worker/VFS 增加业务分支。

验证：规划建筑发布、LOD 调度及农业地面查询三个文件共 74 项通过。新增 6 项覆盖启停、返回副本、排队取消、准备取消、保存后取消及重复销毁。通过 Vite load 插件在测试进程内加载 HEAD 的旧实现进行反证，不修改运行源码或开发服务器：旧实现 5 项失败、1 项通过，后者是必须保留的“保存后取消仍发布”行为。当前实现新增 6 项全部通过。证据：`output/preset-systems/planned-masonry-lifecycle-{tests,focused,baseline}.log`。

真实 Chromium + WebGLEngine + ShaderCompiler + 几何 Worker 夹具验证：启用/禁用/恢复有实际像素变化，拾取与碰撞同步切换，旧 capture 不变；已驻留细节的建筑编辑在保存期间取消仍完成发布；销毁清理可重复等待，WebGL error 为 0。截图 `output/playwright/planned-masonry-lifecycle.png` 已人工查看（启用有建筑、禁用仅背景、恢复有建筑），结果 `output/preset-systems/planned-masonry-lifecycle-browser.log`。完整 Seed 页面仍为 ready，46 栋规划房屋与此前保存的手工作品正常加载；`output/preset-systems/planned-masonry-seed-ready.log`。这些是 Runtime 行为验证，不是 Scene 组件代理或真实 LLM 验证。

Terrain 类型检查通过；Runtime Editor 类型检查仍有既存 18 条 tiny-glade JS 声明缺失，输出与前一阶段基线逐字一致，没有新增诊断。git diff --check 通过。本轮局部复审未发现新增的确定问题；逐文件范围、未验证项与结论记录在 `output/preset-systems/planned-masonry-lifecycle-review.json`。整个目标仍未完成：下一步需把规划建筑真实绑定到 Scene 组件与作者资产，处理世界候选发布、组件替换/禁用/删除/重建时的所有权，再接通面板、Editor 代理、声明与 knowledge；前一节的坐标语义、Script 导出、本期非目标入口清理和真实 LLM 验收仍未关闭。


## 2026-10-18：规划建筑接入真实组件与资产

- 新增 `PlannedMasonrySystem` Scene 组件，以 `authoring.$ref` 引用 `PlannedMasonryAuthoring` 虚拟资产。首次预置记录保留显式删除；宿主按通用 Projection 身份绑定组件，不把 Engine instanceId 当成持久化身份。
- 组件拥有每个准备中/已发布的建筑世界；`PlannedMasonryCollection` 向导航、拾取、农场地面和世界发布提供多组件的几何汇总。禁用同时影响显示和空间查询。替换作者资产先释放旧写入者，保存完成仍写回原路径对应的资源。
- Editor 扩展提供 list / inspect / edit / focus / returnToRoam。list 分页，完整属性由 inspect 提供；全部建筑补丁类型从领域声明生成。面板选择真实组件并调用同一组方法，换组件或投影后清除旧草稿。位置与布局仍由空间规划 API 管理。
- 新世界准备前等待当前建筑编辑结束；准备后启动的新编辑立即使候选失效，避免旧世界退役时才完成保存而新世界保留旧数据。
- RuntimeProjectSession 提供通用候选校验注册点，Editor prepare 和真正持久化前分别执行。建筑模块自行检查作者引用类型与独占写入权，通用编辑器不识别建筑类型。重复引用在保存前报错，失败后原项目、版本和运行实例不变；新建独立作者资产后可继续编辑。

验证：规划/手工组件与几何发布 68 项、项目存储 30 项、调度/世界发布 52 项、农场建筑地面 6 项，共 156 项通过。Terrain 类型检查通过；Runtime Editor 仍为原先 18 条 tiny-glade JS 声明缺失，与 farming-assets 基线逐字一致。生成声明检查通过（手工 12、规划 13 项类型）。

真实 Chromium + Engine + 生产 Worker 验证编辑保存、禁用/启用、删除/重建、切换作者、两个独立组件、重复作者拒绝、删除释放后的资产与 IndexedDB 重开；证据为 `output/preset-systems/planned-component-browser-v3-{initial,restored}.log`。完整 Seed 页面修改 `poi-large-1:volume:0-roof` 屋顶高度到 0.55，画面生成更新后刷新仍读回 0.5500000317891439（Float32）；截图 `output/playwright/planned-component-full-edited.png`。功能观察不代表用户审美验收。

剩余：真实 LLM 全指令矩阵、预置系统的 Script 导出与声明、农场单 Scene 所有权的 Editor 校验、手工建筑实体变换契约、本期模型可见包安装/生成材料清理。当前通用范围审计仍为 needs-scope-split（包含历史输出与整个未提交接入），不宣称已通过全目标 CR 或达到交付条件。

真实模型初次验证：ASAP `codex/seed-world-local-debug` 远端与本地均为 `dd14e71a348`，经 antcode fetch 核对；8082 服务 PID 98241 属于该工作树。当前源码实际请求 `dsv41flash`，Trace 返回 `aisearch_dsv41flash` / requested_model。Root Seed 问答通过。模型自行找到最近房屋 `poi-medium-1:volume:7`，调用规划组件 edit，将屋顶参数从 0.1264534890651703 改为 0.4000000059604645，并 inspect 读回；任务 completed。证据 `output/preset-systems/llm-planned-roof-{result,final}.log`。过程中有错误路径探索和 4 次类型检查拒绝，不能视为完整易用性验收。已将三个领域目录入口改为明确的虚拟说明/声明路径，继续复测；通用 Prompt 和 Worker 未新增业务规则。

保存校验反向证据：仅在 Vitest 加载期间移除 commitPackage 的 validator 调用，新增公开 publish 回归失败，非法候选被成功保存；见 `output/preset-systems/project-validator-baseline.log`。产品文件未做反向修改。

知识复测：第二次完成屋顶 0.45 修改，共 22 轮；随后修正 world 指南中的 tools 命名空间、过时 building.edit/delete 说明和组件查询归属，并补充分页筛选/聚合后返回的边界。第三次真实模型在 12 轮完成屋顶 0.5 修改，仍有两次模型生成代码的类型错误并自行恢复，不能宣称完全消除认知成本。IndexedDB 独立读取确认作者资产仅记录 `poi-medium-1:volume:7` 的 `roof.height=0.5`，无其他建筑修改。证据 `llm-planned-roof-v3-summary.json`、`llm-planned-roof-persisted.log`。知识回归另有 10 项通过，本轮共 166 项通过。农场真实模型指令继续验证中。

农场真实模型基础链路现已完成：9 轮自行查询组件/地块/目录，在空地块 B1 种番茄并浇水，回读两条回执、作物实例和含水率；一次空值类型检查失败后自行修正，拒绝阶段没有执行命令。最后读回作物实例 `22c282ae-84fa-4670-b160-7b5f755ba086`，解除土壤过干暂停。独立读取项目存档确认作物、播种/浇水回执和建筑 roof.height=0.5 同时存在，另三块地仍为空。证据 `llm-farming-result.log`、`llm-farming-building-persisted.log`。这只证明两条基础真实模型流程及状态共存，完整操作矩阵、重启后联合业务验收与视觉表现仍需继续。


## 2026-10-18：农场 Scene 所有权与状态文件删除

诊断确认两处边界错误：运行时 Scene 单例约束没有进入 Editor 保存前校验；Farming 状态格式的永久 runtimeOwned 禁删与 project 级保留叠加，使组件移除后无引用的存档仍不可删除。两个删除回归在修改前均失败，日志 `output/preset-systems/farming-ownership-before.log`。

- 新 `PlanningFarmingProjectValidation` 由 Seed 宿主注册到通用项目校验入口；首次加载前检查，后续 prepare/publish 共用。拒绝重复 FarmingSystem（包括禁用实例）、缺失 catalog/rules/state 引用和错误资产类型；删除唯一组件合法。没有在通用 Editor/Worker 中加入农场分支。
- Farming 状态资产的内容仍由领域 validate 拒绝直接编辑/创建/导入；移除类型级永久禁删，使用通用引用检查与活跃 owner 检查。仓储改用 owner 级保留，释放后不自动删除存档，但允许下一次明确删除。正在使用的状态文件仍禁止删除，旧草稿也不能覆盖最新业务状态。
- knowledge 说明一 Scene 一个系统、多农场区域，以及先完成组件移除/引用切换、再删无引用存档的操作顺序。

验证：47 项通过（Scene、存档、运行时、既有地形发布校验）；Terrain 类型检查通过。真实 Chromium + Engine + Worker 完成播种/浇水、重复组件拒绝且项目/版本/实例不变、移除后旧代理拒绝、组件重建恢复作物、从 IndexedDB 重开。日志 `farming-ownership-after.log`、`farming-ownership-terrain-types.log`、`farming-owner-browser{,-restored}.log`。类型检查曾发现新增文件与已有地形校验文件重名，已恢复原文件并独立命名；复测包含原校验 7 项。

本阶段仍未覆盖：真实 Seed 页面移除组件后删除存档的端到端操作、目录/规则内容的完整保存前语义校验、状态资产新建入口、Script 导出、手工建筑变换以及完整真实模型指令矩阵。整体目标继续，不能以本次局部 CR 代替整体验收。


## 2026-10-18：农场资源内容校验与空存档创建

通过普通资产/组件入口复现：catalog 错指向 rules 时保存前没有拒绝，空状态资产 create 被写保护一并拦住；红灯日志 `output/preset-systems/farming-resource-before.log`。

- 将种子引用和规则约束从领域定义校验中拆为可复用函数。Engine 资源构造与 Editor 格式验证复用，检查植物/作物/种子、土壤、环境、动作策略及模拟参数；模拟参数的内在约束与需要真实 cellSize 的扩散稳定性分开，后者仍在区域服务中检查。
- 项目校验核对同一 FarmingSystem 引用的 catalog/rules 内容 kind、版本与仓储定义组合。成功的最近一对内容按字符串缓存，变更后重新检查，失败不更新缓存；Scene 所有权每次仍检查。首次只准备当前组件引用的远端内容，不加载无关资源。
- 引用查询仅解析文件结构和贴图路径，不构造完整植物目录，避免引用扫描引入重复业务构建。
- SeedWorldFarming 支持普通 asset.create 创建 `{version:1,farms:{}}`；禁止用 raw update 写作物/库存/回执。未绑定的新文件可按普通引用规则删除。说明已补齐创建示例。

验证：领域/原生/水分/地块六文件 147 项通过；Scene/持久化/Runtime 三文件 44 项通过。真实 Engine/Worker 通过错误 kind 与错误规则拒绝、空存档创建/禁止直写/删除、原组件重建与作物恢复（`farming-resource-browser.log`）。Terrain 类型检查发现格式 Map 推断错误，已显式声明 Map<string, RuntimeAssetFormat> 后复查。

限制：这还不是已有存档的定义迁移方案。改变合法规则/作物版本后与旧存档的兼容、simulationConfig 在 PlanningFarmSave 的读取一致性、引用切换后真实 Seed 场景恢复仍需继续验证；不能把资源结构合法等同于旧存档已安全迁移。完整系统目标保持 active。

后续验证：Terrain 类型检查通过，Editor 类型检查仍为完全相同的 18 项既有声明错误。真实模型任务 `95ba4d7f-2bc3-47fe-9329-e5a28907ddbd` 在 25 步完成空存档的创建、读回、引用检查、删除；一次空值类型检查拒绝后自行恢复，没有执行被拒绝脚本。独立 IndexedDB 读取确认试验文件不存在，原番茄实例 `22c282ae-84fa-4670-b160-7b5f755ba086`、4 块地与 `poi-medium-1:volume:7` 屋顶 0.5 均保留，见 `llm-farming-state-asset-summary.json`。模型查找普通资产 API 时多次探索 Script/world 声明目录，因此在农场资产说明中补充直接读取 `editor/declare/native/api.d.ts` 的入口；该说明改进尚未进行第二轮模型对照。

知识回归另 10 项通过，本阶段共 201 项通过；仍不代表完整系统接入验收。


## 2026-10-18：规则与已有农场存档兼容

复现：FarmingService 使用规则资源 simulationConfig 保存，PlanningFarmSave 却使用默认模拟参数恢复，正常存档被判 INVALID_SNAPSHOT 并进入重建路径。修复前用真实 Service 写入覆盖参数的存档，恢复测试因规则签名不符失败，见 `farming-state-compat-before.log`。

- 提取有效土壤参数和已配置存档校验，Service、Planning 恢复及项目候选配置检查共用。PlanningFarmingRuntime 将规则资源 simulationConfig 传入恢复检查，不再以默认配置误判。
- 注册的农场校验器对比当前已接受项目；当目录/规则内容或 state 引用改变时，用候选配置校验所选存档全部农场的作物、库存、网格及模拟签名。普通运行时 checkpoint 继续由业务仓储校验，不反复做配置迁移。
- 不兼容的编辑在提交前拒绝，保持已有配置和存档。需要新的规则时，可同一编辑创建空状态资产并切换引用，保留原存档。没有引入隐式状态迁移或删除。
- 首次加载准备当前组件所引用的状态文件；切换到尚未读取的远端存档会提示先 read。未被引用的远端文件仍不在启动时加载。

验证进行中：48 项 Planning/恢复/Scene/持久化测试、147 项领域/原生/水分/地块测试、23 项 Service/快照/命令/生长测试通过，共 218 项。真实 Engine/Worker 拒绝结构合法但与现有存档模拟签名不兼容的规则编辑，并通过后续组件重建。整体目标未完成，真实 Seed 存档往返切换、类型检查和本阶段复查继续。


本阶段验证收尾：相关独立测试共 229 项通过（含超出默认土壤上限的覆盖参数恢复）；Terrain 类型检查通过，Editor 与原有 18 项声明错误一致。真实模型任务 `35ff0678-acd4-4625-9e17-70fe86161951` 在 29 步、零脚本失败下完成新存档创建、切换、初始化回读、切回和临时文件删除。独立 IndexedDB 核对原番茄实例 `22c282ae-84fa-4670-b160-7b5f755ba086`、4 块地和建筑 roof.height=0.5 均保留。见 `output/preset-systems/llm-farming-state-switch-summary.json`。局部兼容修复已验证，完整目标仍待 Script 接入、建筑变换、模型操作矩阵和整体 CR。


## 2026-10-18：预置系统的原生 Script 模块

- RuntimeProjectSession 在打开时接收通用 scriptModules；名称、原生导出和声明一并固定，拒绝重复名称及越界声明路径。编译 Worker、执行模块及 Agent 的 read/list 声明消费同一个项目环境。通用流程没有农场/建筑分支。
- Seed 宿主注册 `@galacean/seed-world-systems`，导出 FarmingSystem、FarmingAreaComponent、FarmingAPI、MasonrySystem 和 PlannedMasonrySystem。Scene 原生组件与 Script 导入保持同一类身份；execute 继续使用 Editor 代理。
- `systems/runtime.md` 明确两种环境、查询/就绪/生命周期与存储职责；281 个声明文件从实际源码生成，保留传递类型和注释。更新顺序为 sync-gallery → build-preset-system-declarations → sync-gallery；生成脚本支持 --check，并检查 TypeScript 诊断及声明依赖闭包。
- 浏览器真实 Compiler Worker → ESM → Engine Script 验证三类组件身份、农场查询、重复加载复用，以及未注册项目拒绝模块导入。没有用 Worker proxy 假装 Engine 实例。

验证：36 项相关测试通过；Terrain 类型检查通过，Editor 与既有 18 项诊断相同。模型任务 `6811e105-ed17-4861-b845-b8155817ef83` 在 19 步自行阅读材料、创建脚本并挂载新节点，Engine 控制台实际输出一次 `PRESET_SYSTEMS_PROBE {"cropCount":1,"buildingCount":46}`。两次 Editor 参数类型错误在执行前拒绝并由模型修正。随后 9 步清理任务移除节点、查引用并删除脚本；独立存档确认两者不存在，原番茄实例、7 个原节点及屋顶高度 0.5 保留。证据：`output/preset-systems/llm-preset-script-summary.json`。

本阶段复查限定新增 Script 注册/导出/材料链路；整体目标仍未完成。实测发现两轮模型均误用 editor.entity（当前入口是 tools.entity），清理时还对已删除资产查询引用并自行恢复。下一步需收敛通用 Editor API 的发现/命名，并继续手工建筑 Entity 变换、禁用本版本系统安装/生成入口、完整真实模型操作矩阵及累计差异 CR。


## 2026-10-18：统一 Editor 编辑入口

Native 编辑统一公开为 `editor.asset/entity/component/document/package`，执行仍复用相同 Tool dispatcher、Worker RPC、事务、预算和错误处理。Scene-scoped component.query 读取当前编辑草稿，能看到同次执行的新建/删除；带已注册类型时返回绑定身份的异步代理，方法每次解析当前 Engine 组件。仅 type 的查询读取活动运行时。新建组件须先提交激活，再调用 live 方法。没有加入农场或建筑分支。

删除原有 NativeEditingTools 根接口，迁移应用声明、测试与操作示例；应用业务 tools 保持独立。实体查询声明补充：层级来自父节点 children，parentEntityId 只用于创建输入。这个说明来自连续真实模型误读，不增加第二份父子状态。

验证：32 项相关测试通过，最终类型推导修正后复跑 9 项通过；Terrain 类型检查通过，Editor 与既有 18 项诊断完全相同。真实模型任务 `4602ef80-297e-408e-ad7e-cf2ace5d93e0` 15 步完成临时禁用节点/DirectLight 创建、同草稿查询、shadowStrength 0.2→0.3 回读、提交后回读和删除。一次 parentEntityId 类型错误执行前拒绝并自行修正，无运行时错误。独立 IndexedDB 确认原 7 个节点、8 个组件、番茄实例及 roof.height=0.5 保留，没有 Probe 残留。证据 `output/preset-systems/llm-editor-facade-summary.json`。

第一轮指令错误地要求当前 Engine 不存在的 intensity 属性，模型耗尽 32 步；作者数据保存但 receipt 报 Unknown property，第二轮已清理。这轮不计为验收通过。局部审查见 editor-facade-review.json，不等于累计 diff CR。系统安装/生成入口仍需关闭，手工建筑变换、完整指令矩阵和整体 CR 尚未完成，目标保持 active。


## 2026-10-18：本版只提供预置系统

本版本只注册预置系统。资源包安装、动态系统宿主及系统生成示例已删除，不保留能力开关或备用路径。普通文件/文件夹、Script 资产及预置组件保持可用。

Native Editor 工具、声明和系统创作知识随同一会话设置组装。默认 Script 环境移除 @galacean/editor-system，Worker 编译与 read/list 使用同一模块声明筛选函数。Seed 不挂载系统安装/创作指南，也不提供该 SDK；原先独立包实验显式启用。没有按农场、建筑名称分支。

修复前测试复现默认项目保存包和能力目录宣传包创建，两项红灯。修复后 81 项项目、知识、脚本与包机制测试通过。真实浏览器验证 SDK 编译拒绝、asset.import 包提交拒绝且原项目不变、普通文件夹导入成功；三个预置系统类身份、农场读取与模块复用仍通过。启用包能力的独立实验验证创建/渲染、动态系统 SDK、持久状态、重复命令与旧工具拒绝；不计作本版产品功能。

真实模型任务 `7c49619b-cc7a-41ec-91c1-bebe4f0707c8` 10 步正确确认本版不能安装外部系统，并查出 1 株番茄、46 栋房屋（138 个表面）。一次 nullable crop 类型错误执行前拒绝后自行修正；没有写入回执，模型当轮可用 API 列表不含 package.*。证据 `output/preset-systems/llm-preset-only-summary.json`。Terrain 类型检查通过；Editor 最终复查与既有 18 项诊断完全相同。声明已重新生成（281 文件）。本阶段局部审查记录为 output/preset-systems/package-scope-review.json，完整目标仍待手工建筑变换、全部指令矩阵及累计差异 CR。


## 2026-10-18：手工建筑世界坐标与真实模型编辑验收

真实 Engine 复现了手工建筑的坐标冲突：MasonrySystem 管理节点移动到 [23,7,-11] 后，生成物随父级变换移动，而资产 placement、地形采样和 focus 仍在原位置。沿用已有世界坐标约定（本轮未收到新的坐标语义选择）：生成根节点由组件拥有并创建在 Scene 根下，管理节点只负责启停与销毁，作品位置由 placement 决定。初次绑定也检查有效激活状态，禁用节点上的组件不会意外显示作品；通用 Editor/Engine 没有增加建筑分支。

真实 Engine/Worker 验证管理节点及祖先的平移、三轴旋转和非均匀缩放不改变作品 worldMatrix；改 placement 后生成物和 focus 一起到达 [12,0,9]。祖先/Scene 启停、组件移除、禁用节点重建、独立资产释放以及重新打开 IndexedDB 工程均通过。生成节点不写入作者 Scene。19 项相关组件测试通过；Terrain 类型检查通过，Editor 仍为原有 18 项声明诊断。原生 Script 声明已重新生成。

真实模型任务 e39d2aa8-a3b7-4e8b-a8b3-fa9650cf8371 用 22 步创建独立 MasonryAcceptance 资产/实体/组件，通过模板放置、木板材质 seed=321、完整作者编辑增高到 3.625、局部隐藏/恢复、地形适配与聚焦。三次类型检查失败均在执行前拒绝后由模型修正，没有运行时命令失败。独立存档确认作品数据保存。

重新打开页面后，任务 10b9cf19-7884-42ea-a6af-142d5781c9b3 用 27 步读取恢复作品及另一模板，验证管理节点变换不会改作者 placement，完成启停、返回漫游、删除实体、查引用、删除作者资产。独立 IndexedDB 确认回到 7 个原实体/8 个组件；原番茄实例、规划屋顶高度 0.5 和默认空手工作品保留。两轮覆盖了手工建筑当前 11 个 Editor 方法，但不代表每种参数组合或全项目指令矩阵已验收。

这轮同时暴露知识材料缺口：同一次 execute 的普通组件修改只作用于草稿，不能用其中的 live read 验证已激活效果；规划 list 的 total 是表面绑定数，不能当成房屋栋数。模型最终曾把 138 个表面误报为 138 栋，因此这条文字结论不计为通过。已在通用 Native Editor 声明/知识中明确提交边界，在规划建筑契约/生成声明/知识中明确按组件和 owner 跨页去重；未改变事务行为或添加系统特判。新增说明后的 4 项知识测试和 10 项规划组件测试通过，真实模型复测见本节末记录。

局部诊断及 CR：output/preset-systems/masonry-transform-diagnosis.json、masonry-transform-review.json；真实模型证据 llm-manual-summary.json。完整目标仍待农场其余动作、规划建筑多参数编辑、混合/撤销流程及累计差异 CR；不把本阶段通过等同于整个分支可合并。跨 Scene 转移已绑定宿主的 Engine 组件不在本轮已验证的作者操作范围内。

后续复测完成：任务 17d9be09-2c62-4355-971e-3b1e9bfb6a3f 共 19 步，模型自行分开普通编辑提交和运行时读回，确认 enabled=false→true；遍历 138 个表面并按 owner 去重得出 46 栋房屋。一次把组件 ID 字符串当对象的类型错误被拒绝并自行修正，无运行时命令失败。模型清理测试实体/资产后，独立 IndexedDB 再次确认 7 个实体、8 个组件、无测试资产或 Script、原番茄实例和规划屋顶高度 0.5 保留。见 output/preset-systems/llm-authoring-knowledge-summary.json。知识材料复测通过，完整目标仍保持进行中。


## 2026-10-18：农场完整动作与保存恢复的真实模型验收

独立存档 Saves/FarmActionAcceptance.json 经普通 asset.create 与 component.update 绑定。真实模型完成施肥、萝卜播种、自然成熟收获、篮子展示/收起、库存取出；收获使库存 0→1、地块空置，收起篮子不改变库存，取出后库存归零且仓储内容清空。后续完成除草、浇水、平整、地面可耕检查、临时地块创建/改名/翻地/删除，以及篮子仓储数量 1→3→1。所有操作通过 FarmingSystem Editor 代理，未向通用流程添加农场分支。

重新打开真实 Seed 页面后，模型读到收获 revision=30 与取出 revision=33 的持久回执、4 块地和空库存；再次施肥 95→100，即时 revision 与持久 committedRevision 均为 97。随后切回 World/Farming.json，下一次 execute 读回原番茄与 4 块地，查到测试文件无引用后删除。独立 IndexedDB 核对：7 个原实体、8 个组件，原番茄实例 22c282ae-84fa-4670-b160-7b5f755ba086 保留，测试文件和 Script 均无残留，默认手工作品仍为空，规划屋顶 0.5 保留。自然模拟仍推进土壤和生长，不以数值冻结作为保存正确性的标准。

验收并非零错误：首次任务 f1884541-a884-470f-9d6b-8b308ef97817 在模型生成长度上限处中断，此前施肥/播种已提交；续跑先核对回执，没有重复操作。ASAP 的“本次指令未执行”文案不准确，根因位于请求级服务越权描述任务级执行状态，本阶段未修复该外部实现。地块任务整理结果时错误访问 result.receipt 并捕获 TypeError，实际命令均有成功回执；已补齐 result.value.receipt、即时/持久版本字段区别及完整写操作示例，重开后的模型正确使用。模型仍出现可恢复的类型检查与返回超量错误，最终答复“没有失败步骤”不作为无错误证据。

修复说明中新建存档示例缺少 main 的问题；示例检查组合真实通用 Native 与 Farming 声明，并校验生成版说明与源码一致。65 项农场相关测试通过，最终说明更新后 6 项组件测试复跑通过，生成器 --check 通过。Runtime Editor 类型检查的 18 项错误来自没有启用 allowJs；与 Terrain 和声明生成配置对齐后，保留 strict/noEmit 的实际配置检查通过。

证据：output/preset-systems/llm-farm-actions-summary.json、farm-actions-review.json、llm-farm-final-persisted.log。局部修改复审完成；仍需规划建筑多参数、混合/撤销流程、外部失败文案和累计差异审查。整体目标保持进行中。


## 2026-10-18：规划建筑多参数、保存恢复与混合撤销验收

真实模型任务 9e265fe2-937a-49a0-b5c4-74587cd69fd6 在 14 步内创建独立 PlannedMasonryAuthoring 资产并切换组件引用，编辑同一房屋墙面 wooden_plank / parallel_rows / unitSeed=123，屋顶 height=0，地基 height=0.5 / pillars。surface_uv 隐藏覆盖添加后可 inspect，restore 后覆盖清空而其他参数保留。focus/returnToRoam 成功；分页按 owner 去重正确报告 138 个表面、46 栋房屋。两次 nullable 类型错误在执行前被拒绝并修正。

重新打开页面后，任务 75d83050-376a-42f1-ba43-2fb4b4f4881e 用 26 步核对已恢复参数，在同次 execute 创建 MixedUndoProbe 普通实体并把屋顶改为 0.25。提交读回两者存在；world.undo 精确撤销该事务后，实体消失，而组件独立命令保存的 0.25 保留。这验证普通编辑草稿与领域命令的提交/撤销边界，没有伪装成统一原子事务。随后切回原 World/PlannedMasonry.json、读回屋顶 0.5，查询测试作者资产引用为空并删除。一次 nullable 类型错误在执行前拒绝并修正。

独立 IndexedDB 核对：7 个原实体、8 个组件；无测试文件、MixedUndoProbe 或 Script；原规划作者内容完全恢复（仅屋顶 0.5）、手工作者仍为 null；农场只读，4 块地和原番茄实例保留。证据 output/preset-systems/llm-planned-matrix-summary.json、llm-planned-final-persisted.log。此阶段没有修改建筑实现；验证覆盖五个公开方法和代表性的跨表面参数，不声称穷尽每种建筑参数组合或完成审美验收。


完整 Editor 集成集首次运行暴露验证环境问题：默认 Node 20 不支持测试用 Promise.withResolvers（6 项失败）；两项 GLB 测试在并发负载下超过 15 秒，且 runner 出现一次 onTaskUpdate 超时。Node 22 串行对照 69 项全部通过，执行阶段耗时 32.91 秒。定位到 Vitest 深相等对约 4 MB Uint8Array 枚举全部键；只将三处二进制/含二进制项目断言改为 Node deepStrictEqual，保持完整字节及项目结构比较，不改夹具、产品行为或超时配置。同配置 69 项全部通过，执行阶段 615 毫秒。此数据仅说明测试断言成本，不代表游戏运行时性能；完整 Node 22 复跑另记最终结果。

最终复跑：Node 22.19.0，`vitest run --config tests/vitest.config.ts --maxWorkers=2`，49 个文件、514 项测试全部通过，无未处理错误，耗时 63.64 秒。GLB 两个文件在相同完整集中的断言也通过；`git diff --check` 通过。证据 output/preset-systems/editor-integration-full-tests-node22.log。真实模型测试资产已全部清理；当前仍需处理已确认的 ASAP 错误文案并完成累计 diff 的整体 CR/最终需求审计，不将本次全测试集通过等同于整个目标完成。


## 2026-10-18：模型失败文案修复与累计审查

真实农场验收曾在施肥、播种已提交后遇到模型输出超限，ASAP 却返回“本次指令未执行”。发生根因是单次模型响应边界对整个多轮任务执行状态作出了错误判断。已在本地 ASAP 的同步/流式共同终态处理处改为“当前响应未完成”，保留错误码、拒绝工具输出、结构化长度修复及流收尾逻辑。修复位于独立 ASAP 工作树，尚未提交或远端发布。

4 个公开入口回归用例在旧实现下因错误文案失败；修改后 MiniApp 模块 asyncio 测试 179 项通过，LocalCandyJar HTTP 流与消费者测试 44 项通过。trio 不作为 asyncio 实现的验收后端。目标 Python 环境未安装 flake8，没有声称 lint 通过；git diff --check 通过。证据见 `output/preset-systems/asap-generation-error-review.json`。

本地 ASAP 重启后，真实模型任务 `84d6b738-ed62-48d9-9541-b3a73bb58d4f` 4 步完成只读核对：4 块地、1 株作物、46 栋房屋（138 个表面绑定）。实际路由为 `aisearch_dsv41flash`；没有脚本失败或写入。首次模型响应同时发出两个工具，被协议校验拒绝并重试成功，因此不算零错误请求。见 `llm-post-asap-restart-summary.json`。

累计 CR 已建立 `output/preset-systems/cumulative-review.json`，覆盖全部 224 个变更/新增 world 源文件的路径与内容哈希，逐项区分完整阅读、定向阅读和未读。已追踪保存队列、领域状态合并、组件身份代理、VFS 导入/引用、Script 编译与模块生命周期，以及两类建筑的宿主绑定。未读内容和未闭合调用链继续保留，整体结论仍为 NOT ASSESSED；历史阶段报告不是整体通过证明。文档首页已按现有证据更新，后续不再把已经完成的功能列为待实现。


## 2026-10-18：累计 CR——农场面板资源一致性

发现并修复：组件已使用项目目录/规则资产，但调试控制器仍读默认 FARM_DEFINITIONS，目录替换后会显示并提交旧 seedId，库存/日志名称、土壤湿润度说明与取景边界也可能不一致。现在按当前区域引用解析定义，并使用 Service 已解析的模拟土壤参数；区域移除清空种子，目录替换刷新真实下拉框。通用 Editor、Worker 与 Prompt 没有新增业务规则。

验证：替换目录的回归修复前 1 项失败；修复后 Controls/Scene/Runtime 三文件 49 项通过。Terrain 类型检查通过。真实 Chromium 中验证空列表禁用、自定义选项更新、选择事件写回 seedId、移除后清空。浏览器验证使用真实面板与受控控制器模型，不算新增真实 LLM 验收。证据见 `output/preset-systems/farm-controls-resource-review.json` 与 `output/playwright/farm-controls-resource-panel.log`。

该阶段提出的仓储候选问题已在下述阶段复现并修复。

## 2026-10-18：自定义仓储资源与建筑链路复审

已保存容器的占地恢复改为使用组件当前规则。新农场仅在规则与规划预检不一致时，在原网格和原搜索范围内重新检查初始容器，保留操作通道和 initialContainers 配置；同规则复用原预检结果，已有存档不重新摆放。无合法位置时报告初始化失败，不改旧存档。通用 Editor/Worker 没有增加业务分支。

旧实现 3 项回归失败；修复后针对性 28 项、相邻集成 6 文件 73 项、组件代理契约 6 项通过。Terrain 类型检查、农场与两类建筑 Editor 声明生成校验、281 文件 Script 声明生成校验通过。新仓储经过真实 FarmingService 初始化和 MemoryFarmRepository 保存；宿主渲染使用测试替身，本阶段未新增真实 LLM 验收。证据：output/preset-systems/farm-storage-resource-review.json。

进一步阅读建筑方法声明/实现、规划建筑发布集合、存储、作者解析、编辑队列与面板，以及 Script 接入和农场文档。累计 227 个源文件中，98 个完整阅读、5 个部分阅读、124 个待审；整体 CR 和最终需求审计仍未完成。

## 2026-10-18：通用 Editor 与能力边界复审

已继续核对 Worker/执行循环、Scene 身份、原生编辑声明及测试；Agent 合同生成检查通过。默认 Seed 的工具、Script SDK 和项目保存边界均禁止系统包安装，预置组件使用宿主模块。实验包源码与共享路径/校验辅助实现已分类，尚未做提交范围拆分。本阶段未修改产品行为，也未重复运行真实 LLM；累计审查台账和阶段证据见 output/preset-systems/generic-editor-review-stage.json 与 preset-scope-classification.json。整体审查和最终需求审计仍在进行。


## 2026-10-18：本期预置系统最终验收

完成本期农场、手工建筑、规划建筑的 Scene / Entity / Component / Asset 接入；通用 Editor 的身份代理、保存、引用与事务链路不识别这两个业务模块。对照实际合同与原始模型 Trace，农场 29 项、手工建筑 11 项、规划建筑 5 项方法均有成功调用/回执或已检查的调用与返回值证据。Editor/Engine 声明分开，三个生成检查再次通过。保存重开、引用切换、组件生命周期、混合撤销和原始状态恢复的证据逐项整理到 `output/preset-systems/completion-audit.json`。

收尾修复两处验证问题：包身份夹具显式启用包编译声明及宿主 exports，真实浏览器红绿检查通过；Runtime Editor 测试 Vite 配置独立使用 `node_modules/.vite-runtime-editor-tests`，避免与正常 Gallery 服务共享依赖缓存。最终只读模型检查曾因主服务 TypeScript URL 返回 504 在执行前失败；已记录失败，重启已确认归属本任务的前端，并验证测试服务运行时主服务哈希保持不变、旧依赖地址仍为 200、测试检查 Worker 可用。

新页面真实模型任务 `5dd1c223-0650-4e3f-847b-e7cbd67898f7` 完成：三类组件及其资产虚拟路径均可查询，4 块地、1 株作物、46 栋房屋（138 个表面）。实际路由 `aisearch_dsv41flash`，无失败脚本、无写命令。见 `closing-llm-summary.json`、原始 `closing-llm-retest-trace.log` 与 `closing-dev-cache-review.json`。本期范围 CR 通过，逐文件覆盖和排除理由见 `cumulative-review.json` / `closing-review.json`；不宣称实验包功能已获下一版验收，也不宣称模型从不犯错。源代码保持本地未提交，未推送、合并或部署。
