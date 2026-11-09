# Water 编辑器接入实施记录

2026-11-05，当前 engine 工作区，基线 `ae0aaf81c47617b6865a5729bcf08ede3a8575a5`，分支 `t3/water-migration-todo-blockers`。变更保留在工作区，未 commit、push、创建 PR 或部署。

本期完成 W-01～W-22 在 engine 内的适用范围。按用户要求，不实现旧版本存档转换，不迁入 engine-next 的历史测试。正式 editor 的 E-00～E-08、本地 link 与发布期继续后置。本轮 Quality 组件化不关闭前次 CR：CR-008、CR-009 的 P1 与 CR-010 的 P2 结论保留，未在本轮扩大修复。此结果表示 engine 内 RuntimeEditor/Seed World 接入完成，不表示已接入正式 editor。

## 数据与职责

| 内容 | 唯一作者来源 / owner | 运行边界 |
| --- | --- | --- |
| 具体河湖海的岸线、控制点、水位、连接、显隐与交互 | Source `WaterBodyComponent.authoring`；启禁用是原生组件 enabled | PlanningDocument 是从 Source 投影的算法 DTO，不持久保存同一形状的镜像 |
| Seed 与首次生成规则 | 原有项目规划配置 | 具体水体与按 Seed 的初始化记录同次接受；普通重算、历史和重开不补回已删除对象 |
| 放置 | Source Entity Transform | 形状是局部米制坐标，支持平移/yaw/单位缩放；Seed World 在规划 DTO 边界转到世界坐标，写回时逆变换 |
| 外观值与纹理 | 一份原生 Material 及其 Texture/KTX2 引用 | `.mat` 持有视觉值和外观策略；固定结构从 Shader 家族代码推导；运行私有克隆只读作者资源 |
| 质量预算 | Source `authoring.quality` 类型化值 | 默认函数产生初值，Prefab 共享模板与实例叶子覆盖；运行 QualityResource 是组件拥有的不可变派生输入 |
| 共享水底高度 | 原生 JSONAsset 描述 + BufferAsset 高度 | 两条引用保存在 Source 组件；校验版本、网格、长度和 SHA-256；保留 Float64 精度 |
| Terrain、网格、atlas、编译 transfer、查询场、反射 RT、粒子 | Terrain/Water 运行 owner | 派生数据不进 Source、历史和作者存档；Seed World 保留 Terrain/Water 原子发布 |
| 农场地块、库存、物品、作物、运行时间 | 农场原有仓储与 runtime-owned 资产 | Water 发布只更新接地和取水输入，不执行农场重新初始化；作者历史不包含玩家进度 |
| 相机、Scene、订阅、候选、加载租约 | 各宿主及资源 owner | 一个 Scene 一个 WaterSystem；更换相机需重建 owner，禁止跨 Scene 偷用服务 |

实现入口：[作者契约](src/water/native/WaterAuthoring.ts)、[组件](src/water/native/WaterBodyComponent.ts)、[系统](src/water/native/WaterSystem.ts)、[公共宿主](../world-planning/src/spatial/runtime/NativeWaterHost.ts)、[作者操作](../world-planning/src/spatial/runtime/NativeWaterEditor.ts)、[Seed Source 边界](../../world/demos/seed-world/src/planning/spatial/runtime/PlanningProjectSource.ts)。

## 原生资产交付

生成命令：`node world/scripts/generate-water-assets.mjs`。产物在 [assets](src/water/native/assets)，[project.json](src/water/native/assets/project.json) 登记 **28 项**：16 份纹理、5 份 Shader（3 份可编辑源、2 份 AOT）、4 份 Material、1 份人工床面、1 份 Prefab、1 份 Scene。[conversion.json](src/water/native/assets/conversion.json) 记录复制资源的源路径、完整 SHA-256、尺寸、字节数、sRGB 与采样参数；生成器对已有来源 hash 做校验，合法用户替换使用新内容身份。

| 制作源 / 转换输入 | 原生运行产物 | 色彩与采样 / 直接依赖 |
| --- | --- | --- |
| Lake 已有 512² KTX2 | `Water/Textures/grasslands-water-normal-1024.ktx2` | 保留旧逻辑 ID 中的 1024；实际尺寸仍为 512²、linear、repeat、bilinear、aniso 1。未用 1024 PNG 制作源替换运行字节 |
| Farmlands wave / caustics | 原生 PNG Texture，512² / 1024² | wave linear，caustics sRGB；repeat、bilinear、aniso 1 |
| RiverDrop directional/cloud/lines/edge/voronoi/foam/mist/splash | 8 份原生 PNG Texture | 保留原始尺寸，包括 edge 256×512；cloud linear，其余沿用原 sRGB；原始 alpha 与 hash 不变 |
| Ocean smooth/rough waves、caustics、foam、intersectionNoise | 5 份 512² KTX2 | 两张法线 linear/aniso 4，其余 sRGB/aniso 2；repeat、trilinear、mipmap |
| 现有 Lake/Ocean AOT profile | 2 份 `.shaderc` 运行产物 | 复用已生成 profile；不是正式 editor 的编辑输入 |
| Lake/River/Ocean Shader 家族代码 | `Water/Shaders/{lake,river,ocean}.shader` | 原生 Shader 源和 `Editor.Properties`；Material 的 shaderRef 指向可编辑源，后端继续按有效结构派生变体 |
| 原始预设 Look 的视觉数值与纹理地址 | Lake/River/RiverDrop/Ocean 4 份 `.mat` | 颜色、透明度、法线、焦散、落水数值和外观策略进入原生有类型的 shaderData；纹理是原生引用，实际后端从当前 Material 取值 |
| 共享水底高度 | `manual-bed.json` + `manual-bed.bin` | 描述无资源路径；Source 显式引用原生 JSON 与 Buffer。Quality 继续保存为组件值 |

2026-11-06：已取消自定义水资源文件类型、扩展名注册和对应 Loader。水底明确选择场景 Terrain 或共享 JSON/Buffer 高度输入；后者通过普通项目事务更新一对原生资产。内部 Body/Look/Quality DTO 和资源只服务编译与运行 API，不再对应文件封装。动态 Mesh、材质克隆、atlas 和粒子继续由 backend 创建并释放。旧工程不自动重置，也不保留旧格式的运行解析旁路。

Source 路径引用经过公共 codec。正式 editor 的资产 ID 映射与导入 UI 属于 E 项，本期没有把路径直接写进正式 editor。

资源退役范围是 Source 作者链的旧固定纹理旁路。没有 Material 的低层运行 API/演示仍可使用 `OceanTextureLibrary` 及内置 Lake/Farmlands 工厂，读取包内同一原生 kit；该运行时默认路径不跟随项目纹理替换。Source 水体强制要求 Material，Ocean 从其五个原生纹理槽读取，不会进入该 fallback。

## 单 Material 与正式 editor 的合同

本轮只读核对 editor `22ca81865` 的 `MaterialAsset._getMainData`、Material 属性编辑、ShaderAsset 和 `shader-properties.ts`：材质保存枚举原生 ShaderData，纹理走资产引用，Shader 源通过 `Editor.Properties` 声明表单，Enum 的实际标量声明决定保存类型。Shader 名称可能按资产路径重命名，因此水家族用普通 Integer 参数标识，不依赖名称前缀。

本实现只持久化原生 Float/Integer/Boolean/Vector/Color/Texture，未给 Material 增加未知 JSON 字段或私有 JSON 字符串。反射优先级/回退、混合/裁剪和既有外观策略用有类型的枚举字段；固定映射、字段依赖和编译结构从既有 Shader 家族预设代码生成。组件不再选 Look，复制一份 `.mat` 即可产生独立外观；岸线、控制点、水位、床面和 Quality 仍归原有边界。

实际执行正式 editor 的属性解析与规范化函数，4 份 Material 的 403 个有类型字段及纹理引用全部解析并往返一致；Enum 保存为 Integer。该检查使用当前 modify 的 ShaderLibrary，正式 editor 的 E-00 link 仍是必需前置；其现有 npm Engine 缺少这里使用的云影/SSR includes，不能据此声称原生 npm 已可直接接入。正式 editor 的 UI 导入、复制、依赖和保存重开仍按 E 项验收，本轮没有修改 editor 工作区。

## Quality 组件值与所有权

Quality 不属于 Material，也没有新的 Quality 编辑资产。`WaterQualitySettings.ts` 定义可编辑档位、布尔预算、查询密度与误差/Atlas 上限，复用 `createWaterQualityPlanV2` 的值域校验。三种默认预算保留原三份配置的数值，`opaqueDownsampling` 将既有隐式默认明确为 none/2x。具体属性、单位、默认值和范围见 [作者接口](src/water/native/M1_AUTHORING.md#质量值属性)。

公开编辑支持 Quality 的类型化局部补丁，未知字段、旧资产引用和非法范围在接受前拒绝；false 和 0 不被默认值覆盖。Scene/Prefab 的 `authoring.quality` 是唯一持久值，普通 Scene 保留显式值，Prefab 按现有 Source codec 继承未覆盖叶子。规划 DTO 不复制质量，Seed 重算保留组件的质量值。

组件按不可变值修订派生 `WaterQualityResource`，候选配置保留其引用。替换后仅释放既不属于当前缓存也不属于已发布配置的派生对象；取消候选保留原发布资源，替代候选完成后释放废弃对象。Source Prefab 克隆建立自身的派生 Quality 所有权。低层运行 API 的 QualityResource/Plan 和序列化仍可使用，不构成 Source 的第二份可写作者数据。

只读复核正式 editor 的 CameraComponent `@serialize`/`@propertyField`：深度、采样与 MSAA 都是组件值。这里对齐这一合同，后续 E 项可按 `authoring.quality.*` 绑定字段；本轮未修改正式 editor 或实装 Inspector。

## 属性与 Unity 职责对照

沿用 TODO 中固定的 Unity HDRP WaterSurface / Splines 职责参考，不增加 Unity 运行依赖。

| 职责参考 | 本次实际 API 与默认来源 | 失效及限制 |
| --- | --- | --- |
| WaterSurface 实例 | `authoring.shape/visible/priority/interaction`；visible 默认 true，priority 默认 0，交互默认 query=true、buoyancy/wake=false | 复用领域校验；能力组合不支持时明确失败；hidden 保留查询，enabled=false 移除查询 |
| SplineContainer 曲线组织 | River `course.points/sections`；稳定点 ID，x/z/elevation/width/depth 为局部米制；speed 可显式为 0 | 复用 Watercourse 校验；段型决定解析和落水几何；深度必须与已接受床面一致，或由支持 Terrain 的宿主共同接受 |
| 水位与局部形状 | Lake `referenceLevel + levelOffsetM`，shoreline 稳定 ID/ring；basin 单独表达切挖意图 | 水位局部更新不改床面；岛洞不授权填土；普通微调不传整份 Terrain 数组 |
| customMaterial / 视觉属性 | 原生 `material` 及其 Texture 引用；默认值取当前原始预设 | 共享编辑传播到所有引用者；实例差异产生独立 Material；不从渲染克隆回写 |
| 管线与相机启用 | WaterSystem + Camera/Environment + modify 深度/反射能力 | 缺相机、重复 owner 有诊断；相机/Scene 不允许直接换绑 |
| 波形、范围与质量 | Ocean `waterLevel/layout` 和原生 Material，`quality` 类型化值 | CPU 返回 datum，排除 Shader 波峰；Seed World 仅 datum 0、最多一个活动 Ocean；Quality 不修改物理形状 |
| 连接 | `connections[].target` 为原生 Source 组件引用，截面/过渡长度为世界米制 | 连接组重编译；当前只支持两端单位世界变换，拒绝单端移动 |

面板实际提供 Lake 水位、统一河宽、Ocean 范围、显隐/启用、颜色、Material/法线引用、公共撤销/重做、保存和关闭。完整曲线 UI、正式 Inspector 与组件菜单留给 E 项；同一作者 API 已支持点列、深度和段型。

## W-01～W-22 验证台账

以下“完成”限定为上述本期范围和已声明能力。用例均为本次新增，未使用旧仓库测试计数。

| 项 | 状态 | 实现与本次验证 |
| --- | --- | --- |
| W-01 | 完成 | Source 唯一持久形状；Planning 只投影 DTO。`WaterSource.test.ts` 验证 referenceLevel、显式 0/false、手工覆盖、删除后不重生，拒绝旧 raw river 资源 |
| W-02 | 完成 | Lake/River/Ocean 联合类型与共同校验；领域用例验证无效值、河宽与深度床面约束；实际公共编辑验证三类形状及落水 |
| W-03 | 完成 | 28 项原生资产、完整转换清单；四类实际 WebGL 画面与原始预设逐像素比较相等，并有隐藏对照证明画面非空；纹理替换实际更新消费者 |
| W-04 | 完成 | JSON/Buffer 描述版本、字节长度、SHA-256 与床面校验；组件 Quality 复用领域枚举与数值预算校验；引用使用原生依赖图。错误版本、缺引用、Material 类型错配、删除被引用纹理均被拒绝且不接受作者变更 |
| W-05 | 完成 | 加载前注册 Water/格式，直接 Source Scene/Prefab 冷加载。生命周期用例覆盖缺相机、重复 System、多个 Scene；Seed 生产构建冷加载三类水体 |
| W-06 | 完成 | UI/Agent 使用共同 RuntimeEditor 草稿/历史。实际工具 updateMany 只发布一次；低层运行 API 拒绝修改 Source 水体；raw 语义水体 CRUD 与水色第二写入口删除 |
| W-07 | 完成 | 首次生成与按 Seed 标记同次写入；无生成结果时不建对象，后续首次生成仍可执行。Source 用例覆盖 inactive 祖先、Prefab 覆盖、人工值、重放和删除；没有独立 Water generator 组件或运行期补对象机制 |
| W-08 | 完成 | NativeWaterHost participant 管理输入批次并等待完成；多实例编辑单次发布，历史走同一路径；修复旧组件 detach 等待导致的 undo 死锁，退役完成后解除等待 |
| W-09 | 完成 | Seed 保留 Terrain→Water 的共同候选与同步 commit；最新生产 UI 河宽修改完成全量 Terrain/Water 发布，Lake 水位使用局部发布；只读床面深度失败保留旧查询，Lake carve 明确拒绝，作者仍可撤销修复 |
| W-10 | 完成 | 共享 Material/纹理内容更新影响真实私有消费者，独立副本与无关实例 revision 不变，床面资源不变；Quality 值的 query=off/sparse、false/0、undo/redo、重开与 Prefab 叶子继承有最小断言，不修改形状/床面/Material |
| W-11 | 完成 | 普通 Scene、双链接实例、嵌套 Prefab、内联成员均通过公共编辑；模板更新保留覆盖，revert/undo/redo/保存重开通过；Scene 不展开持久模板。修复通用 Source 稀疏覆盖的浅合并缺陷 |
| W-12 | 完成 | Source 身份派生 waterId，双实例不冲突；重开、移除/撤销、结构重建身份稳定；实际 Renderer 可反查作者，退役 Renderer 映射移除 |
| W-13 | 完成 | 平移/yaw 后局部 shape 不变，世界查询高程正确；非法缩放与静态连接单端移动失败；普通/Prefab 连接删除清除旧遮罩，撤销和重开恢复稳定引用 |
| W-14 | 完成 | 外观数值集中在 Material/Texture，世界 waterColors、规划颜色缓存/写端口删除；颜色、法线、落水 speed=0/透明度、运行禁用恢复和重开均有实际断言；外观不改床面 |
| W-15 | 完成 / 可选 Script 不适用 | Seed Agent 装配实际 `water.author` 并绑定当前公共 edit，工具实调用通过；旧 water.create/update 声明与发现入口删除，受影响的 Script 端口声明刷新并检查 312 模块闭包。本期未新增项目 Script 的 Water 作者权限，未做真实模型对话验收 |
| W-16 | 完成 | 逐项查询审计见下表；Seed 实测 Water 编辑沿用同一 farm 实例，保存关闭重开保留 4 地块、7 物品及稳定状态；本次快照无作物，不外推为完整种植玩法验收 |
| W-17 | 完成 | 隐藏/禁用/删除/撤销、runtime unload/restore、候选 abort/晚提交、共享材质/跨 Scene 释放均通过。失败的重复 System 不再抢占 Scene 组件；Source 组件与借用资源不由旧发布句柄销毁 |
| W-18 | 完成 / 旧档不适用 | 新数据 save→受控 close→新 Engine reopen 实测；关闭先停止/排空/检查点再保存再按依赖释放。简洁用例覆盖保存失败和释放失败重试，不重复 stop/save；未改项目 key、清档或实现旧档转换 |
| W-19 | 完成 | prepare 拒绝不改作者 revision；作者接受后激活失败返回 runtimeError，保留旧运行事实，仍可保存/撤销/修复；实际 Ocean 失败后修复与 River 深度失败撤销通过；关闭错误显示具体阶段与原因 |
| W-20 | 完成 | 独立 RuntimeEditor 在真实 WebGL/IndexedDB 中覆盖 Lake/River/Ocean/落水、引用、历史、关闭和新 Engine 重开；Seed 生产 UI 修改 Lake/河宽、保存、关闭、重开及重开后继续修改通过 |
| W-21 | 完成 | 新增 8 文件 14 用例；modify 映射类型检查、依赖边界、Agent 合同生成、两入口生产构建及 diff 检查通过。平台和未测项分别记录 |
| W-22 | 完成 | 删除 raw AuthoredLakes/AuthoredRivers、水色缓存/写端口、旧语义工具和显式导出；Source 使用项目纹理链；无 Material 的运行 API 保留内置默认工厂，演示复用同一原生 kit；清理声明/知识/文档并通过边界检查 |

## 下游输入核对

| 实际消费者 | 当前读取与更新方式 | 验证边界 |
| --- | --- | --- |
| 农场接地、取水、近岸灌溉 | `PlanningWaterRuntime.captureGrounding()` 捕获发布的 Water spatial fields，`PlanningFarmingRuntime.refreshWater()` 按物理修订刷新，不重建农场仓储 | 实测作者修改/历史后同一 farm 实例；保存关闭重开比较 grid/plot IDs、整地、灌溉记录、inventory/items/storage/crops/sequence |
| 玩家接触、动物导航、桥面 | `PlanningNavigationSurface` 读发布 Water sample；桥面与玩家支撑高度优先于其下水面；动物通过该 navigation 查询 | 源码逐调用核对，Water transform/hidden/enabled/query-off 有真实运行断言；未做完整动物/骑乘玩法回放 |
| 建筑放置、岩石伴生草 | Seed 的 isWater、rockGrassWaterTest 读发布 Water，接地仍使用同次发布 Terrain | 保留原有发布协议；河宽修改实际完成 Terrain/Water 发布，没有单独扩大为建筑/植被全套回归 |
| 规划生态、道路、出生候选 | 用当前 Source 投影的规划 shape/水位和同次 bed；`PlanningSpawnView` 在准备阶段使用计划候选 | 属于规划/准备输入，未宣称都直接调用 WaterSystem；运行查询走已发布版本 |
| 声音 | `PlanningWaterAudio` 用共同发布的 coast/river profile；运行开关与发布可见性来自 Water runtime | 几何随同次世界发布；湖水位局部更新不改变河流声源几何。未做听音主观验收 |
| 调试与拾取 | 公开 sample/sampleDrops、published diagnostics；Renderer 映射回 Source 组件 | 移除后旧 Renderer 不再命中作者；保留 actual/proxy/unsupported、Ocean datum 和独立 drop 查询语义 |

## 关键生命周期修复

Water 批量发布切换到替代组件后，会在旧渲染清理完成时结算待退役 detach；不再等待下一轮 flush 才结算，避免 RuntimeEditor 历史重建与 PlanningWaterRuntime 退役互相等待。取消或 owner 退出后禁止候选晚提交。重复 System 创建失败后也不能在 reconcile 阶段抢占现有 owner。

受控关闭发现并修复农场借用的 presentation 回调顺序：先停止和排空动作，解除借用端口，再在 Renderer 存活时释放 presentation，最后销毁 Entity。Seed 关闭使用可重试的依赖释放顺序；保存失败保留资源，释放失败不重复保存已进入释放阶段的工程。

通用 RuntimeEditor 只增加领域无关的能力：原生 Texture/KTX2/Shader 输入校验、Texture 采样参数、Source 组件引用操作，以及读取 Prefab 稀疏属性覆盖时复用已有 Source codec 深合并函数。没有在公共 Model/历史中加入 Water 业务分支。

## 本次实测与命令

环境：macOS，Node 26、pnpm 9.3，Chromium WebGL2 / ANGLE Metal。类型检查使用 world 的 modify 替换映射，不把原生 npm Engine 结果当作 Water 结果。

| 命令 | 结果 |
| --- | --- |
| `node world/scripts/generate-water-assets.mjs` | 28 项资产生成成功，来源 hash/尺寸/采样记录齐全；逐文件核对 manifest，无孤立文件、Look 或 Quality 作者资产 |
| `node /tmp/verify-water-editor-material.mjs` | 单 Material 轮已执行：4 份 Material、403 个字段和纹理引用类型一致，往返一致；Quality 轮未修改这些材质字段，未重跑此项 |
| `node world/demos/seed-world/agent-adapter/contracts/run-agent-contracts.mjs` | 迁移轮已生成成功；Quality 的 water.author 声明为运行装配的类型化模块，本轮直接更新其 Quality 输入声明，未重跑无关工具生成 |
| `pnpm --dir world typecheck` | 通过；检查器保留基线已有的 1 项原生诊断，没有新增诊断 |
| `pnpm --dir world check:boundaries` | 通过；未放宽包依赖规则 |
| `pnpm exec vitest run --config packages/water/vitest.config.mjs` | 8 文件、14 用例全部通过，真实 WebGL/Source/RuntimeEditor/IndexedDB；Quality 轮复用原用例，验证 query off/sparse、局部补丁、默认值、false/0、非法范围/类型、普通 Scene 与 Prefab 继承、保存重开，以及派生 Quality 的替换/取消/释放；原材质、像素及 carve 回归仍通过 |
| `pnpm --dir world build` | Quality 组件值接入后通过，26.84 秒；保留循环 chunk、重复资源发射及大 chunk 提示 |
| `WORLD_DEMO=water/editor pnpm --dir world build` | Quality 组件值接入后通过，8.07 秒；有大 chunk 提示 |
| 新增 TypeScript 文件的 Prettier 检查、`git diff --check` | 通过；未提交代码 |

测试文件：[WaterAuthoring](tests/WaterAuthoring.test.ts)、[WaterEditor](../world-planning/tests/WaterEditor.test.ts)、[NativeWaterPrefab](../world-planning/tests/NativeWaterPrefab.test.ts)、[NativeWaterPlacement](../world-planning/tests/NativeWaterPlacement.test.ts)、[NativeWaterDrops](../world-planning/tests/NativeWaterDrops.test.ts)、[NativeWaterLifecycle](../world-planning/tests/NativeWaterLifecycle.test.ts)、[NativeWaterRendering](../world-planning/tests/NativeWaterRendering.test.ts)、[WaterSource](../../world/demos/seed-world/tests/WaterSource.test.ts)。测试复用一个真实宿主夹具，没有复制旧套件或建立第二套假编辑器。

上一轮迁移的 Seed 生产 UI 实测（单 `.mat` 收敛后未重跑该手工流程）：Lake 偏移 `0 → -0.15 → undo 0 → redo -0.15`，Water revision `1→2→3→4`；河宽 `13.7976119266 → 14.8m` 后 revision 5，待退役 detach 为 0。保存完成后实际关闭，状态为 closed，面板销毁。新 Engine 重开仍 ready，Source 与 waterId 不变，Lake -0.15、河宽 14.8 保留；重开后可继续修改和撤销。

该次水体运行 ID：Ocean `water:a8d60c0cd67e3a5d`、River `water:3e5078386a488f20`、Lake `water:a5bd7c8c591c6316`。它们是该项目持久 Source 身份的派生值，不是所有新项目共用的常量。

保存前后农场 4 地块、7 物品，以及 grid/库存/储物/地块身份/整地/灌溉/作物表/序号的稳定字段逐项一致；湿度从约 24.76758 继续到 24.73794，没有重置。本次作物表为空，只证明已有非空地块与物品进度保护。

渲染回归固定时间、相机和 256² 画布，对 Lake、River、RiverDrop、Ocean 的原始预设与转换后资产读取实际 framebuffer；四组 RGBA 最大差值均为 0，隐藏水体对照均有超过 1000 像素差异。截图为 `/tmp/water-migration-{lake,river,river-drops,ocean}-{native,original}.png`，本轮自动像素对比通过；人工审图沿用上一轮，未重新做主观美术验收。

未验收：正式 editor、远端 Builder/发布、移动设备、GPU 性能、整场景美术、WebGL context loss/恢复、真实 AI 模型对话和完整种植/动物玩法。内置预览的截图接口两次返回 15 秒超时，备用 IAB 返回 browser access host unavailable；Seed 验收采用实际 UI 操作与只读运行事实，转换画面由上述真实 Chromium framebuffer 回归单独验证，不把截图失败写成通过。
