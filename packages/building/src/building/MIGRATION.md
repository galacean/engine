# 建筑系统迁移清单

目标：建筑全部迁到新架构（应用层 → 构件类型层 → 核心层 → 单元渲染）之后，**删除线上旧路径和全部兼容代码**。新架构的规格见 [core/README.md](core/README.md)。

## 规则

1. **整体迁移完成后删除旧代码。** 下文“旧路径”中列出的代码，在最后一个阶段验收通过后全部删除，不保留开关、不保留回退。
2. **兼容代码与旧路径一起删除。** 兼容代码只为在两条路径并存期间做到逐字节对比而存在，每处都标记 `COMPAT(online-parity)`，可以用 `git grep "COMPAT(online-parity)"` 找全。
3. **兼容代码只能放在这些位置：** `application/`、`render/`、`tests/core/CoreParity.spec.ts`、`world/demos/building-core-preview/`。核心层禁止出现，由 `tests/core/CoreLayering.spec.ts` 检查。
4. **删除旧代码前先冻结基准。** 把线上路径对各用例的渲染包哈希保存为固定基准，`CoreParity.spec.ts` 改为与基准比较，然后再删除旧路径。
5. **不是兼容的未完成项不能删，要补实现。** 见文末“未完成项”。

## 阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| M1 | 独立墙、栅栏，含起伏地形 | 已完成：平地上不旋转的墙，渲染包逐字节相同（零的符号统一后）；栅栏、旋转、起伏地形的数值误差 < 1e-12 |
| M2 | 房屋：墙 + 屋顶，墙顶跟随屋顶轮廓 | 已完成：墙体、坡屋顶（四坡、山墙、攒尖、圆锥）、平屋顶（矩形、圆形，含女儿墙）、尖顶都由新架构生成；渲染输入、远景、结构查询、调色板、聚焦位姿、贴地数据、放置文档都由 `render/CoreBuilding.ts` 直接产出，不经过线上管线 |
| M3 | 台基、腰线、木墙、抹灰 | 进行中：腰线已迁移（构件 `floorBand`，几何 `houseFloorBands`，铺设算法 `beltCourses`；与线上块数、层高、截面一致）；抹灰已迁移（构件 `plaster`，几何 `housePlaster` 继承各面墙的修改，铺设算法 `coverSurfaces`，单元是一块连续面材；与线上面积相差 < 5%，磨损和颜色相同）；台基（高度 > 0）和木墙未迁移 |
| M4 | 相连的房屋：对等检测、避让、转角砖 | 已完成：多栋房屋放在一个草稿里（`buildCoreHouses`，每栋一个组）。墙与墙的对等检测同时找转角和相交（`wallsTouch`）；规则 `wallJoin` 在转角派生转角石，在两面墙外皮相交处派生一列接缝石（构件 `wallSeam`，铺设算法 `seamStones`，靠近墙角 0.2 m 以内的交点留给转角石）。两个平屋顶顶高相差不超过 2 m 时，女儿墙各自去掉伸进对方的部分（`parapetsJoin`）。挂点落在另一栋房屋外皮以内的挂件不铺设，并报告诊断（`mountHidden`；每面墙带 `outline` 曲线，离挂点最近的那面墙负责）。线上在平屋顶与坡屋顶交界处的垛口被坡屋顶盖住，看不到，不迁移 |
| M5 | 门窗开洞、老虎窗、拱、尖顶、挂件 | 进行中：墙上的建筑预制件已迁移（Cottage 窗、Cottage 门、壁灯、Gothic 窗、Gothic 门、箭缝窗；构件 `window`、`door`、`lamp`，几何 `houseWallMount`，铺设算法 `placeAtPoints`，attach 规则 `wallOpening` 从所在墙面移除洞口，join 规则 `openingCutsBand` 让腰线避让洞口）。与线上对比：网格、颜色、UV、发光相同，位置偏差 < 3 cm，洞口位置和尺寸相同。转角窗、拱、老虎窗、屋顶舱门、屋顶灯未迁移 |

## 旧路径（迁移完成后删除）

已确认可由 M1 取代：

- `runtime/StripPlacement.ts`
- `parts/architecture/ProfilePlacementAlgorithms.ts` 中的 `placeStripSupport`
- `parts/architecture/BuildingGenerators.ts` 中的 `buildWallStrip`，`European.ts` 中的 `buildEuropeanWall`、`buildEuropeanFence`
- `parts/architecture/BuildingPublication.ts`、`BuildingProfileSupports.ts` 中的 `wallStrip` 分支

预计由 M2–M5 取代，迁到对应阶段时逐个确认后补进上面的列表：

- `parts/architecture/` 的设计与编排：`BuildingDraft`、`BuildingDesign`、`BuildingDesignRules`、`BuildingDesignIdentity`、`BuildingGenerators`、`BuildingImplementation`、`BuildingPublication`、`BuildingProfileSupports`、`ProfilePlacementAlgorithms`、`BuildingExecution`、`European`、`Steps`
- `parts/algorithms/`、`parts/BuildingAlgorithms.ts`
- `runtime/` 中的连接与开洞编排：`WallConnectionPipeline`、`ProfileContacts`、`ProfileDecorations` 等

保留：`runtime/` 中的渲染、打包、shader、LOD。数值内核迁为构件类型层的铺设算法，或者连接规则。

## 兼容代码（与旧路径一起删除）

| 位置 | 内容 | 为什么存在 |
| --- | --- | --- |
| `application/CoreEuropean.ts` | 调用线上的参数规范化函数 | 得到相同的 Float32 舍入 |
| 同上 | `MORTAR_LIMIT = 0.2` | 线上 `insetMaterialSpan` 限制灰缝不超过跨度的 1/5 |
| 同上 | `SLIVER = 0.001` 作为 `range` 下限 | 线上会保留极窄的碎砖 |
| 同上 | binding、owner 调色板、geometry 记录 | 线上放置文档和调色板槽的形状 |
| 同上 | 单元 id（`a/row-0/0`、`rail-i/j`）、按行号计算的 `anchor_uv`、横栏排序 | 线上的单元命名和绘制顺序 |
| 同上 | 栅栏的两个构件合成一个绘制组 | 线上一个绘制组同时画立柱和横栏 |
| `render/CoreRenderInput.ts` | 整个适配器，以及其中的类型强转 | 目标是线上的 `BuildingRenderInput`；迁移后铺设单元直接交给单元渲染器 |
| `tests/core/CoreHouse.spec.ts` | `gridCourses` 与线上 `arrangedWallCells` 逐值对比 | 验证规则网格墙的迁移 |
| `tests/core/CoreParity.spec.ts` | 与线上路径实时对比，`-0` 统一成 `+0` | 线上写 `-s`，`s = 0` 时得到 `-0` |
| `world/demos/building-core-preview/` | M1 验收页 | 并排展示两条路径 |

## 新架构的渲染适配（`render/CoreBuilding.ts`）

设计结果直接转成渲染器的输入契约，不调用线上管线，没有兼容代码。

- **布局：** 每个构件的单元只铺一次，按构件类型分到材质绑定：墙和转角石是一个绑定（砌筑），女儿墙一个绑定（砌筑），坡面、脊瓦、封边瓦或屋面是一个绑定（屋顶），尖顶是预制件。每个组用自己的调色板槽。
- **常驻细节：** 砌筑单元格带 `brick_accent`（强调石）和 `brick_span`（墙面 u 范围），由打包器 `UnitPacking.js` 写进记录；坡屋顶写成 `roof-design-v1` 记录，带入场动画；屋面用通用打包。
- **编辑图表：** 砌筑单元的 `anchor_uv` 是（周长 u，离墙基的高度），屋顶单元是平面位置 (x, z)。放置文档按绑定组织，`resolveDocument` 直接可用。
- **预览面和远景：** 墙面按周长展开，顶边跟随屋顶衔接线；坡面和锥面按弧长展开；屋面用自己的平面坐标，圆形屋面画成圆盘；远景纹理由各自单元的足迹绘制。伸出墙体装饰面的砌筑单元（转角石等）在远景中保留为实体。
- **结构查询、调色板、聚焦位姿、贴地数据：** 由同一份布局产出。
- **入口：** `prepareCoreBuilding`（远景、结构、调色板、聚焦）和 `compileCoreBuilding`（常驻渲染输入），对应产品流程中的准备和编译两步。

## M2 验收

- 测试：`tests/core/CoreBuilding.spec.ts` 对 5 种房屋逐项对比线上：结构查询命中点偏差 < 0.1 m（平屋顶的女儿墙除外：线上把它当作实心带子，新架构保留垛口）；调色板相同；包围盒偏差 < 0.3 m；远景纹理覆盖率不低于线上；贴地数据相同；渲染包绘制数相同、单元数偏差 < 12%；编辑（隐藏区域、换材质）按图表生效。
- 村子（17 栋，`tests/core/CoreBuildingVillage.spec.ts`，Node）：准备 410 ms 对线上 997 ms，编译 614 ms 对 1,061 ms，渲染包 145 ms 对 144 ms；绘制数 170 对 170；单元 24,883 对 24,391；远景纹理 10.4 MB 对 11.1 MB；放置文档和编辑方案 13.7 MB 对 12.4 MB。
- 画面：`world/demos/building-core-preview/house.html`，近景和远景（`view=far`）并排或交替对比 9 种房屋。截图来自 SwiftShader 无头渲染。

## 已定的渲染方向

- 铺设算法分为布局（`plan`）和按槽位展开（`unitAt`）。CPU 只保留布局。
- GPU 用 TransformFeedback（只支持 WebGL2）按槽位生成单元记录。记录留在显存里，正式运行不读回。原型：`render/GridUnitKernel.ts`，以及 `world/demos/building-core-preview/` 下的 `gpu.html`、`draw.html`。
- LOD 保留在 CPU 上。在 seed-world 初始村子（约 1 万个单元）上实测，CPU 的 LOD 选择每帧约 0.15–0.23 ms。WebGL2 不能在 GPU 上压缩绘制列表，LOD 搬到 GPU 会使顶点工作量增加约 8 倍。GPU 路径用 `unitAt` 为 LOD 提供每个单元的中心和半径，每个单元 16 字节，不保留完整记录。测量页：`frame.html`。

## 墙上的建筑预制件

- 由模型组成、组成固定的门、窗、壁灯是建筑预制件：资源包的 `prefabs` 按“类型/规格”引用 `Prefabs/building-prefab--*.prefab`。根节点带 `BuildingPrefabComponent`，它声明预制件在自身 x/y 平面上的洞口 `opening`；没有洞口的预制件（壁灯）不开墙。
- 成员的相对位姿写在预制件里（例如窗框离墙 0.14 m，玻璃在窗框内 0.07 m，灯离墙 0.27 m）。资源包编译时把每个成员的累计变换烘焙进它的网格，包围盒由烘焙后的网格得出。应用层和渲染层只读预制件定义，没有按类型写的偏移表。
- 预制件原点在墙线上，包围盒中心对准安装点（沿墙和竖直方向）。按安装尺寸缩放时，以预制件的背面为基准，所以任何尺寸下它与墙的距离都不变。
- 与线上的差别：线上缩放模型但保持固定的离墙距离，并以模型原点而不是碰撞盒为洞口中心。所以位置差 < 3 cm（离墙方向），门洞高 1 cm（新架构的门洞与门的上下边对齐）。线上为洞口边缘的砖再画一遍带窗洞裁切的绘制组；新架构在铺设时让砖避让洞口，所以单元数少于线上。
- 一个洞口可以由多个矩形组成（`openings`）：Gothic 窗和门是 3 段逐级变窄的矩形，十字箭缝是 2 个矩形。
- 石帽是“单元成员”（`BuildingUnitMemberComponent`）：用一个石材排列单元绘制。带跨度的成员沿墙弯曲，安装几何为它生成墙线（`follow<i>`），渲染层在墙线的两端和中点放骨骼；没有跨度的成员按 prefab 的位姿固定放置（1 号 Gothic 窗的石帽）。
- 圆墙上的洞口变窄量是 prefab 的数据（`curvedNarrowing`）：Cottage 窗按规格为 0.05、0.10、0.15 m，与线上一致。这个值还没有从墙的曲率推导出来。
- 与线上的差别：线上按完整石帽（只在木墙上绘制）的包围盒决定 Gothic 窗的尺寸，prefab 按实际绘制的石帽，两者宽度差 1%。线上在圆墙上把弯曲的石帽再缩短 5 cm，所以圆墙上石帽两端差 2–3 cm。
- 尚未迁移：窗框用墙体石材（`frameMaterial: "wall"`），木墙上的完整石帽。

## 屋顶模型

- 每个坡面一个构件（类型 `roof`），只 attach 到它下面的那面墙：坡面 k 在墙 k 上。坡面几何是 `roofSlope` 曲面：u 横跨一行瓦，v 按弧长沿坡面向上。
- 相邻坡面共用一条侧边时是斜脊：join 规则 `roofSlopes` 派生 `hipCap` 构件，并给两个坡面各加一个 `clip` 修改，把瓦片切在斜脊线内 0.075 m。
- 两个坡面的顶边相对时是正脊：同一条规则派生 `ridgeCap` 构件。
- 坡面几何用 `rakes` 声明哪条侧边在山墙上：attach 规则 `roofOnWalls` 为这条边派生 `rakeCap` 构件，并沿这条边裁剪瓦片。
- 瓦片和脊瓦用不同的单元原型。两者的 `range` 都按 648 种屋顶的实测伸缩范围设定；瓦片的厚度不伸缩。
- 铺设算法：`roofTiles`（瓦行，第一行下面加檐口封边瓦）、`capCourses`（沿线铺脊瓦，接缝位置用各自的种子）。
- 圆形屋顶是一个锥形坡面构件（`roofCone` 曲面），铺设算法 `ringTiles`：一圈圈的瓦，每圈随机转一个角度，第一圈下面加封边瓦。与线上 `generateCircularRoof` 对比，3 种塔楼的瓦片和封边瓦数量相同，朝向一致，尺寸比约 1.0。
- 这套规则以后也用来处理 L 形屋顶和相交屋顶的天沟。
- 与线上对比（`tests/core` 临时对比、`house.html`）：瓦片朝向一致，尺寸比约 1.0，包围盒一致；瓦行按坡面实际弧长均分，所以和线上相差几厘米；檐口封边瓦数量随瓦长随机，和线上不同。

## 平屋顶模型

- 屋顶类型不止一种：瓦坡屋顶是坡面构件，平顶屋顶是屋面构件加女儿墙构件。应用层按屋顶类型写入这些构件，女儿墙不由连接派生。
- 屋面（类型 `roofDeck`）：墙顶高度的 `roofDeck` 曲面，盖到墙的外表面，矩形或圆形；铺设算法 `deckRows` 错缝铺瓦，每行裁到屋面边缘（方形的边，或圆在整行高度内的宽度），裁剪后低于单元范围的瓦不铺。
- 女儿墙（类型 `parapet`）：沿整圈周长的墙面图表，从墙顶到屋顶基准面（高 0.69 m），用 `masonryCourses` 铺砖，参数 `crenels` 生成城垛：每段直墙均分成偶数格，从第一格开始隔一格从顶部往下切一层砖。`crenels` 是通用参数，围墙以后也能用。
- 女儿墙默认用墙的砖块原型，颜色和网格由单元决定。砖块网格封闭，城垛不再露出内表面。
- `flat_rim = 1` 时没有女儿墙。
- 与线上对比：屋面瓦片数量相差约 3%–7%，朝向一致；线上屋面瓦更薄（0.08 m），顶面和墙顶齐平。

## 要替换的还原算法

- 墙体原生砌筑（`generateMasonry` 以及 `Recovered*` 墙体内核）来自 Tiny Glade 的二进制还原。我们会用自己的 `masonryCourses` 替代它：同样做转角加随机砖行，随机数用核心层的种子通道，每块砖可以按槽位单独计算。
- 替代的标准是观感相近，不要求逐字节一致。
- 屋顶还原内核（`RecoveredRectangularRoof`、`RecoveredRoofPlacement`、`RecoveredRoofContext`）：新架构的房屋（含远景和预览）已经不再使用它们，只剩旧路径在用。产品切换到新架构后，随旧路径一起删除。`RecoveredRoofMath` 还被 70 多个旧文件引用，同样随旧路径删除。
- 顺序：
  1. M2 先包装原生砌筑，和线上对比；
  2. 看效果；
  3. 实现 `masonryCourses`；
  4. 在验收页并排对比两者；
  5. 删除还原的墙体内核。

## 未完成项（不是兼容，要补实现）

- 内置 `surfaceGrid` 的 `trim` 只按曲面边界截短，遇到洞口时整块丢弃。`masonryCourses` 已经能绕开删除区域（把砖切成上、下、左、右几块），转角石就是这样实现的；通用的 `surfaceGrid` 还没有这个能力，到 M4、M5 再补。
- 删除区域作为裁剪区域交给渲染（`clip` 平面已经交给渲染）。
- 屋顶开洞（老虎窗）。
- 平屋顶上，抹灰盖到城垛下沿（女儿墙顶往下一层砖）；线上盖到顶下 0.3 m，并沿城垛缺口裁开。城垛缺口目前是砌筑参数，不是几何修改，抹灰继承不到；以后若要抹灰盖到更高，需要把城垛缺口表达为女儿墙上的修改。
