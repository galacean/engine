# 水系统接入公共编辑器 TODO

整理日期：2026-11-04。按 `galacean-editor-system-migration` skill 梳理，取代 2026-11-03 在 `engine-next` 仓库 `world/gallery/shared/water/` 下整理的旧版。旧版路径全部基于已退役的 `engine-next` 目录结构，以本文为准。

| 仓库 | 分支 @ 核对版本 | 本文用途 |
| --- | --- | --- |
| `galacean/engine` | `dev/engine-next` @ `ae0aaf81c47617b6865a5729bcf08ede3a8575a5` | 水领域包、World 公共包（RuntimeEditor/Project/规划/建筑）、引擎修改层、Seed World 与 Water Demo |
| `galacean/editor` | `dev/2.0` @ `0e3ce36a47226ba957a64f179d5d1d120de67344` | 正式编辑器的 Model、Inspector、资产、公开工具、Builder 与 Playground |

本文路径分两类：engine 仓库内的文件用相对本文的链接；editor 仓库的文件用 GitHub `dev/2.0` 分支链接，不依赖个人本机目录。“已有”指源码中有相应能力，不代表水系统已通过编辑器验收。

**本期范围（2026-11-04 确认）：只完成 engine 仓库内的部分**，即水领域契约、原生资产，以及 engine 内 RuntimeEditor/Seed World 宿主的接入（W 项）。在正式 editor 中接入和调试 water（本地 link Engine、打包 water、E 项）整体后置。engine-next 的旧测试不迁移到 engine 仓库。

**本次实施约束（2026-11-05）：** 用户要求在当前工作区实现 W-01～W-22，不 commit、不提交。旧版本存档转换不在本次范围；新数据的保存、重开、撤销及玩家进度保护仍需验证。按实际风险补简洁用例，删除冗余路径。下文的旧档转换要求按此约束执行。

**实施状态：本期 engine 侧 W-01～W-22 的适用范围已完成并逐项验证。** Lake/River/Ocean、落水、静态连接、原生 Material/Texture、公共 Source/Prefab 编辑、历史、保存重开与受控关闭均已接通。旧语义水体和重复水色写入口已删除。按用户要求，旧档转换不适用；正式 editor 的 E 项继续后置。每项实现、证据、限制和未测平台见 [实施记录](EDITOR_MIGRATION_IMPLEMENTATION.md)。

## 0. 仓库迁移带来的变化

2026-11-04 起，World 引擎代码（含水、农场、SSR）已从 `engine-next` 迁入 `galacean/engine`，并拆成 workspace 包，公共开发分支为 `dev/engine-next`。迁移记录见 [World README](../../world/README.md) 和逐文件映射 [files.json](../../world/migration/files.json)。

### 0.1 代码位置对照

| 旧位置（`engine-next/world/…`） | 新位置（engine 仓库） | 说明 |
| --- | --- | --- |
| `gallery/shared/water/**` | [`packages/water/src/water/**`](src/water) | 包名 `@galacean/engine-water`，按子路径导出，如 `@galacean/engine-water/water/native/index` |
| `gallery/demos/terrain/seed-world-planner/src/SeedWorldWaterStartupShaders.ts` | [`packages/water/src/world/`](src/world/SeedWorldWaterStartupShaders.ts) | 已归入 water 包 |
| `gallery/demos/terrain/seed-world-planner/spatial/**`（规划水体、发布、颜色） | [`packages/world-planning/src/spatial/**`](../world-planning/src/spatial) | `PlanningWaterRuntime`、`PlanningWaterPublication`、`NativeWaterEditor`、`PlanningDocument` 等；旧独立颜色 owner 已删除 |
| `gallery/demos/terrain/seed-world-planner/`（项目装配、存储、Agent 适配、Script 导出） | [`world/demos/seed-world/`](../../world/demos/seed-world) | `SeedWorldProject.ts`、`SeedWorldProjectFormats.ts`、`systems/runtime.ts`、`src/planning/spatial/runtime/PlanningProjectStorage.ts` |
| `gallery/shared/runtime-editor/**` | [`packages/runtime-editor/src/**`](../runtime-editor/src) 和 [`packages/project/src/**`](../project/src) | 事务、准备、Session、场景投影在 runtime-editor；项目、持久化、依赖、`captureUndo` 在 project |
| `gallery/shared/tiny-glade/**`、`seed-world-planner/masonry/**` | [`packages/building/src/tiny-glade/**`](../building/src/tiny-glade)、[`packages/world-planning/src/masonry/**`](../world-planning/src/masonry)、[`world/demos/seed-world/masonry/`](../../world/demos/seed-world/masonry) | 建筑参考实现被拆到三处 |
| `gallery/demos/terrain/data/seed-world/project.json` | [`packages/terrain/src/data/seed-world/project.json`](../terrain/src/data/seed-world/project.json) | Water `.shaderc` 与 AOT manifest 仍在此清单中 |
| `gallery/demos/water/**` | [`world/demos/water/`](../../world/demos/water) | 现已在 Seed World 和独立 Water Editor 加载前登记；[Water planner](../../world/demos/water/planner/main.ts) 保留运行预览职责 |
| `world/engine/overlay/**`、`world/.materialized/engine` | [`packages/modify/`](../modify)（[`native-overrides.json`](../modify/native-overrides.json) 登记 182 项整文件替换） | 不再物化 Engine 副本；替换只在启用 `engineModify()` Vite 插件的构建中生效 |
| `gallery/**/tests`、`project-tests`、浏览器夹具 | **未入库，本期不迁移** | 迁移验收时曾复制到已忽略的 `world/.acceptance/tests` 运行；本期 W 项的验收方式见第 8 节 |

### 0.2 实施前核对的编辑器接入事实

第 1～4 条只影响后置的正式 editor 接入，本期不处理，记录在此供后续阶段使用；第 5、6 条与本期相关。

1. **water 包是私有的源码包。** `package.json` 为 `private: true`，`main/types` 直接指向 `src/*.ts`，没有 dist，不参与原生 Rollup 发布。直接依赖 `@galacean/engine-core/math`、`engine-terrain`、`engine-environment`、`engine-ai-chat`（`WaterAgent` 用到类型）和 `engine-modify`。
2. **水依赖修改层才有的 Engine 符号。** water 从 `@galacean/engine-core` 导入的 `ScreenSpaceReflection`、`ScreenSpaceReflectionConsumerLease`、`…ConsumerRequest`、`…Quality`、`…ReceiverMode`、`…ResolvedSettings` 只存在于 `packages/modify/src/native/core/**`，原生 `packages/core` 没有这些符号。[`CameraWaterFeatureBroker`](src/water/runtime/optics/CameraWaterFeatureBroker.ts) 还直接导入 `@galacean/engine-modify/rendering/CameraDepthTexturePrePass`。**用 npm 上的 `2.0.0-alpha.51`，或用原生 `pnpm build` 的产物，都加载不了 Water。**
3. **构建依赖 Vite 语义。** 25 个文件用 `?raw` 导入 Shader，River/Heightfield 编译用 `new Worker(new URL(…, import.meta.url), { type: "module" })`，纹理等资源走模块相对 URL。Worker 构建也要装 `engineModify()`。
4. **版本差。** engine 仓库为 `2.0.0-alpha.52` 加 modify 替换；editor `package.json` 的 overrides 固定 `@galacean/engine*` 为 `2.0.0-alpha.51`。
5. **源码变化。** 旧 `shared/water` 与新 `packages/water/src/water` 的 544 个对应文件中，463 个字节相同，81 个有差异。抽查了 `WaterBodyComponent`、`WaterSystem`、`WaterResources`、`WaterAPI`、`WaterSurfacePicking`、`WaterTerrainSnapshot`、`CameraWaterFeatureBroker` 等关键文件，差异只是格式化、导入路径，以及适配 dev/2.0 的 `entity.scene` 可空处理。下文沿用旧版的领域结论，但未逐个复核全部 81 个文件。
6. **已知共同失败。** Metrics Zoo 在来源和迁移版上都会报 `OceanWaterCompileError: $.wetSource: Ocean render field has no wet texels.`（见[源码对齐续验](../../world/migration/source-parity-2026-11-04.md)）。这是来源已有行为，接入时如果用到无湿单元的 Ocean 输入，需要单独处理。

### 0.3 开发期约束

- **本期只做 engine 侧。** editor 中接入和调试 water 的部分（下面关于 link 的两条，以及 E 项）后置。
- **不迁移 engine-next 的旧测试。** 本期如需自动化用例，随改动在对应包内新增。
- 引擎改动只放在 `packages/modify`，**不合并到原生 `core/loader/shader`**。
- **不发布任何开发包**（包括 `@galacean/engine-modify`、`@galacean/engine-water`）。editor 联调一律本地打包后 link。
- **本期不考虑发布期。** 独立 Builder 产物、部署和 npm 分发都不在本期验收范围。editor 开发服务内的编辑视口、预览和 Play 仍在范围内。
- （后置阶段使用）editor 的本地 link 工具（`scripts/link-local-engine.mjs`、`apps/editor-app/local-engine.ts`）目前只是本地 editor 主 checkout 中的未提交改动，没有进入 `dev/2.0`。它仍指向旧的 `engine-next-backup/world/.materialized/engine`，需要先 `--unlink`，再指向 E-00 的产物。link 只在 editor dev server（`apply: "serve"`）生效，Builder/CLI 仍使用 npm 上的 alpha.51。

## 1. 结论与范围

水系统已有原生运行组件、三类水体后端、资源序列化、批量候选发布和查询能力。接入编辑器要在这些能力之上收敛作者入口。本期在 engine 仓库内完成四件事：

1. **资源转成原生资产。** 可转换的资源变成项目里的原生资产和可追踪引用。
2. **组件可微调。** 提供能单独微调的组件属性和资源引用，并明确每项修改的失效范围。
3. **作者数据只有一份。** Scene/Prefab Source 与项目资产是唯一作者数据，面板、Agent 和代码编辑共用 RuntimeEditor 的公共事务、历史和保存。
4. **发布一致。** Terrain、水体、查询及下游消费者保持发布一致，并处理重建、取消、资源替换和关闭。

本期规划覆盖 Lake、River、Ocean，以及已支持的落水外观、连接和交互配置。本期终点是 engine 内 RuntimeEditor 宿主的真实闭环：能选中、能微调、能撤销、能保存重开。正式 editor 的 Inspector、资产导入和预览放到后置阶段（第 6 节 E 项）。在那之前，**只能说“engine 侧已具备编辑器接入的基础”，不能说“已接入正式编辑器”。** 有限水量、出水口 CRUD、降雨水量演算和游泳不是接入的前置条件。

### 两套宿主的实际边界

| 边界 | engine 仓库 RuntimeEditor / Seed World | 正式 `editor` | 实施约束 |
| --- | --- | --- | --- |
| 作者写入口 | [`RuntimeEditorEdit`](../runtime-editor/src/runtime-editor/runtime-editor.ts)：`run → prepare → commit → activate` | `UI/Tool → Facade → CommandBus → DomainStore → Projection` | 两边共用 Water 领域校验和纯数据契约，各自复用宿主事务；不在 editor 里再装一套 RuntimeEditor 和历史 |
| 资产身份 | 项目 `virtualPath`，Source 资源引用用路径 | Domain 资产 ID；Source `$ref` 也是资产 ID，API 路径由宿主解析 | 导入时建立路径 → 资产 ID 映射，交给原有 codec；禁止直接复制含路径 `$ref` 的 Source |
| 引擎依赖 | 原生 dev/2.0（alpha.52）+ [`packages/modify`](../modify)，由 World 的 Vite 配置启用 `engineModify()` | npm `2.0.0-alpha.51`；开发期可 link 本地产物 | 后置阶段必须走 E-00/E-01；engine 仓库里有 Water 不等于 editor 能加载 |
| 运行注册 | [`registerNativeWater()`](src/water/native/index.ts) 注册 Engine Loader 类和资源 | `EditorComponent` 注册编辑适配与运行构造函数；预览/Play 有自己的加载前注册 | Loader 注册成功，不会自动产生“添加组件”菜单、Inspector 或工具类型 |
| 撤销/保存 | 公共 history、显式 patch（[`captureUndo`](../project/src/runtime-editor/project/runtime-project-edit.ts)）、`project.flush()` | DomainStore 历史、ScenePersistenceRunner、资产 effects 和具体 Storage | 概念可以复用，方法名不能互换；两边的保存重开分别测 |
| 验收入口 | 本期：`WORLD_DEMO=water/editor` 的公共 Water Editor、Seed World，以及随改动新增的用例 | 后置：editor 开发服务内的 Playground、编辑视口、预览/Play、正式公开 API | engine 侧成功不能替代 editor 成功；独立 Builder 产物与远端发布也不在后置阶段的验收范围内 |

**已确认的引用差异：** editor 的 [source-ref-codec](https://github.com/galacean/editor/blob/dev/2.0/packages/model/src/scene-file-v2/source-ref-codec.ts) 和[契约测试](https://github.com/galacean/editor/blob/dev/2.0/packages/model/src/scene-file-v2/__tests__/source-ref-codec.test.ts)明确拒绝 `Materials/Gold`、`Enemy.prefab`、URL 等 Source `$ref`。资产表中的 `Water/...` 只是建议的项目路径，写入正式 editor 时必须转成已登记的资产 ID。Entity/Component 稳定 ID 与最终运行格式里的数字索引，又是另外两层身份。

### 交付分工与先后关系

| 交付层 | 主要职责 | 对应任务 |
| --- | --- | --- |
| 水系统负责人（本期） | 作者契约、合法值、原生资源、不可变修订与失效、批量发布、查询与释放；最小可导入示例 | W-02～W-04、W-08、W-10～W-17 的领域部分 |
| RuntimeEditor/Seed World 集成（本期） | 具体水体 Source、冷启动装配、公共事务、新数据保存关闭、Terrain 同版发布、保护既有下游进度、退役旧路径 | W-01、W-05～W-09、W-14～W-22 |
| Engine 修改层（后置，与 SSR 共用） | 本地 staged 打包脚本：原生包 + `native-overrides.json` → 带 dist/types 的产物 | E-00，与 SSR 方案阶段 0 共用一份脚本 |
| editor 集成（后置，与编辑器维护者协作） | water 本地打包与 link、模块装配、资产导入与身份映射、组件/Inspector/API、异步投影衔接、编辑态与 Play、保存 | E-01～E-08，复用 W 的领域实现 |

这是职责划分，不代表全部由水负责人独自修改。本期先完成第 6 节 M1 的 RuntimeEditor 单湖闭环。农场/导航联动不阻塞单湖闭环，但 Seed World 交付时仍须保留这些行为。旧档转换按本次约束不实施。

## 2. 当前实现与后置边界

| 范围 | 当前 engine 实现 | 后置 / 限制 |
| --- | --- | --- |
| 原生组件 | `WaterBodyComponent.authoring` 持有类型化不可变作者输入，配置与运行 ID 是运行事实；`WaterSystem` 批量发布 | 正式 editor 的组件菜单和 Inspector 留给 E 项 |
| Source / Prefab | 公共身份、覆盖/revert、内联/嵌套成员、原生组件引用、公共历史与持久化 | 不把模板展开保存；正式 editor 的资产 ID 映射另验 |
| 装配 | Seed World / Water Editor 加载 Scene 前注册 Water 和领域格式，宿主注入 Camera/Environment | 一个 Scene 一个 System，换相机须重建；npm 原生 Engine 不能替代 modify |
| 资源 | 28 项原生资产与转换清单，单份 Material/Texture 持有完整外观值与策略，固定结构从 Shader 家族代码推导 | KTX2/Shader 输入与资源替换在 engine 内验证；正式导入 UI 后置 |
| Seed 作者模型 | 具体水体持久于 Source；PlanningDocument 从同一份 Source 投影 DTO，首次生成只写一次 | 本期不做历史存档转换 |
| Terrain / Water | Seed 复用同版候选事务；独立示例使用只读人工床面 | 独立示例不支持雕刻，深度与床面不符时明确失败 |
| 查询 / 玩家状态 | 发布 Water 驱动接地、取水、导航等；已有农场地块和物品进度保留 | 规划预览仍使用候选计划；未验收全部动物/种植玩法 |
| 验证 | 本次新增 8 文件 14 用例，真实 Chromium/WebGL/IndexedDB，两个生产入口构建及 Seed 实际 UI 闭环 | 不使用历史测试计数；正式 editor、移动端、GPU 性能和真实模型后置 |

### 正式 editor 的源码核对结果（后置阶段参考）

2026-11-05 单 `.mat` 收敛另行核对 editor `22ca81865` 的 Material/Shader 编辑与保存合同，并实际运行其属性解析器验证 4 份材质。外观不再使用 Look 作者资产；该专项结果见 [实施记录](EDITOR_MIGRATION_IMPLEMENTATION.md)。下面其他 editor 接入点的语义核对范围仍按原记录，E 项未实施。

以下事实在 2026-11-03 按 editor `92e8e785c` 逐项核对。本次在最新 `dev/2.0`（`0e3ce36a4`，新增 56 个提交，含 #4271 Prefab 嵌套编辑重构）上只复核了文件仍然存在，**语义需要在实施 E 项时重新确认**，尤其是 Prefab 和投影相关部分。

| 接入点与代码入口 | 当前事实 | 水接入工作 |
| --- | --- | --- |
| [EditorComponent](https://github.com/galacean/editor/blob/dev/2.0/packages/model/src/modules/components/EditorComponent.ts)、[注册表](https://github.com/galacean/editor/blob/dev/2.0/packages/model/src/modules/components/componentRegistry.ts)、[main-plugin 组件入口](https://github.com/galacean/editor/blob/dev/2.0/plugins/main/src/components/index.ts) | 编辑器组件元数据和自定义 Engine 构造函数分开注册；当前没有 Water | 选内置/插件组件还是项目 Script 路线，补齐两类注册和加载时序；只调用 Engine Loader 不够 |
| [AudioComponent 示例](https://github.com/galacean/editor/blob/dev/2.0/plugins/main/src/components/AudioComponent.ts)、[InspectorFacade](https://github.com/galacean/editor/blob/dev/2.0/packages/model/src/facades/InspectorFacade.ts)、[ComponentFacade](https://github.com/galacean/editor/blob/dev/2.0/packages/model/src/facades/ComponentFacade.ts) | `propertyField`、`serialize`、属性映射和 Facade 共同完成微调；有 Prefab 分流与撤销分组 | 复用现有表单、默认值和源码序列化契约；领域校验放在写入边界，不能只靠 slider 范围 |
| [ScriptComponent](https://github.com/galacean/editor/blob/dev/2.0/plugins/main/src/components/ScriptComponent/index.tsx)、[装饰属性解析](https://github.com/galacean/editor/blob/dev/2.0/plugins/main/src/components/ScriptComponent/execute.ts) | Script Inspector 从脚本源码解析 `@inspect`；普通 Script 对象与项目实际脚本运行是两个入口 | Water 的 TS getter/setter 不会自动生成表单。走 Script 路线就要补源码/元数据、引用类型和真实的编辑态渲染 |
| [EngineProjection](https://github.com/galacean/editor/blob/dev/2.0/packages/model/src/projection/EngineProjection.ts)、[createComponentFactory](https://github.com/galacean/editor/blob/dev/2.0/packages/model/src/projection/createComponentFactory.ts) | `apply` 是同步调用，属性写入和方法调用不等待 Water 的异步候选；资源有待就绪/重绑机制 | 对接事务后的运行消费者和完成/错误通知；`WaterBodyComponent.configuration` 的异步 setter 返回不代表运行已成功 |
| [Source-v2 类型](https://github.com/galacean/editor/blob/dev/2.0/packages/tsconfig/global-types/scene-schema-v2.ts)、[资产路径索引](https://github.com/galacean/editor/blob/dev/2.0/packages/editor-runtime/src/domain-bridge/asset-virtual-path.ts) | 稳定 Entity/Component ID、资产 ID 与 API 路径各自独立 | 新导入、Prefab 嵌套引用、重命名、复制都要验证映射，不另造一套平行身份目录 |
| [资产注册入口](https://github.com/galacean/editor/blob/dev/2.0/plugins/main/src/assets/index.ts)、[headless 资产映射](https://github.com/galacean/editor/blob/dev/2.0/packages/editor-runtime/src/asset-types.ts) | 没有 WaterResource 编辑资产；浏览器插件与 headless 资产处理是两条接线 | 自定义格式要覆盖导入、编码、版本、依赖、编辑、保存和打包；只有 Loader 或普通 JSONAsset，证明不了资源引用语义 |
| [ShaderAsset](https://github.com/galacean/editor/blob/dev/2.0/plugins/main/src/assets/shader/ShaderAsset.ts)、[TextureAsset](https://github.com/galacean/editor/blob/dev/2.0/plugins/main/src/assets/texture/TextureAsset.tsx)、[纹理输入扩展名](https://github.com/galacean/editor/blob/dev/2.0/packages/constants/src/image-mime.ts) | 普通 Shader 导入接受 `.shader`，打包输出 `.shaderc`；纹理上传接受 PNG/JPG/JPEG/WebP/HDR，KTX2 只是构建输出 | 不能假定现有 `.shaderc`、`.ktx2` 可以直接当可编辑源上传；要么导入源资产，要么补通用的预编译/压缩输入适配 |
| [公开组件词表](https://github.com/galacean/editor/blob/dev/2.0/packages/editor-api/src/tools/component/public-component-types.ts)、[工具合同](https://github.com/galacean/editor/blob/dev/2.0/packages/editor-api/src/tools/component/README.md) | 没有 Water 专属公开类型；组件写入走类型化领域操作，Script 有自己的挂载/更新合同 | 新增 Water 操作或选定 Script 合同，生成同源声明与元数据 |
| [Builder](https://github.com/galacean/editor/blob/dev/2.0/packages/builder/README.md)、[组件编译](https://github.com/galacean/editor/blob/dev/2.0/packages/builder/utils/scene-runtime/component.ts)、[运行继承/引用解析](https://github.com/galacean/editor/blob/dev/2.0/packages/builder/utils/scene-runtime/state.ts) | Source lowering、继承关系、Script 注册和依赖打包分别负责；未知继承不能猜 | 本期只验预览链路中 Builder 编译的 Water 类型与 Prefab 组件引用；独立产物后置 |
| [EditorRuntime](https://github.com/galacean/editor/blob/dev/2.0/apps/editor-playground/src/EditorRuntime.tsx)、[测试归属](https://github.com/galacean/editor/blob/dev/2.0/tests/README.md) | Playground 复用真实 Root/Storage/Engine；reload 会等待 Scene 与资产保存后重新打开 | 直接加入 Water 场景验证闭环，不另造测试 serializer；OPFS 准备数据不等于 UI 导入通过 |

### 必须统一的数据归属（旧入口主要来自 Seed World）

| 当前入口/数据 | 迁移后唯一归属 | 公共能力与系统适配 | 兼容方式 | 验收用例 |
| --- | --- | --- | --- | --- |
| [`PlanningDocument`](../world-planning/src/spatial/PlanningDocument.ts) 中具体的河流控制点、湖岸、启禁用和水位作者值 | Scene/Prefab 组件，以及它们引用的领域作者资产 | 公共 Source 编辑；Water 负责领域校验和派生 | 新作者统一写入 Source，保留 ID 与显式值；旧档转换不适用 | 改一条河后重生成、撤销、重开都保留人工修改 |
| 全局 Seed/初始化生成规则 | 项目中的生成配置；具体对象生成后交给 Source | 只在需要补写作者对象时用公共 preparation | 区分首次导入、显式再生成与普通激活 | 重开或 undo/redo 不会重复生成水体 |
| `World/Editor.json` 的水色及规划中的颜色（`waterColors`） | 统一为原生 Material/Texture 与组件形状 | 公共资产/组件事务；运行层只读已接受的值 | 旧水色写入口及重放删除；本期不转换旧档 | 原始预设转换后画面相同；项目外观只有一个持久写入口 |
| Mesh、材质实例、atlas、编译 transfer、Terrain 采样副本和缓存 | Water/Terrain 各自的运行时 owner | 从当前作者输入和已接受环境重建 | 不把生成缓存迁成作者数据 | 删缓存后能重建，不污染历史与存档 |
| 玩家农场进度、将来可能有的水量过程状态 | 各自领域仓储 / runtime-owned 资产 | 作者历史不包含运行进度 | 保留当前农场进度；Water 过程存档以后另行设计 | 编辑或撤销水不会重置农场；不新增没有用途的 Water 存档表 |
| 相机、Scene、订阅、候选发布句柄 | 宿主 / 运行消费者 | 注册、绑定、串行切换和释放 | 不作为恢复事实持久化 | 旧候选晚到、宿主退出都不破坏当前 Scene |

## 3. 建筑系统中可以直接参考的改造

以下路径都在 engine 仓库。迁入正式 editor 时，复用 Water/建筑已经体现的领域边界，把宿主调用换成正式 editor 的 Facade、投影和保存入口。`registerPreparation/withAsset/registerRuntimeActivation/captureUndo` 只存在于 engine 仓库的 RuntimeEditor/Project 包，正式 editor 没有这些 API。

| 建筑参考 | 值得复用的做法 | 水系统的对应工作 |
| --- | --- | --- |
| [BuiltinBuildingAssets](../building/src/tiny-glade/resources/BuiltinBuildingAssets.ts)、[BuildingAssetKit](../building/src/tiny-glade/resources/BuildingAssetKit.ts) | Manifest 声明 Prefab/Mesh/Material/Texture/Shader 及直接依赖；原生引用构成资源图 | 导出 Water 原生资源清单，复用原生资源；把私有资源包套一层 `.water` 不算完成 |
| [BuildingComponents](../building/src/tiny-glade/components/BuildingComponents.ts) | 作者属性有 setter 和校验，系统从组件构造计算输入；变换归 Entity | Water 提供类型明确的微调面，算法仍消费纯数据，组件不保存运行时对象 |
| [BuildingSceneInitialization](../../world/demos/seed-world/masonry/BuildingSceneInitialization.ts)、[BuildingInitializationInputs](../../world/demos/seed-world/masonry/BuildingInitializationInputs.ts) | 从草稿发现生成器；用 `withAsset` 计算；生成内容和 `initialized` 在同一次提交中被接受 | 只有当水需要生成作者对象时才借鉴；纯运行编译不需要初始化标记 |
| [NativeBuildingHost](../world-planning/src/masonry/NativeBuildingHost.ts)（含 `NativeBuildingWorld`） | 注册公共 activation participant，批处理组件输入，用 `projection.identityOf/resolve` 绑定公共身份；旧发布句柄退出不销毁 Scene 正在用的系统 | Water 对接公共激活并等待自身批次完成，去掉 setter 逐项发布和独立对象目录；理清 WaterSystem、Host、世界候选和派生资源的所有权 |
| [NativeBuildingPanel](../world-planning/src/masonry/NativeBuildingPanel.ts) | 面板走公共 native tools、`prepare/commit/activate` 和公共 history | 水面板与 Agent 用同一条作者命令，不另建 Water undo 栈 |
| [runtime-scene-projection](../runtime-editor/src/runtime-editor/scene/runtime-scene-projection.ts)、[runtime-project-session](../runtime-editor/src/project/runtime-project-session.ts) | 身份投影、最终接受、runtime ownership | 水的拾取映射与运行资产所有权按这里的协议接入 |
| 建筑初始化测试与浏览器夹具（`building-initialization.spec.ts`、`building-host-browser-harness.ts`、`prefab-edit-browser-harness.ts`） | 覆盖草稿初始化、Source/原生对象和生命周期 | **未入库，本期不迁移**；需要时只借鉴其构造思路，水按自身特性补用例，不继承建筑的通过结论 |

## 4. 资产转换清单

`Water/...` 已生成到 [原生资产目录](src/water/native/assets)，转换清单和本次对照见 [实施记录](EDITOR_MIGRATION_IMPLEMENTATION.md)。下表保留原始转换要求；正式 editor 还要登记资产 ID、类型和元数据。交付清单要分别列出**可编辑源资产、转换/构建步骤、运行产物**，并记录格式版本、直接依赖、采样/色彩空间和转换前后对照。不要用运行产物格式代替编辑器的输入合同。

| 当前内容与消费者 | 建议的原生表示 / 路径 | 转换与依赖要求 | 验收与例外 |
| --- | --- | --- | --- |
| 湖细节法线 `grasslands-water-normal-512.ktx2` / 湖法线工厂 | Texture2D 编辑资产，运行产物如 `Water/Textures/lake-normal.ktx2` | 保留压缩、线性色彩、wrap/filter；editor 选用匹配的“图像源 → KTX2”构建，或验证新增的 KTX2 输入路线 | 换纹理、共享湖更新、重开和资源恢复一致；1024 PNG 制作源未经对照，不能替代 512 运行法线 |
| River Farmlands 的 wave、caustics / 运行时工厂 | 项目 Texture/KTX2 + Material 纹理引用 | 保留 ID/hash 校验语义、尺寸、sRGB/linear、采样和焦散效果；替换后重算内容身份 | 法线/焦散实际效果与旧资源一致；不再保留模块 URL 这第二条固定加载链 |
| RiverDrop 的 directional、cloud、lines、edge、voronoi、foam、mist、splash | Texture + 可复用 Material，必要时加 Prefab | 按现有落水资源清单转换；只有存在落差时才声明/租用所需运行依赖 | 落水形态与外观分开；保留矩形纹理尺寸、alpha、粒子配置和按需加载 |
| Ocean 五张 KTX2 / `OceanTextureLibrary` | 可共享的原生 Texture 引用组合，如 `Water/Presets/ocean.prefab` | 优先保留已验收的 KTX2 字节；editor 补输入适配，或提供有对照证据的源资产构建 | 五个槽位、色彩空间、mip/采样不变；同一 Engine 内释放一个消费者不影响另一个，跨 Engine 只共享源资产 |
| Water Shader、AOT profiles / 三类后端 | Shader 编辑源或生成定义 → `.shaderc` 运行产物，或有明确入口的预编译资产 | 复用现有生成器与 profiles（`pnpm --dir world prepare:engine`）；核对 editor 的 `.shader` 上传、include 路径、Shader 身份和 AOT manifest 接线；Shader 依赖 modify 的 SSR/深度预通道 | 编辑视口和预览/Play 都能加载；缺 profile 时明确诊断，不靠运行时源码编译掩盖缺项 |
| 可复用的外观材质与水体模板 | 原生 Material + Scene/Prefab 组件引用 | 外观参数中原生材质能表达的部分转成 Material；系统从资源中提取算法输入；明确共享/独立副本的语义 | 原生引用替换、实例覆盖、共享传播、保存重开，都要落到实际渲染消费者上 |
| Quality 能力预算 | Source `authoring.quality` 类型化值 | geometry、surfaceShading、sceneFields、query、反射/焦散、误差和 Atlas 预算由组件保存，默认函数与领域校验统一；Prefab 提供共享默认与叶子覆盖 | 不再生成或要求 Quality 作者资产；QualityResource/Plan 仅作内部运行输入或低层 API |
| `WaterBodyResource` 中的领域形状 / 物理源 | 组件属性或领域作者资产；确属人工源的栅格可保留为注册数据/Buffer | 保存控制点、岸线、连接意图、必要的人工源和环境引用；宿主生成的床面采样在运行期派生 | 不强行把物理规则编码成 Mesh；运行采样、编译 transfer 和缓存不能成为第二份作者数据 |
| 动态河湖海网格、查询场、atlas、运行材质克隆、粒子 | 运行时生成的原生对象，由 Water owner 管理 | 沿用现有 compiler/backend；动态结果不要求全部离线烘焙 | 资源失效、取消、替换、销毁都正确；不进作者存档和撤销记录 |

**RuntimeEditor 当前的能力限制：** [原生格式处理](../runtime-editor/src/project/runtime-native-formats.ts)和[准备阶段资源编译](../runtime-editor/src/project/runtime-prepared-asset.ts)目前只对已支持的原生引用结构做重映射。给 `.water` 加上 `references()`，并不会让其中的字符串自动获得 `withAsset` 快照隔离。优先把资源引用放在 Scene/Prefab/Material 的原生引用位置。如果最终仍需要带依赖的自定义格式参与隔离准备，先用最小用例证明缺口，再单独补通用的引用编译扩展，公共代码不识别 Water 名称。正式 editor 按自己的资产/引用校验、读取快照和 Builder 合同实现，不要把这条限制或扩展 API 原样移植过去。

**外观资产的约束：** 一份原生 `.mat` 必须完整定义水外观，由现有 MaterialLoader 支持的有类型 shaderData、纹理和宏表达；禁止未知字段或 shaderData 内私有 JSON 字符串。固定属性映射、字段依赖与编译规则从 Shader 家族代码推导；内部 Look DTO 可保留，但不再要求配套 `.water` 作者资产。岸线、控制点、水位、人工床面和查询预算不进 Material。每个值只能有一个作者来源。正式 editor 的材质面板依赖 Shader 的 `Editor.Properties`/`Editor.Macros` 或 `ShaderUIScript` 等元数据，需要核对并补上最小字段和真实消费者。派生 atlas、地形采样、反射 RT、内部宏和临时 uniform 不作为可保存的材质属性暴露。SSR 接收参数由 modify 的 `Material` 和《Galacean Editor SSR 产品接入方案》统一定义，水材质跟随该方案，不另定一套。共享 Material 与实例差异通过显式的实例覆盖或独立资产表达，不从私有渲染克隆反向覆盖共享源。

## 5. Unity 组件参考与建议的微调面

参考固定为 Unity 官方 HDRP **17.0** 文档和 Splines **2.7.2**，只用于职责对照，不作为运行依赖。HDRP 是 Unity 官方渲染管线包，其中的组件并不是所有 Unity 渲染管线都内置的能力。

| Unity 官方参考 | 职责 / 属性 | Galacean 对应方式与取舍 |
| --- | --- | --- |
| [WaterSurface / 水系统属性](https://docs.unity.cn/Packages/com.unity.render-pipelines.high-definition@17.0/manual/WaterSystem-Properties.html) | 水体类型、几何类型、波浪/流向与贴图、查询开关等 | 复用 `WaterBodyComponent` 表达水体实例；Shape/Material/Quality 职责分开，支持单对象微调 |
| [WaterSurface API](https://docs.unity.cn/Packages/com.unity.render-pipelines.high-definition@17.0/api/UnityEngine.Rendering.HighDefinition.WaterSurface.html) | `customMaterial`、吸收/散射/平滑度、脚本查询，声明编辑态执行 | 对应 Material/Texture 与已有查询；借鉴编辑态可见和微调反馈，Galacean 需要显式接通自己的编辑态生命周期 |
| [Water Master Stack](https://docs.unity.cn/Packages/com.unity.render-pipelines.high-definition@17.0/manual/master-stack-water.html) | 水材质/Shader 资产可复用，支持折射、散射、焦散 | 复用现有水 Shader 与光学模型，整理其原生材质表达，迁移中不重写光照闭合 |
| [SplineContainer](https://docs.unity3d.com/Packages/com.unity.splines@2.7/api/UnityEngine.Splines.SplineContainer.html) | 保存曲线集合，管理节点与链接 | 参考河流控制点、分段与湖岸的数据组织；它本身不提供河床切挖、水流或湖盆 |
| [WaterDeformer](https://docs.unity.cn/Packages/com.unity.render-pipelines.high-definition@17.0/api/UnityEngine.Rendering.HighDefinition.WaterDeformer.html) | 独立的局部形变配置 | 当前没有对应功能，保持不支持；不为凑对照去实现形变模拟 |
| [水系统项目启用流程](https://docs.unity.cn/Packages/com.unity.render-pipelines.high-definition@17.0/manual/WaterSystem-use.html) | 管线、相机和场景配置共同决定水是否生效 | WaterSystem + 宿主注入相机、环境和渲染能力（含 modify 的 SSR/深度预通道）；只验构造函数或添加组件不够 |

河流雕刻、湖盆规则、连接和固定水位沿用 Galacean 现有的领域契约，不假设 Unity 官方有一一对应的标准组件。下表保留作者属性组织与约束；实际公开字段、默认来源和验收结果见 [作者接口](src/water/native/M1_AUTHORING.md) 与实施记录。

| 编辑职责 | 建议承载与代表属性 | 默认值、单位与约束 | 修改后的更新范围 |
| --- | --- | --- | --- |
| 水体实例 | 在现有 `WaterBodyComponent` 上补类型化编辑字段，映射到配置与引用 | 默认 `visible=true`、`priority=0`，priority 范围 [-1000000, 1000000]；enabled 与 visible 不合并 | 当前水体和查询路由；不触发 Terrain 重建 |
| 交互能力 | `interaction.query/buoyancy/wake` | 默认 `true/false/false`；buoyancy 和 wake 依赖 query，并受后端能力约束 | 当前水体端口；不承诺已实现全部玩法 |
| 放置 | Entity Transform | 单位米，只支持绕 Y 轴旋转；有限水体不支持平面缩放和倾斜；连接水体另有限制 | 重建必要的水体空间适配；`position` 不在作者字段里再存一份 |
| 河流形状 | 类型明确的 River shape 数据或引用，必要时独立成组件 | 控制点有稳定 ID，`x/z/elevation` 单位米，width/depth > 0，至少两点；section 支持 `auto/slope/waterfall/steps`、carve、stepCount | 当前河流、相关连接，以及确实受影响的 Terrain/生态/建筑接地 |
| 河流解析高级值 | 同一 River 作者契约 | 现有 `bankClearance=0.05m`、`dropThreshold=0.5m`、`slopeThreshold=0.2`、`probeSpacing=0.25m`；stepCount 填写时为 2–64 的整数 | 只影响解析和几何，不等于水量模拟；沿用 [Watercourse](src/water/authoring/river/Watercourse.ts) 的验证规则 |
| 湖形状与水位 | 类型明确的 Lake shape 数据或引用 | 固定的 referenceLevel 与当前水位偏移分开存；现有 `levelOffsetM=0`；每个岸线环至少三点，点 ID 稳定；切挖需显式允许 | 改水位优先局部更新；只有岸线/湖盆变化才联动 Terrain；不填土造岛 |
| 海洋范围与外观波形 | Ocean shape/representation，以及 Material 中对应的外观作者项 | 当前 datum、有限/固定 LOD 范围和波形合法值沿用各自的验证器；每个 Scene 最多一个活动 Ocean | 当前 Ocean 的编译与呈现；Shader 波形不等于 CPU 实测水面 |
| 外观与落水 | 单份 Material 及其 Texture 引用 | 颜色、透明度、法线、焦散、折射、泡沫；落水 speed=0 保留冻结语义；默认值取当前选中的 Material/Shader，不另造一套统一默认 | 只更新外观和资源，不改床面、水位或水深 |
| 质量与反射 | 组件 `quality` 类型化值 | 沿用 geometry、surfaceShading、sceneFields、query、反射及效果预算；不支持的组合明确拒绝 | 受影响的后端资源；质量切换不算物理作者变化 |
| 连接 | 领域连接意图中的稳定水体引用与截面 | 世界 XZ 米制；当前静态连接有变换限制 | 受影响的连接组整体重编译；不能单独拖动一端还保留旧端口 |

实施 W-02 时，每个公开属性还要补齐：类型、默认值来源、合法范围、局部/世界空间、序列化与 Prefab 继承方式、失效范围。颜色色彩空间和流速单位沿用 Galacean 现有契约，不直接拷贝 Unity 的 km/h 数值。优先扩展现有组件的类型化属性和引用，只在用户确实需要独立组合和启停时才拆新组件，避免一个算法步骤对应一个组件。

engine 面板和共同 API 已验证湖水位、显隐/启用、有效颜色、真实纹理/Material 引用，以及河宽、点列/段型和 Ocean 支持项。Source 使用 `WaterBodyComponent.authoring`，低层 `configuration` 与运行采样不作为作者表单。形状使用 Entity 局部 XZ/Y 高程，放置归 Transform；Seed World 在规划 DTO 边界做一次世界坐标转换，写回时逆变换，禁止重复烘焙。正式 editor 的真实 Inspector 仍由 E-03 验收。

## 6. 实施 TODO

P0 是对应交付阶段的阻塞项，P1 是该阶段完成前应补齐的边界和回归。共 31 项；本期 W 项的适用范围已完成，E 项后置：

- **本期：W-01～W-22（22 项）**，即领域及 engine 内 RuntimeEditor/Seed World 路线。其中 W-05、W-15、W-21、W-22 按新仓库改写。
- **后置：E-00～E-08（9 项）**，即正式 editor 接入。其中 E-00 由原“本地 Engine 产物 link”改来，E-01、E-07 按新仓库改写。

同一领域能力不重复实现。W 项里提到的 E 项只表示后置阶段的衔接，不阻塞本期。

| 阶段 | 依赖与交付范围 | 完成证据 |
| --- | --- | --- |
| M0：engine 侧契约与装配 | W-01～W-05 的单湖最小子集 | Water Demo/Seed World 中，新 Engine 直接加载 Source 里的 Water；组件微调契约、原生资产、格式与依赖、Terrain 输入方式已确定 |
| M1：RuntimeEditor 单湖闭环 | M0 → W-06～W-08、W-10～W-13、W-17、W-19、W-20 的单湖部分 | 面板/Agent 改水位、外观、引用 → 实际显示和查询 → undo/redo → `project.flush()` 保存 → 新会话重开 → 继续修改 |
| M2：水系统范围完整（engine 内） | M1 → 河流、落水、连接、Ocean、共享资源/Prefab、Terrain 同版发布（W-09）、外观/Agent/下游（W-14～W-16） | 每类实际支持的作者能力都有编辑、资源、运行和保存证据，限制写明 |
| M3：Seed World 迁移完成 | 与 M1/M2 共享领域实现，另完成 W-18、W-21、W-22 及其余 W 项中的 Seed World 部分 | 新项目保存关闭重开、Terrain/下游一致发布、玩家进度保护和旧入口退役都有验证；旧档转换不适用 |
| 后置：正式 editor 接入 | E-00～E-08，复用 M1/M2 的领域实现 | 本期不做；启动时先重新核对 editor 最新源码 |
| 后置：发布期 | 独立 Builder 产物、CLI/headless 使用的 Engine、npm/私有包分发、远端部署 | 不作为任何阶段的完成条件 |

M0/M1 不新增完整的 Terrain 编辑器或流体模拟。先用明确的静态床面/人工源资产，或已有的环境适配；没有可编辑 Terrain 的宿主明确不支持雕刻。M2 如果声明支持地形雕刻，要交付跨资产事务和一致发布，不能用简单示例代替。

### 第一批：确定作者模型、原生资产和装配入口

- [x] **W-01 / P0：确定唯一作者模型与迁移规则。** 明确自动生成配置、具体水体组件、共享资源、派生数据和玩家状态各归谁，落实第 2 节的数据归属表；保留既有 ID、显式 0/false、湖参考水位和手工形状。入口：[`PlanningDocument`](../world-planning/src/spatial/PlanningDocument.ts)、[`PlanningWaterAuthoring`](../world-planning/src/spatial/PlanningWaterAuthoring.ts)、[`PlanningWaterRuntime`](../world-planning/src/spatial/runtime/PlanningWaterRuntime.ts)、世界编辑文档。**验收：** 每个可变作者字段只有一个持久写入口；规划层可以读取或提供环境与初始生成输入，但不再保存同一水体的可写镜像。

- [x] **W-02 / P0：落地组件微调契约。** 按第 5 节给现有 `WaterBodyComponent` 补上类型明确的值属性与原生资源引用；把低层 Body 描述与可编辑的 River/Lake/Ocean 作者意图分开，明确水位、控制点与 Transform 的坐标关系。必要的分型组件和作者资产保持最小职责。领域校验在作者写入和 Runtime 两处复用，不依赖面板范围或 Prompt。**验收：** 同一套领域契约能改水位、河宽、外观和引用；非法值在规定阶段明确失败；普通微调不需要提交完整的 Terrain 数组。正式 editor 的真实控件和工具，在后置阶段由 E-03 验证。

- [x] **W-03 / P0：完成原生资产转换与项目清单。** 逐项执行第 4 节，分别交付可编辑源与运行产物、路径与 editor 资产的映射、直接依赖和原生引用。复用现有的 KTX2、Shader AOT 和程序化能力，输入适配由 E-06 验证。参考建筑的 `BuiltinBuildingAssets/BuildingAssetKit`，保留原始资源的 hash 校验，同时不阻止用户合法替换后产生新修订。**验收：** 转换前后资源语义和真实画面一致；项目引用的变化能影响实际 Water 消费者；保留的领域格式逐项写明理由；构建不依赖私人目录或模块固定 URL。

- [x] **W-04 / P0：注册保留领域格式的校验和依赖。** Water 领域包负责编码、版本和校验；宿主适配负责真实的资产登记和引用。RuntimeEditor 要补资产格式：未显式标类型时，文件推断不会自动把 `.water` 当成 Engine 资产，隔离准备还受第 4 节限制。正式 editor 按 E-02/E-06 补导入、资产 ID、依赖和预览编译。普通 JSON 承载只适用于已证明没有资源引用语义的纯数据，不能作为绕过类型/依赖校验的默认方案。**验收：** 缺依赖、类型错配、版本损坏、被引用的资源被删，都能诊断；同一作者操作使用本次输入和资源修订，不偷读 live cache。

- [x] **W-05 / P0：接通 RuntimeEditor/Seed World 冷启动装配。** 在 [`openSeedWorldProject`](../../world/demos/seed-world/SeedWorldProject.ts) 的层级加载/转换前调用 `registerNativeWater()` 并完成格式注册（目前只在 [Water planner](../../world/demos/water/planner/main.ts) 调用）；之后初始化新来源的依赖，已有存档要么验证、要么经过明确的版本迁移。明确 WaterSystem 与相机、环境、资源图的绑定，避免 Source 中的系统与 `PlanningWaterRuntime` 另建的系统冲突。**验收：** 新 Engine 直接加载包含 Water 的 Source Scene/Prefab，不需要手动创建来补救；缺相机、系统重复都有诊断。正式 editor 的冷加载按 E-02/E-05/E-07 单独验证。

### 第二批：编辑、准备和运行发布共用公共链路

- [x] **W-06 / P0：把 RuntimeEditor/Seed World 的作者命令接入公共事务。** 在这个宿主中，create/update/updateMany/setEnabled/remove 和颜色修改都生成 `RuntimeEditorEdit` 草稿，经过 `run → prepare → commit → activate`。入口：[`WaterAPI`](src/water/native/WaterAPI.ts) 的作者适配、[`WaterAgent`](src/water/native/WaterAgent.ts)、Planner dispatch、[`NativeWaterEditor`](../world-planning/src/spatial/runtime/NativeWaterEditor.ts)。正式 editor 由 E-03 经 Facade/CommandBus 完成相同意图。游戏运行 API 保留其合理用途，运行脚本默认不获得编辑器的作者写权限。**验收：** 在各自宿主内，面板与 Agent 共用同一条作者链，Source、history、存档保持一致；不再出现直接 `configure/destroy()` 改了作者投影、模型却没变的情况。

- [x] **W-07 / P0（存在作者生成时）：处理首次生成与历史重放。** Seed/Planner 首次生成具体水体时，参考 [`BuildingSceneInitialization`](../../world/demos/seed-world/masonry/BuildingSceneInitialization.ts)（`buildingScenePreparation`）：读取同一份草稿，需要时用 `withAsset` 计算，让生成的对象、引用和所需初始化标记在同一次提交中被接受；之后的普通重算不覆盖人工编辑。正式 editor 的创建/导入命令在自己的领域事务边界完成等价工作，不假定存在 `registerPreparation`。只编译派生运行数据的入口不注册作者 preparation，也不加初始化标记，可标注“不适用”。**验收：** 配置、祖先 active、Prefab 覆盖在本次操作中生效；undo/redo 不重跑作者生成；失败或取消不留下半成品作者对象。

- [x] **W-08 / P0：提供宿主可用的 Water 输入批处理与完成信号。** 领域层复用 `prepareBatch`，统一处理配置 setter、onEnable 和 Transform refresh，避免一次投影逐项发布中间状态。RuntimeEditor 参考 `NativeBuildingHost` 的 participant；正式 editor 经 E-04 接到自身的事务/效果边界。不并行创建第二个 Scene Host；解除批次与等待完成的顺序要避免死锁。**验收：** 多组件、多属性修改只发布完整的候选；普通编辑与历史走同一条路径；晚到的引用、退出、取消都能收敛，错误能被宿主观察到；运行失败不会让旧的 `configuration` 反向覆盖作者值。

- [x] **W-09 / P0（涉及 Terrain 修改时）：保持 Terrain 与 Water 的一致发布边界。** 从同一份作者快照计算河床/湖盆的切挖意图；宿主先准备好最终 Terrain，再准备 Water，所有相关运行候选就绪后才切换可见版本。Seed World 保留 [`PlanningWaterPublication`](../world-planning/src/spatial/runtime/PlanningWaterPublication.ts) 的局部影响能力。正式 editor 只有在提供了对应的 Terrain 作者写入和运行发布能力后才开放雕刻，不能让水直接改采样副本、冒充地形已保存。**验收：** `resolveRiver` 返回 `applied:false` 不算已发布；失败或取消时保持上一套一致的运行状态；作者已接受但运行失败时，新作者数据仍可保存、可撤销；重试运行不重复作者动作。只读床面示例注明没有雕刻能力。

### 第三批：资源更新、身份、Prefab 与运行消费者

- [x] **W-10 / P1：接通资源变化与局部失效。** 根据项目的直接和传递依赖识别纹理、Material 资产和 Quality/形状组件值的变化；更新实际 backend 和私有派生副本，未变化的水体和资源保持不动。目前公共 Material 原位更新，不会自动刷新 Water 的私有克隆或模块 URL 工厂。**验收：** 同一资源的多个消费者都会更新；独立副本保持独立；编辑 Material 不重算 Terrain；调整质量不改变物理作者输入；查询能力/精度变化按声明生效；无关的水体和建筑不会全量重建。

- [x] **W-11 / P1：明确共享资源和 Prefab 覆盖语义。** 区分四种操作：编辑共享模板、实例覆盖、创建独立资源修订、创建独立副本。原生链接 Prefab 使用公共查询、override/revert 和所有权命令。**验收：** 普通 Scene、Prefab 根、继承成员、内联添加的成员都能正确编辑和恢复继承；模板更新后覆盖仍然有效；保存的 Scene 不会把整个模板展开复制成一份新的作者数据。

- [x] **W-12 / P1：统一 Source 身份、waterId 与拾取。** 明确旧规划水体 ID 到宿主 Entity/Component ID 的映射；区分模板源身份、实例作用域与运行 waterId，避免多个链接 Prefab 实例带着同一个固定运行 ID。运行重建保留逻辑身份，复制或新增产生新身份。使用各宿主已有的 projection/EntityModel 映射，不持久依赖随机 ID、Engine 对象或另一份可写目录。**验收：** 重开、undo/redo、Prefab 替换、禁用后恢复，查询都指向原来的逻辑水体；同模板的两个水实例 ID 不冲突；点中生成的渲染子节点能回到正确的作者对象；旧映射及时删除。

- [x] **W-13 / P1：统一变换、地形绑定和连接编辑。** Entity 放置与局部形状数据不重复表达；读取已接受的 Terrain 及 refinement；保留有限水体的刚体限制和静态连接的变换限制。连接意图使用稳定引用，派生的 port 和岸距由连接组重新编译。**验收：** 平移和绕 Y 旋转后，视觉与查询一致；缩放、倾斜和不支持的连接单端移动会被明确拒绝；删除或移动一端后，不会残留旧的连接遮罩或错误查询。

- [x] **W-14 / P1：收敛外观和调试入口。** 把 `settings.waterColors`、规划颜色和当前水外观中的有效作者值迁成统一表达；持久的外观修改走公共事务。临时的 DevTools 值仍按会话调试语义处理；如果提供“应用到项目”，必须产生显式的作者事务。Ocean 专属 tuning 和 RiverDrop Material 保持实际的能力边界。**验收：** 修改或撤销颜色、透明度、法线、落水外观后，重生成、切换运行开关、重开都不会恢复成旧值；外观编辑不改床面和水深。

- [x] **W-15 / P1：接好 Agent 与可选的 Script 暴露。** Agent 作者操作走所属宿主的公共编辑入口，保留 Water 的单位、能力和错误契约。Seed World 的 Script 需要 Water 时，更新 [`world/demos/seed-world/systems/runtime.ts`](../../world/demos/seed-world/systems/runtime.ts) 和 `runtime-declarations.json`；正式 editor 的组件操作、项目依赖、代码声明和预览装配按 E-03/E-07 接通。[`WaterAPIDeclarations`](src/water/native/WaterAPIDeclarations.ts)、Seed World 模块声明和 editor-api metadata 是三个不同的消费者，只更新其中一份不能称为全链路支持。**验收：** 实际导入、类型检查和运行调用一致，Engine 类身份一致；只改 `.d.ts` 不算接入；不把水规则塞进通用 System Prompt。

- [x] **W-16 / P1：迁移实际下游的查询与变更通知。** 按真实调用逐项确认农场取水、接地、植被、导航/桥面、玩家交互、声音和调试的读取入口；消费规划水域的消费者，不能笼统说成都已调用 WaterSystem。只迁移实际需要的消费者，不为了独立 editor 项目搬入整个 Seed World。运行时读取发布版本，规划预览标明是草稿。**验收：** 受影响的消费者使用一致的输入；隐藏时保留查询、禁用时移除查询；`actual/proxy/unsupported` 仍然区分；Ocean datum 不当作视觉波峰；水帘不当作普通湿区；Seed World 的作者编辑不重置农场进度。

- [x] **W-17 / P1：核对候选、Scene 与资源所有权。** 覆盖启用/禁用、删除、撤销恢复、结构替换、相机/Scene 换绑、宿主退役和运行开关；取消要传到编译和加载，并等待晚到的清理。共享原生资源按引用计数释放，私有副本由创建者释放，旧世界句柄只释放自己拥有的候选。**验收：** 旧结果不会让新水体复活；旧句柄退出不销毁当前 WaterSystem；释放一份共享纹理不影响其他水体或 Scene；失败后仍可重试。

### 第四批：保存兼容、纵向验收和旧入口退役

- [x] **W-18 / P0：完成新数据保存与受控关闭；旧档转换不适用。** 本次按用户要求不转换旧 `World/Planning.json` 或 `World/Editor.json` 水数据，也不保留水作者兼容层。新项目的 Source/资产和农场进度必须沿用公共持久化，不能靠换 key、清档或重新初始化绕过。RuntimeEditor 关闭先停止新操作、排空必要的写入和候选，等待保存完成后再销毁。**验收：** 真实保存 → 关闭 → 新 Engine 重开保留作者数据与玩家状态；保存失败可重试，释放失败重试不重复保存；pagehide 的 best effort 不代替受控关闭。正式 editor 由 E-08 单独验收。

- [x] **W-19 / P1：统一结果与失败诊断。** 分别报告三件事：作者是否接受、运行是否生效、是否持久保存。错误要带上目标身份、字段/资产路径、能力或运行原因。组件配置或资源失效导致的运行错误进入公共激活诊断，不能把业务不兼容做成让所有项目都无法保存的系统专用门禁。**验收：** prepare 或陈旧草稿被拒绝时不改作者状态；commit 后激活失败，仍可保存、撤销和修复；保存重试只重试保存，不重跑创建、雕刻或其他领域动作。

- [x] **W-20 / P0：跑通各目标宿主的纵向闭环。** 完整链路：新 Engine 从项目加载 Source Scene/Prefab → 用对应宿主的公共 API 创建或修改水体 → 实际运行与查询 → undo/redo → 用对应存储保存 → 关闭 → 新会话重开 → 继续修改。先完成单湖，再扩展到河宽/控制点、Material/纹理替换和 Ocean 支持项。**验收：** 独立 Water 领域和 RuntimeEditor/Seed World 分别提供适用的证据，不能用 Planner 或手动创建原生对象代替。正式 editor 的同类闭环由后置阶段的 E-08 交付。

- [x] **W-21 / P1：补领域与公共编辑器的交叉回归。** 不迁移 engine-next 的旧测试。针对本期改动涉及的风险，在对应包内新增用例或做浏览器验证，覆盖第 7 节适用的失败、资源、身份与兼容场景；改动涉及 Shader、声明、生产构建或性能路径时，再跑对应检查。**验收：** 记录命令、实际结果、代码 SHA、平台和未测项；类型检查、mock、桌面渲染、移动端和真实模型的结果分开写；不拿建筑或 Water 的历史测试计数当本次通过，也不拿 `world/.acceptance` 的迁移验收结论充当新改动的回归。

- [x] **W-22 / P1：验收后退役旧写入口与重复表达。** 所有调用者迁移完成后，删除具体水体的旧可写作者路径、重复的颜色记录和废弃的资源加载路线；保留 Planner 的环境与生成职责、仍在使用的运行 API 以及 compiler/backend。除静态引用外，还要核查：动态 URL、[`packages/water/package.json`](package.json) 的显式子路径导出、项目 manifest（[`world/scripts/project-assets.mjs`](../../world/scripts/project-assets.mjs)）、Worker、[`world/demos.json`](../../world/demos.json)、生成的声明和文档；退役后跑 `check:boundaries`。**验收：** 新项目只有一条作者写链；旧格式只在明确的导入/迁移边界处理，不长期双写；退役不破坏兼容档案和现有玩法。

### 后置：正式 editor 接入（本期不做）

以下 E 项在本期结束后启动。启动前先在 editor 最新 `dev/2.0` 上重新核对第 2 节的 editor 事实。

- [ ] **E-00 / P0：本地产出带 modify 的 Engine 并 link 到 editor（与 SSR 共用）。** **负责：Engine 修改层；水与 SSR 共同消费；前置：无。** 在 `packages/modify/build/` 新增本地 staged 打包脚本：
  1. 把 editor 需要的原生包（core、design、galacean、loader、math、physics-physx、rhi-webgl、shader、shader-compiler、ui）复制到被 git 忽略的目录；
  2. 按 [`native-overrides.json`](../modify/native-overrides.json) 覆盖替换文件（含 Shader），做法同现有的 `prepare.mjs`；
  3. 在该目录运行原生的 `b:module`、`b:types`。

  editor 侧把本地 link 工具提交为正式开发工具，`--unlink` 旧的 `engine-next-backup/world/.materialized/engine`，再指向新产物。**不要把 engine 仓库根目录直接传给 link 脚本**，否则会把 spine、xr 以及 water/terrain 等源码包一并 link 进去。只出一份脚本，水与 SSR 不各写一套。**验收：** editor dev server 中 `ScreenSpaceReflection` 等修改层符号可用；没有重复的 Engine 类；改动 modify 后重跑脚本即可生效；不发布任何包。记录 alpha.51 → alpha.52 + modify 带来的、与水无关的行为差异，例如 modify 的 `MaterialLoader` 会忽略未知字段。

- [ ] **E-01 / P0：本地打包 Water 并确认 editor 可消费。** **负责：水系统，editor 协作；前置：E-00。** water、terrain、environment 都是源码包，依赖 `?raw` Shader、module Worker、模块相对资源 URL，以及 `@galacean/engine-modify/rendering/CameraDepthTexturePrePass`。可选两种做法：
  - **A（建议）：** 在 engine 仓库用 Vite library 模式本地打包 water 的最小入口（`water/native` 及其运行依赖），`@galacean/engine*` 一律设为 external，由 E-00 的 link 产物提供；产物 link 进 editor。
  - **B：** editor 的 dev Vite 直接 alias 到 engine 仓库源码。此时要同时处理 `?raw`、Worker、modify rendering 模块，并保证 Engine 类身份唯一。

  核对最小入口是否会带入 `ai-chat`（`WaterAgent`），能裁掉就裁掉。**验收：** editor 编辑视口和预览从同一份本地产物真实加载 Water；无重复 Engine 类、无开发机绝对路径、不依赖 `world/` Demo 页面；需要改动的公共 Engine 部分放在 modify 中单独列出。不预设新 npm 包存在，本期也不发布。

- [ ] **E-02 / P0：选定组件交付路线，完成 Source/资产映射。** **负责：editor 与水系统；前置：E-01，以及 W-02～W-04 的最小契约。** 默认优先复用 Water 原生类，在 editor 插件层注册编辑适配。如果评估后选择项目 Script，就要逐项证明 Inspector、原生引用、编辑态执行、预览注册和类型检查都能实现，不能只复制 TS 源码。导入转换负责：RuntimeEditor 路径 → editor 资产 ID、Source 实体/组件 ID、Prefab 内引用和版本。正式 editor 的保存复用 `scene-file-v2`，只在运行导出时才 lowering 成 Engine 索引。**验收：** 冷加载 Scene/Prefab；资源重命名不丢引用；复制实例得到独立身份；坏引用在导入/校验时就能定位。不得放宽 editor 的资产 ID 规则，也不得原样导入 `waterBodyComponentData()` 的运行记录。

- [ ] **E-03 / P0：接通组件菜单、最小 Inspector 和同源公开 API。** **负责：editor，水系统提供属性契约；前置：E-02、W-02。** 原生路线要登记 Engine 构造函数、`EditorComponent` 元数据、默认值、`propertyField/serialize` 与引用表单；Script 路线用现有的脚本资产和装饰属性合同。Inspector 经 `InspectorFacade/ComponentFacade` 写入，工具经 editor-api 的同源领域操作写入，最终都落到 CommandBus/DomainStore。公开类型、操作输入和生成声明保持同步；Editor UI 上的标签和范围不能当作 Runtime 校验。**验收：** 第 5 节的最小微调项能分别由 UI 和工具完成；首改、连续拖动分组、Undo/Redo、显式 0/false、Prefab override/revert 行为一致；非法请求不产生部分写入。不新增专用的 Water 历史，也不用直接 `configure()` 绕过作者模型。

- [ ] **E-04 / P0：衔接 editor 的投影完成与异步 Water 发布。** **负责：水系统与 editor；前置：E-02、W-08。** 当前 `EngineProjection.apply()` 同步赋值，而 Water 配置 setter 会启动异步工作并自己捕获 rejection。需要复用 editor 的事件/效果机制：消费一个完整的已接受输入快照，按 revision 取消陈旧候选，等待 Water 自身批次完成，收集 `ready/lastError` 等事实；同时验证资产未 ready 时的延迟引用与重绑。现有协议若确有缺口，先写最小失败用例，再补通用扩展；不往公共 Model 里塞水业务分支，也不照搬 RuntimeEditor 的 participant。**验收：** 一次作者修改不会发布半份配置；失败可见、可重试；旧的完成通知不覆盖新状态；作者接受、投影完成、Water 就绪、持久化四个结果能分别观察到。撤销/重做走同一条消费链，运行回调不会反向产生作者提交。

- [ ] **E-05 / P0：补齐编辑态宿主、相机/Terrain 输入和拾取。** **负责：水系统，editor viewport 协作；前置：E-01、E-04。** 先声明编辑视口、相机预览、Play 各自使用的 Engine/Scene 和活动 Camera。当前 WaterSystem 初始化后拒绝更换 Camera/Scene，不能直接赋新相机：要么按实际模式重建并排空旧 owner，要么做有证据的最小能力扩展，并保留“一个 Scene 一个 WaterSystem”。用 [WaterTerrainSnapshot](src/water/authoring/terrain/WaterTerrainSnapshot.ts) 的只读输入组织静态或程序化床面、版本与坐标转换，写明没有 Terrain 时的支持范围。对接 [EditorPicker](https://github.com/galacean/editor/blob/dev/2.0/packages/model/src/modules/viewport/EditorPicker.ts) 与 [WaterSurfacePicking](src/water/runtime/surface/WaterSurfacePicking.ts)，让生成的可见 Mesh 能命中作者对象。**验收：** 不进 Play 也能看到和微调水；切相机、Play/Stop、切 Scene、Undo 重建后都正确；深度/不透明纹理、modify SSR 租约和渲染层不破坏原相机；透明水面可选中；粒子和 atlas 不成为作者对象；移除后拾取映射和资源都被清理。

- [ ] **E-06 / P0：贯通 editor 的资源导入、编辑与失效。** **负责：水系统提供资产与转换，editor 接资产链；前置：E-01、E-02、W-03、W-04、W-10。** 按第 4 节选择“源图像 → Texture/KTX2”和“Shader 源 → `.shaderc`”，或实现有测试的原生运行产物输入适配。要支持的 Water 自定义格式需覆盖浏览器 `EditorAsset`、headless 编码/loader 映射、依赖提取与删除保护、Storage 和预览编译。Material 原生化要明确作者值归属和实际后端绑定，补上必要的 Inspector/Shader UI 元数据。**验收：** UI 导入、资源字段修改、共享消费者更新、复制与重命名、Prefab、保存重开在预览中都一致；不出现以下问题：`.water` 被当成未知文件而丢引用、KTX2 被图片解码器误读、Shader profile 缺失、内部编译默认值覆盖刚改的 Material 值。

- [ ] **E-07 / P0：覆盖编辑态预览与 Play 的模块装配（独立 Builder 后置）。** **负责：editor，水系统提供运行入口；前置：E-01～E-06 的最小闭环。** 沿用预览链路的依赖与加载前注册入口，把 Water 类/Loader、Shader/includes/AOT、纹理和必要脚本纳入预览编译；核对自定义组件继承与组件引用的 lowering，不能只改浏览器注册表。选项目 Script 路线时，核对默认导出、装饰器/类字段编译、依赖解析和生成的 `register-scripts`。headless 没有 GPU，不实例化水渲染世界来完成作者查询和保存。扩展公开 API 时同步 metadata/codegen；Seed World 的 [`systems/runtime.ts`](../../world/demos/seed-world/systems/runtime.ts) 不能代替这些入口。**验收：** editor 开发服务内预览/Play 冷启动能加载水并运行查询；不依赖 World Demo 开发服务才能提供的资源或注册副作用。**独立 Builder 产物、CLI 使用的 npm Engine、远端发布属于发布期，本期不验收。**

- [ ] **E-08 / P0：在真实 editor 中验收编辑、保存、重开及失败边界。** **负责：水系统与 editor 联合；前置：E-03～E-07。** 在现有可 reload 的 Playground 中扩展 Water 项目，使用真实的 Root、Engine（E-00 link 产物）、LocalStorage/OPFS 和公共 API。复用现有的 `flushCurrentScenePersistence`、资产 effects 等待和存储保存流程，补上 Water 在途候选的退出与重绑；不要把 `RuntimeProjectSession.flush()` 写成 editor API。**验收：** 第 7 节正式 editor 场景都有本次证据；保存失败可重试；重开后数据和真实效果一致；Play 的运行状态不回写作者配置；重开后普通历史从新会话开始；实际 UI 导入与测试文件复制分开记录。

本期主线是 M0 → M1 → M2 → M3，E 项在其后启动。W 项的分批是领域内的拆分；单湖闭环（M1）不必等 Seed World 旧档迁移完成。水位、外观和河宽至少各保留一个局部更新用例；完整曲线编辑 UI 可以后置。

## 7. 迁移验收矩阵

以下是本期适用验收要求。本次结果按 W 项登记在实施记录；旧档转换不适用，后置平台和未测场景不算已通过。

### 本期：水领域与 RuntimeEditor/Seed World 的适用回归

| 验收面 | 必测场景 | 应观察到的结果 |
| --- | --- | --- |
| 装配 | 不手动创建、直接加载 Source Scene/Prefab；缺类/Loader/相机；WaterSystem 重复；多个 Scene | 正常加载，依赖和冲突有清晰诊断；一个 Scene 失败不影响另一个 |
| 微调 | 单湖水位，河宽/深/段型，颜色/法线/焦散/落水外观，Quality 组件值，可用的 Ocean 作者项 | 通过同一套公共属性契约改出实际效果；非法值不靠隐藏面板来防 |
| 同事务快照 | 同一次编辑替换形状/材质或资源组合并做作者计算；提交后发现上一次激活曾失败 | 读取本次草稿对应的资源；借用对象不逃逸，旧缓存不参与计算 |
| 作者生成 | 首次创建、禁用生成器、祖先 inactive、Prefab 覆盖、显式再生成 | 生成内容和所需标记一起被接受；重放不产生重复对象；人工修改不被自动重置 |
| 原生引用 | 直接/传递的纹理依赖、共享 Material 的多个消费者、独立副本、删除被引用的资源 | 依赖和删除保护正确，实际的派生消费者被失效；取消后不泄漏临时资源 |
| Prefab 与身份 | 模板与实例覆盖、revert、内联添加、结构替换、复制、公共拾取 | 继承和 ID 语义稳定；不把展开的模板存成第二套对象；旧运行对象不能再被反查到 |
| 原子发布 | 多水体修改；河床切挖与湖岸编辑；连接组；故意让一个候选失败 | Terrain、水和查询同版切换；失败时保留一致的旧运行状态；作者接受的结果可以单独解释 |
| 生命周期 | 隐藏、禁用、移除、撤销恢复；快速连续修改；准备中途销毁；旧候选晚到 | 没有旧结果回写、资源复活、owner 重复、错误释放或悬挂的注册 |
| 历史 | create/update/delete、跨文件的资源修改、prepare 输出；commit 后捕获显式补丁 | 公共 history 能完整恢复作者结果；新会话 history 从头开始，跨会话只验证显式保存的补丁 |
| 新数据与保存 | 缺依赖、坏数据、保存失败后重试、新 Engine 重开；旧档转换不适用 | 不静默重置；最后被接受的作者状态可以恢复；项目只有一份水作者表达 |
| 受控关闭 | 关闭时有在途的准备或已接受的写入；一次保存失败后重试 | 排空后再 flush，成功后才销毁；重开后保存正确；失败时项目保留且可重试 |
| 下游与进度 | 农场取水、接地/生态/导航、运行禁用后恢复、作者撤销 | 消费发布的事实和能力质量；保留现有玩家进度；预览不冒充已发布状态 |
| 渲染 | 转换前后的材质/纹理/透明度、粒子和法线；AOT profile；资源恢复；modify SSR 接收 | 资源语义与画面一致；缺变体时明确诊断；桌面通过不能外推为移动端或 GPU 性能通过 |

### 后置：正式 editor 必须另行通过的场景

| 场景 | 实际验证入口 | 完成条件 |
| --- | --- | --- |
| 本地 link 与冷启动 | E-00 Engine 产物 + E-01 Water 产物，editor dev server | 不导入 World Demo 页面，也不提前手动创建组件；Loader、构造函数、资源和声明齐全；类身份唯一，modify SSR 可用 |
| 创建与最小微调 | 添加组件或预置 Prefab、真实 Inspector、公开 editor-api | 同一字段由 UI 和工具编辑，得到相同的 Domain/Source/运行结果；首改撤销、0/false 和非法输入都正确 |
| Source/资产身份 | 现有 Source-v2 codec、manifest、资产管理入口 | 路径先解析为资产 ID，嵌套引用和组件引用按格式保存；重命名、复制、Prefab 多实例、重开都不串对象 |
| 导入与资源更新 | 真实 UI 上传/导入，与 headless 项目读取分别测 | Shader 输入与运行产物、Texture 输入与 KTX2 分开处理；Material/纹理换引用、依赖失效、删除保护都生效 |
| 异步运行完成 | 真实 EngineProjection + Water 候选和完成通知 | 模型接受后能观察到 compiling/ready/error 或等价事实；连续修改、Undo、资产延迟、取消时不闪回旧候选，不吞错误 |
| 编辑态、相机与拾取 | 编辑视口、相机预览、Play/Stop、切 Scene | 不进 Play 就能微调水；点中水面命中正确的作者对象；相机租约、宿主重建、GPU/订阅释放正确；Play 状态不回写作者数据 |
| Terrain 适配 | 明确的床面/高度源资产，或已有的 Terrain adapter | 局部/世界坐标、revision、缺输入时的行为都明确；支持雕刻的路径验证 Terrain 与 Water 同版，不支持时明确拒绝 |
| 保存与恢复 | 可 reload 的 Playground 的实际存储流程 | 等 Scene、资产和必要的水任务完成后再保存和重开；保存失败可重试；不是比较同一个内存对象，也不是重放创建脚本 |
| 预览/Play 运行 | editor 开发服务内的预览 Sandbox 与 Play | 相机、水、纹理、Shader 完整冷加载，查询和画面正确，运行错误可观察；**独立 Builder 产物与部署后置** |
| headless 互通 | editor-api/Runtime 作者操作 → 本地项目 → 浏览器打开 | 工具合同、资产 ID、生成声明、保存和浏览器读回一致；headless 成功不等于 GPU 运行成功；headless 使用的是 npm Engine，若需要 modify 能力须单独说明 |

可参考的测试入口：

- **engine 侧（本期）：** engine-next 中的 NativeWater、WaterSceneRuntimeHost、PlanningWaterLifecycle、PlanningNativeWaterColor、runtime-preparation、runtime-explicit-undo、native-resource-invalidation、runtime-project-persistence，以及建筑的初始化/Prefab 夹具，都没有迁入 engine 仓库，本期也不迁移。需要时只借鉴其用例构造方式，在对应包内为本期改动新增用例，不继承它们的历史通过结论。
- **正式 editor 参考（后置）：**
  - [Source 引用往返](https://github.com/galacean/editor/blob/dev/2.0/packages/model/src/scene-file-v2/__tests__/domain-codec-source-ref.test.ts)
  - [延迟组件引用](https://github.com/galacean/editor/blob/dev/2.0/packages/model/src/projection/__tests__/EngineProjection.deferred-component-refs.test.ts)
  - [首改撤销](https://github.com/galacean/editor/blob/dev/2.0/apps/editor-playground/e2e/component-firstedit-undo.spec.ts)
  - [组件属性生命周期](https://github.com/galacean/editor/blob/dev/2.0/apps/editor-playground/e2e/component-props-lifecycle.spec.ts)
  - [CLI 到浏览器的项目读回](https://github.com/galacean/editor/blob/dev/2.0/apps/editor-playground/e2e/cli-local-project.spec.ts)

  这些只是现有能力的参考夹具，目前还没有 Water 验收用例。

## 8. 实施时的验证命令与完成边界

以下命令按两个仓库当前的 `package.json` 核对，是迁移实施后的验证入口。旧版文档中的 `gallery:sync`、`typecheck:water`、`test:water*`、`water:native-api:check`、`seed-world:declarations:check`、`test:seed-world-water:*` 在 engine 仓库中**都已不存在**，不要再用。按影响范围选择命令，同步、构建与浏览器服务不要并行覆盖同一缓存。

### engine 仓库根目录（`dev/engine-next`）

```sh
# 首次或修改 shader 替换文件后
pnpm install --frozen-lockfile
pnpm --dir world prepare:engine

# 类型与依赖边界（与构建使用同一份 modify 替换映射）
pnpm --dir world typecheck
pnpm --dir world check:boundaries

# 独立公共 Water Editor 开发与生产构建
WORLD_DEMO=water/editor pnpm --dir world dev
WORLD_DEMO=water/editor pnpm --dir world build
# Seed World（默认入口）
pnpm --dir world build

pnpm exec vitest run --config packages/water/vitest.config.mjs
node world/scripts/generate-water-assets.mjs
node world/demos/seed-world/agent-adapter/contracts/run-agent-contracts.mjs
git diff --check
```

本次已新增包级 vitest 配置：用到 WebGLEngine 或 modify 符号的用例要用 Chromium browser 模式并安装 `engineModify()`，可参考 [`modified-engine.config.mjs`](../../world/scripts/acceptance/modified-engine.config.mjs)；命令以实际配置为准。

Seed World 改造还要按约定更新 [V2_IMPLEMENTATION.md](../../world/demos/seed-world/V2_IMPLEMENTATION.md)，并选跑相关的 Terrain/建筑/农场回归。不要求每个小改动都跑全量；出现新增失败、资源/时序疑点或改动范围扩大时再扩展验证。浏览器验证按任务指定的环境进行，未指定时使用内置浏览器。

### 后置：`galacean/editor` 根目录（`dev/2.0`）

本期不执行。后置阶段按 [editor AGENTS](https://github.com/galacean/editor/blob/dev/2.0/AGENTS.md) 和[测试归属](https://github.com/galacean/editor/blob/dev/2.0/tests/README.md)选择验证。

```sh
# 联调前：先产出 E-00 本地 Engine 产物，再切换 link（工具提交后以正式名称为准）
node scripts/link-local-engine.mjs --unlink
node scripts/link-local-engine.mjs <E-00 产物目录>

# 代码修改的基础检查（lint 已包含 guard:model-first）
pnpm lint
pnpm tsc

# 按受影响的 owner 选取测试
pnpm --filter @editor/model test
pnpm --filter @editor/main-plugin test
pnpm --filter @editor/editor-api test
pnpm --filter @editor/builder test

# 公开工具或项目脚本合同变更时，生成并核对产物
pnpm --filter @editor/editor-api codegen
pnpm --filter @galacean/editor-runtime build

# Playground 浏览器用例（先构建 CLI，须串行）
pnpm e2e

# 手动或内置浏览器调试入口，按需启动，不作为验收通过的依据
pnpm play:editor

git diff --check
```

`pnpm e2e` 跑的是无登录 Playground，会先构建 CLI，CLI 构建与浏览器测试必须串行。新的 Water 场景要加入对应套件，现有整套测试通过不能证明新系统已接入。升级 Engine 影响继承元数据时，用 `pnpm --filter @editor/builder generate:component-inheritance` 重新生成并检查差异，不要手改生成表来掩盖未知类型。注意：本地 link 只作用于 dev server，`pnpm e2e`、Builder 和 CLI 仍使用 npm 上的 alpha.51，它们的结果不能证明本地 Water/modify 已生效。

### 最终交付与本次边界

本期（engine 侧）完成时要交付：

- 原生资产源/产物清单和领域格式的例外说明；
- 组件属性与 Unity 的对照，以及组件微调在 RuntimeEditor 中的实际效果；
- 迁移前后的数据与职责归属表、旧入口的兼容与退役说明；
- RuntimeEditor/Seed World 中编辑、资源更新、Prefab、undo/redo、保存重开的实际证据；
- 本期 22 个 W 项的完成或不适用依据；
- 实际执行的验证命令、结果、平台和未验证项。

Seed World 本次交付新数据保存关闭、下游与进度保护和退役验证；旧档转换按用户要求不实施。后置阶段的正式 editor 接入另按 E-00～E-08 交付。“有原生组件”“API 调用成功”“文件能加载”，任何一条都不能代替整体完成。

本次实现、逐项验证和剩余平台边界见 [实施记录](EDITOR_MIGRATION_IMPLEMENTATION.md)。本期 W 项按上述范围完成，E 项保持未勾选。代码仅留在当前工作区。
