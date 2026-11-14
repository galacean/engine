# Water

Water 拥有作者契约、Compiler、Runtime、Shader、公共预设与资源；Lake/River/Ocean、Terrain、SeedWorld 与 PromptNoise 共用这些实现。共享模块不得引用 Demo，固定场景身份、地形配方、相机/灯光、展示控件与专用素材由宿主拥有。

| 入口 | 职责 |
| --- | --- |
| index.ts | Body/Source/Representation/Look/Quality 作者契约和构造函数；不导出后端 Shader、加载器或 DevTools |
| [native](native/README.md) | 原生组件/ReferResource、Scene/Prefab 注册、系统 API/Knowledge |
| [authoring/terrain](authoring/terrain/index.ts) | 纯 CPU 地形快照、裁剪、采样与精确内容身份；生产者和编译器共用同一契约 |
| compiler / runtime | 编译、确定性身份；Host、注册表、资源、查询与交互 |
| runtime/heightfield、river、ocean | 三类后端；轻量配置/资源与 effects 数据/renderer 分离导入 |
| presets/lake、river、ocean / resources | 跨场景 Look、默认值、纹理身份与受管加载 |
| devtools | 独立开发入口，生产排除 |

生产使用公共入口，库内/白盒测试可引用内部文件，Worker/构建工具使用专用入口。River 的 registerRiverWaterBodyPresets、Look ID 和 Quality 选择从 presets/river 导入；Ocean 使用 presets/ocean；作者构造仍在根入口。所有权细则见 [ARCHITECTURE](ARCHITECTURE.md)。

## 外部地形与预算

`WaterTerrainSnapshot` 接收宿主已经生成的规范床面。校验负责现有网格契约（每个网格最多 1,048,576 个采样点）、有限高度、细化身份唯一、包含范围、非重叠和禁止递归细化；不按细化块数或总采样数重新裁定宿主的生成预算。`copyWaterTerrainSnapshot` 保持相同契约，不降采样或丢弃细化块。

Terrain 的 `buildTerrainRefinement.maximumSamples` 是生产者的总采样预算，默认 16,000,000，调用方可以覆盖；计入共享边重复存储的顶点及复用网格，在分配、求值细化高度前检查，超限明确失败。该默认值不进入共享 Water 的快照有效性规则，也不通过快照传递为下游操作预算。

Water 中需要分配派生数据的操作继续检查自己的输出预算。例如 `captureLakeTerrain` 将相交网格映射到共同晶格时，仍在分配前检查 1,048,576 个输出采样点的限制。合法源快照不保证任意范围、精度的编译操作都能完成；失败应归属具体操作，不能据此将源快照判为无效。

背景床面保持双线性插值，refinement 保持固定 a–d 对角线的三角面。Lake 的 bounded raster view 同时携带 canonical `bedTerrain`，岸线、CPU wet/depth、Source hash 和 Worker 重放保留同一拓扑；GPU atlas 继续是同源采样的有限精度字段，不能用它替代权威床高。Lake/River 地形 modifier 必须切挖所有参与采样的 grid，Ocean 编辑 revision 也必须拥有 refinement 的坐标和高度。细节见 [Lake 外部地形接入](authoring/lake/LakeTerrainIntegration.md)。

### MAX_TEXTURE_SIZE 已决定：保持现状，等公开接口

mingming 于 2026-10-22 17:49 决定保持现有读法：`RiverLocalMapTextureFactory` 借用 `engine.canvas._webCanvas` 获取 gl 上下文，再调用 `getParameter(MAX_TEXTURE_SIZE)`。引擎当前没有可用的公开上下文／硬件能力接口。这一步只用于提前检查图集尺寸，超限时给出可读报错；读不到上限就跳过检查。

有意不写死 4096：长河的图集高度经常超过 4096，固定该值会错误拒绝硬件实际支持的图集。

待办：以后可由宿主传入纹理尺寸上限，或者由引擎提供公开的硬件能力接口；具备其中一条路径后，再替换这处私有字段访问。当前不修改读取、跳过检查或超限报错的行为。

## Look 与资源

Lake High（lake-water-look-v1）和 Ocean（ocean-look）共享；原 River Valley（stylized-river-valley-high-v1）迁到共享层后参数保留，River 标定仍可使用基础 High。water/island 专属 Look 属于案例。Planner 当前由 water-rendering.json 选择 Farmlands（farmlands-scene-demo-river-v1）。同一 Look 不保证不同地形/水深/光照下画面相同。

资源加载器核验 ID、SHA-256、尺寸及采样；运行时借用，加载器/租约 owner 在解绑后释放。Scene 间独立，失败与重复释放保持边界。本地覆盖须显式 enableDevelopmentLocalOverride/sourceUrl。Lake 原1024 PNG为制作源，正常运行用512 KTX2；SeedWorld源码快照不收制作PNG，仍收运行资源与来源清单。

编译缓存通过 `acquire()` 交付已持有引用的 consumer lease；LRU 仅释放自身引用，最后消费者退出后才请求 dispose。Loader 先销毁 Backend，再释放编译租约。异步资源 Registry 为取消重试创建新 generation，整体销毁等待已启动的 load/retirement，并汇总清理错误。

Heightfield shader 的物理波容量取已编译 WaveSet 的 0/2/6/12 槽位，独立于 geometry 档；Look 结构重绑保留该容量。质量轴与空间场精度各自的既有约束仍由对应契约控制。

GridMask 的 CPU 岸距以源网格湿格矩形的边界为准，有限网格外为干地；源格中心保存独立的 Float32 米制场，支持非正方形单元，跨 geometry 档保持同一物理查询。连续点使用双线性采样和源湿格判定，误差上界为半个源格对角线加 Float32 舍入误差；域边缘另外裁到真实边界距离。该字段增加每源格 4 字节，受已有 `maxQueryTexelCount` 分配上限和编译资源缓存字节预算约束，Worker 转移其所有权。`query=off` 和使用精确闭合轮廓查询的 Lake 不分配该字段。Heightfield compiler 版本升到 3，使旧编译输出失效，作者物理身份规则保持不变。

视觉 RGBA atlas 仍按质量档采样和量化；本次只分离 CPU 物理查询，尚未统一其与 GPU 宏波岸边衰减的精度。视觉距离场的非正方形单元近似和跨档采样误差仍属于后续空间场修复范围。

## 静态地面查询快照

支持该能力的 `body.runtimeInterfaces.spatialField.capture()` 返回 CPU 静态场快照，提供 `metadata/sampleSpatialField`，以及后端支持的 `maximumSurfaceHeightInBounds`。它固定编译身份、实例位置与静态水位，保留协商后的通道屏蔽；后续水体替换、销毁、时钟或 GPU 资源释放不会改变已有快照。快照不拥有渲染器，也不提供修改、销毁或 GPU binding。River、Heightfield、Ocean 已实现，Scene 与能力协商端口沿用同一接口。

`maximumSurfaceHeightInBounds` 返回闭合 XZ 范围内湿点的静态水面高度上界；`null` 才能证明整个范围为干地。有限上界可能包含干地，不能直接作为水面命中。River 使用范围内命中三角形的顶点水位上界，并保守计入宏位移幅度与查询容差，覆盖同版静态和动态查询；Heightfield 使用湿格与分量插值邻域，Ocean 使用原生岸线/河床双线性单元及有限域外策略，两者只提供静态事实，不包含波浪表现。停用 Bathymetry 时不暴露该端口。消费者可结合地形范围下界细分，获得实际湿点或完整分离证明；预算或精度耗尽必须公开未判定原因。

宿主可将它与已发布 Terrain 组合用于地面合法性检查；实时波浪、自然补水和灌溉仍由各自接口负责。调用方保留快照期间会保留对应的不可变 CPU 编译数据，应随地面版本替换释放引用。

### CPU 近岸距离

Lake（含作者池塘）和 River 的同一空间场快照另外提供 `nearShore`：在 `radiusM=32` 米支持范围内返回到真实湿区（原生几何覆盖与正水深床面区域的交集）的水平距离和最近湿侧静态水位。真实湿区内为 0；名义 ring 内或名义河宽内的零水深区域仍为干地，最近候选为干区时继续搜索其他湿区。它与 `sampleSpatialField` 的有限栅格支持域分开，不修改 metadata.bounds、wet/footprint、深度、碰撞或 GPU 数据。干岸得到有效近岸结果不代表那里有水。协商禁用岸距或 Bathymetry 时不暴露该组合查询。

Lake 在协作准备阶段从同版 queryGrid 的正水深等值线、湿掩膜边缘、编译 ring/容差及连接裁剪界提取真实湿侧线段，建立紧凑 BVH；临时采样/交点缓存随准备完成释放。River 的水面命中以原生网格三角形为准，端头与网格保持平切，不包含半圆端盖。静态查询与动态查询共用三角形插值，静态等价于宏波幅度为 0，汇流区水位和法线也从顶点插值。近岸搜索同样使用网格三角面候选，并通过同版水面查询验收；凸且不折叠的横向共线采样行压成两个外缘三角形；折叠/退化角仅保留该局部原生细分，汇流只索引局部面。最近名义点被裁干时，同一编译版本按不重叠canonical床面格及refinement所有权边界协作提取一份湿岸界，由所有span共享；span树仅用于几何候选/水位上界与裁剪，不重复扫描重叠区域。固定三角床面同时保留实际对角线分界。

近岸距离采用玩法精度：湖等值线以编译床面格距为基准，双线性混合格再细分一次，裁剪交界以约0.1m定位；河局部混合区细分到至多0.25m（细地形取半格）。有限采样全干不能判空：只要床面/几何保守界仍possible就继续验证，不以精度尺度删除正水深小水域。恒定原生水位、完整凸河段覆盖及仿射床面可直接保留精确直岸；其他情形继续细分。直岸交点使用原生wet/dry窄括区验证，失败仍走二分。不再逐地块证明1µm最优距离。候选点必须通过同版原生正水深查询；返回水位也由该点的原生静态选源裁定，距离为0时直接读输入X/Z，不能等距取最高水位或用独立 span 水位替代。索引/湿岸线段按不可变编译对象 WeakMap 共享，热查询不增加节点或重做提取；水位/床面换版使用新索引，旧静态捕获保持原事实。实例平移、旋转与高程仍由 provider 适配。

帧内消费者先协作调用 `nearShore.prepare(now, budgetMs)`，再通过 `createTask(x,z,out)` 创建查询并调用 `advance(now,budgetMs)` 继续同一任务。河紧凑索引准备每次至多128步，湖准备与查询每次至多1024个内部步骤，均以0.2ms时间预算先到即让出；局部湿岸界提取同样在协作任务内进行。只有任务完整完成后的 `hit/out` 才能使用；任务独立持有进度/输出，支持交错推进。取消时释放任务即可，旧完整农场缓存保留到整批原子替换。变换/能力/generation 边界同时约束任务入口与后续继续执行。

`sample` 是同一查询任务的同步便利入口，供非帧消费者使用，可能包含完整冷准备和湿区搜索。32米支持半径覆盖宿主20米作用范围；建树不计为地块查询，单个地块/候选查询创建时计一次，后续 `advance` 是同一查询的延续，所有延续的 CPU 均计入农场切片与最大同步段耗时。原来的无协作能力 provider 保留最多两次外层空间采样。时间预算检查发生在细粒度步骤之间，单次原生床面查询仍不可抢占，不宣称任意病态几何或系统调度下有2ms硬上限。

## River Look 定位

| Look | 用途 | 默认场景／接入位置 | 特点 |
| --- | --- | --- | --- |
| Stylized | 通用风格化河流、其他 Look 的基础 | 显式注册使用；不是当前 River Demo 的启动默认 | 场景颜色与深度渐变混合，流向法线强度 0.467 |
| High | 带物理体积散射的风格化河流 | River Demo 的 calibration、bend、pools、bridge、editing 场景 | Beer–Lambert 深度响应、单次散射，流向法线强度 0.15 |
| Valley | 导入河谷场景的配套外观 | River Demo 启动默认 valley 场景 | 基于 High 调整河谷水色和光学参数，流向法线强度 0.467；地形与相机由宿主提供 |
| Farmlands | 农田与规划世界中的浅水河流 | SeedWorld／Planning、Island 的河流接入 | Scene_Demo 贴图细节和焦散，独立水色／透明度；基础流向法线为 0、旧泡沫关闭 |

四套 Look 都提供默认 DropLook。所有 Drop 水幕与落点网格合成一次绘制，原生 mist／splash／droplets 粒子效果保留；N 个 Drop 对应 1 个网格绘制及 3N 个粒子发射器。水幕 shader 的时间按 4096 秒回绕。Drop 贴图只在河流确实包含落差时进入资源依赖。

River、PromptNoise 与 SeedWorld 共用 `authoring/river/RiverCurve.ts` 的曲线评估内核。Catmull-Rom 统一采用 alpha=0.5 的向心参数化和端点外推；PromptNoise 使用水面高程参与三维弦长计算。Bezier 保留两种浮点运算顺序，以精确保持 PromptNoise 默认曲线及 SeedWorld 装饰／岸线曲线的原输出。`Watercourse` 仍表示落差／坡段作者输入，`River` 仍表示编译和运行时水体。

## Farmlands 通用外观

| Surface Appearance V2 字段 | 语义 |
| --- | --- |
| LinearColorOpacity | 水色/透明度系数独立，单位/米，maximumOpacity∈[0,1] |
| RefractedAlbedoDepthRamp | 折射背景和水色先组成 albedo 再受光；原闭合继续保留 |
| detailNormalStrength / FirstDetailLayer | 混合后法线强度；折射可读取第一细节层，缺层拒绝 |
| boundaryEffects.outputs.colorMode | albedo 泡沫同时影响颜色/权重；缺省仍 additive |
| caustics | 纹理/hash、世界缩放、UV/秒速度、强度、法线扰动、视差与/米深度衰减；opacityContribution=0仍保留颜色 |

River/Heightfield 消费这些能力，Ocean 明确拒绝不支持项。未启用的新字段保留旧变体身份；外观不改变水位/床面/查询。River 主层 FlowAdvected 使用连续行进时间减动画时间，沿河道切线输运；0～0.05米/秒衰减主法线/折射而不硬切相位，material_FlowSpeed=0冻结。第二层世界扰动强度0.2；主行进时间尺度0.02周期/秒，波长随局部流速变。Heightfield 没有行进坐标，保留世界平流。源法线沿原混合规则，不提前归一化。

[河流来源](resources/river/assets/FARMLANDS_SOURCE.md)、[落水来源](resources/river/assets/drops/README.md) 保存纹理/参数/转换和移植限制；河床材质归 Terrain，不进入 Water 查询。

## 运行时总开关与 DevTools

原生 Scene 的 `WaterSystem.setRuntimeEnabled(enabled): Promise<void>` 是河湖海运行时的统一接入开关。`runtimeState` 区分请求值、实际生效值、加载/卸载阶段及失败原因；清理失败的 `residualResources` 区分保留的所有者引用和可读取的活跃资源/租约计数。重复同值请求等待当前切换，过时准备不能重新激活系统。`WaterAPI.setEnabled` 仍只控制指定 Body，不能越过系统总开关。

关闭通过 Loader 的终止撤销先封闭查询与交互，不受同水体替换/Look 编辑锁阻挡；撤销绘制和更新后取消准备并等待资源退役，释放 Host、编译缓存、自有纹理、资源租约和相机功能请求。`activeRuntimeHost` 在卸载完成后为空；关闭期间读取 `runtimeHost` 明确拒绝，不会隐式重建。作者资源与外部借用资源保持原所有权，已有 CPU 静态地面快照继续有效。

`developmentTargets` 是跨 Host 重建保持身份的发现端口，DevTools 应同时绑定该端口与 `runtime: system`。会话只保存参数值：Look、单水体显隐/查询/浮力/尾迹及 Ocean tuning 都相对已接受的作者发布基线计算差量。重建后只叠加用户实际修改的字段，未编辑字段保留停用期间最新接受值；连续卸载重建也保留该差量。不保留旧 Handle 或生成几何，也不持久化总开关。宿主通过 `configureRuntime` 的初始化/卸载/恢复回调接回最新已接受内容；Planner 在关闭期间仍能发布规划，开启阶段若规划再次变化，会在最终启用前重新核对。

共享 DevTools 按当前后端能力展示控件。River 与 Lake 共用 Surface Appearance V2 外观入口，包含当前深度模型的水色/透明度、法线、焦散、高光、边界与折射参数；实际存在 RiverDropRenderer 时才展示落水 Look。当前 Ocean 保留自身调参入口，只支持环境反射，能力描述来自实际运行时。无消费者或无写入端口的编辑项不再占位，未实现效果不添加开关。所有 Look 修改仍经 `WaterLookAuthoringPort` 提交。默认 Lake 的细节法线总强度由实际 detailLayers 消费者决定是否挂载，缺省为 1；没有对应消费者时不显示。数值输入遵循验证器的范围与零值语义，不通过 dat.gui 的步长量化输入，也不按推断的小数位截断回显。

Planner 的 Water 分类下并列放置“水系统”和“地表水文”。总开关只控制共享 Water 河湖海，地表积水、水膜及地表涟漪由环境系统独立控制；不修改规划水文、河床或 Terrain。全局开关默认开启，仅作用于本次运行会话。

## River 编译传输与激活

River Worker 直接转移编译结果中的 TypedArray buffer，并携带在 Worker 内计算的资源哈希；主线程只接管数组、恢复只读包装，不解析 JSON 或重算编译内容哈希。传输 schema 与编译数据 schema 不匹配时要求重新编译，暂不增加索引／引用关系校验。

`replaceActiveIncremental` 在同一个 Controller 内按河段 ID 匹配，并精确比较配置、几何、关联 chunk、图集采样区域和连接／宏面依赖。未变河段复用材质、纹理和网格；图集其他区域变化时，未变河段可继续借用原图集。候选完成前旧集保持可用，发布时转移复用对象所有权，之后分步释放旧资源；请求版本号阻止已取消或被替代的候选重新发布。不同 Controller 仍各自拥有资源，保持后端 staged publication 的隔离语义。

同一提交计时器覆盖准备、比较、纹理、连接、逐河段材质、查询服务、逐 chunk 上传、发布与退役。`maxSliceMs` 记录实际整片耗时，调度器依据已观测任务耗时预留下一任务空间；同步引擎调用与原子发布不能中途抢占，单次调用超预算时如实报告，不截断统计值。比较大数组时按 256 个值分批，可响应取消。

## 验证

从仓库根执行 `pnpm --dir world typecheck` 和 `pnpm exec vitest run --config packages/water/vitest.config.mjs`，检查类型及 Water 浏览器回归。

## 潜在缺陷：首次激活前的 SSR 合成强度（R-4-01，暂不修）

首次激活之前设置 River 的 SSR 合成强度，后续材质注册 receiver 时会将强度写回 1。当前所有 Look 使用默认值 1，Planner 又是在激活之后设置，所以尚无可见影响。

触发条件是以后出现合成强度不是 1 的 Look，或者有调用方在首次激活前设置该值。届时应由 `RiverRuntimeController` 持久保存强度，并在创建、注册材质后应用；本次只记录，不修改运行时行为。

当前代码位置（2026-10-22）：

- [RiverWaterBackend.ts:780](runtime/river/RiverWaterBackend.ts#L780)：创建运行时集合之前调用 setter。
- [RiverRuntimeController.ts:856](runtime/river/RiverRuntimeController.ts#L856)：`setScreenSpaceReflectionCompositeIntensity` 只遍历已有集合，未保存状态。
- [RiverMaterialFactory.ts:317](runtime/river/RiverMaterialFactory.ts#L317)：`setRiverScreenSpaceReflectionReceiver` 将 uniform 和 receiver 注册强度写为 `enabled ? 1 : 0`。
