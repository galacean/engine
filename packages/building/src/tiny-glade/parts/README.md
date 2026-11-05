# 建筑基础构件

当前公开入口是 `architecture/index.ts`，由 `parts/index.ts` 和 `@galacean/seed-world-systems` 导出。

建筑架构迁移已完成，生产与演示只运行新版。迁移期间使用的旧执行基准、测试适配及新旧比较入口已删除；历史验收结果见 [ACCEPTANCE.md](ACCEPTANCE.md)。Seed World 建筑项目使用 v7-groups 存档键，不读取旧存档，也不转换旧作者格式。当前测试验证新版功能、资源生命周期、编辑保存及版本隔离，不依赖旧执行器。

```ts
const draft = Building.European.buildHouses({
  id: "house", seed: 17, height: 4,
  rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
  roof: { height: .5, profile: 0, ridge_length: .5, eave: .2 }
});
const manager = BuildingManager.forScene(scene);
manager.assets = buildingKitPrefab;
manager.camera = camera;
manager.terrain = (x, z) => terrainHeight(x, z);
const root = manager.create(parent, draft);
await manager.flushAsync();
```

场景宿主在作者 Scene 解析完成后调用 `BuildingManager.forScene(scene)`，由它收集已启用的构件。构件启用时只向已有管理器注册，不在解析期间插入管理器根节点；后续启停、跨场景移动和删除由原生生命周期维护。Seed World 已由 `NativeBuildingHost` 完成绑定，业务脚本复用该管理器。

LLM 的 `execute` 通过 `tools.building.generate({generator:"European.buildTower", parameters:{id:"tower",height:9}, source:{id:"tower-frame",assetLibrary:"项目中实际资产库路径"}})` 获取完整 Prefab Source。将返回的 `content` 原样交给 `editor.asset.create`，再用 `editor.entity.create` 实例化；它们使用原生编辑事务。生成 API 不创建场景对象，不保存第二份生成器参数；游戏 Script 才使用上面的模块导入和运行时 CRUD。

## 流程与数据归属

1. `Building.European.buildHouses/buildTower/buildWall/buildFence/buildSteps` 完成风格规划与草案，返回 `BuildingDraft {groups, parts, relations}`。`buildHouses` 可接收参数数组。不会创建 Engine 对象或放置砖瓦。
2. 公共 `buildWalls/buildRoof/buildFoundation/buildWallStrip/buildSteps` 生成基础构件。前两者既支持现有轮廓描述，也支持调用方提供的 support。风格入口选择算法和 Unit。
3. `designBuilding` 从原始构件解析连接、开口和邻居接触。`resolveBuildingConnections` 对内置与自定义显式规则使用同一个 `buildingConnectionRules` 注册表；规则可修改工作副本、派生构件或发布临时几何约束。墙顶、台基和附件宿主约束由后续几何阶段消费，不再按作者规则名称二次猜测。墙交界返回 Path 与预留范围。内置欧式规则适用矩形/圆形轮廓，不声称任意 Mesh 自动 CSG；未知规则、不适用的支持类型或重复派生身份会报错。
   解算结果以 `design.parts` 作为唯一构件列表，不再额外返回各类连接、拱、附件、小屋顶和尖饰列表及来源 Map。提前参与远景的构件携带临时 `publication` 信息（记录格式、来源），由同一循环执行和验证；具体几何打包保持各自数值规则。该信息不得写回作者构件，`supports` 保留为解算几何索引。

4. `implementBuilding` 按稳定顺序执行构件任务，统一按构件声明的 `algorithm.type` 从 `buildingPlacementAlgorithms` 查找算法。原生解析曲面的砖瓦排列和通用 Point/Path/Mesh 算法使用同一注册表、调用点、取消检查与输出收集；不再由实施层把算法名替换为 support 生成器名。解析曲面保留精确轮廓和邻居约束，算法可返回打包所需的 profile 结果；通用算法返回姿态数组或原生批处理。`BuildingInstancePlacement` 仅描述输出，不再执行算法。台阶是 Path + stepCourses，无隐藏房屋壳。包含需要原生资源的 support 生成器时，调用方提供并管理 `BuildingAlgorithmContext`；Manager自动管理。铺设算法可异步返回，取消后的结果不能发布。

   墙接缝已由设计阶段生成真实 Path，`wallStitches` 与其他铺设算法通过同一个 `executeBuildingPlacement` 调度，支持自定义异步实现和取消。返回的 `wall-stitch/v1` 数值记录由独立打包器保持全局编号、颜色随机输入和交替墙归属；预览先执行一次，细节复用已发布的铺设结果。不能在每条接缝上重置编号。

   屋顶交接也生成真实水平 Path，由 `roofMerlons` 注册算法消费曲线、边沿模式和材质参数，返回 `roof-merlon-course/v1`；不再由发布阶段直接调用交接铺设器。砖石和木结构保留原始浮点精度、分段次序与实例缓冲。

   石拱与木拱先求开口及基准 Path，再分别由 `stoneArchCourses` / `woodArchMembers` 注册算法铺设砖、拱框与柱。预览和细节共用一次铺设结果；冲突而被拒绝的开口不产生铺设任务。

   普通墙窗、转角窗、门、壁灯、平台舱门和屋顶灯在设计阶段只解析开口、占位和 Point 挂点。`mountAttachment` 通过共享注册表消费精确挂点、资产及框材质参数，返回 `native-attachment/v1` 几何记录；发布只执行一次，细节复用结果。自定义异步算法可以替换该挂接算法，取消或返回错误格式时不会发布。转角窗的两个过梁保留资产成员各自的精确挂点；设计只投影源顶点计算安装范围，不生成渲染网格。

   完整乡村式老虎窗（`dormer-cottage`）已拆为窗体 Point 挂点与派生 `cottageDormerRoof` Surface。窗体由 `mountAttachment` 生成；小屋面由 `cottageDormerCourses` 执行瓦片、封边及侧板排列，保留原实例批处理。附件作者参数 `params.roofAlgorithm` 可替换小屋面铺设算法，返回 `dormer-roof/v1`；其 Unit 与宿主屋顶共享材质绑定。派生结果不保存到作者 Source。

   完整哥特式老虎窗（`dormer-gothic`）现在同样发布窗体 Point 与派生小屋面 Surface。窗体使用 `mountAttachment`，小屋面是两侧拱形截面加宿主曲面的 `profiledDormerRoof`，由注册的 `profiledDormerCourses` 铺设。设计为了保持原有精确避让，会按目标 Unit 尺寸、倾角和搭接计算瓦带占用体积，但不产生或缓存实例字节、瓦片输出数组、窗体渲染网格；实施复用数值采样内核生成真正的铺设记录。不能把这个设计阶段描述成完全不计算排列。

   乡村式、哥特式、箭孔式半老虎窗也通过同一挂接/小屋面铺设流程。设计负责墙/屋顶双开口、百叶窗或石帽的成员挂点，以及精确占用；`wall-curve` 编辑坐标保留原周向投影与闭合接缝。三个旧整体生成入口已删除。屋顶尖饰由设计阶段派生 Point，明确引用 `{libraryMesh:"roofSpire"}`，通过注册的 `placeRoofSpire` 生成。屋顶构件的 `params.spireAlgorithm` 可替换该算法；发布执行一次，预览和细节消费同一份结果，不另行补造尖饰。局部隐藏仍按实际挂点与屋面开口判断。解析曲面的自定义铺设已可注册，但必须声明其原生几何约定；任意曲面仍应使用 Mesh support，而非强套欧式 profile。
5. `renderBuilding` 消费明确的 `BuildingRenderInput`（绘制归属、颜色槽、实例、垫底面、材质面与铺设编辑数据），复用 dev/2.0 资产、着色器、实例 ABI 和屋瓦 GPU feedback。渲染器不读取旧整屋描述，也不从 geometry_id 后缀推断所属建筑。

新版链路已删除 `buildingKernelDocument`：`BuildingProfileSupports` 从构件参数及显式关系生成几何，设计、实施和绘制不重建旧整屋模型。Seed World 直接读取 BuildingGroupComponent 与 BuildingPartComponent。建筑存档键已升级到 v7-groups，旧版本存档不读取，不提供旧 Source 转换。

`BuildingPipeline.prepareBuilding` 对所有构件执行设计、实施和渲染，返回一个未发布候选。生成support与Unit使用同一候选资源作用域；成功统一发布，失败或取消统一释放。`BuildingInstanceRender` 只把已计算的实例布局生成合批或独立对象；原生砖瓦仍使用精确实例渲染后端。Manager只保存一份已发布候选，不再维护两套输出状态。原 `BuildingFlatPlacement` 已删除。

`BuildingCpuClient` 已提供独立的新 Worker 协议：输入是扁平草案、不可变地形网格和资产快照；预览保留求解后的几何，细节生成复用该快照。每个句柄独立释放，取消立即拒绝结果，Worker 故障使原句柄失效；资产和地形按引用共享。当前 Worker 只接受原生轮廓构件与附件描述，尚未提供 Entity/Prefab/Mesh 的跨线程编解码；不支持的输入明确报错，没有回退到旧编译器或主线程。

Worker 细节返回值只包含 `{renderInput, grounding}`，供渲染、表面编辑查询和落地消费；完整解算上下文与中间几何留在 Worker。预览与细节仍分时生成，细节复用预览已铺设的派生构件。

`BuildingDistanceView` 是纯远景渲染器，消费生成几何、颜色槽和拾取映射，不读取整屋作者模型。Seed World 与公共 BuildingManager 使用同一 BuildingRuntime，统一 Worker、局部重建、LOD 驻留、地形事务、拾取与灯光生命周期。 原生附件灯光从已发布的构件几何提取，Worker 与自定义算法主线程视图共用灯光池，隐藏、移动、删除和撤销均跟随构件；原生 Prefab 自带的灯仍由节点管理。

**生产接入：** Host、初始世界生成、内置 Prefab、面板和 Script 导出已切到新版；历史验收记录曾覆盖 seed=1 的17栋/17组/203个构件；该数字不是每次版本的重新验证结果。多视角、多距离与性能对照的最终结果以文首和ACCEPTANCE为准；内置轮廓仍由专门几何求解器准备，连接与铺设已走共享注册入口，任意 Mesh 的连接需要对应自定义求解器；复制材质随机输入已完成下述独立验收。不能把生产启动成功当成整个目标完成。

`BuildingPartComponent` 保存自身 `definition`、从自己出发的 `relations`、可选祖先 `frame` 引用，；独立的 `BuildingGroupComponent` 保存组 `definition`（id/seed/颜色）、`frame` 和 `assetLibrary` 引用。没有递归 children/parts 或第二份 plan。组 Entity 负责归属与移动；Unit 可以是资产库材质单元、Entity、Prefab、明确的 `nativeAttachment` 窗门资产描述，显式的资产库网格 `{libraryMesh:"roofSpire"}`（由对应注册算法消费），或不带递归 building 的程序化几何模板。通用静态可读网格合批，行为对象保留 Entity，原生砖瓦保留实例批处理。

`BuildingManager.buildStatus` 提供可经运行时属性读取接口查询的bound/pending/generation/errors/diagnostics，不触发编译或清除变换脏标记；供Agent在编辑提交后区分正在生成、失败和已发布。

`BuildingManager` 负责 CRUD 与构件身份；共享 BuildingRuntime 负责分组签名、异步取消、原子替换、Worker、LOD 和地形事务。失败保留上一份可见结果；只重建输入变化的 frame，无变化时复用原结果。原生可传输 profile 使用 Worker；含原生对象引用的 Point/Path/Mesh 使用主线程执行，两者在同一分组调度和发布流程中，不做失败回退。通用主线程构件当前保持完整实例表现，没有自动生成远景替身；结构碰撞查询目前来自 profile 的生成面。矩形/圆形欧式结构构件共享组坐标系，支持水平刚性移动/旋转；高度来自 terrain，倾斜、缩放或单独移动依附屋顶会明确报错。墙 Point 附件可以单独平移节点，运行时把相对宿主的平移合入挂点，再求解开口；附件旋转/缩放以及通过节点位移更改 UV 挂点会明确报错。通用 Point/Path/Mesh 构件支持 Entity 变换。外部原位修改 Mesh/Unit 后调用 `part.rebuild()`；替换 `manager.terrain` 高度采样函数会使相关输入失效，生产地形使用 `bind/prepareTerrain` 的可传输快照。

作者归属与运行状态分开：`get`、`groupFor`、`groupEntity`、`snapshot`、`update` 和 Entity 删除查询原生对象，包含禁用组件与隐藏节点。`list` / `listGroups` 表示原生启用的注册成员，不是完整作者目录。构建先校验完整作者关系，再按启用组筛选参与执行的构件和连接；停用 Group 不删除作者身份，也不阻塞其他有效实例。真正缺失的组、重复 ID 和无效关系仍然报错。稳定帧不执行作者树扫描。

删除由 `planBuildingRemoval` 统一计算，Manager 的 `remove(Entity | BuildingGroupComponent | BuildingPartComponent)` 执行原生删除、面板执行 Source 事务；两者使用同一删除计划。内部运行注销是独立的受保护方法，不作为公开删除行为。结构轮廓构件与 Group 删除整组，普通构件单独删除；只在目标 frame 内清理所有入边和出边，包含隐藏/禁用的关系拥有者。先校验剩余作者图再修改，不通过忽略悬空引用维持运行。

Group 和 Part 共用建筑作者身份标记。Entity/Prefab Unit 的普通和 packed 路径都在发布前拒绝建筑作者组件，包括隐藏或禁用组件。生成树使用已有输出标记划分归属；Manager 注册、初始收集和作者查询均排除生成树，`create` 也拒绝以生成节点为父对象。失败不会把派生节点注册成作者，也不妨碍修正输入后重建。

## 在原生曲面上替换铺设算法

`buildingPlacementAlgorithms.register(id, callback, { profile: { basis } })` 可为原生 profile 注册自定义排列。`basis` 声明原生垫底面、材质足迹及几何准备所用的约定（如 `grid`、`overlap_rows`），不替换 callback；实施始终执行构件保存的算法名。callback 消费解算后的 `support.profile` 并返回 `kind: "profile"` 的完整铺设输出，绘制单元和编辑 plans 应一致。Point/Path/Mesh 算法不需要此声明。

```ts
const grid = buildingPlacementAlgorithms.resolve("grid");
buildingPlacementAlgorithms.register(
  "myRoof.v1",
  async (support, params, context) => {
    const placed = await grid(support, params, context);
    // 可按自己的规则调整 placed 中的绘制单元及编辑布局。
    return placed;
  },
  { profile: { basis: "grid" } }
);
// roofPart.algorithm = { type: "myRoof.v1" };
```

动态注册的铺设或连接函数在编译前选择主线程，包括附件的小屋面算法和屋顶尖饰算法。Worker 只执行 `BuildingExecution` 中实际打包的实现，直接把动态函数名称送给 Worker 会明确报错，不在失败后回退。原生自定义主线程构件仍使用实例合批和原生材质；当前不为这些自定义函数自动重建远景外观替身。要获得另一类自由曲面，提供自己的 Mesh/Path/Point support。

## 原生几何与局部编辑

内置资产原有的“关闭墙面铺设”仍显示原生砌体，仅不使用可编辑铺设层。新版用显式 `algorithm.type: "nativeMasonry"` 表达这个选择（wallProfile + brick），整体台基用 `foundationSurface`（foundationProfile + brick）；不再通过缺少绑定隐式选择表现。这两个算法直接调用构件级几何内核，不调用旧整屋编译器。它们不接受局部 UV 编辑。

可编辑轮廓构件的 `regions` 保存有稳定身份的表面 UV 区域及 `effect: {unit_id?, hidden?}`；设计统一校验并用于预览、细节和材质解析。`wallStructure` / `support.params.structureMaterial` 明确几何连接使用的砌体或木结构。欧式生成器默认由墙体 Unit 选择结构，调用者可以显式指定。

## 可保存结构

Scene 为每个基础构件创建一个 Entity 和 `BuildingPartComponent`；没有逐砖瓦 Entity。算法使用注册名；Mesh/Prefab/Entity 使用 Source 原生引用。不要保存生成结果、接触占位、实例缓冲或 Renderer。持久化修改使用 Editor Scene/Prefab 事务。

`buildingDraftSource(draft, { id, name?, assetLibrary? })` 将基础构件写成可编辑 Source 片段：一个明确的编译 frame、各组的节点及 BuildingGroupComponent、各构件节点和组件。组 seed/颜色与资产库仅由独立组组件保存，连接挂在起点构件上。`groupTransforms` 与 `partTransforms` 分别保存原生组节点和构件节点变换，不保存额外逆矩阵。初始墙附件使用节点 position 加零 Point 偏移。直接消费运行时 Mesh/Prefab/Entity 的 draft 必须通过 `reference` 回调提供项目 `$ref` / `$entity`，不能把活的引擎对象图 JSON 化。`staged.ts` 使用此公共输出函数。

建筑作者 ID（group/part/relation）分别在所属 `frame` 的各自命名空间内唯一，组与构件允许同名。原生 Prefab 可以直接重复实例化，保留相同作者 ID；连接在同一 frame 内解析。Manager 的 `get(id, frame)` 和 `snapshot(frame)` 明确选择实例。拾取、碰撞和灯光跨出 frame 时使用运行时实例身份，这个身份不写回 Source、不参与材质随机。存档重载后重新建立身份索引。运行时显式区分 group key 与 part key：每个构件始终保有自己的变换与拾取绑定；组结构的变换和拾取绑定来自独立组组件，构件绑定来自自身组件。交换或删除构件不改变组身份。近景与远景均通过明确的 group/part key 选择对象，铺设任务 ID 不参与拾取。编辑删除限定当前 frame；同名 Prefab 副本互不影响。

`copyBuildingPrefab` 按每个组件实际的 frame 分别校验作者身份和连接；同一个 Prefab 可以包含多个拥有相同局部 ID 的独立 frame。显式 frame 必须指向组件节点或祖先；省略时沿用原生的父节点/自身规则。它只重映射独立粘贴所需的 Source Entity/Component 引用；不再重写建筑构件 ID、附件名字或外观随机输入。组、铺设参数和附件可选的 `variationKey` 仍用于显式控制外观随机命名空间。附件求解使用其构件 ID，`support.params.spec.id` 仅保留生成器提供的局部命名/默认外观随机输入，不能作为全场景拾取别名。

Surface 必须通过 `meshSurface.params.mesh` 显式引用 Mesh；不会在生成输出节点上查找 MeshRenderer。几何 Unit 的 `geometry.generator` 与 support/铺设算法一样保存注册名；直接函数可注册或执行，但写入作者字段前使用 `buildingGeometryAlgorithms.reference(fn)`。

```ts
{
  id: "roof-tiles", group: "custom-building", type: "roof",
  support: { generator: "meshSurface", params: { mesh: roofMesh, subMesh: 0 } },
  algorithm: { type: "staggeredGrid" },
  unit: tilePrefab,
  params: { step: [.3, .25], stagger: .5, offset: .02 }
}
```

## 演示与回归

`demos/building-components/index.html` 与 `recursive.html` 统一进入 `staged.ts`，支持房屋、圆塔、围墙、栅栏、台阶、相交房屋和窗口编辑，以及原生保存、撤销和重载。演示页只运行当前建筑流程。

回归测试直接调用当前生成、设计、铺设、Worker 和渲染包接口，覆盖开口/连接、算法替换、取消、身份归属、存档和资源生命周期。旧版本执行代码及迁移期间的新旧比较测试不再维护。

旧存档迁移器、旧字段转换工具及迁移夹具已删除。当前格式的内置 Prefab、初始建筑及原生实例仍验证保存重载和生成结果。编辑删除使用当前实例的完整作者组件，包含禁用组件及隐藏节点，不能用 Manager 的活跃集合替代。

窗门使用 `attachmentMount + mountAttachment + {nativeAttachment:{kind,type,rank,frameMaterial}}`。`design.diagnostics` / `manager.diagnostics()` 返回墙角冲突等未能实施的原因，与生成失败的 `errors()` 分开；调用方应处理这些结果。演示中失败编辑不会替换已发布画面。

设计结果不再使用作者的裸 `id` 作为执行身份。`identity.kind="author"` 保存作者 ID；`identity.kind="derived"` 保存 producer、带类型的 source（作者构件集合或连接关系）和 localId。support 索引、已执行集合使用 `BuildingDesignKey`；作者字符串即使恰好等于派生键的完整编码，也属于不同身份。`selection` 单独指向真实作者 Group/Part，派生身份不能用于编辑或拾取作者。只校验同一身份域的真正重复结果，不对作者名字设置保留前缀。渲染底面资格是生成几何上的 `backing` 信息，不根据构件名称判断。通用 Point/Path/Mesh 铺设的资产库砖、木板、瓦片消费所属 Group 的颜色/seed，以及对应材质要求的完整绑定；Prefab 自带材质不受这些资产库颜色槽控制。


通用原生瓦片可以在构件定义中指定 `appearance: { roofColor: 4 }`，颜色索引为 0–12；该字段持久化在 Part 中，独立于 support 和铺设 params。省略时通用瓦片保持原来的 0 色。公共生成器通过 `style.appearance`、欧式入口通过 `roofStyle.appearance` 传入。对于原生轮廓屋顶，显式 appearance 覆盖入口 roof.color；省略时仍采用该屋顶原来的颜色。改色不改位置、单位数量、随机种子或拾取身份。Prefab 自带材质不使用原生瓦片色槽。

自定义连接规则返回 `BuildingDerivedPart[]`：每个结果填写 `localId`、`selection`、group、type、support、algorithm、unit、params，可带 appearance；不填写作者 id。相同 localId 可出现在不同关系中，来源由设计阶段绑定当前 relation。派生结果不再插回作者 parts，也不成为后续作者关系端点。连接结果提供可直接铺设的 Point/Path/Mesh support；需要参与体量规划的原生 profile 主体应由入口写入基础构件。Source 只保存作者定义和连接，复制和重载后重新解算派生身份。


Source 的 Entity/Component ID 由导出器按 frame、对象类型和作者 ID 独立分配。作者 ID 不再直接用作 Source 组件 ID；调用者通过组件 definition 和原生引用定位对象，不能拼接后缀猜节点 ID。根 ID 与任意合法作者名字允许相同。复制仍只重映射原生对象引用，作者关系、seed 与配色保持不变。

`manager.partView(part)` 只读取该实例已发布结果中的查看位姿：附件使用已解算挂点，结构使用已生成几何范围，通用 Unit 使用已执行铺设的位置或批次范围。Worker 和主线程随各自生成候选一起发布这些派生信息，不存入作者 Source。首次未发布或构件已停用时返回 undefined；候选失败保留旧结果的查看位姿，禁止用未接受的作者参数推算目标。Worker 的原生刚性附件与渲染一样使用发布时的绑定坐标。
