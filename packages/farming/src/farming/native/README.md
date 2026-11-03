# 种植系统原生接入

区域默认启用共享播种表现，服务确认 `crop-planted` 后播放种子落下、停留和隐入土中的动画。组件拥有生命周期，不写入领域快照；参见 [播种表现与宿主表面采样](../assets/sowing/README.md)。

本层将已有领域规则、事务仓储与 `FarmingService` 接入 Engine Scene；无 Engine 的接入继续使用 `../api`。种植运行状态始终只有一份 `FarmSnapshot`，组件不另存作物或库存。

## 最小宿主

```ts
import {
  FarmingSystem,
  FarmingAreaComponent,
  FarmingAPI,
  createFarmingResources,
  registerNativeFarming
} from "./native";

// definitions 是已通过 createPlantingCatalog 校验的领域定义；groundProvider 提供当前宿主地形事实。
registerNativeFarming(); // 必须在加载 Scene / Prefab 前调用。
const system = scene.createRootEntity("Farming System").addComponent(FarmingSystem);
system.configureRuntime(() => ({ groundProvider, clock, autoAdvance: true }));
const resources = createFarmingResources(engine, definitions);
const area = scene.createRootEntity("Farming Area").addComponent(FarmingAreaComponent);
await area.configure({
  farmId: "orchard",
  layoutId: "orchard-layout",
  layoutVersion: 1,
  ...resources,
  plots: [{ id: "orchard/a", label: "A", target: { groundId: "host-ground", cellX: 0, cellZ: 0 } }]
});
// 组件已经持有引用；交还宿主创建的临时资源所有权，组件释放前资源不会销毁。
resources.catalog.destroy();
resources.rules.destroy();
const api = new FarmingAPI(system);
const catalog = await api.execute({ operation: "getCatalog", input: { farmId: area.farmId } });
```

每个 Scene 只有一个 System，同 Scene 的 `farmId` 必须唯一。Prefab 保留稳定身份；两个同身份副本不能激活在同一个 Scene，不自动改名或合并存档。不同 Scene 可以独立恢复同一身份，共享资源但不共享运行状态。

宿主可按区域注入仓储、时钟和演出端口。未注入仓储时创建独立内存仓储，并用组件快照初始化。农场案例注入 IndexedDB，已有匹配记录优先，快照仅用于首次初始化。目录与规则资源的版本必须一致；定义、布局、模拟规则签名或作物引用修订不匹配时加载明确失败，不覆盖存档。

## Debug 开关

`system.debugMode` 默认 `false`，运行中可赋值 `true/false`；宿主通过 `system.debug.subscribe(enabled => ...)` 控制调试面板。订阅不会立即回调，接入时先读取 `system.debugMode` 设置界面，释放界面时取消订阅。系统销毁时关闭开关并清理订阅；不同系统实例互不影响。该模式不改变耕地、作物、库存、模拟时钟或快照，不随 Scene/Prefab 克隆。

农场案例使用同一个控制器，底部 `Debug` 按钮、`F2` 或启动参数 `?debug=1` 控制显示。普通模式保留底部 HUD 和作物顶部标签，其余面板仅在 debug 开启时创建；关闭时释放弹窗和输入锁。无 Engine 的宿主可从 `../api` 导入 `FarmingDebugMode`。

## 默认耕地与实体仓储

省略 `plots` 并传入 `initialLayout: { groundId }` 即可初始化 3×3 耕地、空推车和空篮子各一。`storageLayout` 配置仓储锚点、搜索范围与宿主预留耕地；显式 `plots/grid` 继续支持自定义农场。详细容量、摆放和存档规则见 [实体仓储](../storage/README.md)。

`getCatalog.storage` 返回容器类型和逐作物容量，即使当前容器数量为零也可发现可用类型。`getContainers` 查询每个容器，`setContainerCount` 调整数目和保留数量，`withdrawInventory` 取货。容器持有唯一库存，`getInventory` 只聚合数量。

原生区域默认创建 `StorageContainerPresenter`，按提交事件更新世界中的模型与逐份产物。显示根节点独立于组件变换，采用宿主地形的世界坐标；组件/System 禁用时隐藏，销毁或非法迁移时释放。无图形宿主通过 `storagePresentation: false` 显式关闭显示。渲染资源由 Engine 共享管理，呈现器拥有自己的产物网格和材质。

## 玩家与 API 演出

`FarmingActionCoordinator` 接收宿主 `FarmingPresentationPort`，UI 与 API 共用操作流程。宿主通过 `prepare/begin/committed/finish/cancel` 驱动现有演出，使用服务的确认事件更新植物和篮子。无端口时直接执行领域操作；篮子与当前目标查询明确返回 `NOT_SUPPORTED`。

收获在篮子就位后提交，确认事件同步触发植物消散和篮内显现。浇水立即提交并由宿主与水滴落地同步。整地先播放可取消的临时形变，完成后提交；锄地绑定开始观察到的实例和地形版本。每区域同一时刻只有一个交互动作，查询始终可用，篮子通过 `getCarry/queryItems` 查询、`placeItem` 放下并保留内容、`unloadBasket` 手动卸货。

成功结果提供持久化回执、完整 `request` 和独立演出状态。存储失败使用 `error.details.retryRequest` 原样重试。已持久化成功后演出异常不能报告为领域失败；无显示宿主时不制造篮子状态。

## Scene / Prefab 与生命周期

`serializeFarmingResource` 输出纯 JSON 资源，ResourceManager 以 `FarmingResource` 加载、缓存并管理引用。组件引用使用原生 `{$ref: index}`；先注册虚拟资源路径或真实 URL，再按 Engine 2.0 Scene/Prefab 格式加载。

保存时 `await farmingAreaComponentData(area, resource => refsIndex(resource))`，内部等待服务检查点并导出当前作物身份、进度、土壤、库存、模拟时钟和回执。禁用且未启动的组件保留初始定义/快照。演出和临时形变不保存。宿主拥有其他 Scene 实体与最终文件/URL；本层不定义第二套 Scene 文件格式。

加载后重新 `system.configureRuntime(resolveDependencies)`，宿主地形和仓储不是序列化对象。禁用组件或 System 取消交互动作；已初始化区域继续结算领域时间，重新启用不会获得额外的暂停时间奖励。销毁时取消未提交操作，等待事务队列和演出等待收尾，再释放自有仓储与资源引用。外部仓储由宿主在 `await system.dispose()` 后关闭。

完整可运行宿主见 `demos/farming/native-preview/NativePreviewHost.ts`，其中演示真实 Scene/Prefab Loader 和原生资源引用。现有农场案例继续提供浇水、锄地和收获演出。

## Agent 与生成检查

`createFarmingAgentPackage(api)` 提供 FarmingSystem/FarmingAreaComponent 身份代理绑定、内部 RPC 工具、真实方法声明和四份只读虚拟文档。Agent 通过 editor.component.query 获取代理并调用异步方法；内部工具名不作为另一套公开调用协议。将其返回的 `definition/tools` 注册给现有通用 Agent；不修改应用层、Agent Loop 或 Prompt。API 索引来自 `FARMING_API_CONTRACT`，声明从传递类型提取，knowledge 来自本目录的 Markdown。

从仓库运行：

```sh
pnpm --dir world farming:native-api:generate
pnpm --dir world farming:native-api:check
pnpm --dir world typecheck:farming
pnpm --dir world test:farming
pnpm --dir world build:farming:all
```

`tests/native/FarmingInstructionSuite.ts` 的同一自然语言用例和固定脚本，通过现有通用 JavaScript Agent Script 执行器回放；检查允许调用范围、最终状态与结构化失败证据。此结果证明确定性系统链路，不代表真实模型指令遵循验收。模型接通后复用该用例集另行记录结果。

已注册的 FarmingSystem 与 FarmingAreaComponent 固定属于原 Scene，不能通过 addRootEntity 迁移。迁移会拒绝继续访问旧运行时并取消等待；需要迁移数据时先保存快照，再在目标 Scene 创建新组件并注入目标地形、仓储及演出依赖。克隆/Prefab 新实例由目标 Scene 单独初始化。

临时存储加载失败会释放失败实例，并以 STORAGE_FAILURE/retryable=true 返回。下一次 API 状态或操作请求重试一次，也可由宿主调用 area.retryInitialization()；定义或存档不兼容须修正后重新创建组件。
