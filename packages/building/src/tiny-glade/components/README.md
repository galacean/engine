# Scene 建筑主体与装饰组件

入口：`demos/building-components/`（房屋/窗户）和 `extensions.html`（围墙/栅栏/门/墙灯）。
所有作者组件均继承 Engine Component：

- `MainBuildingComponent`：`HouseComponent`、`WallComponent`、`FenceComponent`。
- `DecorationComponent`：通过 `WallDecorationComponent` 共有墙面挂载约束，包含
  `WindowComponent`、`DoorComponent`、`WallLampComponent`。
- `RoofDecorationComponent`：包含 `RoofWindowComponent`、`RoofHatchComponent`、`RoofLampComponent`；
  尖拱屋顶窗统一使用 `RoofWindowComponent` 的 `dormer-gothic` 类型。
- `OpeningComponent`：墙面拱形开口，同样继承 `WallDecorationComponent`。
- `BuildingSurfaceComponent`：同一主体 Entity 上的表面铺设及局部编辑组件。

采用 tiny-glade 的原生组件链路；本轮不做楼梯。
已支持矩形/圆形房屋、围墙、栅栏及上述装饰，Seed World 默认建筑已接入，生产创建与保存恢复已验证。
运行建筑库和三份原生预设已进入 VFS；旧作者实现和独立 `dormers` 编译路径已退役。
原始引擎离线采样工具独立保留，用于几何算法对照，不参与产品作者链路。

## 原生排列资产（2026-10-28）

`MainBuildingComponent.assets` 现在引用 `Building/Units/building-kit.prefab`，类型为
Engine `PrefabResource`。集合组件引用砖、瓦、木板和装饰的 Prefab；每个单元由
`MeshRenderer` 的原生 Mesh、Material、Shader、Texture 描述。

- 新集合有335个VFS资产：118 Prefab（含1个集合）、127 Mesh、42 Material、30 Texture、18 Shader。
  另有3份整栋建筑预设，不计入这335个单元资产。
- 排列仍输出合批实例记录，不逐块砖、逐片瓦创建Entity。模板只在解析资源时脱离Scene实例化一次。
- CPU开洞、碰撞和Worker几何从当前原生Mesh的可读缓冲提取；不存在另一份可编辑的bin几何源。
- Loader负责原生BufferMesh、显式mip/数组Texture的上传与恢复。建筑运行时不再解析
  ConstructionLibrary或加载原捕获bin。原始采样及其解析器只用于offline导出和独立数值对照。
- Material/Texture/Mesh变化会沿VFS依赖图使引用它们的Prefab失效，组件重新获取原生资源。
  单元材质不同时拆分对应批次，保留组件拾取身份；相同材质继续合批。
- 集合组件持有资源引用，集合getter返回结构副本，避免原生反射加载器在setter前修改内部表；
  克隆hook补齐嵌套集合引用，销毁后由引擎GC按依赖链回收资源。

排列单元当前要求identity根节点、根上的一个BuildingUnitComponent及一个MeshRenderer；
Mesh使用一个覆盖完整索引缓冲的三角形submesh，与单材质合批契约一致。
几何顶点属性与Shader遵循现有排列ABI；不承诺任意层级、任意标准材质都可直接作为排列单元。
这些约束在候选保存前校验。任意Shader的GPU编译成功仍属于运行环境验证。
纹理目前保留显式原始mip及数组数据；KTX2转换未包含在本轮，也不以资产字节数推断显存。

## 所有权

- Entity 保存名称、层级和变换；组件保存尺寸等参数。Source Scene 是持久化真相源。
- `BuildingSystem` 维护启用中的组件集合、编译任务和派生几何；禁用组件不删除 Source。
- 每个主体直接从当前组件读值，生成临时 `MasonryDocument` 交给原有 Worker/几何管线。
  该文档不保存、不编辑，也没有新的建筑作者目录。修改一栋房屋不会重放生成历史。
- 稳定身份由宿主现有 `RuntimeSceneProjection` 提供；当前 Demo 从投影查询组件，
  不引入额外的持久 ID 或公共反向索引。
- 变化通知只要求重新检查输入；每个在途候选记录所属房屋及实际输入签名。
  仅输入真正变化或房屋退出时取消候选，发布前再次校验。整体世界变换不取消局部几何生成。
- 拾取 ID 经宿主现有投影解析为当前 Component，再检查启用集合；拾取不依赖缓存的组件实例。
  同 ID 组件替换且几何相同时，保持原 Renderer，不依赖重建来刷新拾取绑定。

## 合批与拾取

独立作者 Entity 不要求独立 draw。窗框、玻璃等部件仍按原有 owner 合批，
附带 `decorationId`。合批阶段输出顶点拾取槽位（每顶点增加一个 float）及派生 ID 表。
拾取链为 `Renderer + 批次内槽位 → Source 组件 ID → 真实 Component / Entity`。
普通整栋建筑拾取仍使用原来的 owner；仅原生组件入口开启细分拾取。

因此，合批 Renderer 位于房屋的派生渲染子树中，并非挂在每扇窗的 Entity 上。
它与窗 Entity 的关系由批次中的身份保留，而不是通过拆批来模拟。

`RigidDecorationRenderer` 通过现有稳定 ID 解析当前 Entity，实际消费其 `worldMatrix`。
每个槽位使用 `inverse(rendererWorld) × entityWorld × inverseBind`，通过小型浮点矩阵纹理
驱动原有 BufferMesh；法线使用逆转置，包围盒同步变换，颜色与拾取共用同一路径。
这相当于每顶点只有一个节点、权重为 1 的刚性蒙皮；没有引入 Skin 资产或拆开 draw。
矩阵数据未改变时不重新上传；Renderer 销毁时释放自己的矩阵纹理。

沿墙移动或缩放先更新窗口矩阵；墙洞仍由现有异步生成器重建，`flush()` 等待最终发布。
因此预览期间旧墙可能暂时遮住移到新位置的内凹玻璃或门板；不能把矩阵预览当作墙洞已提交。
世界矩阵的懒缓存由消费者读取，更新观察标记后仍能收到下一次变换通知；发布前强制核对
最新几何及绑定输入。尺寸相同但组件尺寸/Entity 缩放不同，也不能复用旧 inverse-bind。

## 当前明确边界

- 房子支持矩形与圆形，使用原有砖墙、瓦片、窗框/玻璃和墙洞生成。不是简化盒子替身。
- `shape` 为矩形 `{type:"rectangle",width,depth}` 或圆形 `{type:"circle",radius}`，尺寸及 `height` 以米计；`roof` 保存原生屋顶配置（高度比例、轮廓、屋脊方向等）。
  `foundation/plaster/floors` 为可选配置，null 移除；复杂配置整项替换，getter 返回副本。
- 窗户、门和墙灯是房屋的直接子 Entity；局部位置表示墙面安装点及装饰底部高度。
  临时编译时由它推导墙弧长，不额外保存 `u/bottom`。离墙位置会明确报错。
- 屋顶装饰是房屋的直接子 Entity，安装点由组件 `uv/elevation` 指定，尺寸、类型、颜色及发光由组件配置。
  子 Entity 局部变换必须为单位变换，整体跟随房屋，避免存在两个安装点真相源。
  需要坡屋顶的窗户不能安装到平屋顶；修改宿主为平屋顶时须在同一事务禁用或删除这类窗户。
  原生项目验证器在持久化前验证屋面安装约束。
- 窗朝向由墙决定，要求局部 rotation 为零；任意倾斜明确拒绝。
  支持有限正数的均匀/非均匀 scale：切向与高度缩放影响墙洞，法向缩放影响装饰深度。
  圆墙斜切向要求水平 x/z 缩放相等，否则会改变安装朝向而明确拒绝；高度缩放独立。
  零或负缩放明确拒绝。尺寸也可以继续用组件字段编辑。
- 同一祖先 Entity 下的主体可共用编译组，保留连栋墙面/屋顶关系；子主体使用水平刚体变换。
  独立模型的公共父节点支持整体移动/旋转/缩放。世界接地已复用原有地形和岩石采样，
  接地组的世界框架限于 Y=0 的水平平移和 yaw，不能用任意缩放改变采样域。
- 远景先发布，精细网格按原有可见性、屏幕尺寸和预算加载/淘汰；`flush()` 等待当前需要的
  精细任务，远处编辑不强制全量加载。`BuildingSurfaceComponent.inspectPublished()` 是
  异步查询，未驻留时在 Worker 中解析铺设单元，不为查询创建 GPU 网格。
- `BuildingSystem.bounds/intersectSegment/intersectCapsule/captureSurfaceQuery()` 读取已发布
  结构表面，包含原有洞口和装饰结构，不使用规划 OBB。查询跟随实际 Entity 世界矩阵，
  胶囊半径使用世界米制；已捕获范围查询是不可变事务快照，后续移动/删除不会改写它。
- 宿主在 `bind({terrain})` 交付初始不可变环境快照，后续通过 `prepareTerrain(next, signal)`
  准备隐藏候选。候选提供新结构的 `bounds/captureSurfaceQuery()`；`commit/rollback/finalize`
  为同步发布边界，最终确认前保留旧渲染资源，取消或准备失败不改变当前环境。
  不再轮询宿主回调发现环境变化。准备期间对象编辑会使候选失效，需丢弃后重新准备；
  普通 `flush()` 在环境事务期间明确拒绝。远处地形变化复用未受影响的建筑网格。
- 原有材质与几何资源仍复用 tiny-glade 管线；运行建筑库、装饰网格与碰撞边界、窗洞、石材和砖块 SDF 已通过 assets 引用 VFS。
- Demo 经 RuntimeEditor 先 Apply 工作预览，等待 BuildingSystem 发布几何并返回 `runtimeErrors`，再独立保存。
  不向所有系统强推组件 `whenReady()` 协议。建筑组件归属、接地组坐标及装饰安装能力属于运行时消费规则，
  不再注册建筑专用保存验证器。运行失败不自动回滚作者数据，也不阻止显式保存。
  已保存的建筑消费错误在重新打开时保留诊断，允许通过原生编辑器修复；后续地形候选仍保持原有原子发布边界。

## 围墙、栅栏和墙面装饰

- 围墙/栅栏只接受矩形 `shape`，其 `width/depth` 与组件 `height` 分别为条带长度、厚度和高度；Entity 决定整体位姿。
  继续消费现有 `enclosureCells`、砖块/木板网格、材质与批次，不复制几何算法。
- 门继续使用原有装饰生产器及洞口裁切；类型和规格来自现有装饰 Catalog。
  当前组件入口只开放对应用途的墙面款式，不将屋顶款式自动替换成墙面款式。
- 墙灯的灯具、拾取和发光材质使用同一个装饰 ID；编译的照明描述额外保留该 ID。
  光源通过同一 inverse-bind 和当前 Entity 世界矩阵更新，不能只有灯具移动而照明留在旧位置。
- System 复用现有四槽灯光池、距离迟滞与渐变策略。无发光装饰时不创建池；删除/禁用
  的光源从输入集合移除。池、PointLight 和编译结果不写回 Source。
- `groups.html?terrain=1` 使用真实高度场与岩石支撑，`?residency=1` 验证按需加载，
  `?structure=1` 验证结构碰撞与事务快照，`?environment=1` 验证环境原子发布。
  默认 Seed World 已通过 NativeBuildingHost 接入 Source 初始化、世界发布事务及原生编辑面板。
  完整世界生产创建/刷新证据见文末；组件 Demo 不替代完整默认世界验收。

## 初始验证（历史记录，最新证据见文末）

`BuildingComponents.spec.ts` 验证两个窗、多部件保持同一 draw、逐顶点身份、
从 Entity 位置生成既有编译输入及离墙错误。配套拾取/LOD、既有装饰编辑、灯光与门生成回归共 47 项通过。

Demo 的“运行验收”执行真实 WebGL、Scene 投影、Worker、IndexedDB：分别拾取两窗，
修改单窗、保持另一窗、撤销、新 Engine 重载、禁用/启用、删除/恢复，以及非法窗宽失败后的持久化和运行态恢复。
新增默认属性移除后的组件替换/几何复用、整体移动不重建、持续移动中更新以及在途局部编辑覆盖回归。
新增连续直接 Transform 编辑、重建前旧批次的 GPU 矩阵变形、真实墙洞迁移/扩宽、
等有效尺寸的绑定变化、非均匀房屋变换和非法倾斜/零缩放检查。
84 项断言通过，控制台无错误或警告。修改前后均为 3 个作者组件、8 个 draw 描述、
5 个启用 Renderer、18 个派生 Entity（包含 System 节点）；它们不是 GPU 帧耗时指标。
Terrain 类型检查通过。此结果不代表所有建筑、真实 LLM 或全世界性能已验收。


## 2026-10-25：原生围墙、栅栏、门和墙灯组件

用户明确以 tiny-glade / PlannedMasonry 为准，楼梯移出本轮范围。

- 新增 Engine 原生 `WallComponent`、`FenceComponent`（MainBuildingComponent 子类），
  `DoorComponent`、`WallLampComponent`（DecorationComponent 的墙面挂载子类）。
  原有 House/Window 改为共用尺寸、位姿读取和运行集合。`BuildingDocument` 仅为瞬时编译输入。
- 围墙/栅栏消费原有 enclosure 几何与砖/木材质；门和墙灯消费原有装饰生产器、门洞与合批。
  未使用 shared/building 的 Cozy 运行时，未添加楼梯生成器。
- 编译光源保留装饰 ID，使用与灯具一致的 inverse-bind/当前 Entity worldMatrix。
  复用四槽距离/渐变灯光池；无发光装饰时不分配池。灯光和派生节点不进入 Source。
- 新增 `demos/building-components/extensions.html`，支持真实 GPU 选择及按钮验收；
  已核对房屋、围墙、栅栏、门与灯的实际画面。

验证（最终源码）：

- 五个定向测试文件 92 项通过：BuildingComponents 10、CottageDoorProducer 7、
  DecorationLighting 5、PlannedMasonrySceneLighting 2、PlannedMasonryPublication 68。
- Terrain TypeScript noEmit 通过。两入口生产构建通过，仍有既有大 chunk 提示。
  初次临时构建配置使用 ESM 导入 CommonJS 失败，已改为 CJS 构建配置；产品源码未作降级。
- 静态生产版新增组件 36 项真实 WebGL 检查通过：四种新增组件的独立 GPU 拾取、
  光源随灯/整栋移动、运行集合、Source 编辑、撤销、禁用/删除、IndexedDB 与新 Engine 重载。
- 同一生产产物的既有窗口 84 项检查通过，包括瞬时矩阵更新、异步真实墙洞、
  同 ID 组件替换、非法尺寸补偿和非均匀变换。两页控制台 0 error / 0 warning。
- 新页面统计：6 作者组件、3 主体、14 draw 描述、8 启用 Renderer、37 派生 Entity
  （含 System 与四槽灯光池）；既有窗口页保持 3 作者组件、8 draw、5 Renderer、18 派生 Entity。
  这些不是 GPU 性能基准。
- 证据：`output/building-component-extensions/`；截图：
  `output/playwright/building-extensions-production.png`、`building-extensions-window-production.png`。
  自建浏览器、4197/4198 服务已关闭；未操作用户 4173/8082 服务，未 commit/push。

未完成：Seed World 默认建筑全量接入、圆形主体和所有已有屋顶/装饰配置的原生持久化、
世界接地/连接组/驻留 LOD 的统一，以及全量建筑资产 VFS。当前独立入口只用平地宿主，
不能替代这些功能。以上是组件扩展阶段证据，不是四项目标完成或全世界视觉等价声明。
真实 LLM 验收按用户要求暂不执行。


## 2026-10-26：组件持有房屋生成配置

- HouseComponent 直接持有完整 roof、可选 foundation/plaster/floors，主体共有 seed、
  wallMaterial、wallColor、woodColor。复杂配置整项替换，读写均隔离对象引用，避免外部原地
  修改绕过失效通知。字段校验复用真实 ConstructionSource 契约及 f32 归一化。
- 移除试点 roofHeightRatio 别名，演示 Source 改为 roof 对象；新演示项目 ID 不迁移旧试点存档。
  BuildingDocument 是从组件读取的临时编译输入，使用既有屋顶/墙面绑定；只有显式地基
  配置才创建 foundation 绑定，避免引用不存在的几何。楼梯仍不在范围内。
- 验证用例将组件输出与独立手写的原生文档比较，核对实际预览几何、地基和楼层带。
  浏览器进一步通过真实 Worker、精细瓦片、Scene 编辑和新 Engine 重载检查配置。

本轮发现并保留的边界：

- 非零 roof.tip 能通过原生文档解析和粗模生成，但现有 RecoveredRectangularRoof 精细
  生成器明确拒绝。最终渲染用例使用默认世界已有的零偏移；没有增加屋顶算法或吞掉失败。
  ridge_direction=1 由既有外层坐标变换支持，已通过浏览器实际生成。
- 新墙面绑定引入同批次墙背板。旧“隐藏非装饰 Renderer”测试先被相机 LOD 重新启用的
  墙砖干扰；改为 Layer 后又命中与窗同批次的背板。最终仅在同步 GPU 矩阵隔离检查中
  屏蔽墙体渲染层，并利用宿主现有 resolve 回调隐藏背板所属槽位；窗仍解析真实 Entity。
  finally 恢复全部状态。后续完整场景拾取和新旧墙洞检查不隔离，保留真实遮挡。
  未添加生产测试开关，未更改 Engine/LOD 行为，失败日志全部保留。

验证：

- 定向 24 项测试通过（BuildingComponents 12、CottageDoorProducer 7、DecorationLighting 5）。
- 最终 Terrain noEmit、两入口生产构建通过（既有大 chunk 提示仍在）。
- 配置/扩展页 41 项、窗口回归 84 项真实 WebGL 检查通过，成功运行控制台均 0 error/0 warning。
  最后一次重构只改窗口验收隔离方式；扩展页复用相同产品源码及资源上的已通过结果。
- 窗口测试前后：3 作者组件、10 draw 描述、5 启用 Renderer、22 派生 Entity；
  扩展页：6 作者组件、3 主体、16 draw 描述、8 启用 Renderer、41 派生 Entity。
  相比上一阶段显式墙面绑定增加了备用材质描述/节点；这些不是实际帧 draw 或性能测量。
- 证据：output/building-component-configuration/（源码快照、SHA256、成功及失败日志）。
  截图：output/playwright/building-configuration-production.png 与
  building-configuration-window-production.png，均已查看。自建浏览器及 4198 已关闭。

仍未完成：默认 Seed World 接入、圆形主体/屋顶附件/表面作者能力、地形接地/连栋/驻留 LOD
统一，以及建筑资产全面 VFS 化。没有将独立 Demo 的通过当作默认世界等价；不执行真实 LLM
验收，未 commit/push，整体目标仍在进行。


## 2026-10-26：建筑库成为 Scene 引用的 VFS 资源（阶段验收）

本轮继续采用 tiny-glade / PlannedMasonry；楼梯不做，真实 LLM 验收暂不执行。
这只是原始建筑库和石地板资产入口的迁移，不是四项目标全部完成。

实现：

- 新增 ConstructionLibraryResource（Engine ReferResource）与 ConstructionLibrary 资产格式。
  Source 主体以及 MasonrySystem / PlannedMasonrySystem 通过 assets 引用它；库内相对文件
  从该库实际 VFS 目录解析，缺失或类型错误直接拒绝，不回退到模块内置文件。
- 内置资源导入器登记一个库文件和 424 个 Buffer（126,542,208 字节，按实际需要读取）。
  合并原始库与石地板元数据，删除 ConstructionStaticAssets 的全局加载缓存和石地板的
  隐式合并/静态回退。模块 URL 只负责安装预设描述符，运行消费者使用显式资源。
- 每次加载固定 VFS 映射并持有不可变元数据，字节检查长度和 SHA256；更换文件不会偷换
  在途任务输入。几何复用签名包含资源实例身份。组件、在途编译和驻留世界分别按实际
  使用周期持有资源，旧世界退出后释放，不因组件切换就提前回收。
- 组件 Host 更换资源时重新绑定投影，保留已接受的作者编辑。普通 Seed World 工程入口
  安装同一组描述符，预置系统 Source 保存显式引用；新项目使用 building-assets-v1 键，
  不迁移也不删除旧键的工程。两个组件演示项目也使用新格式项目键。
- 预置系统声明重新生成（566 文件 / 2,273,491 字节）。仍使用原 Worker、GPU 合批、LOD
  与地形适配；没有通过更换建筑几何来完成资源迁移。

验证与纠正：

- 本轮最终资源/组件/发布/地形/驻留回归：12 文件 221 项通过；另复用同版本未再修改的
  原生装饰、灰泥纹理与墙面保留 3 文件 18 项通过，共 239 个不同用例。Terrain noEmit 通过。
- 两入口生产构建通过；扩展页 46 项、窗口页 84 项真实 WebGL 检查通过，成功运行日志
  均无 error/warning。包含实际 VFS 元数据修改、共享引用更新、GPU 拾取、新 Engine
  重载与撤销。该用例验证资源传播，不宣称已经验证任意贴图内容替换或全部资产格式。
- 初次浏览器检查发现演示页未向 RuntimeEditor 传递资产格式，已补齐；随后发现测试
  编辑未指定 loadPaths，撤销缺少原始内容，已按现有编辑契约读取后捕获 undo。保留失败
  日志，不改动公共编辑器来掩盖调用错误。
- 默认 Seed 1 开发页完成启动；通过现有“查看选中建筑”入口等待精细几何加载，实际可见
  圆房、屋瓦、灰泥、门窗与墙灯，控制台无 error/warning。该证据不等于默认建筑已逐对象
  接入新的 House/Decoration 组件，也不是全世界逐像素等价或性能基准。
- 默认静态产物的 Vite 构建通过，但 Flash App 检查报告未找到内联 Worker；实际静态页
  仍因 meadow-plant-materials.json 404 加载失败（本文件已有 2026-10-14 同类记录）。
  没有宣称发布验收通过，没有顺带修改植被打包。
- 首次开发页等待误用了不存在的 window.endMs（源码中的 window 是帧测量局部变量），
  超时后保持原页面，改用已发布的 seedWorldPlanning、真实 UI 与近景加载完成状态验证。
- 证据：output/building-vfs-library/；截图：output/playwright/building-vfs-extensions.png、
  building-vfs-window.png、building-vfs-seed-dev-near.png，均已查看。自建浏览器、4197/4198
  已关闭；用户 4173/8082 未动。未 commit/push。

尚未完成：默认世界每个建筑/装饰的真实组件化；圆房、天窗和其他附件的完整 Source 契约；
其余砖块 SDF、装饰模板/目录、示例地形等资产进入 VFS；默认世界静态发布问题及整体迁移验收。
旧默认世界 authoring JSON / BuildingManager 尚在，不能把新增的 assets 引用描述成已退役旧作者链路。

补充检查边界：另以临时配置检查 23 个直接改动的独立浏览器夹具，未通过：除 Node Buffer 类型声明冲突外，报告 14 处夹具类型问题；这 14 处诊断行均能在 HEAD 找到，核对记录见 supplemental-consumer-diagnostics.json。没有将该非标准扩展检查计为通过，也没有因此改动无关夹具行为。


## 2026-10-26：原生形状与圆墙挂载

- 主体的局部几何收敛到 `shape`：矩形宽深或圆形半径；中心、朝向仍由 Entity Transform
  持有。删除试点主体的 width/depth 别名。围墙和栅栏保持原矩形条带能力，楼梯不做。
- Source 使用已有 `$type` 构造形状值，例如
  `shape: {$type: "CircularBuildingShape", radius: 3}` 或
  `shape: {$type: "RectangularBuildingShape", width: 8, depth: 6}`。
  直接 Runtime 赋值可用普通对象；getter 返回隔离副本。没有修改通用 Source 加载器。
- 浏览器实测先发现普通对象在加载器中与默认矩形合并，导致圆形带上多余宽深字段。
  已改用现有多态构造契约；不忽略残留字段、不为圆房添加加载器特判。失败日志保留。
- 门窗灯挂点使用几何生产器的同一条 0.5 米采样墙面折线，由 Entity 位置推导 u；
  不额外持久化 u。圆墙不是另写一个解析圆近似。inverse-bind 同样使用该墙面切向。
- 继续墙面安装约束：局部倾斜拒绝。圆墙斜切向若水平非均匀缩放会改变安装朝向，明确
  拒绝；x/z 相等的正缩放和独立高度缩放通过。移动后的最终墙洞等待原有异步编译发布。

验证：27 项不同定向测试通过（组件/形状 15、门生成 7、灯光 5）；最终形状类注册后
重跑组件 15 项通过，其余消费者未变。Terrain noEmit、两入口生产构建通过（既有大 chunk
提示保留）。圆房扩展页 55 项、矩形窗口页 84 项真实 WebGL 检查通过，控制台 0 error /
0 warning。覆盖圆房实际细模及门窗灯 GPU 拾取、沿圆墙移动/缩放、Source 保存、新 Engine
重载和撤销到矩形；原矩形瞬时矩阵与墙洞、并发编辑、同 ID 替换回归均通过。

独立手写原生文档与组件文档的圆房预览几何相同；不据此声称默认全世界逐像素等价。
扩展页恢复后仍为 6 作者组件 / 3 主体 / 16 draw 描述 / 8 启用 Renderer / 41 派生 Entity；
矩形窗口页前后保持 3 / 1 / 10 / 5 / 22。这些不是 GPU 性能数据。

证据：`output/building-component-shape/`。已查看截图
`output/playwright/building-component-round-production.png`、`building-component-shape-window.png`。
自建浏览器和 4198 已关闭，未操作用户 4173/8082，未 commit/push。

未完成：默认世界按真实 Scene/Entity/Component 持有全部建筑与装饰；天窗、表面铺装及
局部切除的原生作者能力；地形接地、连栋与驻留 LOD 的统一；剩余 SDF/装饰等资产 VFS。
当前默认世界仍走原 authoring JSON / BuildingManager，不能把圆房演示通过视作第 3 项完成。


## 2026-10-26：砖块 SDF 资产进入 VFS（阶段验收）

范围继续采用 tiny-glade；楼梯不做，真实 LLM 验收暂不执行。

- 建筑库升级为 `tiny-glade-static-assets-v2`，包含砖块 SDF 着色器、代理索引和
  内容寻址的纹理模板引用。删除独立静态程序文件与纹理模块 URL 读取路径；运行时
  必须使用库提供的 reader。模板字节、8 份 shader stage 源码与代理索引迁移前后相同。
- 预设现在包含 425 个 Buffer / 126,566,656 字节；没有复制或改写原始纹理内容。
  GPU 缓存按模板内容哈希共享，更换内容生成新资源，旧租约释放后销毁旧纹理。
- 浏览器验收发现公共 Buffer 格式没有导入校验器，实际无法导入新二进制资产。
  已在 native formats 补齐 Uint8Array 导入；字符串冒充 Buffer 被拒绝，文本 update
  仍不支持。业务 ABI、长度和哈希由建筑资源验证，未塞进通用编辑器。
- 新项目键切换到 building-assets-v2；旧格式不提供兼容回退。公开声明已重生成
  （566 文件 / 2,273,955 字节）。离线导出器改为显式接收 SDF 程序和模板；只检查了
  Python 语法，本轮没有运行依赖外部原始产物的完整离线导出流程。

验证：78 个不同自动化用例通过（terrain 59、Node 8、editor lifecycle 11）；
Terrain noEmit 与四入口生产构建通过。扩展页 60 项真实 WebGL 检查通过，覆盖 GPU
纹理数据替换、共享、释放、新 Engine 重载和撤销；控制台无 error/warning。
7 组实际着色器编译链接通过，该独立页面有 favicon.ico 404。
实际 PlannedMasonryWorld 的 5 组相机比较均通过既有 adaptive/full 门限：
最大 RGB 平均误差 0.008149、最大 patch P95 0.015055、最小轮廓 IoU 0.997674；
运行时 readback 为 0。该页面无 error，有一条 canvas 缺少 CSS 尺寸导致自动分辨率
关闭的 warning。此对比不是迁移前后像素基线，也不是 CPU/GPU 性能基准。

证据：`output/building-vfs-sdf/`。扩展页与 LOD 截图已查看：
`output/playwright/building-vfs-sdf-extensions.png`、`building-vfs-sdf-lod.png`。
初次 clip 程序校验、Buffer 导入与测试空 documents 差异的失败日志保留。
自建浏览器和 4198 已关闭，用户 4173/8082 未动，未 commit/push。

当前剩余：默认世界的建筑/装饰真实组件化、天窗/表面作者能力、地形接地/连栋/
驻留 LOD 的统一，以及装饰模板/目录、示例地形等剩余资产 VFS 化。
默认世界仍使用 authoring JSON / BuildingManager；此阶段不代表整体迁移完成。


## 2026-10-26：退役装饰渲染时的内置库覆盖（阶段验收）

发现默认世界精细 `ConstructionRenderPackage` 与粗略 `DecorationNativeView` 两条渲染路径
都在 VFS 库加载后，再合并代码内置的石质装饰、石框及木墙开口资源；这会覆盖同名的
项目资源，且这些字节不属于 VFS。现已删除两条路径中的覆盖，直接消费传入的库和 reader。
旧资源构造器移至 `offline/`，生产 runtime 不再导入；木墙实例绑定和裁切列表仍由运行时
持有，未将动态实例误存成资产。

- 新增显式离线导出命令 `node world/gallery/shared/tiny-glade/tests/export-decoration-assets.mjs`。
  导出前核对每份字节长度、SHA256 和内容寻址文件名；119 份装饰 Buffer 中 12 份已存在，
  实际新增 107 个文件。最终预设（含石地板）共 532 Buffer / 128,288,224 字节。
- 原库已有的 programs/templates/textures/files 条目均未改写；导出的静态程序、模板、
  纹理描述、网格与 SDF 图集逐项对照原离线构造器通过。没有增加运行时默认回退。
- Seed World 新项目键为 building-assets-v3；组件演示也换新项目键。旧项目不迁移。
- 公共声明重生成：566 文件 / 2,273,955 字节。离线导出器实际执行成功；完整外部原始
  资产提取流程仍不是本轮执行范围。

验收证据：

- 36 项定向测试通过（7 文件），包括真实木墙开口/石框编译后保留 VFS 程序修改、
  缺文件拒绝、缺模板拒绝、粗略渲染使用原 VFS reader，以及资源字节/ABI/生命周期。
  Terrain noEmit 和五入口生产构建通过（保留大 chunk 提示）。
- 真实 WebGL：石框页 10 draw、木墙页 38 case、山墙页 10 case、扩展页 60 项通过。
  扩展页覆盖实体拾取、编辑、禁用、保存重载、撤销，以及前一阶段的 SDF GPU 替换。
- PlannedMasonryWorld 的 5 组 LOD 对比通过；首次与历史日志数值不同，未据此宣称一致。
  随后分别启动保留的迁移前产物和本轮产物，以相同 1280×720 viewport、960×640 canvas
  做受控对照：5 视角 × full/low/adaptive 共 15 张 PNG 的 SHA256 完全一致，所有指标一致。
  这是该固定场景的迁移前后证据，不是全世界全部视角或性能等价的证明。
- 石框独立页仅有 favicon.ico 404；木墙、山墙、组件、LOD 页 console 均无 error/warning。
  首轮新 coarse reader 测试放在 describe 外，继承前例的失败 mock，已移回原 beforeEach
  作用域；失败日志保留，没有改产品逻辑来掩盖测试问题。

证据目录：`output/building-vfs-decoration/`；图片位于 `output/playwright/building-vfs-decoration-*.png`。
已查看石框、山墙、组件及 LOD 图片。自建浏览器与 4198 均关闭；未操作用户 4173/8082，
未 commit/push。

整体目标仍未完成：默认世界仍以 authoring JSON / BuildingManager 持有作者状态；
真实组件还需覆盖天窗/表面及默认生成、地形接地、连栋和驻留链路。装饰几何目录、
部分其他程序/模板、示例地形等仍有模块资产入口。楼梯及真实 LLM 验收仍排除。

## 2026-10-26：原生建筑表面组件

`BuildingSurfaceComponent` 已作为真实 Engine Component 接入原生建筑链路。
它与恰好一个 MainBuildingComponent 位于同一 Entity，按 role（roof/wall/foundation/surface）
修改该主体已有表面的铺设；同一角色不能存在多个启用的表面组件。主体继续负责体量。
placement 整体替换规则、材料单元、尺寸和种子；regions 保存局部隐藏/材料覆盖。
getter 返回副本，显式 seed=0 保留，最终使用原有 MasonryDocument 校验及几何编译器。
禁用或删除表面组件恢复主体基础铺设，主体、门窗和 Scene 作者记录不会被删除。
`inspectPublished()` 读取实际发布的单元与区域；未发布/禁用时明确失败。

真实入口：extensions.html 的“屋顶换成木板”，经 RuntimeEditor Source 事务完成。
Source 组件 ID 是临时 material binding 身份，没有新增持久化目录或双份表面状态。

验证：22 个 CPU 测试通过，Terrain noEmit、两入口生产构建通过；真实 WebGL 扩展验收
74 项通过，涵盖材质改变、局部切除、保存后新 Engine 重载、禁用、移除与撤销。
原窗口矩阵/拾取/墙洞回归 84 项通过，前后均为 3 作者组件、10 draw、5 renderer、22 派生节点。
扩展恢复后为 6 作者组件、16 draw、8 renderer、41 派生节点。已查看瓦片/木板屋顶截图。
两个页面 console 无 error/warning。证据：`output/building-surface-component/`。
首次几何对照误用了原 roof overlap_rows 而不是待测 auto；差异打印耗时已用堆栈确认，
改为有界差异报告并校正测试参照后通过。失败与诊断日志保留，未改产品来规避差异。

本阶段仅补齐原生试点的表面作者能力，默认世界全量组件化、地形/连栋/驻留接入、
屋顶附件组件及剩余资产 VFS 化仍未完成；楼梯和真实 LLM 验收排除。

## 2026-10-26：Gothic 资产来源收敛与远景纹理释放

`ConstructionGothic` 删除源码 `gothic-preview/units.ts` 默认回退。原有 Gothic 天窗的
碰撞尺寸/玻璃槽位统一由当前 ConstructionLibrary 提供；驻留编译、远景生成、结构查询、
宿主附件适配及开口容量检查传递同一资源快照。没有天窗时不要求无用资源；需要天窗而
未提供资产时明确失败。旧 units 文件仅作为离线基准，不再被产品运行时代码导入。
本阶段不代表其他装饰 Catalog、静态网格和碰撞数据已全部迁完。

新增回归证明：默认 VFS 数据与迁移前 units 编译结果一致；修改真实参与计算的碰撞纵深后，
驻留和远景几何一致变化。横向开口宽度由原算法按 rank 决定，本轮保留该规则，没有为了
让测试变化而修改几何算法。Gothic 浏览器夹具同时改为真实 VFS reader，补齐实际的
ownerIdByBuildingId，并等待远景资源 ready 后再做像素比较。

额外的真实上下文恢复检查复现了帧内释放缺陷：远景 root/材质延后销毁，而 LOD 纹理
立即 destroy，被 Engine 引用计数拒绝；最后留下 559×361、563×162 两张纹理。
HEAD 原有代码已存在此顺序。现在正常销毁与失败清理共用幂等 disposeView，先拆除
Renderer/材质，再在其清理之后释放纹理及 lease；不强制销毁仍被引用的资源。
复测中新增残留 graphic 从 2 变为 0，近景 restorer 与远景顶点 buffer 也均无残留。

验证与证据：`output/building-vfs-gothic/`。

- 336 项不同 Vitest 测试及 39 项 Node 测试通过，共 375 项。覆盖原生几何、默认世界
  编辑发布、宿主/附件处理、结构查询、材质铺设、资源加载与释放。分次日志保留，未重复计数。
- Terrain noEmit、两入口生产构建通过；公共声明生成 566 文件 / 2,274,425 bytes。
- 真实 WebGL：默认与修改后的 VFS 碰撞数据均通过近远景换材质、局部隐藏及恢复；
  恢复像素差 [0,0]。两种数据的上下文丢失/恢复、共享资源保留、加载中断重试和最终释放
  均通过。原有 5 组 LOD 场景通过，已查看默认、修改后及 LOD 截图。
- 正常页除首次 favicon 404 无其他 console error/warning；强制上下文丢失测试有
  157 条 WebGL warning（含 INVALID_OPERATION delete），已保留日志。这些警告尚未
  在 Engine 层定位/修复，不能将断言通过描述为 console 完全干净。
- 早期失败保留：测试替身缺显式资产、试用未参与开口计算的 X bounds、测试源缺 host
  placement/平屋顶、临时 Node runner 未还原 import.meta.url，以及旧浏览器夹具缺归属表。
  分别修正夹具/参照；最后的 GPU 残留则有实际产品代码修复与同例复测。

自建 4198 与测试浏览器已关闭，未操作用户 4173/8082；未 commit/push。
整体目标仍未完成。下一重点是默认世界的作者状态从 authoring JSON/BuildingManager
切到真实组件，同时保留地形接地、连栋、附件和驻留 LOD；剩余 Catalog/mesh/碰撞/程序
及示例地形资产仍须进入 VFS。楼梯和真实 LLM 验收仍排除。


## 2026-10-26：装饰外观与原生石框、石帽接入真实组件

本阶段补齐默认建筑迁移前的一处能力缺口，不代表默认世界作者状态已切换。

- `DecorationComponent` 持有 woodColor、frameMaterial、lightIntensity、lightColor；门、窗、灯
  共用原生成器的校验。null 表示撤销覆盖并使用原生默认/宿主继承，显式 0 保留。
  默认窗户微光原先仍由生成器提供；本次解决的是组件不能表达既有外观编辑，并非修复
  一个默认窗户完全不发光的问题。frameMaterial 受实际装饰类型支持范围约束，没有替代材质。
- 原生墙体窗框与尖拱石帽此前没有装饰身份和节点位姿绑定。生成时现在保留 decorationId；
  原有单附件 draw 通过 `MountedDecorationRenderer` 消费真实 Entity world × inverse-bind，
  同步包围盒、法线/模型变换及拾取。禁用/删除后停止绘制；同 ID 组件替换通过当前 Scene 解析。
  原生 shader、实例 ABI、mesh 与 draw 数量保持原样，未把石框换成普通近似网格。
- 木框、玻璃继续使用原合批 `RigidDecorationRenderer`，不拆批。墙洞仍等待异步重建；
  矩阵预览不冒充已完成的墙洞发布。新增 renderer 使用 Engine 已公开的 protected `_render`
  扩展点，无 Engine 修改，也未增加作者 Entity 或另一份持久化对象表。
- 扩展 Demo 增加“尖拱窗：切换窗框材质”入口，经 Source 编辑、保存与激活。
  默认 cottage 窗不支持墙体框，因此此按钮明确切换为已有 Gothic 类型；不是运行时 fallback。
  项目键更新为 native-building-extensions-v8，公开声明已生成（566 files / 2,274,689 bytes）。

验证：78 项定向 Vitest 测试通过；最终 Terrain noEmit 和两入口生产构建通过（既有大 chunk
提示保留）。真实 WebGL 扩展页 100 项检查通过，原窗口页 84 项回归通过。矩形与圆墙上，
矩形墙检查覆盖墙体框/石帽分别 GPU 拾取、移动、缩放、父级移动、保存新 Engine 重载、
覆盖清空、禁用和撤销；另验证圆墙上的独立框/帽 GPU 拾取、沿墙移动缩放及撤销。
圆墙测试不只是人工单像素点击。两个页面控制台均为 0 error / 0 warning。
恢复后的扩展场景仍为 6 作者组件 / 16 draw / 8 enabled Renderer / 41 派生节点；原窗口为
3 / 10 / 5 / 22，数量未变。数量证据不代表已经测得 CPU/GPU 性能收益。

证据：`output/building-decoration-component/`，截图 `output/playwright/building-decoration-*.png`
已查看。早期测试失败保留：f32 挂点与双精度分数直接相等、对 cottage 使用不支持的墙体框、
引用 Engine 声明未暴露的 `_prepareRender`。分别修正测试参照/用例并采用实际 protected hook。
圆墙首次人工点选落在房屋像素，未计为通过；随后加入独立窗框/石帽 GPU 回归，最终通过。
测试服务 4198 与两个测试浏览器均已关闭，用户 4173/8082 未动，未 commit/push。

整体仍未完成：Seed World 默认作者状态仍在 `World/PlannedMasonry.json` / BuildingManager；
原生屋顶附件、地形接地、连栋及驻留管线尚需统一。剩余装饰 Catalog/mesh/碰撞数据与部分
程序、示例地形仍有模块资产入口，建筑资产全面 VFS 化仍待完成。楼梯与真实 LLM 验收排除。


## 2026-10-26：屋顶饰尖网格与颜色进入 VFS

本阶段只迁移屋顶饰尖资产依赖，不代表原生屋顶附件组件或默认世界 Scene 迁移已经完成。
楼梯继续排除；真实 LLM 验收本轮不做。

- 静态资产库升级为 tiny-glade-static-assets-v3，必含 roofSpire 的位置、法线、形变权重、
  索引和线性 RGB。沿用原始 828 顶点 / 1242 索引与默认颜色；原有 532 Buffer 不变。
  原 roof-spire.ts 仅留作离线/测试参照，产品生成路径已取消模块网格导入，无 v2 fallback。
- 资产入口校验数组一致性、三角索引和有限数值。需要饰尖的建筑缺少资产时显式失败；
  不生成饰尖的建筑无需读取该数据。原轮廓形变、屋顶放置与局部隐藏条件保留。
- Worker 输入显式携带饰尖资产，编译结果发布 spires，驻留预览消费已完成结果；
  远景/结构查询直接生成路径使用同一 VFS 数据。没有把整份库重复塞进 Worker。
- 扩展页提供“编辑 VFS 饰尖”操作，经 RuntimeEditor 资产事务生效、保存、重载和撤销。
  公共声明已重新生成：567 文件 / 2,275,443 bytes。

验证与证据：output/building-vfs-roof-spire/。

- 汇总每个文件的最终测试结果，共 32 个文件 / 374 项 Vitest 测试通过，未重复累计多次运行。
  Terrain noEmit、两入口生产构建通过；构建原有大 chunk 提示仍在。
- 真实生产 WebGL：扩展页 104 项、原房屋/窗户页 84 项检查通过。新增验证实际驻留网格
  高度随资产修改、新不可变资源实例、新 Engine 从保存的 VFS 恢复、撤销恢复原几何。
  两页控制台均为 0 error / 0 warning。近远景几何一致性另由同输入自动化测试覆盖；
  本阶段没有重新运行完整默认世界 LOD 浏览器场景，不据此宣称该链路已全面验收。
- 已查看原饰尖、修改后饰尖和窗户回归截图。修改后饰尖因变高触及演示相机画面顶部，
  截图仅作功能证据，不当作构图/审美验收。
- 扩展恢复态仍为 6 作者组件 / 16 draw / 8 enabled Renderer / 41 派生节点；
  原窗口为 3 / 10 / 5 / 22。未进行新的性能基准，不宣称性能收益。
- 初始新增几何对比混用了 double 与解析后的 f32 输入，修正为两路使用同一规范化输入，
  保留精确相等断言；五个旧测试夹具补齐显式资产。失败日志保留。
  离线导出脚本仅做 Python 语法检查，未重新执行外部原包提取。

测试浏览器及自建 4198 已关闭，未操作用户 4173/8082，未 commit/push。
整体仍待完成：默认 World/PlannedMasonry.json / BuildingManager 作者状态退役、屋顶附件
真实组件化、地形接地/连栋/驻留链路接入，以及剩余 Catalog/mesh/碰撞/程序/示例地形资产。


## 2026-10-26：尖拱屋顶窗的渲染、结构与碰撞统一读取 VFS

本阶段收敛 Gothic 几何真相源，不代表默认世界已经完成 Scene 迁移。楼梯与真实 LLM 验收继续排除。

- ConstructionGeometryAssets 从现有 VFS Buffer 解码三档尖拱窗的 frame/glass/collision；
  GPU、远景结构、屋顶附件占位使用同源字节，不再在产品链路导入模块网格或碰撞副本。
- 静态库升级 v4，删除作者 collisionBounds，边界由实际碰撞顶点计算；旧字段明确拒绝，
  无旧格式 fallback。原 532 Buffer 保持不变，未再引入一套几何资产格式。
- ConstructionLibraryResource 缓存不可变编译快照，Loader 准备完成后才发布；并发读取
  共享准备过程，失败可重试，销毁后不再发布。Worker 与预览显式消费同一快照。
- 保存入口更新资源版本；公开声明生成 568 文件 / 2,277,487 bytes。

验证证据：output/building-vfs-gothic-geometry/。29 个文件合计 320 项唯一 Vitest 测试、
11 项 Node 测试通过；Terrain noEmit 与四入口生产构建通过。测试覆盖原始三档网格精确
一致、实际 Buffer 修改、损坏数据拒绝、资源销毁/重试、附件碰撞和默认建筑发布链路。

真实生产 WebGL：尖拱窗默认、修改碰撞 Buffer、修改显示 Buffer 均通过；扩展页 104 项、
窗口页 84 项通过。默认尖拱近/远两块 480×480 画面与上一阶段逐像素相同；显示 Buffer
编辑后分别变化 1992 / 2337 像素，恢复差异为零。这只证明该夹具，不冒充全世界画面一致。

完整 masonry-lod-runtime 夹具复测通过：8 组建筑，连续转向 242 帧/852 个可见样本无
几何重建和几何上传；远处编辑只在返回时重建被编辑的一组，其他缓存对象身份保持；
过期释放、重新生成、拒绝保存与作者数据保持均通过。近/中景轮廓 IoU 0.9941。
最初失败的“return uses retained generation”来自过时夹具：HEAD 的 startCoarseRender
本来就销毁被修改对象的旧细节，且编辑完成不等于投影完成。修正夹具等待 warmup，严格
验证远处旧细节已释放、返回恰好重建一组、所有无关缓存保持；没有改变产品驻留策略。
迁移前源码与初次失败日志已留存。

扩展和窗口控制台 0 error / 0 warning；尖拱首次页面和 LOD 页面仅 favicon.ico 404，
无应用错误。窗口和 LOD 最终截图已查看。构建保留既有大 chunk 提示；离线外部资源
提取未重跑，未做受控 CPU/GPU 性能对比。自建 4198 和浏览器已关闭，未动 4173/8082，
未 commit/push。

整体未完成：World/PlannedMasonry.json / BuildingManager 作者状态尚未退役，原生屋顶
附件、真实地形接地/连栋/驻留接入和剩余 Catalog/几何/程序/示例地形资产仍待推进。


## 2026-10-26：尖拱屋顶窗组件与独立拾取

默认配方使用的原生 Gothic 屋顶附件现在有 GothicDormerComponent，继承 DecorationComponent，
作为房屋直接子 Entity 保存 meshUV、rank、seed、woodColor 与 allowConnection。主体、窗框、
玻璃和小屋顶继续使用原生成器；颜色与入场动画仍归宿主，拾取身份归实际附件。小屋顶按附件
分组，每组内部瓦片继续合批。多附件比旧版每宿主一组增加 draw，默认 0/1 附件不增加组数。

保存只包含 Scene 组件，临时编译文档不作为作者目录保存；禁用、删除、撤销和新 Engine
重载均验证。平屋顶保留作者组件但停止生成坡屋顶附件，恢复坡屋顶后恢复原附件。
明确限制：此类屋顶窗沿原屋面 chart 用 meshUV 安装，子 Entity 局部变换必须为单位变换；
整栋位姿跟随父 Entity。不把它宣称为墙窗的矩阵平移/缩放能力。原木框与玻璃外观保持，
不支持的墙框材质/灯色覆盖明确拒绝。

证据 output/building-roof-component/：8 文件合计 135 项唯一 Vitest 测试通过（两轮有重复，
不计为 157 项）；Terrain noEmit、公开声明生成及四入口生产构建通过。真实 WebGL 扩展页
123 项、原窗口页 84 项通过；包括圆房/矩形房、实际 GPU 窗体与小屋顶拾取、VFS 编辑、
保存重载与撤销。完整 LOD 回归通过：242 帧/852 可见样本无几何重建和几何上传，远处编辑、
缓存与恢复正常，作者数据保持；近/中景轮廓 IoU 0.99550。该夹具指标不代表全世界性能基准。

验收过程中修正了两处夹具前提：平顶的墙灯超过原墙顶净空，改为事务内同步降低灯位置；
圆屋面 UV 把附件放到背面，改为从原生安装朝向观察并真实 GPU 拾取。没有放宽产品净空、
绕过拾取的场景深度或用 CPU 命中替代 GPU 拾取。早期失败与修正日志保留。
扩展页/窗口页控制台零错误零警告；LOD 仅 favicon.ico 404。最终截图已实际查看。
自建浏览器和 4198 已关闭；未修改用户 4173/8082，未 commit/push。

整体仍未完成：默认 World/PlannedMasonry.json / BuildingManager 作者状态退役、默认世界
真实地形/连栋/驻留链路接入，以及剩余装饰 Catalog/几何/程序/示例地形资产进入 VFS。
楼梯和真实 LLM 验收继续排除。


## 2026-10-26：木拱 Shader 与立柱结构几何接入 VFS

删除两处产品内置资产入口：ConstructionWoodArchRender 不再注入模块 Shader，直接消费
VFS 建筑库的 wooden-arch-frame；ConstructionWoodArchGeometry 不再读取内置立柱副本，
从实际 wood 模板的顶点/索引 Buffer 解码。资源加载时验证并缓存不可变几何，独立结构查询
与已有编译结果使用同源资产；缺失时明确报错，无旧资产 fallback。只给确实含木拱柱的
编译组携带该查询快照，普通房屋不额外传输未使用网格。

离线装饰导出器负责把原 Shader 写入预置库，模块原件仅保留用于离线导出和独立对照。
与上一阶段预置库逐字段比较：仅新增 wooden-arch-frame 程序；所有网格、纹理、绑定和
Buffer 描述完全不变，原库仍为 444 Buffer，含既有地板资源的运行库为 532 Buffer。

证据 output/building-vfs-wood-arch/：6 文件 35 项唯一 Vitest 测试通过，最后条件化传输
调整后相关 3 项复跑通过；Terrain noEmit、公开声明（568 文件 / 2,278,027 bytes）和
木拱测试页生产构建通过。原始立柱 60 组 Metal 表达式最大误差 9.54e-7，默认网格精确
相等；真实校验的 VFS Buffer 替换同步改变编译与独立结构查询；原 Shader 内容精确相等，
项目自定义程序不会被内置程序覆盖。

真实 WebGL 的矩形/圆形房屋、近/中/远景、尺寸与颜色编辑、入场及恢复全部通过。实际
VFS Loader 加载的修改版 Shader 使近景变化 3345 像素、远景变化 3075 像素，恢复差异为零。
默认与修改截图已查看；控制台零错误零警告，生产链路零 readback。没有进行全世界的画面
或受控性能对比。首次浏览器失败来自旧夹具缺少 ownerIdByBuildingId；已按现有接口补齐，
并将此测试页纳入 Terrain 类型检查。初次失败日志保留，没有修改产品归属规则。

自建 4198 和浏览器已关闭，未操作用户 4173/8082，未 commit/push。
整体未完成：默认世界的旧作者目录仍待退役，连栋/真实地形/驻留需要接入原生 Scene；
其他装饰 Catalog、网格/碰撞、裁切和示例地形资产仍有模块入口。楼梯和真实 LLM 验收不做。


## 2026-10-26：以 Scene 坐标框架编译连栋主体

组件系统从逐栋编译改为按宿主提供的实际祖先 Entity 分组；同组各主体仍分别持有
House/Wall/FenceComponent，编译时从 Scene 局部矩阵、组件和 VFS 资源临时组成原内核输入。
不增加可写 BuildingGroup 目录或存档快照。默认表面绑定 ID 改为主体作用域，避免合组时
roof/wall/foundation 重名。独立 Demo 显式选择主体自身作为编译框架，保持原独立模式。

BuildingGroup 沿真实父链读取局部矩阵，避免大世界坐标相减引入公共父节点移动误差。
矩形方向、圆形 phase 和窗户逆绑定一并转换到编译框架；原内核继续处理连栋墙面和屋顶。
同组必须引用同一 VFS 建筑库。当前组内主体支持水平平移和 yaw；单体垂直偏移、倾斜、
非单位缩放明确拒绝，不能把这一阶段限制当成已经完成的默认世界变换契约。
共同父节点仍可整体变换；现有 Demo 平地随该框架移动，不代表真实世界接地已经完成。

删除或禁用主体时立即隐藏其绘制，保留邻居直到替换组完成；同时使已发布视图失效。
这样即使同帧恢复相同 ID/几何，也不能复用已经隐藏绘制或持有旧组件实例的视图。
运行集合清理使用发布时身份缓存，不在组件销毁后向 Scene 查询已不存在的身份。

新增真实入口 demos/building-components/groups.html：相交方房各有独立窗 Entity，另有一个
独立组。实际 Worker/WebGL 验证双方 GPU 拾取、公共父矩阵移动不重建、单体移动/撤销、
同帧禁用恢复、删除/撤销、新 Engine 重载；局部操作保持独立组 Renderer 实例不变。

证据 output/building-component-groups/：6 文件 47 项唯一 Vitest 测试通过（首轮 45 项，
最后 BuildingGroup 7 项中新增 2 项，不重复计数）。方房/圆房分组与独立构造的原多主体
文档在斜坡采样下结构预览、铺设组和接触孔完全一致；方房还确认逐栋编译会产生不同
屋顶结果；真实 Entity 矩阵与原墙面 chart 的挂点坐标一致。早期测试错误保留：Node
导入完整 Engine 无 window；连接候选并不保证产生接触孔；圆房邻居不必改变第一栋
方房预览。修正了测试前提，没有放宽产品生成规则或原几何相等比较。

Terrain noEmit、公开声明生成（568 文件 / 2,278,027 bytes）及三入口生产构建通过。
真实浏览器连栋 17 项、扩展 123 项、原始窗户 84 项，共 224 项通过；控制台均零错误
零警告。连栋最终截图已实际查看。自建浏览器与 4198 已关闭；未触碰 4173/8082，未提交。

整体仍未完成：默认 Seed World 仍使用 PlannedMasonrySystem/World 与旧作者资源，不能
声称它已使用上述组件。下一项实际接入需要保留原世界地形/岩石支撑、连栋的稳定框架、
coarse/fine 驻留与入场，再退役旧作者目录；剩余模块资产入口也仍需清理。楼梯和真实
LLM 验收继续排除。本节只证明组件编译边界与相关回归，不是全世界性能或迁移验收。


## 2026-10-26：组件组接入世界地形与岩石支撑

BuildingSystem 宿主可提供已发布 ConstructionTerrainSource；组件组从实际 Scene 世界矩阵
构造原内核 placement，直接消费原 R16 地形与岩石三角形。没有新增高度采样器、保存接地
快照或复制作者位置。候选发布时复核地形 revision；过期 Worker 结果不能覆盖最新结果。
提供了 terrain 回调却没有快照时明确失败并保留旧视图，不退回平地；独立无地形 Demo
仍使用其本地平面。灯光从世界编译结果转换回真实装饰节点，避免双重位移。

当前地形组世界框架限制为 Y=0、水平刚体平移和 yaw；倾斜、缩放、垂直偏移明确拒绝。
这不是默认世界接入完成，也不是任意建筑变换契约。组件渲染根使用原 grounding 的世界
矩阵，公共父节点不会再叠加位置。原连栋组输入与局部平面演示仍保持。

证据 output/building-world-grounding/：4 文件 46 项 Vitest 通过，Terrain noEmit、公开
声明（568 文件 / 2,278,027 bytes）和三入口生产构建通过。真实浏览器世界接地 36 项、
局部连栋 17 项、扩展 123 项、原窗户 84 项，共 260 项通过，控制台零错误零警告。
验证含斜坡/岩石、移动旋转、地形连续发布、丢失地形后的保留与恢复、保存新 Engine 重载
和撤销；灯光世界坐标相对原编译路径最大误差 1.622e-6 米。接地截图已实际查看。

失败记录保留：首次灯光检查因测试相机距离 29.2145 米超出原 enterDistance=28，调整
测试相机到 21.9512 米，没有改产品灯光策略；第二次发现 terrain?.().revision 在缺失快照
时提前解引用，修正为 terrain?.()?.revision 后验证预期失败和恢复。类型检查初次失败
来自测试向 getComponents 传抽象类，改查真实 Window/WallLampComponent。

自建浏览器与 4198 已关闭，没有操作用户 4173/8082，未 commit/push。默认世界仍使用
PlannedMasonrySystem/World 和旧作者资源，coarse/fine 驻留、组件初始化和剩余模块资产
仍待接入；没有声称全世界性能或真实 LLM 验收。楼梯不做。


## 2026-10-26：墙面装饰外观种子与 Scene 身份分离

旧装饰编译器用 owner.seed 与局部装饰 ID 哈希决定模型细节，直接把 entrance/window-0-0
替换成唯一 Scene ID 会改变部分门窗几何。WallDecorationComponent 现在持有明确 uint32
seed（含 0），buildingDocument 将其传给原内核；创建生成对象时可用原哈希算法确定初始
值，然后保存到 Source。新组件运行时不再从当前组件 ID 或父建筑种子重新计算外观。
没有另建装饰身份表、保存模型副本或保存旧 ID 别名。

此字段归属墙面装饰，改变种子属于结构变化；屋顶已有独立的 GothicDormerComponent.seed，
通用旧屋顶规格不接受会被忽略的墙面 seed。原生成器尚未接入 Scene 的规格仍可省略该字段，
原编译算法保持；这条未迁移路径仍待默认世界切换时退役，不能把当前改动称为整体完成。
演示 Source 明确保存旧外观的初始种子，保证本轮不因组件默认值变化而重置示例外观。

证据 output/building-decoration-identity/：4 文件 50 项唯一测试通过（首轮 49 项，新增一个
边界检查后相关 11 项复跑，不重复计数）。六类 wall window/door/lamp 在换成唯一 Scene ID
及改变父建筑种子后，生成结果去除身份字段与原路径一致；验证 uint32 全范围、非法值、
显式零、真实 Gothic 石帽随 seed 改变以及结构失效。Terrain noEmit、568 文件/2,278,209
bytes 公开声明及三入口生产构建通过。构建保留现有大 chunk 提示，没有改包拆分策略。

真实 WebGL：扩展 126 项、原窗户 84 项、世界地形/岩石接地 36 项、局部连栋 17 项，共
263 项通过，全部控制台零错误零警告。新增 Scene 编辑 seed=0、保存后新 Engine 恢复和
撤销恢复原 seed；既有独立拾取、矩阵驱动、VFS 替换、连栋和地形发布回归通过。最终扩展
截图已实际查看。自建浏览器和 4198 已关闭，未操作 4173/8082，未 commit/push。

整体未完成：Seed World 默认入口仍需退役 PlannedMasonrySystem/World 作者目录，并把
原 coarse/fine 驻留、入场和预算逻辑接到组件派生视图；剩余 Catalog/几何等模块资产仍需
进入 VFS。本节不是全世界外观或性能验收；楼梯及真实 LLM 验收仍不做。


## 2026-10-26：默认世界驻留策略拆出旧作者目录

将 PlannedMasonryWorld 内相机变化检测、屏幕尺寸选择、显示质量预算、渐变、缓存保留及
淘汰移入 shared/tiny-glade/runtime/MasonryResidency。新模块只借用 Camera、显示条目和
统计对象，不读取 IslandPlan、PlannedMasonryEdits、BuildingManager 或持久化资源。
原默认世界已经调用这个共享模块；旧类仍负责异步获取/重试、入场、结构和作者事务。
本轮没有再复制一套调度策略，也没有替换成全量常驻精细网格。

MasonryLodPolicy / MasonryLodTransition 移到 shared/tiny-glade/runtime，旧路径删除，
所有实际 TS/MJS 消费者改用新路径。阈值策略文件与原文件逐字节一致；渐变状态机仅更改
已有 TerrainLodGroupRuntime 的导入路径。七个搬移方法只做状态归属/回调替换，规范化
源码比较一致；引入的数据结构只持有派生显示状态，不承担编辑身份或资产真相源。

证据 output/building-residency-boundary/：5 文件 114 项原有 Vitest 回归和独立 Node
LOD 脚本 5 项通过。调度测试只将内部 spy 指向新 owner，未放宽行为断言。Terrain noEmit
通过，并把真实驻留夹具纳入类型检查；公开声明 569 文件 / 2,280,058 bytes。生产构建
成功，仍有现有大 chunk 提示。Node 独立脚本首次运行不能解析已有无扩展名 TS 导入，
使用 output 中仅供 Node 测试的 .ts 解析器后通过，没有改变产品资源加载。

使用本轮拆分前的 PlannedMasonryWorld 源码与相同资产构建对照版本（只修正已搬移模块的
导入路径，不改对照逻辑）。两版真实 GPU 各通过显示预算 8 项、缓存压力 10 项。相机
六次转向、720 次可见采样、缓存淘汰/回归及编辑恢复均一致；排除耗时字段后的所有状态
快照完全一致，两组最终画布（1280×504）各自像素差异均为 0。当前版本截图已实际查看。
两版控制台零错误零警告，零几何回读；这不是全世界、美术或受控性能验收。

初次真实浏览器暴露旧夹具前提失效：原模型完整细节的额外成本总和已低于固定测试预算，
两版均在 combined requests exceed budget 失败，峰值同为 854,070。仅调整测试夹具的
FOV 和测试预算：从实际几何最大成本确定预算，补断言至少两栋可见建筑请求完整细节。
两版使用相同夹具，最终预算 939,478、峰值 854,070；缓存压力测试预算 1,522,827 bytes。
产品预算/阈值不变，夹具结束恢复其临时参数。另给测试页补 data favicon 消除无关 404。
原始失败与最终对照结果都保留。

自建浏览器和 4198 已关闭，未操作用户 4173/8082，未 commit/push。整体仍未完成：
BuildingSystem 组件渲染器尚未接入 coarse/fine 视图、异步获取与入场；默认 Scene 初始化
和旧作者目录退役、剩余模块资产进入 VFS 仍待完成。楼梯及真实 LLM 验收不做。


## 2026-10-26：共享远景渲染保留组件身份和 Entity 矩阵

默认世界远景原来直接依赖 PlannedMasonryGroup 和规划 owner 映射。其门窗玻璃按房屋
合批，原生石框也只暴露房屋身份，不能直接接入组件拾取。现在将实现、顶点打包及 Shader
迁到 shared/tiny-glade/runtime/MasonryDistanceView、MasonryDistanceVertexData 和
MasonryDistanceSurface.shader，删除旧路径；所有产品、测试和公开声明均改用新入口。
共享渲染只消费编译文档、VFS 库和调用者提供的 resolvePickId，不读取旧作者目录。
当前旧世界调用者显式提供原有 owner 映射，保持它的现有行为，未增加第二份作者数据。

组件输入提供 rigidDecorations 时，ConstructionPreview 保留原生装饰部件及身份，不先
合并成丢失身份的房屋表面。DecorationNativeView 复用近景的玻璃/木框合批矩阵纹理和
原生石框 MountedDecorationRenderer；Renderer 消费实际 Entity worldMatrix。石框按
挂件绑定，玻璃仍按房屋批量绘制，拾取按部件 ID 解码。Gothic 屋顶原生身体和屋顶瓦片
保留 sourceId。预编译几何若已丢失装饰身份则明确拒绝，不静默退回房屋拾取。

证据 output/building-distance-components/：146 项不同自动测试通过（原发布/调度及
生命周期 115 项，LOD 外观 16 项，新增身份几何对照 7 项，入口及 Shader 8 项；重复
运行不重复计数）。六类门窗/墙灯的坐标、法线、颜色、发光、结构查询、包围范围和原生
石框数据与原远景相同；Gothic 屋顶组件 ID 和三角形总数验证通过。Terrain noEmit、公开
声明生成（569 文件 / 2,280,741 bytes）及生产构建通过，保留已有大 chunk 构建提示。

真实 WebGL 入口 demos/building-components/groups.html?distance=1：22 项验收通过，
覆盖两栋连栋房屋与独立房屋的门窗/灯独立拾取、连续矩阵更新、缩放、实际石框矩阵、
通过 Scene 事务移动并重编墙洞、父节点移动、隐藏及恢复。此夹具单独驱动共享远景，
不代表 BuildingSystem 已完成自动远近景切换。截图已实际查看，控制台零错误零警告。

首次 GPU 测试在“只改窗口矩阵却不更新墙洞”时失败。后续验证明确旧墙面仍遮挡，隔离
墙面才检查裸矩阵消费者；完整编辑另走 Scene 事务重编墙洞后再检查真实遮挡下的拾取。
未关闭产品深度判定。另一个错误断言要求箭缝窗必须有独立石框 Renderer；检查源实现
确认其使用合批几何后改为按实际表示验证，同时保留 Gothic 必须存在原生石框的断言。
原始失败日志保留，不算作通过。初始单测夹具缺少必需屋顶 binding，补齐有效输入后
通过，未降低产品约束。

当前默认世界实际 GPU 显示预算 8 项、缓存压力 10 项通过。使用上一阶段保留的生产
构建在同一浏览器环境重跑两组对照：排除耗时字段后的全部状态相同，两组最终画布
1280×504 像素差异各为 0。与更早会话保存截图比较曾出现微小差异；保留原始数据，
不据此声称产品回归或认定具体环境原因。同环境复跑才作为本轮像素对照证据。

自建浏览器及 4198/4199 已关闭，未操作用户 4173/8082，未 commit/push。整体仍未完成：
BuildingSystem 尚未接入共享远景与驻留的异步获取、入场和缓存生命周期；默认世界的
Scene 初始化/保存尚未切换，旧作者目录仍待退役；其余模块资产仍需进入 VFS。楼梯和
真实 LLM 验收不在本轮范围。


## 2026-10-26：组件建筑按需加载精细网格与未驻留表面编辑

BuildingSystem 已接入共享 MasonryDistanceView / MasonryResidency。每个 Scene 编译组先
发布可拾取远景，按屏幕尺寸、可见性与预算异步加载精细网格，复用原有渐变和缓存淘汰。
加载准入移入共享 residency.admit，旧 PlannedMasonryWorld 也调用同一实现；预算和
优先级规则不变。组件 frame 的世界缩放参与尺寸阈值，公共父节点移动仍不重编局部几何。
加载中有新编辑时取消过时任务；删除主体立即隐藏该 owner，保留同组邻居，迟到加载
不能恢复已删除对象。灯光由已发布装饰姿态驱动，不依赖精细网格是否驻留。

BuildingSurfaceComponent.inspectPublished 现在返回 Promise。未驻留时，用同一 VFS
资产快照及 Worker 编译输入查询真实铺设单元，不为查询分配 GPU 精细网格；缓存属于
派生视图，编辑、退役或销毁使其失效。已加载时仍查询当前精细发布。过期输入明确拒绝。
这不是另一份可写建筑目录。远景预览生成仍有同步 CPU 工作，本阶段没有主线程无卡顿
或 FPS / 内存收益的受控测量结论。

证据：output/building-component-residency/。75 项不同自动测试通过（原 73 项，异步
隐藏 owner 新增 1 项，Scene frame 缩放与观察距离等比变化新增 1 项）。Terrain noEmit
通过；公开声明生成 569 文件 / 2,281,136 bytes；生产构建通过，保留已有大 chunk 提示。
真实 WebGL：组件驻留 16 项、连栋 17 项、地形与岩石接地 36 项、主体/门窗灯/表面与
VFS 编辑 126 项、窗口矩阵 84 项通过。生产包组件驻留再验 16 项通过；旧默认建筑的
显示预算 8 项与缓存压力 10 项通过。生产截图已实际查看，生产检查控制台零错误零警告。

扩展验收首次失败在饰尖高度检查：同名 decorations/house-c 同时存在于远景和精细
网格，远景批次只有墙面附件，饰尖另作表面绘制。检查改为定位 Source 主体直接拥有的
精细批次，仍验证资产顶点修改改变真实网格高度、保存重载和撤销恢复；未放宽高度
断言。失败日志保留。验收入口 groups.html?residency=1 覆盖远处编辑、近处加载、
淘汰回归、加载中继续编辑、删除撤销和保存不含派生状态。

自建浏览器与 4198/4199 已关闭，未操作用户 4173/8082，未 commit/push。整体目标仍未
完成：默认 Seed World 仍走旧 PlannedMasonrySystem/World/作者目录；下一阶段要接入
原生组件初始化与世界发布，并保留入场、碰撞及宿主事务，再退役旧目录和剩余资产导入。
楼梯与真实 LLM 验收排除；不能将本次组件夹具通过称为默认世界已全面迁移。


## 2026-10-26：组件建筑复用真实结构碰撞与不可变查询快照

BuildingSystem 发布远景时同时捕获原 ConstructionPreview 结构几何，并提供 bounds、
intersectSegment、intersectCapsule、captureSurfaceQuery。命中返回 Scene 主体组件 ID；
洞口、屋面及装饰结构仍由同一生成器负责，不增加建筑目录或用 OBB 代替实际表面。
查询与精细 GPU 驻留独立；世界矩阵未变化时复用世界结构缓存，变化时重新变换结构顶点。
胶囊半径保持世界米制，支持独立模型公共父框架的非均匀缩放。禁用/删除主体立即从当前
查询移除其 owner，连栋邻居保留；已捕获事务快照不可变。局部编辑重新发布结构，
保存只保留原 Scene/VFS 作者数据，结构缓存不入存档。

ConstructionSurfaceQuery 新增不可变 transformed / withoutOwner 派生操作。初版用
Engine Float32 Matrix 保存逆转置，导致同一表面的不同切分在严格结构比较中不等价。
修正为 CPU 双精度余子式计算法线/UV 梯度，保留原有比较精度；这是本次查询变换的精度
要求，不是 Engine 世界矩阵脏标记或派发问题。奇异、非仿射或非有限变换明确拒绝。

证据 output/building-component-surfaces/：57 项不同定向测试通过（初轮 46 项有 1 项
精度失败，修正后该文件 5 项全部通过；另 11 项原几何/装饰身份回归通过，重复不计数）。
Terrain noEmit、公开声明生成 569 文件 / 2,281,688 bytes、最终生产构建通过，保留
已有大 chunk 提示。生产浏览器结构 16 项、接地/渲染/结构对照 43 项、驻留 16 项通过。
七个地形/岩石/位姿/重载状态，命中身份和世界坐标与原编译器结构独立逐顶点变换的
参考一致。生产控制台零错误零警告，接地截图已实际查看。

浏览器初始失败均保留：范围探针错误假设外墙在 Z=3（实际命中 Z=3.28）；放大组会
正常追加精细 LOD，改为验证既有 Renderer 未替换；局部移位后的旧探针恰落在新墙边缘，
改用完全分离位置；屋顶中心竖射线在两边均为空，改为从原结构非退化三角面生成探针。
没有降低实际命中、快照隔离、保存、矩阵或几何比较断言。未宣称遍历所有表面、全世界
导航、完整连续碰撞或受控帧率/内存性能验收。

临时浏览器及 4198/4199 已关闭，用户 4173/8082 未动，未 commit/push。默认世界入口
仍未切换：后续还需组件入场表现、原生 Source 初始化与世界事务接入，退役旧
PlannedMasonry 作者目录，完成剩余建筑资产 VFS 化。楼梯和真实 LLM 验收继续排除。


## 2026-10-26：组件建筑入场时钟与驻留解耦

- BuildingSystem 按 Source 主体组件 ID 持有派生的 ConstructionEntrance 时钟，继续使用原有
  2.4 秒入场曲线和材质绑定。首次 flush 后，宿主通过 publishEntrance()/startEntrance()
  等待世界展示屏障；普通独立组件默认完整显示，只有显式开启才让后续新主体入场。
- 已有主体编辑、组件重投影、整体位移、精细网格到达/淘汰/重载均保留进度；粗模和精细
  材质绑定同一当前状态。ConstructionEntrance.accept 只让新主体独立跳过首帧，避免它的
  编译耗时推进动画，同时不暂停正在播放的邻居。删除后清理时钟，撤销删除后重新入场。
- 墙灯在主体入场完成后进入原有距离/预算/渐变策略。显式 replayEntrance(body) 可重播
  单个主体；日常编辑不调用它。动画状态不写进 Source，也不增加建筑作者目录。

验证：

- 61 项定向自动化测试通过：ConstructionEntrance 9、ConstructionEntrancePublication 5、
  BuildingComponents 17、PlannedMasonryScheduling 30。覆盖新增主体独立计时、初始屏障、
  旧发布行为、Shader、组件几何与原驻留调度。
- Terrain noEmit 通过；预置声明生成 569 文件/2,282,080 字节。生产构建通过，仅有既有
  大 chunk 提示。最后仅调整验收诊断快照为 structuredClone，不改变产品源码/公开类型。
- 静态生产版 groups.html?entrance=1 通过21项真实 WebGL 检查：粗模/精细材质实际进度、
  中途编辑、整体移动、缓存淘汰/重载、删除/撤销、相邻主体计时、灯光和独立GPU拾取。
  既有 terrain=1 场景43项接地/碰撞/编辑/新 Engine 重载检查通过。成功页面控制台均
  0 error/0 warning。截图 output/playwright/building-component-entrance-production.png 已查看。
- 保留三次测试假设修正的失败记录：加入灯具的场景在原700米相机仍请求一组精细模型，
  验收远景位置改为4000米；冻结 dt 同时冻结了LOD渐变，淘汰测试改为推进时间；灯光
  验收相机原先在28米入场距离外，改在有效距离内检查入场门控。未修改生产LOD/灯光阈值。
- 证据：output/building-component-entrance/（日志、结果JSON、最终源码与SHA256）。
  自建浏览器和4198/4199服务已关闭；没有操作用户4173/8082，没有commit/push。

范围仍未完成：默认 Seed World 的 Source 初始化、世界发布事务、编辑入口切换及所有建筑
资产 VFS 化。上述通过不代表默认世界已经完成迁移；真实LLM验收暂不执行，楼梯不做。


## 2026-10-26：默认建筑配方首次生成原生 Source 对象

BuildingSceneGeneration 将一次初始程序化结果转换成 Scene Entity/Component：房屋、围墙、
栅栏、门窗灯、屋顶尖拱窗及铺设配置都有原生身份；保留连栋分组、主体顺序、挂点、原始
外观种子和 VFS 建筑库引用。仅实际生成成功的附件成为对象；不保留可写 MasonryDocument，
不在编辑或重载时重跑默认配方，也不迁移旧存档。楼梯继续排除。

转换对照发现并修复两处数值扰动：buildingWallPosition 用原墙曲线的点/结点进行双精度
插值，避免 Entity 挂点经额外 Float32 往返；wallPlacement 在 XZ 等比例缩放时直接采用
该比例，避免将单位缩放算成 0.9999999999999999 后改变墙洞细分。非等比例仍按墙切向计算。
未更换墙曲线或放宽安装约束。几何对照采用 1e-4 数值误差上限，三角划分不同则另外通过
ConstructionSurfaceQuery.hasSameGeometry 验证实际结构表面一致，不宣称字节相同。

验证：

- 29 项自动化测试通过（BuildingSceneGeneration 5、BuildingGroup 7、BuildingComponents 17）；
  覆盖 17 主体、重叠 ID 前缀、被拒绝附件、实际配置/粗模几何、重复身份及非初始化文档拒绝。
- Terrain noEmit 通过；声明生成 569 文件/2,282,080 字节；生产构建通过，仍有既有 chunk 提示。
- generated.html 开发版和静态生产版各通过 12 项真实 WebGL 检查：组件类型与父级、VFS、
  GPU 拾取、编辑保留邻居身份、撤销、删除、保存、新 Engine 重载及重载后撤销。此页实际
  保存 111 Entity/153 Component，包含 17 主体、5 组；删除的窗户不会被默认配方重新生成。
- 既有 extensions.html 静态生产版 126 项回归通过，覆盖围墙/栅栏/门灯、矩形与圆墙、
  挂点矩阵、墙洞、屋顶窗、表面修改、VFS 替换、禁用/删除/撤销及新 Engine 重载。
  两个成功页面控制台均 0 error/0 warning；生产截图均已实际查看。
- 保留初期失败日志：错误的默认值/候选拒绝假设、数值舍入比较、实际插值/缩放扰动，
  以及测试相机看向门立面而窗口被遮挡。拾取验收改从窗户外侧观察，未改生产 picker。
  既有 126 项验收超过一次 45 秒观察窗口，沿同一页面继续等待后通过，没有重启测试。
- 证据：output/building-scene-generation/（日志、result.json、7 份源码快照及 SHA256）。
  截图：output/playwright/building-scene-generation-production.png 和
  output/playwright/building-scene-generation-extensions-production.png。
  自建浏览器和4199静态服务已关闭；用户4173/8082未动，没有commit/push。

范围说明：这是原生初始化转换的独立集成验收，SeedWorldDemo 默认入口仍未切换。
下一步需将原生建筑接入地形/岩石/世界的原子发布，完成默认入口与编辑入口切换、退役旧
作者目录，并完成剩余建筑资产 VFS 化；本阶段不代表全目标完成，不包含真实 LLM 验收。


## 2026-10-26：原生建筑环境变更的原子发布边界

BuildingSystem 改为持有宿主交付的不可变已发布环境快照；bind({terrain}) 只设置初始值，
后续地形和岩石变化通过 prepareTerrain(next, signal) 进入一次事务。不再轮询 terrain 回调
并逐组暴露新旧混合状态，也不另建作者目录或克隆 Scene 组件作为候选。

- 普通编辑与环境事务共用 prepareView。环境候选只创建隐藏的派生网格，准备期间旧渲染、
  碰撞、灯光与作者身份继续有效；候选提供新结构 bounds/captureSurfaceQuery 给世界发布者。
- commit 同步切换几何、环境、结构查询与灯光；rollback 恢复原资源，finalize 才销毁被替换
  的旧资源；discard、取消和 Engine 销毁会清理未接受候选。提交/回滚/最终确认之间不应
  插入异步世界编辑。环境事务期间普通 flush 明确拒绝交叉发布。
- 准备后 Component/Transform 的变更通过当前修订校验使候选失效；验收覆盖组件属性变化
  后拒绝提交。候选不写 Source，环境发布保持原生对象身份和已有入场时钟。
- 原 PlannedMasonryTerrainUpdate 的区域样本检查移动到共享 ConstructionTerrainUpdate，
  原调用者和新组件链路共同使用 constructionTerrainAffects，旧模块删除，没有复制算法。
  未受影响的组保留原粗模/精细网格并更新已接受输入签名；影响范围或采样格点/解码、
  支撑集合变化时才重新准备。支撑集合变化仍保守影响全部组，未声称细粒度岩石优化。

验证：

- 56 项定向测试通过：生成转换5、组件组7、组件17、入场9，以及既有地形发布/附件生命周期18。
  Terrain noEmit 通过；公开声明生成569文件/2,282,080字节；生产构建通过，保留既有大chunk提示。
- 环境事务开发版/生产版各24项真实WebGL检查：无关区域不分配网格、候选隐藏、提交/回滚、
  资源延迟释放、取消、组件编辑使候选失效、失败保留当前状态、Source不增加作者副本、
  旧不可变碰撞快照、新Engine重载。
- 生产版真实地形接地44项通过：地形/岩石升高、移动/旋转、重载/撤销及连续环境更新，
  碰撞、GPU窗口和灯光坐标与原编译器对照一致。既有围墙/栅栏/门灯等126项组件编辑回归通过。
- 成功页面控制台均0 error/0 warning。126项回归超过一次45秒观察窗口，同一页面继续等待后
  完成；没有重启验收。所有结果是行为/几何验证，不是全世界性能或真实LLM验收。
- 证据：output/building-environment-publication/，包含结果JSON、日志、7份源码及SHA256、改前组件源码。
  output/playwright/building-environment-publication-production.png 与
  output/playwright/building-environment-publication-terrain.png 已实际查看；环境验收末尾相机
  保持原观察高度，升高后的建筑部分出画，不作为审美展示或完整场景截图。
  自建浏览器和4198/4199服务已关闭，用户4173/8082未动，未commit/push。

本阶段提供默认世界接入所需的可回滚原生发布接口。SeedWorldDemo 仍使用旧宿主，尚需替换
默认初始化/发布/编辑入口并退役旧作者资源；建筑资产仍未全量进入VFS。全目标继续执行，
楼梯不做，暂不开展真实LLM验收。


## 2026-10-26：Seed World 默认建筑接入原生组件（仍在迁移中）

默认启动现改为 Scene 中的 BuildingGeneratorComponent 完成一次初始化：沿用当前规划的原建筑配方与真实接受几何，生成房屋/边界、表面和附件的 Source Entity/Component。初始化标记属于 Scene；已接受对象之后只经原生编辑事务修改，删除对象不会因刷新重新生成。首次仍有“接受几何预览 + 原生管理器准备”的重复成本，未声称启动性能优化。

NativeBuildingHost 只绑定项目生命周期、身份、相机和已发布地形；BuildingSystem 管组件及派生网格。每次世界发布的 handle 不拥有另一份建筑作者数据，旧世界释放不会销毁仍在 Scene 中的建筑。完整世界发布接入 commit/rollback/finalize；岩石发布也增加回滚和最终释放。管理器增加独立可见性及结构修订，使隐藏候选、碰撞查询与接受时机衔接。

- 默认入口不再初始化 PlannedMasonrySystem/World/PlannedMasonry.json，也不再安装其编辑扩展；实际存档确认无该目录和组件。旧的独立 MasonrySystem 与“砌造”示例面板仍存在，尚未退役，不能称全部旧链路清理完成。
- 新“建筑组件”面板通过 entity.update/component.update/entity.delete/component.remove 与原生 undo 操作，提供查看、修改、删除、撤销；拾取直接返回 Source component identity（scene/entityId/id/type），聊天提交保留该身份。
- 预置 Script 模块导出 BuildingSystem 与主体、装饰、表面组件，声明重新生成。Source 模板新增生成节点并加入根节点集合；首次真实启动发现遗漏 rootEntities 后已修复。
- “查看对象”进入环绕视角时同步侧栏模式，避免 ROAM 按钮状态错误；这项最后的小改动通过类型检查，生产整页被下述已有资产问题阻挡。

验证与限制：

- 本阶段88项唯一自动化测试通过（生成5、组件17、世界发布47、农田11、规划Scene回归8）；Terrain noEmit 最终通过，公开声明572文件/2,298,628字节。不是完整PR CR。
- 开发默认入口实际加载 seed=1：46房屋、138表面、299窗、46门、46墙灯、8屋顶窗；截图实际查看。修改窗宽0.9→1.035并改名，撤销恢复0.9；删除/撤销总组件数583→582→583。再修改一窗并删除另一窗，重开后仍为582、名称保留、被删窗不复活；刷新后的宽度未另做数值复核。
- 正常漫游并开启拾取后，真实点击窗口得到 WindowComponent 和所属Entity；首次拾取超过10秒观察窗口，随后同页完成。查看对象的环绕模式关闭漫游输入，因此前两次该模式下的点击不能作为picker失败证据。尚未做受控帧率、主线程耗时或新旧性能对比。
- 成功开发页控制台0 error/0 warning。Vite生产编译通过；完整 Flash App 命令未通过：检查器要求内联Worker，而既有代码已使用module Worker。检查器和相关Worker源码与HEAD一致，未放宽校验。
- 真实静态生产页加载失败：assets/meadow-plant-materials.json 404。PlantSpeciesCatalog与Vite配置相对HEAD无变化，此故障此前已记录于V2实施记录；本轮未扩展修改植被打包，也未把开发通过称为生产通过。
- 证据 output/seed-native-buildings/（result.json、日志、源码快照/SHA256、已有生产故障基线比较）。截图 output/playwright/seed-native-buildings-focus.png、seed-native-buildings-selected-window.png 已查看。自建浏览器与4198/4199服务已关闭，4173/8082未动，无commit/push。

后续仍需替换旧独立创建/编辑入口并删除旧作者资源，完成剩余装饰目录/模板/示例地形资产VFS化，补回原默认开发建筑benchmark的原生版本，并解决默认生产验收阻挡。楼梯不做，本轮不开展真实LLM验收，全目标未完成。


## 2026-10-26：范围确认及窗洞 VFS 迁移中的类型收尾

用户确认楼梯本轮不做。继续保留房子、围墙、栅栏与门窗、灯等装饰的目标；不扩展楼梯实现。

窗洞 CPU 元数据转入建筑库 v5 的迁移仍在进行。本轮补齐三个测试文件构造 ConstructionUnitAssets 时遗漏的 windowCuts 字段，并为验证器回调补充 number 类型标注；未改变窗洞计算算法。首批6文件31项测试通过，本轮追加4文件26项通过，去重49项。Terrain noEmit 类型检查通过，日志见 output/building-window-cuts-vfs/typecheck-final.log。

这不代表窗洞迁移整体完成：模板与图集引用一致性检查、针对修改元数据的用例、公开声明刷新及浏览器资源替换验证仍待完成；无生产验收或性能结论。未 commit/push，未启动浏览器或服务，用户4173/8082未动。


## 2026-10-26：窗洞 CPU 元数据与 GPU 图集统一进入 VFS

建筑库严格升级为 tiny-glade-static-assets-v5，windowCuts 持有逻辑槽位到物理图层的映射与采样范围。ConstructionLibraryResource 的不可变快照提供同一份编译输入；普通墙、横向木墙、山墙、预览及 Worker 编译显式传递该资产。DecorationWindowCutBuffer 不再从代码里的旧图层表取默认值，缺少资产直接拒绝。原图层表/样本仅保留为离线导出输入及独立验收 oracle，不是运行时 fallback。

资源导入校验有限有序范围、纹理数组、图层范围与 GPU 编码容量；使用 windowCuts 动态存储的模板必须绑定同一 metadata atlas。GPU 图层可重排，CPU 搜索范围与 GPU 采样范围共同读取当前资源。默认 atlas 字节及原数值算法未改；本次没有新增楼梯或真实 LLM 验收。

验证：
- 本轮9文件53项自动测试通过，包括原始窗洞范围/GPU字节逐字节对照、VFS 修改后的搜索/采样范围与物理图层、错误资源拒绝和图集一致性。
- Terrain noEmit 通过；声明更新为573文件/2,300,024字节。
- 实际组件页开发与独立生产构建各133项检查通过。新增检查读取真实驻留 GPU 窗洞存储，证明修改 VFS 后 Worker 上传新范围/层号、旧资源快照不变、新 Engine 从保存项目恢复一致、撤销回到原值；既有主体/装饰/表面/屋顶窗拾取、编辑、禁用、删除回归通过。
- 静态生产木墙38个图层/视角用例、22个缩放用例、12个内部视角回归及9个单元调度检查通过；山墙10个用例和7个屏幕LOD检查通过。这些是现有独立渲染fixture，不是完整原游戏GPU像素等价或全世界性能结论。
- 组件页控制台0 error/0 warning；木墙页有一次 favicon.ico 404，未出现shader/WebGL错误。生产构建保留已有大chunk警告。未改动默认世界此前记录的生产检查器/module Worker及植被资产缺失问题。
- 证据 output/building-window-cuts-vfs/result.json、全部日志、源码快照/SHA256；output/playwright/building-window-cuts-{vfs-dev,vfs-production,wood-production,gable-production}.png 已实际查看。首次开发页等待45秒超时后同页继续执行并通过，没有重启。自建浏览器和4198/4199已关闭，4173/8082未动；未commit/push。

本节完成窗洞资产这一段，不代表建筑资产全量迁移完成。旧独立“砌造”入口、其余装饰网格/碰撞目录、示例模板/地形仍待迁移清理；全目标保持进行中。


## 2026-10-26：石框与石帽的查询几何使用实际 VFS 网格

ConstructionGeometryAssets 从当前建筑库的 stone-decoration 模板读取位置、索引及原生 bbx 变形坐标，得到不可变资源快照。结构相交查询、预览、细节/粗级渲染包围盒均显式消费这份数据，不再读取独立的 catalog-meshes 默认表。缺少所需模板立即拒绝；没有加入模块资源 fallback。原生噪声、变形、组装和材质算法保持不变。仅离线导出使用的 DecorationCatalogBuffer 移入 offline。

本段覆盖21个石框/石帽模板；复用已有53个VFS缓冲区，合计316,180原始字节，没有增加重复的查询网格资产。字节数不代表运行内存、CPU或帧率测量。其他装饰组装、安装范围、碰撞边界和默认尺寸仍有旧目录消费者，尚未完成全部81个装饰网格/26份碰撞边界的迁移。

验证：
- 两组自动化测试54项和32项通过，去除重复的3项后83项；包括全部21模板与独立原始数据逐项对照、修改VFS顶点改变结构几何/包围盒、缺失资产拒绝、资源和Scene组件回归。
- Terrain noEmit 通过；公开声明573文件/2,300,903字节。上一轮类型检查句柄丢失且进程已不在，本轮重新运行并取得exit 0，日志typecheck-acceptance-verified.log。
- 真实组件页开发和独立静态生产各139项通过。通过RuntimeEditor事务将实际石框和石帽网格向外改1米，Renderer包围盒同步改变，GPU拾取仍返回窗组件，结构相交点跟随；新Engine保存恢复和撤销同时恢复相同查询/几何。石框maxZ实际从3.274500113487244变为4.274500113487243。
- 首次开发验收失败是fixture只改了未使用的_hat_full变体，而石墙当前使用_hat。修正fixture覆盖实际变体，保持原断言；失败日志保留。后续等待超时均继续观察同一页，没有据此重开测试。
- 开发/生产控制台均0 error、0 warning，生产构建通过，保留已有大chunk提示。两张截图已实际查看；仅证明独立组件页，不代表默认Seed World整页生产通过，之前记录的module Worker检查器和植被资产问题仍待解决。
- 证据：output/building-decoration-catalog-vfs/result.json、测试/类型/构建/浏览器日志及源码快照SHA256；截图output/playwright/building-stone-geometry-vfs-{dev,production}.png。最后仅清理两处行末空白，不改变验证过的逻辑。

自建浏览器和4198/4199服务已关闭，用户4173/8082未动，无commit/push。楼梯及真实LLM验收不在本轮范围。后续继续其余装饰资产VFS化、旧独立砌造入口退役与完整默认世界验收，全目标仍未完成。


## 2026-10-26：26 份装饰安装碰撞边界进入 VFS

建筑库升级为 tiny-glade-static-assets-v6，新增 decorationCollisions 保存原始的26份安装/切洞体量。它们与可见网格包围盒不是同一语义，不能为简化迁移而用网格范围替代。ConstructionLibraryResource 的现有不可变编译快照把数据传入 Worker；普通门窗、转角窗、Cottage/Gothic/Arrow半屋顶窗和墙洞生成器均显式读取当前资源，保留原有几何公式和数值。运行时代码不再导入 collision-bounds.ts；原表只作为离线导出输入和独立测试oracle。

资产入口校验有限三维边界、严格正体量及未知字段；使用缺失条目时报明确VFS错误，没有内置数据fallback。仅在生成对应对象时读取其必需条目：专门验证了“删除门碰撞条目仍可生成窗，而生成该门报错”，避免无关对象形成额外资产依赖。公开声明及离线export-decoration-assets脚本同步更新，旧v5不保留兼容。

验证：
- 24个文件、216项去重自动测试通过，涵盖全部26份边界与原表精确对照、资源编辑影响门洞而不缩放可见门网格、普通/半窗分别选取边界、错误资源/缺失条目拒绝，以及墙体厚度、圆墙、转角、门窗/灯/表面/默认建筑组件回归。test-coverage.json保存每文件最后通过日志。
- 首轮167项中两项失败：旧厚度预览fixture未传资源；新测试把调整碰撞采样跨度后约1e-7的float32位置差误判为网格缩放。分别补齐显式资源输入、保留索引精确对照与顶点1e-6精度检查；原始默认数值对照未放宽。原失败日志保留，复跑和追加测试通过。
- Terrain noEmit通过；公开声明574文件/2,302,031字节。离线导出成功，119个装饰buffer/1,856,352字节，建筑主库444个buffer/101,724,224字节；本次碰撞数据是小型JSON元数据，没有添加新二进制网格。
- 开发页与独立静态生产页各144项实际WebGL验收通过。RuntimeEditor事务把门的VFS碰撞宽度扩大一倍，经真实Worker发布后21个原先被墙挡住的采样点变成开口；门保持独立组件拾取，旧资源快照不变，新Engine恢复和撤销得到相同结构查询。原有139项几何/灯光/变换/保存/删除等组件验收继续通过。
- 开发/生产控制台均0error、0warning；生产构建通过并保留已有大chunk提示。两张截图均实际查看。这里是独立组件页验证，不能代替默认Seed World完整生产验收，也未作性能或真实LLM验收结论。
- 证据output/building-decoration-collisions-vfs/result.json、测试/导出/类型/构建/浏览器日志及源码快照SHA256；截图output/playwright/building-collision-vfs-{dev,production}.png。

尚有7处旧目录运行时引用，集中在装饰网格组装和可见包围盒/默认尺寸（remaining-runtime-imports.log）。剩余资产、独立砌造入口退役、默认世界生产验收继续推进，全目标未完成。楼梯及真实LLM验收仍排除。自建浏览器和4198/4199服务已关闭，4173/8082未动，没有commit/push。


## 2026-10-26：81 个装饰网格进入 VFS，完整验收仍有拾取失败

建筑库升级为 `tiny-glade-static-assets-v7`。81 个装饰网格的顶点、索引、UV、法线和附加原生属性进入二进制 VFS 资产；保留原 f32/f64 精度，未使用的网格按需解码。装饰组装、可见范围、屋顶安装和默认尺寸从当前资源读取，不再从旧 catalog 取值。能力名称、支持的类型和材料仍由组件代码定义，不把业务契约混入网格。独立放置的灯也显式接收同一份资产。

与石框/石帽 GPU 模板共享的位置和索引使用模板引用，模板换 Buffer 后 CPU 查询和组装跟随同一引用；没有复制一份可独立漂移的资源路径。其余属性去重后打包为一个新 buffer。旧 catalog 只保留为离线导入源和独立对照测试；生产构建检查模块图，拒绝把旧网格/边界表打进运行产物。无 v6 兼容或默认资产 fallback。

本轮验证：
- 33 个文件、360 项去重自动测试通过；逐项对照全部81个模型的几何、索引、UV和边界，覆盖当前资产尺寸、GPU模板引用替换、Worker可序列化快照、缺失/非法资源、门窗/屋顶窗安装与编辑发布。测试夹具遗漏的显式资产参数已补齐；负向测试仍验证缺少资源必须拒绝。原失败日志保留。
- Terrain noEmit 最终通过；公开声明生成573文件/2,303,530字节。导出结果为445个主库buffer/105,230,912字节；字节数不是内存或性能测量。
- `extensions.html?case=assets` 开发和独立静态生产各11项实际WebGL检查通过：石框/石帽顶点修改同步改变Renderer和结构查询；合批灯具的网格修改经Worker改变实际渲染，GPU仍按批次内ID拾取到灯组件；两类编辑均保留旧快照、新Engine恢复和撤销。灯具批次maxZ由3.7504242386变为4.3946405311。没有拆分灯具draw。
- 两个资产专项页面控制台均0error/0warning，截图已实际查看。生产构建通过，模块图确认没有旧装饰网格/边界表；保留已有大chunk提示。

**完整组件验收本轮没有通过。** 默认验收入口在“窗 Entity 移动后、未等待重建时独立墙体窗框GPU拾取”失败。独立只运行外观流程也可复现；诊断显示Renderer移动前后均启用、活动、未销毁且仍注册window-c。上一轮保存的v6生产产物在相同断言也失败，新旧已有模板/着色器元数据一致。证据排除了“只有本轮网格迁移才会触发”，但尚未确定根因，不能据此宣称Engine矩阵或拾取实现有问题。原断言保留；新增`case=assets`只用于明确边界的资产验收，结果标注scope，不替代完整验收。

证据：`output/building-decoration-meshes-vfs/result.json`、test-coverage.json、测试/类型/构建/浏览器日志、pick-diagnosis.log、baseline-browser.log及源码快照/SHA256。截图`output/playwright/building-mesh-vfs-{dev,production}.png`；失败截图另存。当前未解决项包括上述移动拾取失败、旧独立砌造入口及示例资产退役、默认世界完整生产验收（此前记录的Worker检查器/植被资源问题）。全目标保持进行中。楼梯与真实LLM验收排除；临时浏览器及4198/4199服务已关闭，4173/8082未动，无commit/push。


## 2026-10-26：纠正两处 LOD 期间的拾取验收误报，完整组件验收恢复

上一节的“窗移动后独立墙体窗框拾取失败”经实际 GPU 像素对照，确认是验收采样缺陷，并非已经成立的 Engine 变换或产品拾取 Bug。固定世界坐标网格间隔 0.075 米，投影后约跨 8 个像素；LOD crossfade 中的抖动覆盖与墙体遮挡共同使所有样点落空。异常帧仍有 837 个可见 ID 像素，实际像素 (968,776) 经正式 picker.pick 返回 window-c，CPU 世界矩阵与 GPU 模型矩阵都正确移动 0.5 米。无须重建或等待下一帧。圆墙处另一个相同采样断言也复现“稀疏采样 false、可见像素拾取 true”，覆盖率约 0.127。

只修正 extensions.ts 的两处断言：从保留完整场景深度的真实 ID pass，在目标 Renderer 的投影范围内找到可见像素，再通过正式 pick 接口验证组件身份。目标仍须注册为唯一单对象批次；不可见或身份错误仍失败。测试读取私有纹理只用于定位采样点，不替代正式拾取断言，不改产品深度/透明度/LOD，不推进 Engine tick，也不等待几何重建。其余测试和产品实现不变；旧 probe 插桩保留在 output 证据中，已从源码移除。

验证与边界：
- Terrain noEmit 通过（typecheck-final.log，exit 0）；对照上一轮快照 263 文件相同，仅验收页面改变，复用已验证的360项相关单测，本轮未重复执行。
- 开发完整流程149项通过，含圆墙对照插桩；移除插桩后的最终静态生产版本149项通过，结果 scope=full。最终移动窗框/圆墙覆盖率分别约0.226/0.032，正式拾取都返回window-c。
- 生产构建成功，模块图继续拒绝旧装饰网格和边界表。开发与生产控制台均0error/0warning，两张真实渲染截图已查看。构建仅覆盖独立组件验收页，不能代替默认Seed World完整生产验证。
- 证据 output/building-pick-diagnosis/：pixel-probe4.log、round-full-final.log、production-full-result.json、acceptance-fix.diff、prior-source-comparison.json、构建/类型/控制台日志和source-sha256.json。截图 output/playwright/building-pick-diagnosis-{dev,production}.png。历史失败日志保留，本节以新证据纠正其归因。

全目标仍未完成：旧独立砌造入口仍拥有作者文档；三份建筑示例与示例地形仍由ConstructionRuntime直接加载；NativeBuildingPanel尚缺示例创建/放置入口。后续需将这些能力接到Source组件和VFS后退役旧路径；默认Seed World完整生产验收仍需处理既有Worker检查器与植被资源路径失败。楼梯和真实LLM验收排除。临时浏览器及4198/4199服务均关闭，用户4173/8082未动，无commit/push。


## 2026-10-26：建筑预设进入 VFS，经原生面板创建独立 Scene 对象

三份原示例（圆方 Gothic、双圆屋连接、山墙交接）离线导出为标准 v2 Prefab，注册到 Building/Presets/*.prefab。NativeBuildingPanel 从同一个原生编辑事务读取当前 VFS Prefab 和 Scene，复制 Entity/Component 身份及内部引用，再经 asset.update / prepare / commit / activate 发布。资源引用仍共享；预设是创建模板，修改它只影响以后的副本，不反向修改已有 Scene 对象。共同身份前缀保留主体的相对排序，避免相邻建筑接触顺序变化。Seed World 默认工程加入预设描述符，初始工程键更新为 native-buildings-v2；旧本地工程未删除，也没有增加格式兼容分支。

保真处理：
- 原示例未绑定墙面铺设，原生 House 默认会铺砖。BuildingSurfaceComponent 新增 placementEnabled，显式关闭可选的 wall/foundation 铺设，保留主体几何；禁用或移除该组件仍恢复主体默认铺设。屋顶与围合面不可关闭。关闭时保留作者配置/区域，恢复启用后重新消费；inspectPublished 返回零铺设单元。
- 原文档省略 seed 时实际使用 identity_order 中的槽位加一。导出到 Source 时固化这个实际值，装饰种子同步消费，不能一律写零。
- 原圆形相位经 Entity float32 矩阵恢复会产生约 1.5e-8 弧度差异，可导致接缝裁剪相差一个三角形。独立对照原示例，在两侧所有顶点与三角形重心采样到对方网格的距离，三组最大偏差 1.758824009934067e-7 米（断言阈值 1e-5 米）；铺设组/单元数、部件数量、材料和颜色集合保持一致。此为几何采样等价证据，不声称二进制三角形完全一致。

验收结果：
- BuildingPresets 7、BuildingSurface 6、BuildingSceneGeneration 5、BuildingComponents 17，共35项相关自动测试通过。首次严格拓扑比较失败及测试助手读取可选 colors 的失败均保留日志，最终修正后通过。
- Terrain noEmit 最终通过。公开声明生成573文件/2,303,951字节。最终独立生产构建257文件/160,167,728字节；模块图检查拒绝旧装饰网格/边界目录，检查通过。构建的大 chunk 提示保留，不代表性能已验收。
- 预设开发页与生产页各24项真实WebGL检查通过：正式面板创建三组预设、实际组件与位置/种子、GPU拾取、未绑定墙面零铺设、编辑VFS影响下一副本、已有副本不变、新Engine恢复8栋房屋与相同结构范围。
- 完整组件开发验收154项通过；最终静态生产版154项通过，包含关闭墙面铺设、保存重载、重新启用、撤销，以及既有围墙/栅栏/门窗/墙灯/屋顶窗/变换/资产/碰撞回归。生产两个页面均0error/0warning，三张截图已实际查看。
- 开发首轮在圆墙精细窗框拾取断言失败；它发生于LOD淡入，首轮未记录失败帧fade，不能断言该帧的确切原因。同代码加入诊断后，圆墙fade约0.0354时有297个可见ID像素，正式拾取正确，154项通过。Shader证实fade低于首个抖动阈值时精细Renderer允许零覆盖。最终验收先等待显示稳定，再检查单个精细窗框；移动矩阵测试仍在设置Transform之后、不执行任何tick/flush/await就断言范围与正式拾取，未放宽即时跟随契约。生产最终两处fade均1，分别3517/6267个可见像素，身份均window-c。保留失败日志，不把推断写成已捕获的失败帧证据。

证据：output/building-native-presets/result.json、源码快照/source-sha256.json、tests-final.log、typecheck-final.log、build.log、开发/生产结果与控制台日志；截图 output/playwright/building-native-presets-{dev,production}.png 和 building-native-extensions-production.png。

边界与下一步：当前新面板创建位置为相机XZ、世界Y=0，宿主地形负责原生接地；尚未接入旧入口的有限陆地搜索命令。旧“砌造”面板、MasonrySystem作者资产和直接加载旧示例/地形的运行路径仍未退役，不能把已有原生创建入口宣称为完成统一。需把陆地放置/适应地形和必要编辑操作接到原生链路后删除旧入口与格式。完整默认Seed World生产验收尚未完成；之前记录的inline Worker检查器与植被manifest路径问题本轮没有修改或重验。楼梯与真实LLM验收继续排除。全部自建浏览器及4198/4199服务已关闭，4173/8082未动，没有commit/push；总体目标保持进行中。


## 2026-10-26：原生陆地放置、旧砌造入口退役与默认世界验证

BuildingPlacement 从事务内的当前 Source Entity/Component 读取形状、活动状态和层级变换，临时计算整组占地；没有新增作者目录或持久化位置副本。沿用旧命令的有限候选策略（相机/出生点、8圈、每圈16方向），只接受所有采样点有地形且不在水中的候选。结果仅写组 Entity 的局部位置，保留层级、组件身份及外观。查询考虑父级旋转和当前组件配置，默认形状由组件与查询共用的函数/值类型构造器提供。该策略只证明采样点在陆地，不保证无障碍物、无重叠或全局可行性；没有增加自动移开其他对象的行为。

NativeBuildingPanel 支持“在附近陆地创建副本”和“整组移到附近陆地”；前者在创建 Scene 对象前完成查询，找不到位置时不留下半成品，后者通过 BuildingSystem.groupEntity 获取实际编译组，再用同一 Scene 事务修改。原生建筑一直使用宿主地形，旧 adaptTerrain 只是旧格式的模式切换，已无需重复作者状态。发布地形/岩石支持变化仍由 NativeBuildingHost/BuildingSystem 原有公共链路更新。原来的材质临时预览面板移入原生入口，保持临时预览语义。

SeedWorldDemo 删除旧 MasonryComponentHost、作者资产初始化、独立面板、Agent 扩展和相应生命周期分支；MasonryPanel.ts 与 PlannedMasonryPanel.ts 已删除。SeedWorldProject/Formats 不再注册旧建筑资产类型，Script runtime 不再导出 MasonrySystem/PlannedMasonrySystem，改为使用原生主体/装饰组件；声明示例、Script Worker 验收及 subjectView 的旧接口说明同步修正。默认工程键为 native-buildings-v3，不读取旧格式，也未删除旧本地工程。这里退役的是产品入口；原旧实现及其历史测试文件还在，不能宣称源码已全部清理完毕。

验证：
- BuildingPlacement 6、BuildingPresets 7、BuildingComponents 17、BuildingGroup 7、PresetSystemScript 3，共40项通过。覆盖完整占地/父变换/禁用对象/类型默认值/有限失败不改作者数据/当前配置变化，以及既有几何和脚本类型检查。Terrain noEmit通过。
- 公开脚本声明从上一阶段573文件/2,303,951字节收敛为106文件/275,073字节，移除了旧作者接口的依赖图，不据此声称运行性能提升。
- 开发和独立生产预设页面各29项真实WebGL检查通过，含原24项，以及整组移动、身份、撤销、无陆地原子失败、真实Script Worker编译与原生House/Wall实例身份、隔离会话拒绝未注册模块。两页控制台均0error/0warning；截图已实际查看。上一阶段154项完整组件回归不重复执行，本轮没有修改几何、Shader或LOD算法。
- 完整开发Seed World seed=1启动成功：46 House、138 Surface、299 Window、46 Door、46 WallLamp、8 GothicDormer；旧面板不存在。通过正式新面板在实际地形创建预设后48栋房屋，刷新仍保留同一新组件ID与48栋计数。控制台0error/0warning，真实世界与新建筑截图已查看。
- 独立生产构建282文件/178,037,325字节；完整默认世界构建895文件/314,796,471字节。两个模块图门禁均确认没有旧建筑作者接口；完整世界仍是原有生产Vite配置，加了只读模块图门禁，未改产品打包规则。首次构建命令配置路径错误在正确工作目录重建后通过，错误日志保留。
- **完整默认世界生产运行仍失败**，在创建地形与植被阶段请求 /assets/meadow-plant-materials.json 得到404。新构建再次复现此前记录的问题。PlantSpeciesResources.ts 从打包后索引URL的目录拼原文件名，运行依赖没有部署在这些相对路径；后续需补齐植物catalog及递归资源的生产解析/打包。当前不能把开发完整世界或生产独立页面的通过算作生产世界通过。Flash App的inline Worker检查器问题本轮未修改，也未宣称该门禁通过。

证据：output/building-native-placement/result.json、tests.log、typecheck.log、declarations.log、build.log、world-build.log、开发/生产页面日志与source-sha256.json。截图 output/playwright/building-native-placement-{dev,production}.png、building-native-placement-world-dev.png。

剩余工作：完整世界生产资源问题、ConstructionRuntime 中仍存在的旧示例/示例地形直接加载路径，以及产品外遗留作者实现/测试清理。总体目标未完成，楼梯与真实LLM验收排除。自建浏览器和4198/4199服务已关闭，4173/8082未动，无commit/push。


## 2026-10-26：生产资源依赖闭包修复，完整默认世界生产验证通过

此前完整生产世界在植被阶段请求 meadow-plant-materials.json 返回404，阻止了默认建筑的完整环境验收。根因是 Vite 只看到 PlantSpeciesResources 中的索引静态 URL，把索引改为哈希文件，却未发现后续拼接的参数/材质/纹理地址；相对引用也包含跨到 Terrain/data 的路径。

新增 PlantSpeciesProductionAssets 构建插件，将实际使用的 catalog 固定发布到 assets/plant-species/asset-assembly/generated/procedural-trees/plant-species.json，并按 catalog 的明确字段收集依赖，保留相对于 Terrain 的目录关系。material manifest 的纹理查询参数保留在原数据中，文件发布时按无查询参数的实际路径读取。资源解析必须留在 Terrain 目录且文件必须存在；只在包含该运行时索引的构建中发布47个依赖，不递归复制离线测量报告。材质中的虚拟资源名仍归原有引擎资源注册表负责，未把它们误当HTTP相对文件。没有修改植物或建筑的几何、材质、LOD、运行时加载契约。

验证：
- PlantRuntimeResources 两项通过：现有源资源闭包，以及使用真实 Vite 配置/真实浏览器入口模块的最小生产构建，逐项解析嵌套部署前缀下的 catalog、material manifest、参数、树木跨目录纹理和灌木资源。首次测试因 macOS /var 到 /private/var 的临时目录实路径差异导致 Vite HTML 输出路径报错；规范化临时测试目录后通过，失败日志保留。
- Terrain noEmit通过。完整世界生产构建941文件/323,021,353字节；模块图确认没有已退役的旧建筑作者入口。本轮未重新运行几何未变的154项独立组件验收，不用两项资源测试替代它们。
- 实际静态生产 Seed World seed=1 加载成功：46 House、138 Surface、299 Window、46 Door、46 WallLamp、8 GothicDormer。正式面板聚焦默认房屋，实际看到墙面、窗框和瓦片；截图已查看。
- 正式面板创建圆方Gothic副本后48栋房屋，资产引用仍为 Building/Native/library.json。刷新生产页面后再次ready、仍48栋，原新建组件83cd4fe6-6bb1-4779-95c4-3af4a8652334/component-000000保留。新建组截图能看到屋顶细节，但相邻主体遮挡，不能凭该截图宣称整组所有表面可见。创建/保存/恢复另有组件结果证据。
- 开始加载及刷新时45秒观察窗口曾超时；同一浏览器继续运行后成功，没有重启或使用超时结果替代最终结果。聚焦时一次默认5秒截图超时，后续相同页面截取成功。未做启动耗时或帧率验收。控制台0error/0warning。

证据：output/building-production-resources/result.json、tests.log、typecheck.log、world-build.log、browser-ready-final.json、create-result.json、reload-final.json、console-all.log、源码快照及source-sha256.json；截图 output/playwright/building-production-{world-default,default-house,created-house}.png。

本节消除上一节的生产世界404阻断，不代表总体迁移完成。尚需清理 ConstructionRuntime 内的旧示例/示例地形直接加载路径、产品入口之外的旧作者实现及相应测试，并完成全范围验收审计。Flash App 打包脚本的 inline Worker 检查器不匹配仍未修改或验证，普通静态生产页面通过不等于该发布门禁通过。楼梯和真实LLM验收排除。自建浏览器和4199服务已关闭，4173/8082未动，无commit/push。


## 2026-10-26：建筑编译明确消费宿主地形，移除共享运行时示例加载

ConstructionRuntime 删除原 cottage 地形 URL、隐式 fetch 缓存和 loadMasonryExample。prepareMasonry 必须接收明确的 host_terrain 与宿主字段；独立组件预览由 BuildingSystem 提供明确的平地字段，产品使用当前世界地形。校验发生在资源准备前；资源异步准备后再次核对地形 revision，过期则拒绝编译，保留 GPU 发布前的版本检查。避免在等待 VFS 资产期间切换地形却复用旧字段。旧示例 JSON 只由产品外的历史作者/对照测试直接引用，不再由共享运行时暴露加载接口；这不代表旧作者文件已物理删除。

移除运行时的偶然 vite/client 引用后，声明构建脚本显式把当前 Gallery 的 Vite 类型作为编译根输入，不再依赖某个业务文件携带环境类型。旧组件参考测试在隔离会话自行注册旧格式，产品格式注册没有恢复。

验证：
- 49 项独立自动测试通过：BuildingComponents 17、BuildingGroup 7、BuildingPresets 7、ConstructionEntrancePublication 7、历史 MasonryComponent 对照 11。覆盖无宿主字段拒绝、资源准备期间地形过期拒绝及既有组件/连接行为。保留所有失败与修正日志，不重复累加重跑数量。
- Terrain noEmit、额外 building-features-runtime 类型检查、公开声明生成通过；公开声明 106 文件 / 275,073 字节。
- 原生完整静态生产组件页 154 项真实 WebGL 检查通过，控制台 0 error / 0 warning。旧特性对照生产页也通过：屋顶变化112418像素、材质变化42392、局部编辑1097、原生灯光18047；detailFailures/renderFailures 均0，errors为空。对照页控制台仅 favicon.ico 404。
- 对照页首次比较失败暴露测试在接受编辑后、几何尚未发布时读取旧画面；改为等待该目标 warmup 完成后再比较，像素阈值未放宽。显式宿主地形移动的缓存检查也已更新：改变世界占地需要重编译，不能沿用原示例地形的整体移动复用假设。历史失败截图和日志保留。
- 独立生产构建293文件/201,485,857字节；完整默认世界生产构建937文件/322,489,089字节。模块图确认产品无旧作者入口、原示例 JSON/cottage 地形、旧装饰网格/碰撞目录。完整世界浏览器结果沿用上一节已通过的实际生产创建/刷新，本节未重跑完整世界浏览器，不以构建替代运行验证。
- 两张生产截图已实际查看；自建浏览器与4199服务已关闭，用户4173/8082未动。

证据：output/building-host-terrain/result.json、browser-result-final.json、features-result-final.json、各测试/类型/构建日志、source-sha256.json；截图 output/playwright/building-host-terrain-{production,reference}.png。

总体目标仍未完成：产品外旧作者实现与测试仍需收敛，并需最终全范围审计。Flash App inline Worker 检查器不匹配尚未验证，普通静态构建不等同于该发布门禁。楼梯和真实LLM验收排除，无commit/push。


## 2026-10-26：默认生成配方与旧建筑作者格式解耦

新增 BuildingInitialRecipe，将纯初始生成从 PlannedMasonrySource 提取出来。NativeBuildingHost 和原生 generated 示例直接调用 initialBuildingGroups；入口只消费已发布规划，不接收旧建筑 edits，不解析旧存档。房型、接触分组、种子、材质及默认装饰算法保留。生成只在 BuildingGeneratorComponent 尚未初始化时执行，后续编辑和重载仍消费 Source Scene 组件；没有新增持久化目录、兼容读取或产品 fallback。

旧 PlannedMasonrySource 的历史参考消费者暂时仍在，它复用同一初始生成后处理自己的旧编辑数据，生成算法不再有两份；旧作者源码及独立参考页面的物理清理仍未完成。生成分组类型独立于旧编辑契约。接地测试改为显式提供真实 VFS 几何资源，原地形/岩石/Worker 字段一致性断言保留。

验证：
- 修改前实际运行旧生成器，记录 seed=0/1/42 的完整规范化输出摘要；拆分后的三组摘要逐字节一致，覆盖矩形/圆形房屋、连栋、围墙、栅栏、装饰、材质、顺序和身份。另验证输出与规划输入及下一次初始化互不共享可变状态。基线不是用新函数自比。
- 126 项独立自动测试最终通过：BuildingInitialRecipe 4、BuildingSceneGeneration 5、PlannedMasonryPublication 68、PlannedMasonryConfigurationAuthority 14、PlannedMasonryPlasterExtent 4、BoundaryPlacement 9、ConstructionGrounding 3、PlannedBuildingManager 19。首轮125通过，接地测试缺显式VFS资源失败；修正fixture后该文件3项通过，没有放宽原断言。Terrain noEmit通过。
- 原生初始化独立生产构建250文件/159,581,914字节；完整Seed World生产构建937文件/322,481,770字节。模块图门禁确认两者无PlannedMasonrySource、旧参数覆盖/存档解析，以及既有已退役作者入口；没有原示例JSON或隐式cottage地形。独立页范围与上一节不同，不比较两者文件数作为优化收益。
- 实际静态生产初始化页12项WebGL检查通过：17个主体，真实VFS引用，门窗灯和屋顶窗组件，装饰Entity归属，Worker无网格错误，默认窗户GPU拾取，房屋编辑保留邻居身份，撤销，删除装饰，新Engine从Source恢复且不会重新生成已删除装饰，恢复同一装饰身份。页面截图已实际查看。
- 完整生产Seed World seed=1重新加载ready：46 House、138 Surface、299 Window、46 Door、46 WallLamp、8 GothicDormer，与此前基线一致。正式面板聚焦默认房屋，截图可见原有圆房、屋瓦、窗框与墙面。两页控制台均0error/0warning。完整世界本节重验启动与显示；创建/刷新验收沿用前一阶段，未将其计为本节重测。
- 核对当前合并后的VFS清单：主体库与平屋顶库合计533个Buffer/131,794,912字节，逐文件SHA-256与大小匹配；主体库36个模板、81种装饰。之前445个Buffer的记录只对应主体库，不是合并平屋顶库后的总数。

证据：output/building-initial-recipe/result.json、baseline.log、PlannedMasonrySource.before.ts、tests.log、grounding-tests.log、typecheck.log、生产构建/浏览器日志、vfs-integrity.json、source-sha256.json。截图 output/playwright/building-initial-recipe-{production,world}.png。

总体仍未标记完成：旧作者实现与参考页尚存于产品依赖图之外，仍需物理清理与最终范围审计。Flash App inline Worker 检查器仍未验证；本节只验证普通静态生产构建。楼梯与真实LLM验收排除。所有自建浏览器和4199服务已关闭，4173/8082未动，无commit/push。


## 2026-10-26：补齐原生屋顶窗、活板门、屋顶灯及小屋顶拾取

保留 tiny-glade 已实现的屋顶附件生成器，新增 RoofWindowComponent、RoofHatchComponent、RoofLampComponent。它们继承 RoofDecorationComponent / SizedDecorationComponent / DecorationComponent；墙面装饰复用尺寸、rank、类型校验，仍保留自己的 seed 和 Entity 挂载位姿。屋顶附件的唯一挂载状态是组件 uv/elevation，子 Entity 局部变换保持 identity，禁止再叠加一份位姿。组件生命周期、Scene 事务、撤销、资源引用和派生灯光继续走 BuildingSystem。生成 Scene 时按目录定义的 host/purpose 实例化相应组件，未恢复旧作者目录。

Cottage/Gothic 普通屋顶窗的小屋顶瓦片现在携带装饰 ID。预览和 Worker 细节按装饰分组，窗框与小屋顶共享同一组件身份；顶点、原始瓦片记录、宿主材质/编辑图表与生成算法未改。每个小屋顶内部仍批量绘制，不创建逐瓦片组件。资产继续复用 VFS ConstructionLibrary，公开 Script 声明已重新生成。

验证与证据：
- 64 项独立自动测试最终通过，包含新增 BuildingRoofDecorations 8 项与原生组件/Scene 生成/初始配方、Cottage/Gothic/平屋顶生成器回归。首轮 63 通过、1 项完整几何对照超过 30 秒；同一测试文件单独重跑 5 项通过（几何对照 27.8 秒），未调整断言或超时。保留失败日志。
- Terrain noEmit 及修改后的浏览器 fixture noEmit 均通过；Script 声明 106 文件 / 277149 字节。
- 屋顶专项开发页面 84 项真实 WebGL 检查通过。最终静态生产完整组件页 238 项通过（原有 154 项 + 屋顶 84 项），覆盖两种活板门、两种尺寸可调屋顶窗、屋顶灯，实际 GPU 拾取、挂点/尺寸编辑、PointLight、禁用/删除/撤销、新 Engine 保存恢复。运行 metrics.errors 为空，控制台 0 error / 0 warning。
- 首次浏览器失败为旧测试辅助函数只检查 batch.resolve(0)，遗漏合批其他槽位；改为遍历实际槽位，并补上重载后的真实 GPU 拾取，未修改生产逻辑或放宽验收。
- 静态生产构建的模块图门禁通过：没有旧作者入口、原示例 JSON/隐式 cottage 地形、旧装饰网格/碰撞目录。生产截图已实际查看。未重跑完整 Seed World，不能把组件页结果替代全世界验收，也未声明性能改善。

证据：output/building-roof-components/ 的测试、类型、声明、构建日志、browser-{dev,production}-result.json、源码快照和摘要；截图 output/playwright/building-roof-components-{dev,production}.png。开发截图恰在撤销后的背面视角，不作为全部屋顶附件的展示图；可见性由实际 ID 像素拾取检查佐证。

整体仍未完成：opening-arch 拱形洞口尚未接成原生组件，需保留已有石拱/木拱生成及墙洞能力后再清理旧作者实现。最终全范围审计未完成，Flash App inline Worker 发布检查器尚未验证。楼梯和真实 LLM 验收不在本轮范围。未 commit/push。


## 2026-10-26：拱形洞口原生组件与石/木拱身份

新增 OpeningComponent，继承 WallDecorationComponent；Source 子 Entity 的墙面位置/正缩放及组件宽高/种子驱动原有 opening-arch 生成器。保持落地洞口约束（局部 y 必须为 0），不新增悬空或倾斜切洞算法。墙面有效材质决定石拱/木拱，仍遵守既有铺设绑定的材质优先级。Scene 初始化按已接受的生成结果创建 OpeningComponent，公开 Script 导出及声明同步更新。

将装饰 ID 从原有石拱记录、木拱横梁/斜撑/立柱贯穿到预览和 Worker 细节，按拱洞保持独立拾取；每个拱洞内部的原生单元仍批量绘制。没有修改石拱/木拱几何算法和原生记录字节。无墙面铺设绑定时，距离表现保留原生石拱记录，与细节路径保持一致，而不伪造一个作者表面绑定。石拱作者存在性从已接受的结构组判断；隐藏全部拱框铺设只改变可见单元，不删除组件或填回开口。两种拱洞继续使用 VFS 的主体库/程序/纹理，没有新增直接资产 URL 或旧格式读取。

验证：
- 58 项独立自动测试最终通过：BuildingOpening 7、BuildingComponents 17、ConstructionArchIntegration 10、ConstructionStoneArch/ConstructionWoodArch/WoodArchRender/WoodArchGeometry 合计 24。覆盖两种材质、有/无铺设绑定、同房多个独立拱洞、隐藏拱框、原有圆房/矩形房墙洞与地板约束、原生几何及渲染打包。首次新增木拱用例仍绑砖墙，正确生成了石拱；修正测试为木墙绑定后通过，未修改材质优先级或放宽原断言。
- 两次 Terrain noEmit 通过；公开声明生成 106 文件 / 277613 字节。生产构建及既有模块图门禁通过，没有旧作者入口、原示例 JSON/隐式示例地形或旧装饰网格目录。
- 静态生产专项 40 项真实 WebGL 检查通过；完整组件页 278 项通过（原有 238 + 拱洞 40）。覆盖实际墙面穿过查询、GPU 独立拾取、连续两次移动、尺寸/种子、无铺设绑定、拱框隐藏/恢复、非法悬空拒绝、修正后恢复、禁用/删除补回墙体并保留另一拱洞、撤销、新 Engine 保存恢复。metrics.errors 为空，两个页面控制台均 0 error / 0 warning。
- 完整页的一次 45 秒观察等待超时，同一浏览器继续运行后完成 278 项，没有重启测试或把观察超时当作终止。
- 增加可见的“添加拱形洞口”按钮，实际 Scene 事务创建石拱截图已查看。测试自建浏览器和4199服务关闭，4173/8082未动。未重跑完整默认世界浏览器，不把组件页等同于全世界验证。

证据：output/building-opening-component/ 的 result.json、browser-{opening,full}-result.json、测试/类型/声明/构建日志、源码快照及source-sha256.json；截图 output/playwright/building-opening-component-{production,verified}.png。

本节补上此前确认的最后一个目录类型入口缺口；不代表整体目标已经完成。旧作者文件/参考测试仍待物理清理，全部系统与资产边界的最终审计仍需完成。Flash App inline Worker 发布检查器尚未验证；楼梯和真实 LLM 验收仍排除。无 commit/push。


## 2026-10-26：世界发布边界直接使用原生建筑

`PlanningSeedScenePublication.masonry` 直接使用 `NativeBuildingWorld`，删除旧 `PlanningMasonryProjection` 的新旧类型混合声明。建筑候选的 commit/rollback/activate 以及岩石支撑候选的 rollback/finalize 是完整契约，不再通过可选方法兼容旧集合。SeedWorldDemo 不再逐帧调用空 update，也不再调用空 flushAuthoring；BuildingSystem 的 Engine 驱动与原生 Scene 事务负责实际工作。ConstructionStartup 几何测试改用真实的 BuildingInitialRecipe。

验证：
- 87 项去重自动测试通过：PlanningSeedScenePublication 51、保留的旧支撑算法/所有权参考用例28、ConstructionStartup 4、BuildingInitialRecipe 4。发布用例实际使用 NativeBuildingWorld，覆盖 Water 拒绝时回滚、旧世界句柄退场不销毁 Scene 建筑、拾取 owner 切换，以及岩石支撑接受/丢弃/失败/取消。
- 旧支撑测试的 GPU 替身遗漏了 VFS 编译资产，已补齐。移除3条仍把旧 Collection 当成产品发布对象的集成用例，原文保存在证据目录；不为它们恢复旧产品接口。旧作者自动清理/异步补网格语义不再作为原生 Scene 的验收契约。其资源回滚/保留职责由原生发布测试和下述真实环境事务覆盖；其他旧参考用例仍待迁移清理。
- Terrain noEmit通过。首次新增测试有循环闭包类型推断错误，补显式 NativeBuildingWorld 类型后通过，未改变运行逻辑。
- 静态生产 groups?environment=1 的24项WebGL检查通过：隐藏准备、画面/碰撞共同提交、回滚旧网格、取消/过期拒绝、保留对象身份和Source、Worker驻留、新Engine恢复。metrics.errors为空，控制台0error/0warning。截图已查看；验证结束视角裁切房屋，不作为完整外观展示。
- 完整静态生产Seed World seed=1达到ready：46House、138Surface、299Window、46Door、46WallLamp、8GothicDormer，共583组件。通过可见面板把房屋poi-large-1:volume:0高度3.677703380584717改为4.177703380584717并改名，保存并刷新后身份、完整属性和组件总数一致；随后恢复测试修改。默认建筑近景截图已查看，运行建筑错误为空。
- 组件构建250文件/159619426字节；默认世界构建937文件/322489541字节。已有模块图门禁均通过，产品不依赖旧作者入口。最初静态服务根目录设置错误导致脚本404，改为构建根后验证；未改产品来适配错误服务路径。

证据：output/building-native-publication-boundary/ 的测试、类型、构建、environment-result.log、world-restore-verification.json、源码快照及摘要；截图 output/playwright/building-native-publication-{environment,world}.png。

整体目标仍未完成：旧作者实现/剩余参考测试的物理退役与全范围最终审计尚未完成，Flash App inline Worker发布检查器尚未验证。本轮没有新增几何算法或性能调参，不宣称性能改善。楼梯、真实LLM验收排除；未commit/push。


## 2026-10-26：旧建筑作者入口物理退役

默认产品已走 NativeBuildingHost / BuildingSystem / Source Scene / VFS，本节删除产品图之外仍保留的旧作者实现、存档格式、声明生成器及绑定旧类的测试入口。共退役82个文件：34个旧作者入口/文档/脚本、28个旧诊断页及辅助模块、20个旧API测试/夹具/用例文件。删除前完整源码、SHA256与测试标题保存在 `output/building-legacy-retirement/before/` 和 `retired-files.json`，不是新增运行兼容层。

几何断言保留：原始编译输入冻结为测试夹具；18个相关Vitest文件不再调用旧作者修改器。另从旧planned测试中迁出13项有效的几何、资源租赁及局部发布断言到 ConstructionNativeRegression，包括凹UV、圆墙空角、屋顶形状、顶点颜色/法线/发光、开口、基础和Worker包围盒。原生初始化配方仍由先前采集的seed 0/1/42 SHA256对照保护。旧存档、旧目录重分组和旧代理API本身不再属于验收契约；不声称所有被删除的旧API测试都有一对一替代。

LLM测试宿主移除旧系统实例查询，通用Scene/相机读取保留。持久化与不相关对象保护直接检查Source Scene。删除15个已退役的建筑API用例，历史能力库存从106收敛至91，明确标注范围变化；不能据此宣称通过率提高。本节没有真实LLM调用，未新增其验收范围。

验证：
- 几何相关161项与原生相关159项Vitest通过，其中5项农场地面测试重叠，合计315项不同检查；迁出的13项包含在159项内。Node编译/资源回归47项、验收工具单测74项通过。
- Terrain noEmit通过。首次从JS提取的测试缺少类型和查找结果检查，补齐后通过；未修改生产几何或放宽断言。
- 旧Node夹具曾只传资产清单而缺少VFS几何；另有测试仍把新增pick属性误当顶点属性。修正为显式加载几何、按attribute location寻找顶点数据，47项全部通过。
- 静态生产组件页完整278项真实WebGL检查通过，涵盖主体/装饰、独立GPU拾取、连续编辑、撤销、禁用/删除、资源替换、新Engine保存恢复；控制台0error/0warning。观察等待超时后继续等待同一页面，没有重启验收。
- 默认世界使用原有独立构建配置启动ready：46 House、138 Surface、299 Window、46 Door、46 WallLamp、8 GothicDormer，共583组件；控制台0error/0warning。通过正式面板查看默认圆房，截图已实际查看。本节未重测世界保存/重载，上一阶段的证据单独保留。
- 第一次将世界入口并入Gallery多页构建时，Source场景文件未复制到所需位置而404；换回已有独立世界构建配置验证。没有为错误的验证配置修改产品加载链。构建依赖门禁确认无旧作者模块、原示例JSON/隐式cottage地形和旧装饰网格/碰撞目录。

证据：`output/building-legacy-retirement/`，含覆盖关系、全部失败/通过日志、构建配置、结果和源码快照；截图 `output/playwright/building-legacy-retirement.png`、`building-legacy-retirement-world.png`。自建浏览器与4199服务已关闭，4173/8082未动，无commit/push。

总体仍未标记完成：需最终全范围审计；用户指出老虎窗应属于窗户类型，当前 WindowComponent / RoofWindowComponent / GothicDormerComponent 的语义分类尚未统一，本节未混入组件继承改造。Flash App inline Worker发布检查器仍未验证。楼梯、真实LLM验收排除，不声明性能改善。


### 2026-10-26：演示页统一使用 RoofWindowComponent，核实默认世界与预设入口

按用户本轮范围，`demos/building-components/extensions.ts` 的“添加屋顶尖拱窗”改为
`RoofWindowComponent(type="dormer-gothic")`。尺寸读取当前建筑 VFS 配方，挂点使用
公开平面 UV，不把 GothicDormer 的 meshUV 原样复制。验收同步改为公开挂点、尺寸、
颜色、发光、保存/重载、删除/撤销、圆房及主体移动。GPU 拾取测试保留完整建筑深度，
只筛选命中 ID，不再通过排除宿主遮挡证明附件可见。平屋顶操作先显式禁用窗户，撤销
同时恢复坡屋顶与启用状态；没有改动组件或安装算法。

实际静态 Seed World seed=1 的 Source 中查到8个 GothicDormerComponent（3个圆房、
5个矩形房）。默认生成条件为非平屋顶、规划宽深均大于6、seed % 5 === 0，并要求
几何预览产生 bodies。实际查看 poi-large-1:volume:4 与 poi-medium-1:volume:13 并绕看后，
没有确认清晰可见的凸出窗体；不能把组件数量视为可见效果验收。未定位该现象根因，
本轮未修改默认世界生成路径。

三个预设 round-gothic / circle-circle / gable-junction 已进入 SeedWorldProject 的 VFS；
正式 NativeBuildingPanel 的“建筑预设 → 在附近陆地创建副本”实例化它们。默认生成器
使用 BuildingInitialRecipe，并非从这三个预设选取。预设仍各有一个旧 GothicDormer，
本轮未替换预设、生成器或全局删除旧类。

额外发现与验证边界：试验“保持窗户启用，把屋顶改平”时，演示页在 activate 阶段
报告无法安装，但 IndexedDB 中已保存平屋顶和墙灯新位置；不能宣称 prepare 阶段已经
阻止保存或失败自动回滚。首轮运行错误及错误的原子性断言已保留；此事务问题未在
本轮演示组件替换中修复，后续需独立处理。没有降低安装规则来使旧测试通过。

证据目录：`output/building-roof-window-convergence/`；默认世界截图位于
`output/playwright/roof-world-*.png`，Source 实测记录见 world-hosts.json。

本轮最终验证：53项相关 Vitest、Terrain noEmit、静态生产构建通过；完整演示页278项
真实 WebGL 检查通过，控制台0error/0warning（首两轮失败日志另存，不计作通过）。
通过正式按钮新增 RoofWindowComponent，截图 `output/playwright/roof-window-component-demo.png`。
最终结果与源文件哈希保存在同一证据目录。未 commit/push，未宣称默认世界屋顶窗可见性问题已修复。

最后追加演示显示调整：创建屋顶窗后复用按真实挂点计算的观察方向自动对准窗户，避免
默认正面镜头看不到侧坡附件。此调整之后重跑 Terrain noEmit，并用开发页实际点击
“添加屋顶尖拱窗”、点击可见窗体，返回“屋顶尖拱窗 · RoofWindowComponent”；截图
`output/playwright/roof-window-component-focused.png` 已查看。278项生产验收对应此前
同一组件替换版本；该最终镜头复用调整另以开发页实际交互验证，未重复全套或生产构建。


### 2026-10-26：屋顶窗统一收尾与保存前安装校验

本轮只收敛原生屋顶窗入口，不扩展楼梯或全系统迁移。默认 Seed World 生成、三个内置建筑预设和组件演示统一创建 `RoofWindowComponent(type="dormer-gothic")`。删除 `GothicDormerComponent` 的类、配置、注册、导出与 Scene 生成分支，并更新公开类型声明。原始 Gothic 几何算法和原始样例 oracle 保留；恢复样例的 mesh-UV 转换仅供离线预设导出使用，不是旧 Scene 加载兼容路径。新的示例/世界存储 key 与旧组件存档隔离。

- 初始配方保留原先挂点的空间位置，转换为公开 roof UV，再使用真实安装生产器决定是否发布组件。seed=1 的八个候选中七个满足条件；一个圆房候选不满足现有净空要求，不产生无可见几何的占位组件，也不放宽净空。
- 核实了先前“创建却看不到”的一处原因：Entity 是屋顶 UV 附件的作者节点，位置不等于实际挂点；面板曾对准房屋原点。BuildingSystem 现在从实际组输入和地形派生挂点/朝向，世界与预设面板从正面查看。没有保存第二份挂点坐标。
- RuntimeProjectSession 的已有域校验支持异步，编辑 prepare 和 durable commit 都等待完成。取消/失败不写盘；异步 prepare 后再次检查项目 revision。建筑域使用候选 Source 的真实组件 setter、候选 VFS 几何和现有安装生产器检查屋顶装饰；隔离临时 Entity 不加入 Scene、不触碰当前组件。此边界只证明屋顶安装错误在保存前拒绝，不代表所有运行激活都已有通用回滚。

验证证据：`output/roof-window-unification/`。

- 67 项相关测试通过：配方4、Scene生成5、预设7、屋顶装饰/安装15、项目存储36。配方比较的旧快照由修改前备份独立生成，剔除本次有意更换的屋顶窗记录后保留原来的主体/墙窗/连接/围墙/栅栏结果。
- Terrain noEmit 类型检查通过；公开声明重新生成。
- dev 浏览器全建筑演示282项通过（含4项非法平屋顶事务拒绝检查），独立屋顶附件84项通过；这两组有覆盖重叠，不相加当作独立测试数。
- 生产构建通过，原始样例JSON/旧作者模块/旧装饰查表依赖门禁通过；构建有已有的重复资源发射与大chunk警告。生产预设35项通过：三个预设真实创建、每个屋顶窗的正面定位及GPU拾取、编辑、撤销、资源更新、重载、Script Worker。
- 默认世界dev实际加载 ready，7个RoofWindowComponent，已实际查看圆房窗体和小屋顶；截图 `output/playwright/roof-unified-world-focus.png`。未把一张截图宣称为所有默认窗户的逐个视觉验收；本轮未运行真实LLM。
- 自建4199服务与测试浏览器已关闭，用户4173/8082不动。未commit/push。

**独立未解决视觉问题（用户指出，不能计为验收通过）：** 山墙交接预设的屋脊右端存在浅黄色凸出物。当前截图 `output/playwright/roof-unified-presets.png` 与此前 `output/playwright/building-native-presets-production.png`、`output/playwright/building-native-placement-production.png` 的相同位置均可见，因此不是本次屋顶窗组件统一首次引入。尚未证明具体属于墙体穿出还是屋面覆盖缺口，不据颜色猜测发生根因。本轮的功能/身份测试没有覆盖这一像素级缺陷；后续需要针对该处单独定位，不能靠移动相机或隐藏几何作为修复。


### 2026-10-26：山墙交接预设凸出物的根因确认（仅诊断）

进一步按 diagnose-issue 核实：黄色凸出来自方房原生砖墙 wall-2。ConstructionRenderPackage 的原生墙 Draw 分支漏传已生成的 owner.wallRoofJoint，自定义墙面分支则携带该字段，因此只有前者绕过现有屋面边界裁剪。隔离 Vite 实验只补传字段，同镜头同像素由 wall-2 变为下面原本存在的屋瓦 generic-3，凸出消失。当前 HEAD 同段已有遗漏，不是本轮屋顶窗统一新引入。之前的约束测试只检查 layout.groups 的墙组，漏掉原生墙分支。完整证据、红绿图和后续验收建议：output/gable-protrusion-diagnosis/REPORT.md。产品实现尚未修复；实验页、浏览器及4199已清理，未commit/push。

### 2026-10-26：退役旧 dormers 作者和渲染路径

屋顶窗现在只有 `decorations(host="roof", type="dormer-gothic")` 这一条编译入口，对应 Scene 的 `RoofWindowComponent`。删除旧 `ConstructionBuilding.dormers` 字段、解析器、ConstructionGothic、GothicGenerator、GothicInstance、旧预览代理及 resident/distance 专属分支；旧输入明确拒绝。三个示例及预设导出已切换到统一格式，离线转换器 RecoveredRoofWindows 删除。旧预览网格的重复 CPU 解码也已删除；实际装饰网格继续由当前 VFS 资产链路提供。

保留当前屋顶窗实际使用的 GothicBlueprint、GothicRoofTiles、GothicPlacement、安装/占位算法、资产和 GPU 孔洞格式。独立 Python 原作采样工具及 masonry-lab 仍用于原游戏对照，不接入当前 Scene 编译器，不是兼容旧存档的路径。

证据在 `output/dormer-path-cleanup/REPORT.md`：备份旧实现与新实现在同一规范化输入上三例几何哈希完全一致，重新导出的三个 Prefab 逐字节一致。相关 Vitest 166项、masonry套件47项、Terrain类型检查及生产构建通过；生产依赖门禁确认无已退役模块。黄色凸出物对应的原生砖墙 Draw 未在本轮更改，仍为独立待修复问题。

生产浏览器验收完成：预设页35项、完整建筑组件页282项全部通过，两个页面控制台均0error/0warning。完整验收首次45秒观察超时，当时仍在运行214项，未重启或重复触发；继续等待后完成。截图 output/playwright/dormer-cleanup-presets.png 与 dormer-cleanup-extensions.png 已实际查看。生产构建有既有重复资源/大chunk提示；最终Terrain类型检查通过（typecheck-verified.log）。自建浏览器和4199服务已关闭，用户4173/8082未动。未commit/push。


### 2026-10-26：原生砖墙屋面裁剪漏传已修复

此前山墙交接预设的黄色凸出物已修复。ConstructionRenderPackage 原生砖墙 Draw 现在传递编译墙体已有的 wallRoofJoint，复用现有屋面裁剪；产品改动一行，没有预设特判、尺寸调整或新裁剪算法。

新增回归在修复前两个屋脊方向均失败，修复后通过。覆盖无自定义绑定→有绑定→无绑定、房屋旋转与平移，以及平顶/四坡顶/圆房不误启用裁剪。相关墙顶约束与预设20项测试、Terrain noEmit通过；两处旧测试补齐 constructionPreview 所需的同源VFS资产。

真实WebGL复验使用正常Vite加载实际修改后的源码，未使用诊断注入插件。同一镜头、同一屏幕像素(789,150)，拾取从原砖墙wall-2变为已有屋瓦generic-3；浅黄色凸出消失。截图 output/playwright/gable-fixed.png 已查看，控制台0error/0warning。证据 output/native-wall-roof-fix/。本轮未重新运行全量LLM、生产构建或逐LOD图像矩阵，不将单视角验收宣称为全系统美术检查。临时页面、自建浏览器及4199服务已清理，用户4173/8082未动，未commit/push。

### 2026-10-26：建筑生产接入收尾与正式打包通过

本轮只处理 tiny-glade 建筑接入收尾，不扩展楼梯或真实 LLM。重新生成公开类型快照，移除旧 dormers 编译输出的传递声明；修正文档当前契约中的旧组件与屋面安装说明。

官方 Flash App 脚本存在两项旧检查：强制要求当前入口不再使用的内嵌 Worker，以及要求已删除的树种文件名。前者改为核对实际外置 Worker 引用、文件存在及独立 IIFE 语法，并要求 ConstructionWorker 存在；后者复用现有 PlantSpeciesProductionAssets 的依赖解析器，从当前目录核对产物字节哈希，不维护第二份树种清单。没有修改植被算法或资产。9项门禁回归通过，实际10个外置 Worker、47个植被依赖文件通过检查。

官方 build:seed-world-flash-app 最终退出0（937文件，322475323字节），声明一致性、Worker、植被、项目资源清单及发布扩展名检查通过。此前三次失败日志保留；最终日志 flash-build-complete.log。

在产物启动默认世界，46栋房屋、299扇墙窗、46扇门、46个墙灯、7个RoofWindowComponent，建筑错误为空。通过原生编辑面板把一扇屋顶窗宽度改为0.68米并改名，保存成功；完整刷新后同一组件ID、名称和属性一致，建筑错误仍为空，控制台0error/0warning。实际查看截图 output/playwright/building-integration-final.png。最终重建产物与浏览器所验产物逐文件哈希一致。

本轮未进行全PR审查、性能基准、真实LLM、远端发布或全系统验收，不把此阶段通过等同于整个PR完成。构建保留重复资源输出和大chunk提示。证据 output/building-integration-final/REPORT.md、result.json；自建浏览器与4199已关闭，4173/8082未动，未commit/push。

### 2026-10-27：四项建筑迁移目标完成核验

按原目标逐项核验：围墙/栅栏等主体组件、门/灯等装饰组件、Seed World默认建筑全面接入、全部运行建筑资产进入VFS，均已有当前实现及直接测试证据。独立旧生产器快照、原始网格/碰撞/材质数据与Scene重建对照用于保真，未将组件数量当成渲染等价证明。按用户后续要求保留RoofWindow统一和墙顶裁剪修复，不兼容旧作者格式。

本轮同步后23个Vitest文件157项、masonry runner47项、Terrain noEmit通过；通过可见按钮运行完整282项WebGL验收，覆盖GPU拾取、门洞、灯光、围墙栅栏编辑、禁用/撤销、VFS修改和新Engine重载。控制台0error/0warning，截图output/playwright/building-completion-audit.png已查看。上一轮正式Flash App及默认世界编辑恢复证据的相关源码哈希未变，无需重复构建。

四项需求矩阵、代码边界审查、保真证据及适用范围见output/building-completion-audit/REPORT.md。此结论只完成本建筑目标，不表示整个工作区PR逐行CR完成，也不包含旧全系统迁移、真实LLM、楼梯、性能/手机矩阵或远端发布。未commit/push，自建浏览器和4199已关闭，用户4173/8082未动。


### 2026-10-27：非法建筑候选在持久化前拒绝

- 将仅检查屋顶的 BuildingRoofInstallationValidation 收敛为 BuildingInstallationValidation；
  复用同一装饰生产器的接受结果，覆盖墙窗、门、灯、屋顶附件和石/木结构开口。
  候选验算与实时预览共用判定，保留“生成阶段可筛掉建议、已创作对象必须被接受”的区别。
- Source 候选与 BuildingSystem 共用装饰/表面宿主检查；接地坐标始终按接地条件验证，
  不再被“没有屋顶附件”的提前返回跳过。通用事务没有增加业务规则或 whenReady 协议。
- 回归入口 `demos/building-components/validation.html`：真实原生 Tool、IndexedDB、
  新 Engine 重开及撤销。10 用例覆盖非法旋转/尺寸、孤立装饰/表面、带/不带装饰的非法
  接地组、合法尺寸编辑、同事务禁用依赖后删除宿主、整栋删除及改名。
- 相关 Vitest 56 项、Terrain noEmit、上述浏览器 10 用例通过；完整演示结果见
  `output/building-validation-fix/`。不宣称移动端、真实 LLM 或性能基准已验证。
# 固定组合资产规范

固定零件、材质和相对位姿由原生 Prefab 持有；环境相关生成留在程序。全部组合及支持边界见 [Prefab 编写规范](../resources/PREFAB_AUTHORING.md)。



## 2026-10-28：旧建筑系统退役

按用户“只使用 Tiny-glade，shared/building 退役干净”的要求，删除旧实现目录、资产、
旧演示、Cozy Worker/客户端、旧建筑规划作者 API、Seed 归档字段和专属测试。
PlanningSession 只处理现有空间/环境参数；不再持有第二份建筑设计或建筑撤销入口。
默认建筑创建、编辑、资源、碰撞和拾取继续由 Tiny-glade 原生组件链路负责。

Tiny-glade 实际使用的两项纯数学函数（三角形/包围盒相交、线段/三角形距离）迁入
runtime/SurfaceQueryMath.ts，距离退化情形测试保留；没有搬迁 Cozy 的生成或资产机制。
规划体量的 building 查询保持可用，其详情契约只描述 planningElementId；实际建筑仍通过
原生 Entity/Component 编辑。删除 building-part 与旧 building.edit/delete 的宣传及类型，
保留的道路、桥梁和其他系统契约不变。更新生成声明、构建入口和失效知识链接。

通用发布/存档/撤销/取消回归改用普通规划作者数据，地形测试改为验证当前 Tiny-glade
消费的最终 R16 场。当前有建筑时生产入口禁用地形插值动画；本轮未改变该行为。
旧 LLM building.create/标签评测已删除；保留时间编辑、执行失败与超时恢复评测。
这不是一次真实 LLM 回归，不以退役测试的删除作为通过证明。

验证详情与清理前对照保存在 output/building-retirement/REPORT.txt。
PlanningInvalidation 的三项道路断言在清理前代码中也可复现；未放宽断言或借本次修改
处理既有道路问题。现有 Tiny-glade Scene/Prefab 格式未改变，不重置当前原生工程存档。

本轮验证完成：252 项定向测试、5 项评测器测试、302 项 WebGL 验收通过；Terrain/建筑生产代码类型检查与生成声明检查通过。生产包 668 文件，真实加载 worldReady=true，46 栋建筑、582 个作者对象，浏览器零错误/警告。临时浏览器与服务已关闭；未 commit/push。


### 2026-10-31：建筑查看与落地统一读取原生对象

本轮落实查看对象、整组移动这一批边界。NativeBuildingPanel 通过公共 projection.readEntity/readComponent 读取当前已激活对象的作者属性（包含原生 Prefab 覆盖），不再用裸 Scene.entities 查派生成员。未应用草稿仍属于原生编辑事务，不从 live 属性反向序列化。

公共投影在完整映射发布时统一生成反向身份，覆盖普通节点/组件、预分配与替换组件、关联 Prefab 根与内部成员；旧对象不再获得当前作者身份。没有新增建筑目录或持久化对象副本。

BuildingPlacement 直接读取 Entity.worldMatrix、父节点 worldMatrix、组件 shape/enabled 与层级 active 状态；删除建筑专用 Source 层级、Euler 和 shape 默认值解析。真实组通过 BuildingSystem.groupEntity 定位，移动使用公共 entity.update，因此嵌套 Prefab 的组位置写入原生实例覆盖。有限陆地搜索策略、地形高度语义不变。

预设创建的落地查询也改为读取已加载原生 Prefab 的临时实例，查询后销毁；创建仍按原有语义生成独立副本。建筑专用复制/Scene 拼接、初始化生成写入、临时配色面板未在本轮改造，不将本轮描述为全部入口迁移完成。

验证：6 项原生 Entity 落地测试、46 项公共编辑/API 测试通过；真实浏览器新增19项嵌套 Prefab 查看/编辑/移动/撤销/保存重开检查，以及58项公共 Prefab、35项建筑预设（包含GPU拾取）、57项资产 Apply 检查通过。Terrain 类型检查、预置声明检查及 diff 空白检查通过。证据：output/building-native-access-20261031/REPORT.txt。本轮没有真实 LLM、整世界性能或移动端结论，没有 commit/push。
