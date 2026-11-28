# Asset Assembly

## 统一物种目录（2026-10-13）

`generated/procedural-trees/plant-species.json` 是展场与 Seed World 共用的唯一物种索引；结构参数、材质和贴图沿用同目录中的既有文件，共用资源不复制。原 `meadow-plant-library.json` 已更名，生产读取和尺寸同步工具均消费新路径。

- `assets`：通用程序化植物，包括结构原型、材质别名与实例参数；`prototypes` 只提供复用结构，不是独立生成物种。
- `treeRecipes` / `shrubRecipes`：保留树骨架或独立灌木格式的物种，资源路径、材质、颜色和 LOD 同样登记在本索引。加载器按格式适配，展场和 Seed World 都自动枚举。
- 每项 `vegetation.layer` 指定生成层：`trees / shrubs / grass / herbs / cover / flowers / litter`。新增同格式物种只在索引登记；不再修改 Seed World 的 palette 或树种尺寸表。
- `vegetation.seedWorld: false` 是明确排除，默认可参与生成；保留先前对放射长叶草的排除。质量诊断 `geometryAccepted` 不充当隐式物种过滤。进入候选池不保证每个 Seed 必定出现该物种。
- `foliageVariation` / `barkVariation` 是 Seed World 首次生成的共享叶色/树皮规则，登记项可用 `vegetation` 下同名字段覆盖。`regionExposureStops` 与 `plantExposureStops` 分别控制片区及单株明暗；`regionalTint.colors` 的两个 RGB 端点控制冷暖色相，`influence` 控制对素材色度的影响，`plantInfluence` 控制片区内部单株的色相差异。先按素材亮度混合色度，再应用曝光及整体色域限幅。Seed、物种组、片区和单株身份保证重放一致，邻区在混生带平滑衔接。默认叶色覆盖蓝绿到黄绿，树皮覆盖棕色到暖灰；具体数值只在目录维护。自动按真实 leaf/shrub/bark 材质角色应用，无需第二份物种名单。季节仍整体调色，显式材质通道优先；草色场、花瓣和菌类保留各自原生颜色。展场单素材保留原色；Seed World 的自然植被 Runtime 消费生成颜色。
- 乔木的 `vegetation.sourceDimensionsM` 由当前结构的 LOD0 编译包络生成。在仓库根运行下面命令更新，校验时追加 `--check`。展场尺寸预览倍数不会写入米制尺寸。

```sh
node world/scripts/run-engine.mjs node world-gallery/demos/terrain/asset-assembly/offline/sync-plant-species.mjs --catalog "$PWD/world/gallery/demos/terrain/asset-assembly/generated/procedural-trees/plant-species.json"
```

`seed-world-planner/planning-data/natural-vegetation.json` 只拥有原生仍生效的密度、尺度、斑块与关联等分布规则；物种成员由共享索引派生。独立构图预览额外消费本目录的 `vegetation-landscape-preview.json`，经 `NaturalVegetationPreviewLayers` 保留原有间距、深度、椭圆簇和花区伴生规则；这些字段不再混入原生 Seed 配方。材质的原生作者字段对资产/材质身份逐段 URL 编码，带 `/` 的物种 ID 可保存重放。

此变更统一了底层登记和读取，未新增网页导入/保存到仓库的操作界面。新增外部模型仍先转换成已有参数格式，再登记资源；现有 Terrain 原生低草覆盖保留独立的地表渲染职责。


Asset Assembly 是 Cartoon 风格的单素材生产校验页。当前素材、光照与环境来自 Grasslands 工程，页面同时展示 Tree、Shrub、Grass、Flower、Rock 的原子 Prefab 与局部 Population，不负责 Terrain、Biome 或完整 World 布局。

页面的可见天空使用 Gallery 共享 `VolumetricCloudSkyRuntime`，与 Integrated World 采用相同的 economy、direction-cache 云管线，并由同一昼夜时钟、clear/scattered 天气和 Scene 风场驱动。

2026-10-13 按用户指定，白桦 `SM_BirchTree_01/02/07` 的上下段树皮统一使用各自上段原有的线性 RGB 倍率，消除共享树皮图上额外的分段色差。这是最终材质默认值的外观编辑；稳定材质身份、独立作者覆盖、UV、贴图、叶片颜色和不同树种的色调均保留，不在 Runtime 添加自动统一染色规则。完全重新从 Unity 拟合时须连同其他作者外观编辑重新应用。

## 统一植被展场

Highlands `Bush_2`“团簇灌木”已取消基础株的 2 倍放大，并按用户要求将整株收小到原始 Unity 素材的约 67.25%。该比例沿用与相邻桦木灌木叶片尺寸比较得到的缩小值；叶片尺寸和分布位置同步缩放，保留原有冠层的相对密度，不再单独缩叶而撑大冠幅。三个 LOD 仍为 387 / 193 / 94 张叶片卡、774 / 386 / 188 个三角形；法线采样范围和 LOD 包围盒同步缩放。逐顶点验证位置为同比缩放，拓扑、UV 和法线方向不变；这是主动尺寸编辑，标记为 `geometryEdited`。

“疏枝层簇乔木”和“团簇矮冠乔木”（含绿色变体）的树种目录、结构参数、配方、七株展示变体、专属材质和贴图已删除；旧 Seed World 树种目录也不再注册它们。锥形针叶乔木独立加载自己的材质资源，保留原来共用的树皮图与材质外观。导入植被库中的其他树木、灌木、草花和共用生成器保持独立，不随这两排删除。“裸枝乔木”仍保留目录数据但不进入此展场。

## 程序化植被升级进度

现阶段落地的是共用几何基础，尚未完成全部生产物种迁移。

- `ProceduralPlantGeometry.ts`：最终形状参数、部件父子图、多根部、显式 LOD 与纯 CPU 几何生成。面片支持左右轮廓、折角、卷曲、扭转；茎和实体使用中心线与半径截面。曲线控制点独立于网格分段，运行时不接收源顶点或索引。
- `ProceduralPlantMeshes.ts`：直接上传生成的三维几何，显式管理 ModelMesh 的所有权和失败清理。
- `ProceduralTreeGenerator.ts`：已有树的矩形叶片接入共用面片生成器；现有树的 GPU 编辑、风动和 LOD 路径继续由树系统负责。
- `ProceduralPlantExamples.ts` / `ProceduralPlantPreview.ts`：树、灌木、草、花的合成几何验证，不能作为源资产还原或生产迁移的验收结果。

预览入口：`/demos/terrain/asset-assembly/?view=procedural-plants`。可切换植物类型、高低细节和叶片折角。浏览器 `window.proceduralPlantPreview` 支持读取最终结构、提交 JSON 结构和查询部件／三角形数量；预览材质限于 bark、foliage、petal、pollen。

后续阶段：

1. 在 `offline/` 实现源面片的分离、轮廓与折痕识别、参数拟合及独立误差验证，先验证 Fir 枝叶。
2. 逐种转换灌木、草、花的真实源资产，验证轮廓、表面、UV、法线和各级 LOD；多分叉轮廓或内部折痕超出当前带状面表达时，先扩展通用形状模型。
3. 将通过验收的物种接入 catalog、Population、植被材质和对应风动，再替换当前 authored 资源。当前通用上传器用于几何验证，尚未接入生产批处理或植被风动。

### 首个还原目标：HIGHLANDS Fir_3

源模型为 `/Users/zzzz/unity/terrain11/Assets/HIGHLANDS - Stylized Environment/Meshes/Forest/Fir_3.fbx`，不是 AZURE 的 AN_Fir 系列。2026-09-15 读取原始 FBX 的结果：

| 原始级别 | 木质三角形 | 枝叶三角形 | 总三角形 | 枝叶单元 |
| --- | ---: | ---: | ---: | ---: |
| LOD0 | 192 | 1026 | 1218 | 19 个七顶点单元 + 57 个十四顶点单元 |
| LOD1 | 32 | 684 | 716 | 19 个七顶点单元 + 57 个十顶点单元 |
| LOD2 | 6 | 304 | 310 | 76 个六顶点单元 |

配套 Unity Prefab 的 screenRelativeHeight 为 0.54785144、0.30072588、0.069113076。这些是源 LOD 的屏幕相对高度阈值，不是距离。

此资产每级均有 76 个枝叶单元，不能靠减少叶片数量代替原始几何简化。通用结构的 `lods` 不限定四级，`shapeIdsByPart` 可在保留部件 ID 的同时选择不同的简化形状。父子位置始终按 canonical 结构解析，避免父茎简化带动整个子树漂移。

现有生产树仍保留 LOD0–LOD3 四级契约；该源文件只提供前三档参考。接入既有树系统时，前三档分别对照源模型，第四档需要由统一简化策略生成并独立验收，不能声称其来自原始 FBX。现有服务的固定四级验收与新通用结构的对接仍属于后续生产接入工作。

已修正源提取器的材质角色判断：先识别木质支撑路径，不再依据“能否拆为 UV 四边形”判断叶片。Fir_3 原先会被反向识别为枝叶材质是树干、树干材质是叶片。

当前叶片提取器仍要求四边形或成对 UV 三角形：Fir_3 的 LOD0/1 会明确拒绝；LOD2 则被旧叶卡逻辑拆成 152 张卡，而源模型是 76 个枝叶单元。这进一步说明必须将枝叶单元身份与三角形／叶卡划分分开。既有视觉验证器主要验证 LOD0。该源模型的多顶点面片拟合、三级独立几何验收和材质接入尚未完成，不能标记为还原通过。

#### 首轮参数拟合候选（2026-09-15，未验收）

新增离线 `offline/fit-procedural-plant.py`，使用 UV 对应关系、镜像分类、共同形状对齐、最小二乘截面曲线拟合和跨 LOD 全局单元匹配。镜像不能用旋转代替；将其混合平均会抹掉折面。输出只包含共享曲线与最终挂接结构，没有源顶点、索引或运行时拟合器。当前仅支持单木质支撑和各级保留相同数量枝叶单元；不支持的拓扑会报错。

候选保存于 `generated/procedural-trees/highlands-fir-3-candidate.json`，报告为同目录 `highlands-fir-3-fit-report.json`。76 个枝叶单元、1 个树干，三个 LOD 合计使用 14 个表面参数形状。测量调用 `offline/compile-procedural-plant.mjs`，直接执行同一运行时编译器。

冷杉默认针叶遮罩为 `../data/seed-world/source/stylized-environment/textures/procedural-leaf-mask-fir.png`，直接提取自用户确认的黑底枝簇参考图，保留原图 828×1000 像素和原始轮廓，不重采样、不重绘。按白色前景在黑底上的合成关系，将源 RGB 三通道均值写入 Alpha，RGB 固定为白色；三通道均值消除截图的微小色偏，复合回黑底时最大通道差为 2/255。图片顶部的枝簇根部对应曲面 `v=0` 挂接端。材质控制颜色，共享曲面算法控制折角，运行时无需改变 UV。该贴图属于参考图驱动的美术表现，不代表原 FBX 材质还原验收通过。冷杉及自定义叶片遮罩沿用现有树种的三线性过滤和 8 倍各向异性采样，保留 Mipmap 与 Alpha Test，缓解远处倾斜叶面出现的细条伪影。

| LOD | 最差单元采样距离 | 最差方向轮廓差异 | 候选 / 原始三角形 |
| --- | --- | --- | --- |
| 0 | 3.79% | 3.86% | 2016 / 1218 |
| 1 | 4.03% | 3.53% | 1552 / 716 |
| 2 | 12.46% | 18.66% | 1222 / 310 |

距离为双向顶点、边中点和三角形重心到表面的距离，除以每个源单元包围盒对角线，属于采样测量，不是连续 Hausdorff 上界。轮廓差异是同框正交前、侧、顶视图的 `1-IoU`，256 像素，无膨胀容差。LOD0/1 的上述指标低于 5%，但三角形预算和 LOD2 均未通过；原材质/UV 还原、连续误差证明和生产 Population 接入也未完成。

诊断入口：`/demos/terrain/asset-assembly/?view=procedural-plants&candidate=highlands-fir-3`，明确标注未验收，可切换三个 LOD；现已按用户要求作为“冷杉”加入 Asset Assembly 的 Base tree，现从统一物种目录进入 Seed World 候选池，质量验收状态独立保留。LOD2 的 UV 等高截面会扭曲错位端部，增加曲线控制点未能解决，后续需要中脊与左右边缘独立拟合并降低生成拓扑复杂度。

复现（仓库根目录；先执行 `node world/scripts/sync-gallery.mjs`）：

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python world/gallery/demos/terrain/asset-assembly/offline/fit-procedural-plant.py -- \
  --source '/Users/zzzz/unity/terrain11/Assets/HIGHLANDS - Stylized Environment/Meshes/Forest/Fir_3.fbx' \
  --compiler "$PWD/world/.materialized/engine/world-gallery/demos/terrain/asset-assembly/offline/compile-procedural-plant.mjs" \
  --output world/gallery/demos/terrain/asset-assembly/generated/procedural-trees/highlands-fir-3-candidate.json \
  --report world/gallery/demos/terrain/asset-assembly/generated/procedural-trees/highlands-fir-3-fit-report.json \
  --tree-output world/gallery/demos/terrain/asset-assembly/generated/procedural-trees/highlands-fir-3-tree-structure.json \
  --controls 7 --normal-field radial
```

重新同步 Gallery 后查看候选。上述输出须在统一物种目录登记，重新拟合不得覆盖既有分层、材质及实例元数据。

叶片几何折面与着色法线分别表达。`--normal-field radial` 从 LOD0 的 FBX 角点自定义法线反求共同中心，再对所有 LOD 计算角度残差；不会保存逐顶点法线。最终结构中的 `leafNormalField = { origin, radialBlend }` 由通用 CPU/GPU 生成链路求值：`normalize(position - origin)` 与面法线按比例混合。中心使用树局部坐标，随 `size/referenceSize` 缩放。省略该字段或比例为零时保留原有树种行为。

冷杉源法线的径向模型误差中位数约 0.005°，最大约 0.483°；这是在源顶点位置测量的法线模型误差，不代表生成网格的整体还原通过。材质透光、叶片投影和场景光照需分别验证。


## 最终结构参数与离线边界

统一链路为：离线源网格分析／规则生成 → 最终植物结构参数 → 运行时生成网格 → 上传 GPU → 绘制。

最终参数允许表达茎中心线与半径曲线、可复用面片形状以及部件的连接位置、方向和尺寸。控制点属于形状描述，不能按源顶点逐个抄写；不得通过新增字段、编码或缓存携带源网格、三角索引、逐顶点法线、残差位移表。增加几何分段必须复用同一份形状参数。

原始 FBX/GLB、源分析明细、拟合器、对照截图和误差报告只留在离线分析与 QA 中。运行时加载最终结构，不执行模型解析、形状识别、参数搜索或误差优化，也不导出再回读中间 GLB。

验收时必须断开源模型和离线分析文件，仅从最终结构独立生成并验证几何。形状参数化可表达的精度必须实测；不能把合成示例通过、渲染可见或更改文件格式当作源资产还原成功。

## 三层职责

- **Asset**：可独立复用并进入一个 GPU Batch 的生产原子。Tree recipe 只引用 `trunkMaterial`、`leafMaterial`、`leafMask`，运行时用 catalog 指定的 Sapling profile 生成树干、递归树枝和叶片 Card Mesh；共享 Prefab 只保留远景整树 impostor。Shrub、Grass、Flower、Rock 使用完整 authored LOD Prefab。叶片、枝条和内部密度只属于素材自身。
- **Population**：一类素材的单体外观、内部密度和局部 1/1000 布局。每类素材各有一个 `pt1` Population Token。
- **World**：未来负责世界坐标、Biome、Terrain、holes、水体、积雪以及多个 Population 的组合。V1 Token 不包含这些字段，只保留版本化 extension 列表。

LOD 距离、当前预览 LOD、昼夜、阴影和入场播放状态属于页面或 catalog render profile，不写入 Population Token。所有素材都使用同一个 `lodProfile` 契约：`PopulationLodMetric` 枚举声明数量语义，`values` 按 catalog LOD 顺序保存每级数值。Tree/Shrub/Grass/Flower/Rock 当前均以完整实例数量表达；这是 catalog 的素材策略，不是 category 的硬编码限制。增加到 LOD10 只扩展数组，不升级 Token schema；数组长度必须与生产素材的 LOD 数量一致。

## Population Token V1

页面格式为 `pt1.<Base64URL canonical JSON>`。它没有运行时 SHA，也不依赖二进制格式；所有序列化逻辑封装在 `PopulationTokenCodec.ts`，未来替换为文件或二进制编码时不改变运行时逻辑契约。

Token 保存：

- `schemaVersion`、`generatorVersion`、category、全局版本化 catalog/recipe/Prefab ID。
- `rootSeed:uint32`、基础尺寸和 RGB8 颜色。
- 通用 `lodProfile = { metric, values[] }`；枚举决定每级数值是 Count / Cell 或完整实例数，不暴露树干、叶片或枝条等素材内部组成。
- standard / stress-1000、局部 Cell 范围、Cell 规格和布局算法版本。
- 版本化 extensions；未知 optional block 保留并跳过，未知 required block 拒绝。

`NEW SEED` 只更新 `rootSeed`。尺寸、颜色、密度、数量和 1/1000 模式修改时会重新编码同一个 Token；输入旧 Token 会完整恢复这些参数及确定性局部布局。

## 确定性编译与 Instancing

稳定 instance key 为 `category + localCellX/Z + slot`。`rootSeed` 直接按名称派生四个互不串扰的 domain：

- `layout`：局部位置。
- `appearance`：旋转、尺寸微差、色差和基础变体。
- `density-rank`：稳定密度保留顺序。
- `animation`：风相位和入场差异。

Grass/Flower 的 Count / Cell 表示每个 Detail Cell 内的完整植株数量；`stratified-jitter-v1` 使用 layout domain 在整个 Cell 面积内确定性随机采样。Rock 在局部地块内使用中心配对的确定性随机 Cell。这里的 Population 只复现“一小块地里这个素材如何随机分布”。

Biome 级疏密属于 World 层：例如森林中心树密、边缘树稀，湿地区域灌木多、道路旁花草少。它由 Biome mask、Terrain 条件和 Region/Cell 规则决定“哪些地方采用哪个 Population、采用多大权重”，不会改写单个素材的 Population Token；同一个 Token 可在不同 Biome 位置按不同权重被引用。

新增 domain 或 optional extension 不会改变已有 domain 输出。Token 只解码一次，编译器直接写入复用 TypedArray；不会创建、保存或解析 1,000 个单株 Token，也不会创建逐实例 Entity、对象数组或临时 Matrix。

Batch key 为 `prototype × LOD × primitive × material × shadowMode`。世界实例单位始终是一棵树、一个灌木或一个完整原子；Tree 的三个 3D LOD 共用同一 Sapling seed 和参数，只降低曲线采样、截面边数、递归分枝预算和叶片卡数量，最后切换为整树 impostor。Grass/Flower 实例化完整植株 Mesh，Rock 实例化完整 authored LOD Mesh。五类素材都支持自动相机距离和手动距离预览；Shrub/Rock 直接复用 Integrated World 源 Prefab 的 `localReferencePoint`、`size` 与 `screenRelativeTransitionHeight`，按相机 FOV、实例缩放和距离选择 LOD，并在最后一级后交叉渐隐。Grass/Flower 使用生产材质的距离渐隐配置。

## 程序化 Sapling Tree

`ProceduralTreeGenerator.ts` 使用与 Blender Sapling 相同的三级参数语义：`shapeRatio` 决定树冠包络，`length/branches` 决定递归分配，`curveRes/curve/curveBack` 生长曲线，`downAngle/rotate` 生成父枝局部坐标内的黄金角分布，`ratio/ratioPower/taper/rootFlare` 控制半径，并保留 `baseSplits/segSplits/splitAngle` 分叉。叶片数量按 Sapling 的末级枝长比例与 `leafDist` 包络计算，沿末级枝条均匀生成，再按 `leafRotate/leafDownAngle/leafScaleT/horzLeaves/leafangle` 的原始变换顺序摆放。Broadleaf 使用 Small Maple 参数族，Birch 使用 White Birch 参数族。

Sapling 的原始 `branches` 数量只参与相对长度与父枝分配，不直接变成游戏网格数量。独立的运行时预算把 LOD0 限制为 Broadleaf `2+30+64`、Birch `3+28+60` 条分层茎干；启动预算为 `250 / 180 / 48` 张方形卡。生成器先为每条父枝多生成一个候选，以吸收 Sapling 强制产生的 `t=1` 直线延续枝；LOD 裁剪先为每条可见父枝选择角度分离最大的连接子枝，再以枝端最远点覆盖补满预算，避免直线延续枝把整个树冠拉成局部空间中的柱状叶团。每级 LOD 锁定每条枝梢的 tip leaf，并把其余叶卡限制在末梢枝的最后一个几何段内，再按枝条轮询从尖端向内补足预算，避免多张卡沿整条弯曲枝干排成弧形叶带。`Leaf spacing` 从这一真实的末梢聚簇布局逐步混合到最大中心间距；它不移动叶片、不改变卡片数量，也不会产生脱离枝条的悬空叶片。

所有树种的叶面共用 `buildPlantShapeGeometry` 与 `createLeafMesh`，没有 Fir_3 专用生成分支。`leafSurfaces` 保存共享截面曲线与采样分辨率，叶片的 `surfaceIdsByLod` 选择各级形状。旧配方缺省为直中线、固定宽度、零折角的矩形曲面，沿用原来的四顶点与两个三角形；新曲面由同一算法生成折叠与不规则轮廓。

每个顶点上传稳定 `LEAF_CARD_INDEX`、三维 `LEAF_SHAPE_POSITION` 和局部 `LEAF_SHAPE_NORMAL`。Forward 与 ShadowCaster 共用叶面局部形状，再从 canonical GPU frame 读取挂接位置、朝向、宽高；不再根据纹理 UV 重建矩形。GPU 节点编辑仍更新共享框架，不用重建叶面拓扑。新增属性之外，现有白桦、阔叶树、枯树的原始网格和 GPU 数据哈希保持一致。

Tree 面板在叶片长宽下提供 −90°～90° 的“折角调整”。0° 保留原有截面折角，正负值沿中脊向相反方向折叠；左右和不同截面的原始差异保持不变。编辑器将调整后的实际折角写入 `leafSurfaces` 并随结构 Token 保存，`leafFoldAdjustmentDegrees` 仅用于界面回显和恢复。运行时继续从最终曲面参数生成网格，所有树种共用算法。三角形预算按曲面拓扑的实际增减更新，原始平面恢复到 0° 时回到两三角形。修改共享 Shader 后需重新编译并同步生产和验证目录中的 `Vegetation.shaderc`；仅同步 GLSL 源码不会改变页面使用的程序。

叶片 Node Edit 的 CPU 职责仅限于稳定 ID、字段校验、Token 往返和把稀疏编辑编译成 canonical frame 记录；GPU 顶点阶段负责最终位置、朝向和尺寸。`setLeafNodeOverrides()` 只对发生变化的叶片上传连续三个 RGBA texel，四级 LOD 共享同一张 frame 纹理及相同 canonical 索引；它不会重新执行生成器、重新筛选 LOD、重建 `ModelMesh` 或重传实例缓冲。`所属枝条 + 枝上进度 + 位置偏移` 决定叶根，`Right / Up` 决定完整朝向，宽高仍按树高百分比持久化。

枝条 Node Edit 同样由 GPU 拥有最终求值。CPU 只生成一次稳定枝 ID、父子拓扑和基础 `ModelMesh`，并负责闭合字段校验、成环检查、算法版本绑定及 Token 持久化；每根枝的父级、挂接进度、父枝局部方向、长度、首末半径和最多 64 个 Path 控制点被编译到 RGBA32F 行。WebGL2 顶点阶段沿父链求挂接框架，在 GPU 上执行 Catmull-Rom Path、长度归一化、半径衰减、枝管顶点/法线变换和叶卡跟随。`setStemNodeOverrides()` 只上传发生变化的参数行，Asset Assembly 与 Seed World 共用这条路径；禁止因逐枝编辑重新调用生成器、重建 `ModelMesh` 或把最终顶点回写 CPU。

Tree 面板可独立调整 25%–300% 的全局叶片长度和宽度；数值保存在可选 `terrain/procedural-tree-leaf-card` Token 扩展中。由于全局尺寸参与碰撞间距和 LOD 叶片筛选，修改它会重新生成树冠；Node Edit 中单张叶卡的宽高则只更新 canonical GPU frame。材质另暴露 UE 同名的 `BillboardSize`、`BillboardsScale` 与 `Inflate`：先保留相机平面内的基础 `cardOffsetWS`，再按 `(normalize(cardOffsetWS) * BillboardSize + VertexNormalWS * Inflate) * BillboardsScale` 追加顶点位移；因此 `BillboardSize = 0` 不会折叠原始卡片。尺寸在 Token 和 UI 中使用厘米，仅上传 uniform 时换算成米。三项保存在可选 `terrain/procedural-tree-billboard` 扩展，Forward/ShadowCaster 共用同一组参数。

树干为从配方 Bark PBR 模板克隆的独立材质，叶片为从配方 Leaf PBR 模板克隆的独立 Alpha-Test 材质；每个 LOD 都拥有自己的材质实例。叶片继续使用 Vegetation 的 PBR Forward 主光、IBL 和阴影；可选 `terrain/procedural-tree-leaf-lighting` 扩展把 UE 图中的 `HueShift`、`UndersideColor`、`NormalAdd`、`NormalPower`、`Saturation`、`BaseReflectFractionIn`、`FresnelExponent`、`Highlights` 与 `EmissiveStrength` 暴露为独立材质 uniform。前五项在 PBR Base Color 入口处理正反面颜色，后四项生成叠加在 PBR 结果上的 Fresnel Emissive；页面启动时使用已调校的 LOD0 艺术参数。叶片轮廓选项由 catalog 提供，`terrain/procedural-tree-leaf-mask` Token 扩展只保存选项 ID；切换时只更新三个树冠材质的 Base Texture。纹理 RGB 固定为白色，因此颜色仍来自 Base Color；Alpha Cutoff 继承 `leafMaterial`，Forward 与 ShadowCaster 使用同一 Alpha Test，不进入透明队列，风保持关闭。

程序化树使用最终结构参数与 Population Token 持久化。来源转换与规则生成负责产生最终结构，运行时从该结构构建网格及 GPU 数据；不会导出、回读或缓存树木 GLB。具体归属见上方“最终结构参数与离线边界”。

## 生产素材与离线生成

唯一 catalog 是 `cartoon/catalog/v1`。素材 ID 和生成规则必须全局版本化；几何、材质绑定或 recipe 语义改变时升版本，不能复用旧 ID。

离线生成器：

```bash
pnpm terrain:asset-assembly:generate
```

生成器只为仍属 authored 路径的 Shrub、Grass、Flower、Rock、Fence 和共享整树 impostor 输出单 primitive GLB 与标准 Project Prefab。Tree recipe 输出三项 catalog 资源引用和程序化 profile，不生成、注册或加载 trunk/crown GLB 与 Prefab。生成脚本属于离线资产管线；运行时不执行裁剪或 GLB 重写。

新增风格时必须注册真实 catalog、全局版本化 ID、生产 Prefab、authored LOD 和离线验证结果。World 读取 catalog 解析 Token ID，再把编译后的紧凑数据按 Batch key 上传；不得把资源 URL 写进 Token。

### Fir_3 在 Base tree 中的接入状态

`TreeSpeciesCandidates.ts` 从统一物种目录读取树骨架配方，供展场与 Seed World 共用，使用同一 `ProceduralTreeStructureParameters -> buildProceduralTreeGeometry -> createLeafMesh -> GPU frame` 链路。离线拟合器的 `--tree-output` 可输出 `generated/procedural-trees/highlands-fir-3-tree-structure.json`；它包含相同的形状和挂接参数，不含网格缓存。原模型只有三个 LOD，现有四槽树渲染契约的最后一槽复用第三个源 LOD 的叶面形状，树干继续由共用 LOD 算法简化，不声称有第四个源 LOD。原始材质还原和 5% 总体验收仍未完成，当前使用 Gallery 的植被材质显示形状。

### Seed World 配色继承（2026-10-14）

唯一 `plant-species.json` 中维护 `foliageVariation`、`barkVariation` 与 `groundCoverVariation`。前两者由真实叶/树皮角色派生，地被叶片则继承实时草地色场并在 0.8–1.2 倍明度内变化，花瓣不跟随地被叶色。`PlantSpeciesSources` 将原生 recipe 的有效部位颜色从材质载体提取到 renderer，与转换素材共用生成色逻辑；只修改 population 自有材质，不改展场源素材。
