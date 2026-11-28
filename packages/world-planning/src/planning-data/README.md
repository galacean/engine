# 规划器参考数据

当前协作与参数契约见 [空间框架 README](../spatial/README.md)。当前 POI 组织规则、初始参数抽样范围位于 [space-rules.json](../spatial/layout/space-rules.json)，由可注册的 `LayoutRule` 消费；此目录同时保留环境配置与历史 study 数据，不是当前 UI 参数的第二份来源。新增可编辑参数必须经过注册 schema、Session 和真实消费者。

| 配置 | 拥有的规则 | 消费者 |
| --- | --- | --- |
| [poi-layout.json](poi-layout.json) | 统一布点间距 spacingM、最小有效管理面积 minAreaM2；单 POI 的 sizeWeight 由作者组件保存 | [PoiDistribution](../semantic-study/PoiDistribution.ts) / [PoiTerritories](../spatial/ecology/PoiTerritories.ts) |
| [poi-content-catalog.json](poi-content-catalog.json) | 历史 study 的素材语义 POI 变体；当前布局入口不使用 | [PoiContentCatalog](../semantic-study/PoiContentCatalog.ts) / [PoiPopulation](../semantic-study/PoiPopulation.ts) |
| [animal-appearances.json](animal-appearances.json) | 可选的动物初始化外观候选与权重覆盖，可选外观权重；Cute Zoo 同体型 A/B 外观等权随机 | 按需导入的 `PlanningAnimalRuntime` / 共享 `AnimalAssetLibrary` / `AnimalPopulation` |
| [natural-vegetation.json](natural-vegetation.json) | 新植被七层素材、密度、斑块、接缝和林下关联 | `NaturalVegetationLayers`；面板七项密度比例经现有 `landscape` schema、Session 保存和发布 |
| [units/landscape.tree.json](units/landscape.tree.json) | 树高、朝向与树干碰撞默认值；物种及 LOD0 比例由统一 plant-species.json 提供 | `NaturalVegetationProfile.naturalTreeDimensions`；候选占地和真实素材共用 |
| [landscape-contexts.json](landscape-contexts.json) | 景观环境带、候选与基础生长策略 | [ContextLandscape](../semantic-study/ContextLandscape.ts) |
| [landscape-influences.json](landscape-influences.json) | 建筑/道路/地貌组合与其周边景观规则绑定 | [LandscapeInfluences](../spatial/ecology/LandscapeInfluences.ts)；实例通过 `landscapeInfluence` 覆盖 |
| [flower-regions.json](flower-regions.json) / [flower-influences.json](flower-influences.json) | 花区实际覆盖率、区内丛/㎡密度、形状策略及道路/公共区域选址偏好 | [FlowerRegions](../spatial/ecology/FlowerRegions.ts) / [FlowerInfluences](../spatial/ecology/FlowerInfluences.ts) |
| [visual-guidance.json](visual-guidance.json) / [wayfinding.json](wayfinding.json) | 沿途引导体量、可行适配与道路关系默认值 | [VisualGuidance](../spatial/guidance/VisualGuidance.ts) / [WayfindingPolicy](../spatial/guidance/WayfindingPolicy.ts) |

首次工程使用统一 POI 候选与管理分区。`poi-layout.json` 的 `spacingM` 初值为 210 米，`minAreaM2` 为 0；`distribution` 组件编辑这两个世界参数。单 POI 的 `poi.sizeWeight` 默认 1，是相对管理区偏好，不是面积或建筑尺寸倍数。候选保留稳定 ID 与原始位置，求解产生当前中心、有效面积和 active 状态；休眠候选仍可选择并调整恢复。成员数量由实际区域、空间组织、OBB 尺寸和间距产生。

当前统一组织抽样来自 `space-rules.json.defaults.rules`：建筑分支 42%、岩体分支 18%、曲线岩组 40%。普通成员间距初值 36–60 米；建筑长宽 8–12 米，岩体宽深高 64–112 × 36–72 × 12–48 米。曲线仍有独立的间距、弯曲与侧向变化参数。所有范围均是 Seed 初始化输入，不保证每个区域都放得下内容；显式 POI 或单体覆盖保持优先。

种类、材质和 LOD 接入留在原 Asset Assembly/Seed 素材系统；[population-presentation.json](../spatial/runtime/population-presentation.json) 只选择当前映射，不允许凭名字改换 prefab/shader。湿度与每 POI 的素材分布规则尚未全部接入，不应添加没有消费者的配置项。

Seed 自然植被的物种比例由 `sampleLandscapeSpeciesWeights` 按 Seed 与作用域抽样：对每个稳定资产 ID 生成独立指数变量，再归一化为概率单纯形上的中性分布，不指定某个 Seed 必须出现的品种或比例。花卉候选从素材目录的 `Flowers` 类别发现，按所属区域生成比例；其他植被层与乔木也按 Seed 生成组成。位置、朝向、大小和聚簇继续由现有生态布局算法派生。显式 `flowers.assetWeights`（包括 0）逐字段覆盖，reset 后恢复算法值；生成值仅用于发布结果和 inspect，不写回作者参数。素材结构原型、实测尺寸、生态范围及用户要求的长叶草排除项仍是算法输入；单株内部拓扑沿用素材原型。

以下为历史 study 参考，不能作为当前框架的约束或接入规范。旧 POI 目录的 `fit.scales`、内容生成失败时拒绝事务的行为已退出当前入口。当前候选不足记录请求/实际数量，不否决整个布局。

- reference-profile.json：当前实际读取的尺寸参考，source.kind=experiment；不是Unity实测数据。改此文件后刷新重新生成，内部配置不暴露用户滑条。
- PlanningReference.ts：基础校验、建筑尺寸解析；调用点覆盖 WorldSemanticPlanner、WorldLayoutPlaces、WorldVillageCourtyards、WorldLayoutRoutes、WorldLookout、PlanningWalk、LandformMetrics、PlanningLandform、InteractiveLandforms。
- semantic-units.json：基础体量、连接口、通路、区域、组合与关系目录。台体为岩石基础形状；台地为组合。鞍部不作为独立岩石。旧兼容形状键仍存在于rockShapes，但不列为新的语义原子。
- PlanningInventory.ts：从实际Snapshot提取尺寸、面积、朝向、归属、路线长度和端口；随编辑器原导出按钮输出semanticInventory。

数据修改参与布局缓存版本。当前确定性与局部更新要求见框架 README；历史通路检查不构成当前硬约束。

旧 [PlanningReference](PlanningReference.ts) / [WorldLayoutPlaces](../semantic-study/WorldLayoutPlaces.ts) 消费链仍包含 `widthPerVillageSize` 历史公式；[BuildingSizing](BuildingSizing.ts) 仅供旧 study 使用。当前内核只解析通用体量尺寸。历史地貌实验和素材参考不改变当前契约，也不代表已核实 Unity 实测尺寸、Prefab 语义或碰撞范围。

Unity提取应保留：源场景/Prefab标识、层级与变换、单位换算、局部朝向、渲染边界和碰撞边界（分别记录）、尺寸样本分布、组合成员、入口和间距样本。尚未实现Unity读取器，也不要求项目遵守预设命名。


## 历史参考：2026-09-17 两村庄与沿路景观初版

以下记录属于早期研究入口；当前尺寸、页面、参数和默认值以上述架构说明及源码为准。

默认入口为 `semantic-study/index.html?study=settlements`；世界仍为 2048 × 2048 米，镜头初始聚焦局部两座村庄。`?study=world` 保留此前大世界实验。新入口不生成农场、独立院落、山群或水域，不删除旧地貌模块。

数据源为 `planning-data/settlement-profile.json`：建筑整组边界和门尺寸参考总监0元购-1 的 5 个有效建筑样本；道路、广场、间距和景观数值是首版策略，不冒充 Unity 测量值。人物仍使用共享 reference-profile 中的 1.8 米、步行 2 米/秒、跑步 8 米/秒。

模块顺序：场地分配 → 村庄建筑/门/公共路网/广场 → 村口间道路 → 稀疏景观。每座村庄使用独立随机键和有界缓存；局部编辑不重排另一村庄。景观只读取上游空间，避让道路完整轮廓、建筑、门、广场、围栏、水和岩体；放不下就留白，不反向移动上游。树冠占地和树干碰撞分别记录，岩石使用 OBB 占位。没有全局迭代约束求解。

村庄参数：范围、建筑密度、建筑尺度、朝向变化、路网曲折、村界围栏。道路参数：曲折、宽度变化。景观参数：密度。均为 0–1；建筑尺寸不跟随村庄范围缩放。范围下限由建筑对角线、广场及通行间距计算，再将范围参数映射到可行区间。容量不足会记录 requested/resolved，不强行叠放。村口支持多个；入户支路接入公共路网，接点共享端口，避免建筑彼此直连。道路共享连续宽度采样，拆分接点不重新随机宽度相位。

地表默认草地，仅道路和广场泥土。2D 使用同源矢量轮廓，白盒进入时才生成 1024 alphamap。建筑 OBB、门、围栏、树石通过同一 snapshot 渲染与导出；白盒使用米制网格与 FBM 地面，并加入树干、石块和围栏碰撞。

空间组织与元素的初始化组合位于 `spatial/layout/space-rules.json.defaults`，按 Seed + POI 稳定 ID 抽样。元素米制范围来自 `elementProfiles`；上层配置提供表现绑定，切换组织不重选表现。曲线参数及作用域见空间框架 README。

### 内部道路模式（2026-10-12）

`spatial/layout/space-rules.json` 的每个初始化组合显式声明 `roadMode: none | backbone | members`。已删除 scatter 类型；原组合保持相同权重和抽样顺序，改为 connected/radial + none。形状、道路模式和上层表现绑定分别配置，切换组织不重选表现。

植被形态与外观直接使用程序化植被自己的参数契约：`ProceduralPlantStructure`、`PlantInstanceVariation` 和材质槽颜色。上层按具体素材/实例提供参数，生态分布不另包一层公共色板或自动染色。原生草及草底保留 `SeedWorldGrassColorFieldTuning` 的 A/B 色、空间变换与远近渐变。

`natural-vegetation.json` 的 `planning` 是 Seed 生态的低草相对高度和边缘伴生参数；`edgePlantingLayers` 声明参与富集的层。高度以活动物种的实测尺寸推导，禁止在原生场景入口另设全图米制高度。路边、岩石墙脚的带宽采用米制，伴生倍率 1 为中性、0 为抑制，带宽 0 关闭该偏好。参数消费者和作用域见空间框架 README。

### 2026-10-14 植物物种片区

物种与模型变体仍只维护 `asset-assembly/generated/procedural-trees/plant-species.json`。`vegetation.speciesGroup` 是同物种模型的稳定共享身份；不填时该登记项独立成组，不能用展示 `family` 或网格复用的 `prototypeId` 代替物种。新增物种只登记一次；新增同物种变体填写相同组 ID，组内模型数量不增加该物种默认区域占比。这里是素材的种植分组，不声称植物学分类。

首次生成的叶色和树皮色在同一目录维护：顶层 `foliageVariation` / `barkVariation` 为共享规则，登记项的 `vegetation` 下同名字段可覆盖。曝光范围控制明暗，`regionalTint.colors` 的 RGB 端点控制冷暖色相，`influence` 控制素材色度混合，`plantInfluence` 控制同一区域内部的单株色相变化。叶色默认片区 -1.5 至 -0.1 档、单株 ±0.1 档；树皮默认片区 -1.5 至 -0.3 档、单株 ±0.1 档。先保留素材明暗细节混合色度，再应用曝光；不能只用统一 RGB 倍率冒充蓝绿/黄绿色相变化。物种组、片区和单株 ID 决定稳定结果，所有 LOD 共用。季节继续沿既有路径整体调色；显式 `plantMaterial` 通道（包括 0）优先，reset 恢复生成来源。草类仍共用 Terrain/Grass 色场。

`natural-vegetation.json` 的 `defaults.speciesRegions` 与各层 `rule.speciesRegions` 配置片区名义间距 `sizeMetres` 和边缘混生带的全宽 `transitionMetres`，均为世界米，独立于原有参考树高单位。当前乔木为 192 m / 16 m，林下层默认 48 m / 4 m，过渡宽度 0 表示纯区域。这是默认配方，暂未增加界面参数。

同一 Seed 在世界坐标中确定不规则片区，内部只选择该物种的模型，边缘向相邻物种逐渐混生。区域位置不依赖相机、驻留分块、单株 ID 或树高；未启用局部形态混合时，单株 ID 只决定组内变体与边缘混生。乔木在占地规划前确定物种，普通树与地标树共同消费；林下层使用同一算法，花区的作者配比及显式 0 继续优先。区域结果由 Seed 和配方重建，不新增保存的生成快照；更换此配方后旧工程重新生成会使用新分布。

### 灌木的种植面与局部冠层混合

目录 `vegetation.plantingHeightM` 声明原素材局部米制的种植面，显式 0 有效，缺省仍按几何最低点接地。BirchBush 03/04 的原 Unity prefab 保持局部原点和单位缩放，根端位于原点下方，因此登记为 0；Runtime 按参考比例和素材实例比例换算种植面，全部 LOD 共用该偏移，规划包围盒也保留地下根段。Highlands Bush 2 保持几何底部贴地。此规则不改变素材形状，坡地仍按植株中心采样，不承诺每根枝脚同时贴合坡面。

目录 `vegetation.mixtureGroup` 将灌木分为 `grounded-crown`（贴地冠层）与 `raised-crown`（保留短裸枝的冠层）。灌木层 `rule.speciesRegions.localMixture` 默认给两类相同权重；先按稳定单株身份选形态，再消费各形态自身的物种片区与变体。形态占比独立于模型数量、旧物种总权重和驻留分块，树脚覆盖率换算使用相同的有效成员概率。排除素材后仅在仍可用的形态间归一；实际接受数量还受道路、水面、地形和遮挡约束，不是每个局部强制一半一半。其他植被层未启用此混合。

### 树木与岩石周围的伴生斑块

`natural-vegetation.json` 的 `companionPatches` 定义共享锚点层、相对锚点实际半径的中心分布/斑块尺寸、名义覆盖率和椭圆长宽比。各层的 `companionPlanting` 设置关联强度及密度倍率；灌木额外使用 `coverage` 指定簇中心的名义冠幅覆盖率，通过 `-ln(1-coverage)/E[实际植株占地]` 转为每平方米密度，独立于空地散布密度。覆盖率模式在有限椭圆内采样，重叠簇按共享最大权重去重，跨分块保留相同候选身份；灌木、草本、地被与菌类共用相同斑块；花区不再叠加树下伴生或区内二次聚簇，保留背景散布与组间空隙。强度 0 完全恢复未关联的采样；密度 0 仍不生成。实际根部、道路、水域、建筑、岩石占地和作者花区继续约束种植。锚点支持范围由真实冠幅/岩石尺寸和配方解析推导，跨分块不依赖相机或分块随机数。用户要求的树脚小石块由 `companionStones` 配置覆盖率及原生尺度变化；候选素材直接枚举已加载的 `stoneFamily`，不建立第二份石块名单。它们只在乔木伴生簇内生成，不再执行彼此间距或排斥后续植被，可与草灌木交叠。表现统一使用现有 rock-formation 程序化生成器，与大型规划岩石共用 Worker、岩层参数、材质和上传逻辑；Stone 仅提供原有尺寸和身份，不再渲染其网格或材质。保持原分块生命周期、LOD 可见性范围和接地枢轴，坡地按实际旋转占地最低角接地；全局岩石参数编辑同时准备伴生网格，提交时原位替换，失败或取消时释放候选。

`samplingBudgetPerReferenceArea` 明确配置采样工作与输出预算，以目录原始测量尺寸及作者参考比例换算世界面积；不随某次替换的渲染网格高度缩减花区采样预算。原生候选或输出预算超限会明确报错；正常筛选缺额记入 shortfall，不重试补足，也不放宽道路或实体避让。

## 动物初始化外观

`animal-appearances.json` 按稳定 `typeId` 列出各体型的 `{ appearanceId, weight }`。默认文件为空对象 `{}`，不用逐条登记权重1；资源库对未配置外观使用等权重1。当前Cute Zoo的14个体型分别注册为typeId，21个外观由各体型appearances列出，默认等权重1；每个外观拥有稳定ID，不把不同体型混成外观。需要自定义的体型才增加候选列表。修改某一条的权重即可调整出现概率；权重2表示相对权重1的候选概率加倍，并不保证数量为1时选中它。权重0或从该体型列表删除会排除候选；列表不能为空、不能全零，未知ID、重复ID、负数或非有限权重会报错。整个体型未配置时，由资源目录补全该体型所有变体且等权重。

此文件是初始化内容配置，不注册到dat.gui、参数schema或LLM工具。关闭动物系统时不导入该文件或动物资源目录。修改文件后刷新生效；数量min/max仍由已有群体参数控制。相同seed、数量/权重配置、素材版本与世界几何重建相同出生名单和变体；当前相机、模型加载先后不参与抽样。可通过既有运行快照的births核对每个id与appearanceId。

## 原生配方与预览规则分离（2026-10-16）

原生 `natural-vegetation.json` 只保留真实消费者：物种片区、共享尺度、固定背景斑块、冠下伴生、坡度和道路/墙脚富集。已移除原生不消费的 spacing、crownSeparation、clusterScale/Aspect/Coverage、speciesCoherence、edgeFade/edgeGrowth、depthWeights/Falloff，以及花区二次聚簇/伴生规则。普通斑块仍使用 clusterRadius/Strength，伴生椭圆仍使用 companionPatches.aspectRatio；不要误删仍生效的字段。

素材独立构图预览继续消费 `asset-assembly/vegetation-landscape-preview.json` 的实验规则，经 `NaturalVegetationPreviewLayers` 叠加共享物种/尺寸/密度；原生 Seed 不读取它。参数面板字段、分组与顺序不变，LLM 说明由生态系统声明和相同字段契约提供。


## 当前 Seed 动物内容与行为

Seed 注册 Cute Zoo 3 的14个体型（默认各1只，21个确定性外观）和100个默认0只的备选模型。入口为 `spatial/runtime/PlanningAnimalContent.ts`，复用两包远程GLB和KTX2纹理；Wild包保留独立预览。`animal-types.json`是轻量身份、别名、默认数量和远程URL目录；已有dat.gui调整min/max，未注册的旧包数量字段经既有schema导入迁移清理，当前类型显式数量保留。

`animal-calibration.json`只配置Seed脚底到头顶参考总高度 `standingHeightMeters` 和源静态蒙皮高度 `sourceHeightMeters`；注册时一次计算两者比值作为scale，不能再另写重复scale。以1.8米角色和0.55米草高标定：公牛1.8m、骡1.9m、鸵鸟2.3m；豹/狼1.25m、考拉1m、狐狸/浣熊0.95m；狐獴/豪猪0.85m、臭鼬/松鼠0.8m、变色龙/鸭嘴兽0.75m。小型动物为草丛可读性采用夸张游戏体型，不是严格生物学尺寸；进食低头、卧姿和更高植被仍可能遮挡。与独立观察场10倍展示区分。所有外观沿用对应体型尺寸。Walk/Move/Run的源米/秒来自完整骨架脚支撑相采样，实例scale同步缩放位移距离；不是按物种名称猜速度。源FBX声明单位相同，但几何尺寸不同。没有按帧重算体型或脚轨迹，也不复制模型/动画资源。

`animal-behaviors.json`为Seed玩法策略：`roaming`走60/跑4/停留24/进食8/卧4；`grazing`走54/跑4/停留24/进食14/卧4；`groundBird`走60/跑10/停留18/进食8/坐4。权重只在具备能力且环境条件满足的分支间归一化，不是强制百分比；缺失/未知片段不参与。14个Eat经真实姿态检查标注进食表现；Rest依姿态配置卧或坐，鸭嘴兽Rest保持未知。Jump/Attack/Damage/Die保留手动预览，不作为受惊。食物统一草、栖息草地是当前临时玩法配置，不是动物学结论。

自主Walk的一段行程配置6段步态，Run为4段，目标在行程内保持一致；每段都Once播放，完成由行为树重新选择下一段，非渲染器循环。达到段数或目标后再选择其他自主行为，避免短片段结束频繁重选方向。通用autonomy规则可选cycles只接受move正整数，缺省1保持旧配置行为；明确moveTo不受该段数限制。明确指令 > 环境反应 > 自主闲逛；新指令立即取消旧任务，无冷却。

进食为检查可达草→走到目标→检查嘴边草→一次进食，脚下道路/河流不允许直接吃草。受惊用配置允许的Run/Walk逃离，随后平复并恢复自主，不将Damage片段当受惊。所有位移/转向仍要求真实步态采样推进，并经过共享动态避让和同源地面/障碍检查。素材没有独立转身片段，采用步态中的渐变转角与弧线，不新增站着冻脚旋转。

环境只用发布的alphamap及河床覆盖。活动圆仍固定于世界出生点，生成120米、活动160米、玩家激活160米；超距隐藏仅保留碰撞占位。未启用时不导入完整目录、校准配置或GLB，不注册无用帧回调；启用后按观察距离动态加载，不阻塞世界其他模块。LLM继续通过query/describe/command/receipt消费注册语义，无需素材片段名。未新增飞行、游泳、喝水或水边查询，不能把这些说成已实现。

2026-10-16 动物远程目录：`animal-types.json` 保存 14 个 Cute Zoo 默认种类（defaultCount=1）及 100 个备选模型（defaultCount=0）的轻量身份、别名、pack、外观与 HTTPS URL。关闭动物时可搜索目录，但不加载 GLB、重型注册或建立模拟。`PlanningAnimalContent` 仅启用后导入两包语义配置；旧包物种命名空间为 `low-poly-100:`，避免与 Cute Zoo 同名动物混淆。Cute Zoo 保留米制校准，旧包使用原有 1 倍比例；都使用 Seed 草地/草的玩法配置与能力过滤。URL 对应远程 KTX2 GLB（1024 上限、sRGB、完整 mipmap、必需 KHR_texture_basisu，无 PNG fallback），外观默认等权 1。21 个 Cute 外观使用 21 张 UASTC 纹理，100 个备选共用一张 ETC1S 色板；原生 ResourceManager 按 URL 复用，不新增帧内转换逻辑。

`world.animals.spawn` 是单次会话指令：注册 typeId、可选 appearanceId、稳定 requestId 和可选米制位置；新增身份进入既有按需加载队列（同轮并发发起范围内全部请求，逐只完成逐只显示），不重建其他动物、不修改初始化数量、不接受任意 URL。落点复用预计算栖息范围、地面/水体/实体和其他动物占位校验；失败不扩张范围。刷新、关闭系统或种群重建清除会话新增。持久初始化仍经参数事务处理。


## 通用植被与岩石初值（2026-10-26）

这些配置是所有 Seed 的生成参数，不包含任何 Seed 的单体 ID、位置或宽高快照。`natural-vegetation.json` 保留乔木和低草密度 1，灌木 0.03、野花 0.1，高草、匍匐地被和落叶菌类为 0；墙脚/岩石伴生带 6m、倍率 20，路边倍率 1。`poi-layout.json` 的景观密度为 1，building 环境带系数 2，其余环境带 0；`landscape-contexts.json` 的空地及远端保留密度为 0。`space-rules.json.initial.landscape` 同步使用密度 1，避免首次抽样覆盖配方。现有道路、入口、实体和水域避让继续生效。墙脚伴生参数同时作用于岩石边缘，不能解释为只沿建筑生长的保证。

`space-rules.json.elementProfiles.outcrop` 使用统一宽深高初值；不再声明 tiers 或按 POI 等级放大岩体。具体位置与尺寸仍由 Seed、有效管理区和空间组织生成；范围不是放置保证，越界或碰撞的自动候选仍可被拒绝。

共用岩面初值由 `rock-formation/Settings.ts` 提供：蜂窝尺寸 24m、内缩 0.35、深度倍率 0.6、细节倍率 0.2、覆盖 1。旧工程已有显式覆盖继续保留；新建工程使用这些生成初值。现有 Seed 1 的手工摆放与单体高度模式不是通用默认值的一部分。
