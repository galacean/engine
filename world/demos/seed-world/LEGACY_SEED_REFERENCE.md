> 历史参考：以下为旧 Seed 入口的维护说明，保留用于模块追溯。当前入口、持久化和空间编辑契约以 [README.md](README.md) 与 [spatial/README.md](spatial/README.md) 为准；旧 main.ts 函数、FBM/1729 布局和 Authoring API 不代表新规划器已接入。

# Seed World Planner

草地风格化的当前实现边界、输入契约和逐步验收门槛见 [SEED_GRASS_STYLIZATION_HANDOFF.md](./SEED_GRASS_STYLIZATION_HANDOFF.md)。

## 存档 Schema 与恢复机制

世界存档与玩家状态是两份独立数据：世界存档用于恢复建设结果，不包含玩家视角；分享世界时也不应附带玩家状态。当前实现提供保存与恢复能力，不等于已经提供世界分享接口，也不增加原本没有的资产编辑能力。

### 权威定义与数据边界

Schema 以代码中的类型、创建函数和读取校验器为准，不在 README 维护第二套完整类型定义。

| 数据 | 权威定义 | 保存内容与边界 |
| --- | --- | --- |
| 世界快照 `SeedWorldSaveStateV1` | [SeedWorldSaveState.ts](./src/SeedWorldSaveState.ts) | `schemaVersion`、保存时间、规范化复合 Seed 查询串、FBM 参数、地形质量选择、Authoring 状态、水体颜色，以及可选的树木变体和植被布局 |
| 已提交编辑 `SeedWorldAuthoringStateV1` | [SeedWorldWorldEdit.ts](./src/hydrology-v1/SeedWorldWorldEdit.ts) | 由 `hydrateSeedWorldAuthoringStateV1` 校验并恢复的编辑状态；不保存尚未提交的 Draft，也不是完整撤销历史 |
| 实际植被布局 `SeedWorldSavedPopulationV1` | [SeedWorldSavedPopulation.ts](./src/SeedWorldSavedPopulation.ts) | 树／灌木实例、细节密度场及 Profile 版本；密度场 samples 转成普通数值数组，不持久化 GPU 资源 |
| 玩家状态 | [SeedWorldPlayerState.ts](./src/SeedWorldPlayerState.ts)、[SeedWorldCameraBookmark.ts](./src/SeedWorldCameraBookmark.ts) | `{ schemaVersion: 1, camera: string }`，字符串复用相机书签编码，包含位置、朝向、roam/orbit 模式及适用时的 orbit 距离；不包含背包、坐骑或其他玩法状态 |

复合 Seed 复用现有 `g/gp/gx/h` 编码器，不另建 Seed Schema。自然世界由 Seed 和生成参数重建；局部编辑叠加其上。植被编辑会保留已有实例，因此仅重新播种不能保证恢复相同布局，需要保存实际 Population；树木的实例到素材变体映射也单独保留。世界快照不是 Entity、Mesh、材质或其他运行时对象的直接序列化。

创建快照应调用 `createSeedWorldSaveStateV1(input)`，读取应调用 `parseSeedWorldSaveStateV1(value)`；入口组装与恢复顺序见 [main.ts](./main.ts) 的 `captureSeedWorldSaveInput`、`restoreSavedSeedWorld` 和生成后的恢复分支。下面仅演示边界用法，`input` 必须来自已完整提交的世界：

```ts
import {
  createSeedWorldSaveStateV1,
  parseSeedWorldSaveStateV1,
  type SeedWorldSaveInputV1
} from "./src/SeedWorldSaveState";

function roundTrip(input: Readonly<SeedWorldSaveInputV1>) {
  const snapshot = createSeedWorldSaveStateV1(input);
  return parseSeedWorldSaveStateV1(JSON.stringify(snapshot));
}
```

### 版本与兼容

- 当前世界和玩家状态版本均为 `1`；Population 还有自己的 `schemaVersion: 1`。不支持的世界版本会被拒绝，当前没有通用跨版本迁移器。
- 旧世界快照缺少 `waterColors` 时按空数组处理；`treeVariations` 和 `population` 可缺省，读取时保留为 `undefined`。缺少这些字段的旧存档不具备新版所记录的变体／精确布局信息。
- Repository 兼容早期直接存放快照的形式，以及当前“指针 → 独立快照”的形式。悬空指针、非法数据不当作空存档；读取失败会抑制随后生成世界的自动保存，避免自动覆盖原存档。
- 玩家状态损坏或版本不支持时记录错误并忽略，使用正常初始视角；它不阻止世界存档恢复。
- 新增可选字段必须定义缺省行为；破坏性变更需要显式版本策略、迁移或明确拒绝，不能只修改类型声明。

### 保存时机与一致性

两份数据共用 [SeedWorldSaveScheduler.ts](./src/SeedWorldSaveScheduler.ts) 的调度逻辑，但使用独立实例：

| 数据 | 防抖 | 最长等待 | 提示 |
| --- | --- | --- | --- |
| 世界 | 1.5 秒 | 10 秒 | 有改动时隐藏旧提示；真正写入时显示“保存中…”；结果为“已保存／保存失败”并渐隐 |
| 玩家 | 4 秒 | 12 秒 | 不显示保存 UI |

世界编辑成功提交后标记 Dirty，定时到期才抓取整个世界快照；成功生成世界也可触发保存，恢复及显式 URL 选择有抑制逻辑。玩家状态在世界可交互且没有世界编辑时周期采样，编码后的书签变化才标记 Dirty。世界提示使用 Galacean UI，见 [SeedWorldSaveStatusUi.ts](./src/SeedWorldSaveStatusUi.ts)，不是 DOM 文本。

每个调度器最多一个写入在途；写入期间的新改动仍保持 Dirty。世界正在编辑、生成或尚未完成发布时不抓快照；最长等待和显式 `flush()` 都不能绕过一致性检查。提交或完整回滚后通知调度器，已到期的保存补执行。因此“最长等待”不是编辑中、后台挂起或存储请求耗时的硬上限。

安全取消、尚未修改的失败和完整回滚不会锁死保存；底层回滚失败或无法确认完整恢复时，暂停世界保存并返回恢复提示，防止覆盖已有存档。之后一次普通操作成功不会清除这个保护。水体失败分类见 [WaterMutationFailure.ts](../../../shared/water/runtime/body/WaterMutationFailure.ts) 与 [SeedWorldAppearanceMutation.ts](./src/SeedWorldAppearanceMutation.ts)。

存储写入失败不会把本次改动标记为已保存，也不会无限自动重试；后续编辑或显式 `flush()` 可重新尝试。离开页面前尚未到期的改动不保证写入，尤其移动后不足 4 秒就刷新时可能恢复旧玩家位置；不要把防抖保存理解为每一帧都已落盘。

### 恢复顺序与 URL 优先级

1. 读取、校验世界存档并检查 URL 世界身份；显式 `seed/g/gp/gx/h` 选择了不同世界时，不套用个人世界存档。
2. 按保存的 Seed、FBM 和质量参数生成基础自然世界。
3. 通过正常局部编辑发布路径恢复 Authoring 状态和已保存 Population，并核对 Authoring hash；不是把所有编辑后的高度数据当成自然世界重新生成。
4. 恢复水体颜色和树木变体映射，再完成世界展示与输入启用。
5. 按当前世界身份恢复独立玩家书签；首次进入时显式 URL 相机参数优先于玩家存档。

### 存储实现与后续 DB 接入

- 世界逻辑键为 `seed-world:personal-world:v1`，当前保存最新世界指针；每次写入独立的 `:snapshot:<UUID>` 键，写快照成功后再发布指针，最后尽力清理旧快照。不是多世界列表或历史版本管理。
- `localhost` / `127.0.0.1` 本地预览固定使用 `window.localStorage`，包括 Wrapper 中的本地预览；存储被拒绝时直接报错，不静默改写后端。非本地环境依次选择原生 `lingguang.storage`、CandyJar 存储桥；都不可用则报错。
- 玩家状态当前始终使用 `window.localStorage`，键为 `seed-world:player-state:v1:<encodeURIComponent(worldId)>`；入口以当前 `activeWorldSeed` 的字符串作为 worldId。浏览器存储按 origin 隔离，当前键没有额外账号维度，不能宣称支持跨账号隔离或跨设备同步。
- 世界的替换边界是 `SeedWorldSaveTransportV1` 的异步 `getItem/setItem/removeItem`，通过 `SeedWorldSaveRepositoryV1` 构造函数注入；写入和删除成功须返回 `true`。接 DB 时保留 Schema 创建／校验、完整发布后抓快照及失败传播约定，不应把每次编辑直接变成一次数据库请求。
- 当前玩家存储依赖同步 `Storage` 接口；改为异步 DB 时还需调整玩家状态的存储接口与加载时序，不能直接塞入世界 Transport。两份数据继续分开保存，保留玩家 4 秒／12 秒的独立调度。
- DB 的用户／世界权限、并发版本控制及事务提交由后续接入实现。当前指针协议不是跨标签页的编辑合并或多键数据库事务，不能用它代替服务端冲突处理。

### 扩展与验收

新增可编辑资产或字段时，应同步检查：权威 Authoring／独立状态归属、稳定 ID 与引用、快照采集、读取校验、缺省／版本行为、运行时恢复，以及提交后 Dirty 通知。不要仅新增 JSON 字段，却遗漏恢复消费者或让未提交预览混入快照。

相关自动化测试位于 [project-tests](../project-tests)：`SeedWorldSaveState.spec.ts`、`SeedWorldSavedPopulation.spec.ts`、`SeedWorldSavedHillRestore.spec.ts`、`SeedWorldPlayerState.spec.ts`、`SeedWorldSaveScheduler.spec.ts`、`SeedWorldSavePublicationBoundary.spec.ts`、`SeedWorldSaveStatusPresentation.spec.ts` 和 `SeedWorldWaterColor.spec.ts`。扩展时至少覆盖新增／修改／删除后的保存与重新恢复、旧数据缺省、非法版本、安全取消、完整回滚与回滚失败。

实际页面记录见 [WORLD_SAVE_VALIDATION.md](./WORLD_SAVE_VALIDATION.md)。其中包含阶段性历史结果，当前行为以代码和本节为准；自动化 round-trip 不代替浏览器、实际登录退出或跨设备验收，也不代表原本缺失的资产编辑能力已经补齐。

## 坐骑玩法

生成 3D 世界后，在右侧 dat.gui 的 `玩法 → 坐骑系统` 中选择 `马来 / 下马 / 马消失`；信息区显示 Animator 当前动画片段名。坐骑复用 Seed 的漫游、触摸视角与移动输入，Shift 加速；下马通过指令触发。Seed 当前使用 2.2 倍坐骑显示比例，马鞍、骑乘眼高、上下马距离和步幅一起适配，世界与出生视角不变。骑乘 W 前进、S 制动，A/D 持续转弯，位移始终沿马身前方；静止按 A/D 以低速、小半径踏步转身。镜头柔和跟随手动转向，拖动视线后马身在转速上限内平滑对齐水平视线；摇杆正推沿对齐后的方向前进。摇杆偏离竖轴超过 30° 后，至 90° 线性增强转向强度并乘推杆幅度（中心半径 0.15 内不转向），键盘 A/D 用 0.2 秒渐入；镜头自动跟随的平滑延迟不作为反向转向输入。Roam Speed 仍表示徒步速度，骑乘巡航/Shift 分别使用其 1.5/2 倍，滑块修改实时生效。摇杆向前持续 1 秒后自动从 walk 切换到奔跑并加速；松开取消自动奔跑，按实际速度从 run 过渡到 walk、idle，下一次推动重新计时。键盘仍使用 Shift。

GUI 和 AI 共用 `mount.command({ intent: "appear" | "dismount" | "dismiss" })`。该 API 通过现有 Zod 契约、API search、Agent Script、EnginePort 注册，LLM 只识别出现坐骑、下坐骑、消失坐骑的意图。模块负责首次加载、重复召回以及没有坐骑时下马/消失的幂等处理。

`SeedWorldMountSystem` 管理场景生命周期，`SeedWorldMountHost` 适配导航与地表；可配置行为树和 Animator 能力位于 `shared/gameplay/horse`。马来保持边播放 falling 边下落 1 秒，落地奔向玩家，近距离自动上马。下马恢复随机吃草、闲逛和三种 idle；本版移除攻击、击退、障碍碰撞检测及玩法提示 HUD。

吃草采样实际提交给 TerrainClipmap 的最终 alphamap（R 通道草地，双线性权重至少 0.5），而非基础地表字段或可见草实例。行为树只在附近找到有效草地后执行吃草，抵达和吃草期间再次检查；没有草地则选择闲逛或 idle。地表编辑的 alphamap patch 同步给采样端。世界重新生成时释放旧坐骑；持久化及其他坐骑素材是后续扩展范围。

## 大自然规律的第一性原理

自然不是“随机物件摆放”，而是一条因果链：

```text
地质势能 → 水的流动 → 侵蚀与沉积 → 土壤与湿度 → 植被栖息地 → 人类道路与聚落 → 局部细节
```

1. 山不是装饰，是势能的来源。山脊、峰、盆地先决定高低差；它们定义分水岭，也定义哪里值得看、哪里难以通行。
2. 水不是一条曲线，是重力的结果。水从高处向低处汇集；支流只能汇合，河宽应随汇水量增长；缓坡会形成弯流、湖泊、湿地，陡坡形成峡谷、瀑布和岩石裸露。
3. 侵蚀不是增加噪声，而是让地形记住时间。水带走物质的地方形成沟谷和陡岸；水失去能量的地方形成冲积平原、河漫滩与肥沃草地。自然感来自“过程留下的痕迹”。
4. 植被不是散点，是对生境的响应。森林追随湿度、坡度、土壤和海拔；草地占据平缓、开阔、受扰动或较干的区域；岩石出现在陡坡、山脊、冲刷面。

   山定骨架，水定动线，草地定留白，森林定边界，岩石定强调。

5. 道路不是自然物，但必须服从自然成本。道路连接人想去的地方，却会避开陡坡、湿地和大河；必须过河时才产生桥，必须翻山时才产生垭口、盘山路或隧道。道路应当是“对地形协商后的结果”，不是覆盖在地图上的线。
6. 随机性只决定初始条件，不决定因果关系。Seed 可以改变山脊位置、降雨分布、河流密度、森林聚簇和道路备选路线；但不能允许河水上坡、树林长进河床、道路穿过湖面。好的 Seed 世界是“不同但合理”，不是“每次随机”。
7. 每个局部编辑都应该是对原因的修改。改山体后，水系、道路、生态必须重算；改河流后，道路、湿地、树林必须重算；改道路后，只重算路边净空、围栏和植被。不能只把下游结果当贴图修补。
8. “自然”不等于完全自动。自动生成负责连续性、覆盖率和规则一致；人工编辑负责意图、叙事、视线和玩法。派生内容必须跟随地形更新，关键区域仍需要人工做最终判断。

## 世界生成器约束

> 一个 Root Seed 先产生受约束的地质初始条件；所有后续内容都从上游字段推导。
>
> Root Seed 自然生成必须经过完整生态因果链。人工 Authoring 表达玩家意图，不再以湿度、生境等“是否自然”条件作为准入门槛，但仍必须通过水陆、道路、容量、资产碰撞和事务原子性等物理可行性约束。

## 地形质量与运行时编译

当前 Demo 固定生成一个 `3072m × 3072m` 的世界，并把它作为一个 Region 交给 Terrain Clipmap。共享运行时仍保留 `TerrainClipmapRegionSource[]` 的多 Region 输入契约；单 Region 只是这个 Demo 的生成策略，不改变其他 Terrain Demo 的数组能力。

二维布局页只暴露两个联动的质量参数：

| 参数                      | 可选值（每 1024m）          | 默认值 | 完整 3072m 世界的默认纹理 |
| ------------------------- | --------------------------- | ------ | ------------------------- |
| Heightmap                 | `257 / 129 / 65 / 33`       | `129`  | `385 × 385` R16           |
| Alphamap + Detail Density | `512 / 256 / 128 / 64 / 32` | `128`  | `384 × 384` RGBA8 / R8    |

完整 Heightmap 分辨率为 `(height - 1) × 3 + 1`，完整 Alphamap 与每种 Detail DensityField 分辨率为 `coverage × 3`。URL 使用 `height` 和 `alpha` 保存每 1024m 的选择；修改选择后点击“生成 3D”即可在当前页面重新编译同一个 Seed，不需要刷新页面。

Heightmap、Alphamap、Detail DensityField、精确实例和 Terrain Normal 在同一次 Field Worker 请求中生成并以 Transferable 发布。一般地表字段直接按最终选择的 Alphamap/Density 分辨率绘制；道路使用连续可变宽距离场，在每个输出 texel 内做 `4 × 4` 子像素面积过滤，不分配完整的 4 倍边长临时纹理。河岸材质过渡由同一条河流距离场结合地形坡度和 Seed 噪声决定；草和花复用道路核心与 C2 路肩语义，并把双线性采样支持半径和最大植株占地并入净空，避免低分辨率 DensityField 把零星植被插值回路面。

Terrain Normal 没有用户开关。Worker 从最终 Heightmap 的世界尺度中心差分烘焙一张同尺寸 RG8 Normalmap，Seed World 运行时要求每个 Heightmap sample 都有对应法线；Terrain Shader 只采样打包后的 Normal Atlas，不再从 Clipmap 三角面或 Heightmap 在 Shader 中重建几何法线。

Clipmap 的 `meshSize` 固定为 `32`，与 Heightmap 纹理分辨率解耦。质量联动只改变世界采样间距，并自动把 LOD 数调整为 `257→5`、`129→4`、`65→3`、`33→2`；四档的最大半边覆盖都保持约 `4224m`，降低 Heightmap 不会缩短远景可见范围。生成完成后的默认相机模式是出生点漫游；`ORBIT` 只在用户主动切换时启用。

## 素材空间运行时

### Shader 预热与程序复用

预热与正式绘制共用 Engine 的 ShaderProgramMap。
静态清单与真实 Renderer 校验共用紧凑植被实例入场变体扩展规则，只对支持实例入场的 Vegetation 组合增加 `RENDERER_INSTANCE_GENERATION_REVEAL`，并覆盖双 IBL 混合；10% 后仍只允许命中缓存。
宏集合是快速索引；宏未命中时，仅当同一 Engine、同一 Pass 的最终顶点/片元源码、Transform Feedback 输出顺序和实例布局全部一致，才复用已有 Program。
多个宏索引可以指向同一个 Program，销毁时每个程序只释放一次，不跨 Engine 或 Pass 共享所有权。
预热通过 `KHR_parallel_shader_compile` 滚动提交最多 8 个不同的 Program，任意程序完成就补入下一项，不等待整批完成。
宏别名共享程序的完成状态，不重复占用并发槽位或轮询；链接完成后才读取校验结果和 Uniform/Attribute。
进度仍按已完成的宏变体计数，在让出主线程时合并通知，全部结束时保证最后一次通知；源码处理与轮询均受每帧预算约束。
不支持扩展的设备继续分帧同步编译，普通绘制同步获取程序；如果命中正在预热的程序，会完成同一个缓存对象而不是重复提交。
编译失败、Context 丢失或预热期间销毁不能被视为预热成功，10% 门槛保持关闭。

启动清单包含正式场景 MeshRenderer、ParticleRenderer 及非 Renderer Pass 的可达材质状态；这些变体不依赖 Worker 生成的坐标和贴图。
Shader 全部预热完就到 10%，不等待 Worker、世界装配或初始 IBL 烘焙。
0–2% 加载 Shader 资源；静态变体一开始提交，就同时加载 Scene 和生产素材库，地形 Worker 也继续计算。
Scene 与素材库彼此并行，但必须与静态预热全部完成后，才初始化并绘制正式环境，避免绘制抢先同步等待正在编译的程序。
并行分支失败时等待资源获取结束后再回滚，防止迟到的 Scene 泄漏；素材缓存仍由共享 ResourceManager 管理。
2–9% 按编译完成量推进，全部成功后立即打开 10% 门槛。
10–99% 用于正式 Runtime、Worker 结果、初始 IBL 烘焙、世界装配及隐藏首帧；树木 Authoring Profile 按 recipe 分帧准备。
候选、发布后及入场 Renderer 只检查缓存，宏别名允许复用同源码程序；真实程序缺失则报错，不在门槛后补编译。
变体清单变更须以真实运行录制和 `linkProgram` 计数验收，覆盖雨雪、IBL 双端点、资产入场；不能通过把迟到编译加入诊断基线掩盖漏项。
预热期间气泡保持呼吸，大小同步真实准备进度，不累积需要事后补播的进度粒子。
Runtime 就绪后合并尚未播放的气泡队列，只保留最多 4 个可见粒子，在约 0.6 秒内平滑收尾到 100%，再执行原有约 1 秒的世界展开并启用玩家输入。
系统启用减少动态效果时直接收尾到 100%，保留约 0.42 秒的世界展开过渡。
这些动画时长按更新帧累计，不承诺后台暂停或主线程阻塞时的墙钟时间；资源下载与编译重叠也不保证每台设备的相同加速比例。
使用环境反射的状态同时覆盖双 IBL 混合，包括资产入场组合；SH 投影与混合程序纳入提前预热，IBL 组件自己的 warmUp 只消费缓存并准备 GPU 状态。
粒子缓存检查读取正式生成器的模块配置，不播放粒子、不推进世界；清单覆盖雨幕和雪花的风场、Noise 与 Transform Feedback 组合。
季节颜色是 uniform，不按四季复制编译；雨雪的粒子渲染和模拟则需要各自覆盖。

覆盖验收应在实际 WebGL linkProgram 边界统计新程序，而不能把 recorder 的每次宏查询当作一次新编译。
`debugTimings=1` 在正式 Runtime 路由和调试路由都输出分阶段耗时；统计并行阶段时不能把各自耗时直接相加。
移动端驱动首次绘制的延迟仍需设备实测，不能由桌面缓存命中代替。

世界素材按数据规模和渲染方式选择空间策略，不为每种素材复制一套 Cell：

| 素材 | 权威数据 | 空间策略 |
| --- | --- | --- |
| 岩石、碎石、蘑菇、围栏、桥、建筑等精确 Prefab | Worker 输出的 exact transform | Exact Cell 粗筛、可选 authored LOD；逐体 MeshRenderer，由引擎自动合批 |
| 重复植被实例：树、灌木、荷花 | Worker 输出的 exact transform | Cell 粗筛、逐实例/当前 LOD 的子 Renderer Bounds 精筛；主画面和阴影独立裁剪、跨 Cell 全局合批、脏区上传 |
| 花、草 | Worker 输出的 DensityField | Detail Cell + GPU instance batch |
| Terrain | Heightmap / Alphamap | Clipmap |
| Water | Water fields | Water chunk |

Exact Prefab 通过 `SEED_WORLD_EXACT_PREFAB_RUNTIME_PROFILES` 注册。每个 Profile 只提供稳定 `key`、子实体名称和创建适配器；注册表会自动负责：

- 汇总 `exactInstances`，保留稳定 ID、Bounds 和 Authoring 显隐；
- 仅把普通 Renderer 的 `exactSpatialEntries` 交给共享 Cell 调度器；批量渲染路径自行响应 RenderView 裁剪，不重复调度；
- 只向支持 authored LOD 的运行时传播 Debug LOD 配置；
- 按配置顺序创建、按逆序销毁；
- 初始化中途失败时回滚已经创建的素材。

素材适配器把权威 Prefab、exact transform 和可选 authored LOD 解析成 `SeedWorldExactPrefabRuntime`。灌木和荷花复用 `SeedWorldInstanceBatch` 的批次、视图缓存和脏区上传；荷花仍由湖泊分布、水位和水面偏移定位，固定使用 authored LOD1，只保留原有的投影尺寸终止距离，不创建多级 Mesh LOD。

Cell 只是 CPU 空间初筛，不生成位置、不改变 Transform，也不是 GPU 合批边界；默认边长为 `64m`。批量植被按 Mesh/材质/LOD/视图组织少量 MeshRenderer + BufferMesh，共享源几何；普通物体继续走引擎逐体渲染路径。`CELL / LINEAR` 仅用于对比普通 Exact Prefab 的空间调度。相机和相关状态不变时复用可见性结果；可见实例记录不变时不上传，发生变化时每批最多上传一个脏区间。

## 3D World AIChat

默认 URL 直接进入 3D 性能采样模式：

```text
/demos/terrain/seed-world-planner/index.html
```

未传 `seed`、`height`、`alpha` 时，默认 Geology Seed 与地形精度分别使用 `1729`、`129`、`128`。运行时交给 Planner 的 Root Seed 由 Geology、Hydrology 等 composite seed 分量确定性派生，因此不保证等于 Geology Seed；验收时以当前运行时状态中的 Root Seed 为准。默认模式不创建或绘制二维规划图，不保留返回布局所需的 Fields/Population 副本，也不创建 Performance 面板、Runtime Debug、Water DevTools、风场验收轮询和对应的调试全局变量。画面只保留全屏 3D、加载状态、底部居中的语音 World Agent 和左下角漫游摇杆。

用户指定的 Seed World 若在权威生成或发布阶段抛错，默认模式会在候选资源完成回滚后自动重建已验证的 `Geology Seed=1729 + height=129 + alpha=128 + 默认 FBM` 世界，并把 URL 同步为实际展示的 composite seed。降级仍复用同一套 Seed World 素材和生成链路，不加载 Integrated Terrain。

只有 `?debug=1` 才进入二维规划图，并创建 Performance 面板、World Controls、Runtime Debug、Water DevTools、风场验收轮询、图层/子编码诊断和对应的调试全局变量。`aiChat=1` 可让 Debug 模式的 World Agent 初始展开。性能结论仍需在同一场景、相机和 CPU slowdown 条件下重新采样。

AIChat 只属于生成后的 3D 世界，不参与二维布局和 WorldFields 编译。页面在 3D Runtime 与 Debug 控制器完成初始化、`worldInputReady=true` 后才挂载 Galacean 语音 HUD。HUD 不创建 DOM 面板、输入框或按钮；圆球、文字、布局和 Pointer 命中由 `@galacean/engine-ui` 渲染和分发。圆球是 [Siri AI Orb](https://www.shadertoy.com/view/msVBzw) 的运行时移植，空闲时呼吸，按下后提高流动速度与辉光。文字背景参考 [iOS 26 Liquid Glass](https://www.shadertoy.com/view/wfGXzh)，与移动 joystick 共用局部 `SeedWorldLiquidGlassUiMaterial`；材质读取主相机已有的 Uber 输出，只在对应 UI Image 的矩形片元内执行色散折射、透明边缘高光与反射，不创建额外的全屏 PostProcess Pass。原作默认透明 tint，不额外覆盖场景颜色。文字和圆球作为 Overlay UI 保持清晰。按下圆球通过一个长期持有的 `AsrClient` 创建独立 `AsrSession`；本地 Wrapper 通过 `Env.getRuntimeInfo` 显式声明并提供 CandyJar ASR，线上直接绑定官方文档定义的 `window.lingguang.asr.start/stop` 契约，并以 `start()` 的真实成功或失败作为能力边界。识别中间结果实时写入引擎 `Text`。松开或拖拽结束会立即释放 joystick 输入并把 HUD 切到处理态，但不会立刻关闭麦克风：当前 Session 默认至少保留 2000ms 的尾音窗口；窗口内如果收到新的文字或纠正结果，则从最近一次更新继续等待 300ms，且从松手开始总等待不超过 2500ms。Agent Trace 可以在运行时调整并持久化这三个值，当前录音开始时会冻结一份有效配置并写入 Trace。尾音窗口结束后才调用 `stop()`，等待唯一的 `done` 终态，再把完整文本交给同一个 `AIChatSession`。一秒阈值从 Session 真正进入聆听状态开始计算；如果松手时仍在等待权限或语音引擎，HUD 会取消该 Session，并按实际按住时长显示“说话时间太短”或“未识别到文字”。如果玩家立即再次按住，HUD 会保留这次按住意图，等待上一轮释放完成后再启动新 Session，提前松开则取消等待。取消流程会立即请求 `abort()`，但只以 Session 的 `released` 信号作为麦克风资源已经可复用的依据；`done` 只表示本轮用户结果已经结束。HUD 不探测运行环境，也不维护 ASR start/stop/end/timeout 的并行状态。Agent 执行期间玻璃面板保留用户原话并通过透明扫光表示正在处理，不向玩家展示规划、Tool 或其他中间步骤；任务结束后才切换为最终成功或失败信息，并在停留九秒后回到呼吸圆球。切回布局、用户手动重新生成世界或销毁页面时，HUD 会隐藏并取消仍在进行的 ASR 和 Agent 任务。暂时切回布局再返回同一个已发布世界时会保留会话；用户手动发布新的世界实例后会创建新会话，避免旧世界坐标污染新世界。Agent 自己调用地景改造 Tool 时则保留当前会话，等待新世界完成权威发布后再把真实结果返回给同一轮任务。

接入分为三个边界清晰的层：

- `../../../shared/ai-chat` 是不含世界业务的浏览器 AgentLoop、ASAP 请求、API 绑定、对话历史和聊天控制器；
- `agent-adapter` 是 Seed World 专属的 Application、Zod 契约注册表、生成式 Agent Script API 声明、Runtime Binding 与 World Engine Port；
- `assistant` 只负责 Galacean UI 语音 HUD、自定义 Shader 和模型路由选项。

地面树与岩面树共用 Population 存活实例列表、稳定 Ref、编辑事务与渲染发布。
岩面投影只提供贴合位置；查询、删除和撤销以统一实例列表为准，Root baseline 包含可恢复的岩面树。

`SeedWorldAgentApplication` 是 LLM 与 World Engine 之间唯一的业务适配边界。模型只通过生成声明中的 `Ref`、`WorldSelector`、`Target`、领域 Asset 和 `MutationResult` 理解公共语义，不接触 Authoring Resource 的 `contentHash`，也不接触 Entity、Component、纹理、TypedArray 或 GPU 资源。并发校验和内容哈希由 Application 与 `SeedWorldRuntimeEnginePort` 在内部完成。

最终 Agent Script API 共 21 个命名空间能力：`world` 统一查询、检查、删除、标签、命名选择和撤销；`spatial` 实时搜索位置、解析空间目标和传送；`time` 读写时刻与季节；`atmosphere` 读写风雨雪雷云雾；`terrain`、`water`、`vegetation` 分别创建和修改地形地貌、水系与植被。只有 `spatial.teleport` 可以修改玩家 Pose，任何世界编辑都不得隐式移动或转向玩家。

世界索引只包含 25 种持久资产：8 种地貌、5 种水系、单棵树/树林、单株灌木/灌木丛、草地、花地、水草区、岩石、蘑菇、道路、桥梁和 POI。每个 `Ref` 都明确携带稳定的 `id`、`domain`、`kind` 与 `source`；运行时版本不属于 Ref 身份，`source` 区分自然生成和玩家创建。单棵树和单株灌木是可独立引用的原子资产，树林和灌木丛是父资产；树或灌木通过 `relations.parent` 指向所属区域。草地、花地和水草区本身就是最小区域资产，不物化单株。实时高度、坡度、湿度和水域位置由 `spatial.search` 从最新运行时计算，不登记为持久资产。

`world.query` 使用统一 `Selector` 处理领域、kind、语义属性、空间关系、资产关系与排序，并分页返回公共 `QueriedAsset` 投影，也就是 `Asset & { distanceMetres?: number }`。查询结果只携带 `type`、稳定 `ref`、位置、边界、标签、关系和可选查询距离；模型需要类型专属属性时，先按 `item.type` 检索对应 Asset 声明，再把 `item.ref` 传给 `world.inspect`。完整 API 回执只存在于当前 Agent Script 内，脚本负责查询、过滤和聚合，只有 `main()` 的有界结果进入下一轮模型上下文。公开查询通过 `limit` 约束返回条目但保留准确 `matchedCount`；`world.delete(selector)` 对全部匹配资产执行，不先经过展示分页。大批量修改返回事务标识、准确计数和有界 Ref 摘要。只要资产尚未删除，历史结果中的稳定 Ref 就可以直接复用；Revision 与乐观并发全部由 Application 内部处理，不暴露给 LLM。

所有定位能力共用公开 `Target`。Anchor 可引用 viewer、Ref、Selection 或精确位置；坐标系支持 world 与 anchor-local；relation 支持 at、front、behind、left、right、near、around 和 offset；placement 负责地形/水面吸附、碰撞、坡度和水域约束。`spatial.resolve` 返回可整体复用的已解析 `Target`，后续创建或传送不能拆掉其中的关系和放置语义。

所有修改进入 `SeedWorldWorldEditCoordinatorV1` 的统一事务，并返回公共 `MutationResult`。`status` 明确区分已经提交的 `applied`、只做估算的 `preview` 和没有发生修改的 `unchanged`；只有 `applied` 携带可直接传给 `world.undo` 的 `transactionId`。结果还包含创建/更新/删除/跳过数量、有界 Ref 摘要、影响边界、警告和实际采用的效果摘要。运行时 Revision 只在 Application 与 EnginePort 内部流转。地形、水体、植被和单个生成对象都只发布局部 Runtime Delta，不调用全量世界生成。地貌拥有独立 Modifier Layer；池塘和湖泊同时生成湖盆与水面。溪流和河流仍以真实语义资产参与查询与后续编辑；在原生流动水表现恢复前，其地形和水面由等面积湖泊代理临时发布，公共 `kind`、属性和稳定 Ref 不发生降级。删除一棵生成树或精确 Prefab 会写入可撤销 Object Tombstone，并同步 Population、Prefab 可见性与查询目录。自然 Population 只属于 Root baseline；Authoring Brush 以当前已发布的自然实例和其他 owner 实例为不可驱逐占位物，当前写入只能在剩余可行空间内求解。更新 Brush 会移动到 Authoring 顺序末尾，使完整重放仍表达“未变 owner 优先、当前 writer 避让”的确定性所有权顺序。

当前生成器为每个具体 Asset 和应用 API 产出独立 `.d.ts`，API 专属输入输出直接内联，只有 `Ref`、`Target`、`Bounds` 等真正共享结构进入 common。固定 System Prompt 只包含协议和路由表；模型通过原生 `api_search` Tool Call 的 `symbols` 参数精确检索当前任务需要的资产与函数声明，APISearch 自动加载公共依赖并按任务去重。只有已经检索到函数声明的应用 API 才会绑定进后续 `execute` 脚本；每次调用仍经过运行时结构和语义校验。

Seed World 遵循 `shared/ai-chat` 的原生 Tool Calling 契约。首轮模型输入直接包含用户原始指令，不经过本地正则或意图预分类；每次模型响应只能调用一个 `api_search` 或 `execute` Tool，任务完成时则返回一条不带 Tool Call 的普通 Assistant 文本。每轮还包含实时 `world_thumbnail`、按完成时间从近到远排列的最近 5 条已结束任务 `{ timestamp, instruction, result }`，以及本次任务的 Assistant Tool Call / Tool Result transcript。`timestamp` 是任务完成时的 ISO 8601 时间；历史只补全本轮未明确表达的上下文和指代，不覆盖本轮指令。成功的 APISearch Tool Result 只保留已加载模块 ID，完整声明只存在于下一轮重新生成的 System Prompt，不在 transcript 中重复。`execute` 脚本通过 `AgentScriptRuntime` 在全新的执行上下文中运行，局部变量、API 原始大列表、过滤过程和日志不跨脚本保存，只有有界 `main()` 结果进入对应 Tool Result。每次应用 API 调用仍经过 Zod 输入校验、Application、Engine Port 与事务边界；完整调用诊断仅保留在 Trace。

直接打开 Gallery 页面只能验证世界、Shader、HUD 布局和世界 Tool 生命周期，无法获得 Wrapper 注入的 CandyJar 与 ASR。要调用模型和语音识别，本地页面需要放在提供 CandyJar/ASR 的 Flash App Wrapper 内；本地模型和 ASR 分别使用 CandyJar `FlashApp.remoteSkill` 与 `ASR.startRecognize/cancelRecognize`，部署环境分别使用 `window.lingguang.ai.chat` 和 `window.lingguang.asr`。本地 Wrapper 的 `mini_app_url` 和 `app_shell_url` 必须直接指向 `http://127.0.0.1:4173/demos/terrain/seed-world-planner/index.html?aiChat=1`。不要把 `http://127.0.0.1:4173/#terrain/seed-world-planner` 作为闪应用地址，因为 Gallery 会再创建一层 iframe，CandyJar 不会注入到实际 Demo 页面，调用最终会以 `FlashApp.remoteSkill` 超时结束。语音 HUD 的每次 AI 请求都固定选择 `model: "dsv41flash"`，并要求 canonical 模型请求包含原生 `tools`、`toolChoice: "auto"` 和 `parallelToolCalls: false`。当前已发布壳会丢弃这些顶层 Tool 字段，因此 Flash App 与本地 Wrapper 都先通过版本化 `responseFormat` 兼容信封传输，ASAP 在模型调用前恢复成 canonical 顶层字段；这层兼容不改变 Agent 协议。部署时必须先发布支持该信封的 ASAP，再发布 Seed World，并把当前 Artifact 加入 requested-model 白名单、让服务端能够把 `dsv41flash` 解析为 `aisearch_dsv41flash`（DeepSeek V4.1 Flash），同时在闪应用能力声明中允许 `AI_CHAT` 与 `ASR`。

### 时间平滑过渡 API

`time.update({ timeHours: 24, fromTimeHours: 6, transitionDuration: 15 })` 表示先设置早上 6 点，再用现实中的 15 秒连续向前走到午夜，经过中午和黄昏，而不是倒退或瞬切。
`fromTimeHours` 可省略，此时从当前时刻开始；只有提供目标 `timeHours` 时才能指定起点。
`transitionDuration` 范围为 0–60 秒，省略默认平滑过渡 5 秒，0 表示瞬切；23 到 1 会跨午夜，0 与 24 是同一时刻，相同起终点不额外绕一天。
API 声明要求 LLM 在用户未指定时长时省略该参数，指定时长时按要求传入，只有明确要求瞬切或不要过渡时才传 0；“变成晚上”“切到白天”不表示瞬切。
启用 IBL 时，引擎先保持起点 A，冻结完整目标 B 的时间、季节及天气参数，先分帧准备 B 的云缓存，再分帧烘焙 B 的 IBL；两步完成后才开始计时并插值共享时钟。
目标云保留 A 的显示缓冲，借用现有工作缓冲并仅增加一份缓存目标做交替累积；默认 512×512 HDR 配置新增纹理约 2.25 MiB，包含 R8 辅助纹理。
目标云每个引擎帧最多处理一个切片，不使用冷启动突发模式，最后一片云和第一帧 IBL 捕获也分开执行；实际帧耗时仍取决于 GPU 和分辨率，不承诺所有设备零掉帧。
IBL 准备完成后归还借用的缓冲并释放额外缓存；取消、替换和销毁也必须归还资源。
过渡期间锁住两份环境光，漫反射 SH 与镜面反射按同一进度从 A 混合到 B，不执行中间时刻或动态云的 IBL 烘焙；结束后提交 B 并恢复普通调度。
这是端点环境光的平滑切换，不保证跨越正午等中间时刻的物理光照准确性；准备耗时不计入 `transitionDuration`。
时间和同时指定的季节、天气由同一个进度驱动，准备 B 期间不会提前推进季节；`await time.update()` 在过渡完成后返回真实世界状态；`waitForIbl: false` 仅跳过额外的环境光发布等待，不跳过时间过渡。
过渡锁期间收到的显式环境刷新请求合并保留，在解锁后按最终状态重新调度；不会因调用方已标记同步而静默丢失。
新时间设置、手动时钟编辑、取消请求或销毁场景会中断旧过渡并使其抛错；IBL 端点过渡取消时恢复 A 的时间和环境光再释放资源，不能把旧请求误报为已抵达终点。
Seed World 的单段脚本预算为 150 秒，覆盖最长 60 秒过渡和最多 70 秒 IBL 等待并保留余量；模型请求预算保持不变，多次串行长过渡仍受单段脚本预算限制。

### 本地完整链路启动手册

本流程同时启动 Gallery 静态开发服务和支持原生 Tool Calling 的 ASAP 服务，并通过 ASAP 自带的 Flash App Wrapper 测试真实模型请求。两个服务都应在独立终端以前台进程运行。服务启动顺序没有要求，但必须等两个健康检查都通过后再打开测试地址。

前置条件：

- Engine worktree 已经安装依赖并且 `world/scripts/run-engine.mjs` 可以正常物化引擎；
- ASAP Service 已经创建 `.venv`，并能使用 `.venv/bin/python web/app.py --port 8081` 启动；
- 本地模型访问所需的网络和账号环境已经可用；
- 端口 `4173` 和 `8081` 没有被其他进程占用。

终端 A：启动 Seed World 页面。

```bash
ENGINE_WORKTREE_ROOT=/absolute/path/to/engine-next-dev-2.0
cd "$ENGINE_WORKTREE_ROOT/world"
pnpm gallery:sync
node scripts/run-engine.mjs pnpm --dir world-gallery exec vite serve . \
  --config vite.config.js \
  --host 127.0.0.1 \
  --port 4173
```

看到 `VITE ... ready` 后保持该终端运行。

终端 B：启动 ASAP Wrapper 与 CandyJar 后端。

```bash
ASAP_SERVICE_ROOT=/absolute/path/to/asap-service
cd "$ASAP_SERVICE_ROOT"
.venv/bin/python web/app.py --port 8081
```

ASAP 的初始化时间明显长于 Vite。必须等日志同时出现 `Application startup complete` 和 `Uvicorn running on http://0.0.0.0:8081`，不能只看到“服务器启动于端口”就开始测试。

终端 C：执行健康检查。

```bash
curl -fsS -o /dev/null \
  http://127.0.0.1:4173/demos/terrain/seed-world-planner/index.html \
  && echo "Seed World 4173 ready"

curl -fsS -o /dev/null \
  http://127.0.0.1:8081/static/mini_app_wrapper_bundle/mini_app_wrapper.html \
  && echo "ASAP Wrapper 8081 ready"
```

两个命令都成功后，打开下面这个完整地址：

```text
http://127.0.0.1:8081/static/mini_app_wrapper_bundle/mini_app_wrapper.html?mini_app_url=http%3A%2F%2F127.0.0.1%3A4173%2Fdemos%2Fterrain%2Fseed-world-planner%2Findex.html%3FaiChat%3D1&app_shell_url=http%3A%2F%2F127.0.0.1%3A4173%2Fdemos%2Fterrain%2Fseed-world-planner%2Findex.html%3FaiChat%3D1&alipay_uid=seed-world-ai-local-e2e&wrapper_rev=seed-world-voice-hud-v1
```

### 完整链路验收

1. 默认 URL 会直接生成 3D；普通 Debug 模式先点击“生成 3D”，带 `camera` 定位参数的 Debug 深链接会直接生成 3D 并恢复相机位置。
2. 等待 3D Runtime 完成初始化，底部应出现持续呼吸的彩色圆球，空闲时不显示额外提示文字。
3. 按住圆球并说“请告诉我当前世界的 Root Seed，只需要回答数字”；圆球应发光，液态玻璃面板应实时显示识别文本。
4. 松开圆球后应保留识别出的用户原话，并以文字透明扫光表示任务正在执行；任务完成前不应显示规划、Tool 或中间步骤。最终回复的数字必须等于当轮 Trace 的 `worldBefore.world.rootSeed`（等同于发给模型的 `world_thumbnail.world.rootSeed`）。该值已存在于有界世界摘要中，因此模型可以直接返回不带 Tool Call 的最终 Assistant 文本；不得用默认 Geology Seed `1729` 代替 Runtime Root Seed。
5. 再按住说“找到海拔最高的地方并把我传送过去”；Agent 应先调用 `api_search` 检索 `spatial.search` 与 `spatial.teleport` 声明，再调用 `execute` 在脚本内从最新运行时位置中选择最高点并传送；HUD 不展示内部步骤，相机最终应移动到目标处并显示最终结果。
6. 语音期间漫游输入必须暂停，任务完成后必须恢复；把手指拖出圆球再松开也必须结束 ASR。
7. 浏览器中不应出现“当前环境没有注入 ASR”“本地预览没有连接到 ASAP CandyJar 通道”或 `CandyJar call timed out: FlashApp.remoteSkill`。
8. Agent Trace 应记录匹配 `tool_call_id` 的 Assistant Tool Call 与 Tool Result，并显示 `debug.modelName` 为 `aisearch_dsv41flash`（DeepSeek V4.1 Flash）；ASAP 终端应记录 requested-model 路由和模型 HTTP 请求成功日志。

桌面上不方便授权麦克风时，可以在 DevTools 运行 `window.seedWorldAI?.submit("请告诉我当前世界的 Root Seed，只需要回答数字")` 单独验证 Agent 链路；它不能替代 ASR 验收。

Agent Trace 在 PC 和移动端默认开启（与 `debug=1` 相互独立），页面右上角会始终出现避开安全区的 `Agent Trace` 按钮；仅在明确不需要诊断时可追加 `agentTrace=0` 关闭。任务执行期间按钮会显示“执行中”，面板可实时查看、复制或下载本轮尚未结束的 Trace；任务结束后则保留完整终态 JSON。ASR 尾音窗口编辑器可以直接修改最短等待、文字更新后的稳定等待和最长等待，应用后写入当前浏览器的 `localStorage`，后续录音无需重新构建或发布即可使用；录音或 Agent 任务执行期间不接受修改。面板中的指令编辑器会带入最近一次 ASR/Agent 指令，可修正后点击“执行指令”或按 `Ctrl/Cmd + Enter` 以文本输入重新运行；原始语音 Trace 与修正后的文本 Trace 分开保存，便于对照 ASR 和 Agent 行为。Trace 会把一次交互的 ASR 文本与耗时、该次实际采用的尾音参数、发给 LLM 的完整 messages、模型响应与重试、每一步可见的 Tool、Agent Script、Tool 输入/输出/耗时、最终错误，以及执行前后的精简世界状态关联在一起。长按 Siri 球后会立即创建同一个进行中 Trace，按住期间持续写入壳注入能力、实际 Provider，以及 start、ready、流式 text、stop、end、terminal、release 的有界事件时间线；每条文字还会标记发生在松手前、尾音窗口内还是 `stop()` 后，并保存 `seq`、`isFinal`、松手时文字、调用 `stop()` 时文字以及 release→stop→end 的分段耗时。松开后同一个 `interactionId` 继续承载 Agent 与 Tool 事件，因此即使 ASR 卡在中途也可以打开面板复制现场。除“未识别到文字”以外的 ASR 失败会自动开启 Trace 按钮，手机端可直接点击“复制”提供诊断证据。Trace 的游戏区域、开关和工具栏禁用移动端长按选中、拖拽与系统菜单，只有指令编辑器和 JSON 内容区保留文字选择能力。

也可以在 DevTools 中随时控制和读取，不需要重新启动页面：

```js
window.seedWorldAI?.debug.enable();
window.seedWorldAI?.debug.getLastTrace();
await window.seedWorldAI?.debug.copyLastTrace();
await window.seedWorldAI?.debug.downloadLastTrace();
window.seedWorldAI?.debug.getCurrentTrace();
await window.seedWorldAI?.debug.copyCurrentTrace();
await window.seedWorldAI?.debug.downloadCurrentTrace();
window.seedWorldAI?.debug.clear();
window.seedWorldAI?.debug.disable();
```

Trace 默认采集，最多保留当前页面会话的 20 条已结束记录；刷新页面后仍可继续读取。Trace 是诊断旁路，采集、存储或面板失败都不能改变 Agent 的执行结果。复现无响应时不要等待任务结束，直接打开面板复制当前 Trace；它会包含已经发生的模型与 Tool 事件，便于判断链路停在哪一层。

只有步骤 1 至 8 全部满足，才表示页面、Wrapper、ASR、CandyJar、requested-model 路由、原生 Tool Calling、Agent Script、应用 Tool 执行和前端 AgentLoop 的完整链路已经跑通。

### 构建可发布的闪应用

Seed World Planner 拥有独立的生产构建入口，不需要发布整个 Gallery，也不依赖 Gallery 的路由或 iframe。构建脚本会先同步当前 worktree 的 Gallery 源码，再从物化后的 Engine workspace 执行 Vite production build。它会把 Terrain Project 声明的资源和生产素材 Catalog 声明的资源复制到产物，并在结束前逐项验证清单、Worker、入口和相对资源路径。

```bash
ENGINE_WORKTREE_ROOT=/absolute/path/to/engine-next-dev-2.0
cd "$ENGINE_WORKTREE_ROOT/world"
pnpm build:seed-world-flash-app
```

成功后，唯一应发布的目录是：

```text
world/dist/seed-world-flash-app
```

该目录根部必须直接包含 `index.html`。不要发布仓库根目录、`world/gallery`、`world/.materialized` 或 `node_modules`。构建产物使用 `./` 作为 Vite base，因此可以部署到 `render.lingguangcontent.com` 的任意嵌套路径。生产页面与不可变资源可能分属 `lingguangcontent.com` 和 `lingguangobjects.com`。Seed World 的 Field 与 Heightfield Water Worker 必须使用 Vite `?worker&inline` 构建为自包含的 classic Blob Worker。这既避免跨域 Worker URL，也兼容钉钉 UWS 等不支持 Module Worker 的移动 WebView；不要改回 `{ type: "module" }`。语燕部署还会忽略 `.br`、`.r8`、`.f32le`、`.treewind` 和 `.asset` 等物理文件扩展名。生产构建会保留资源字节和虚拟资源名，只给物理发布路径追加可透明传输二进制的 `.wasm` 后缀并同步重写 Project/Catalog；不要直接复制源资源目录替代构建脚本。正式 Flash App 容器会通过 sandbox iframe 的 `srcdoc` 运行入口，此时 `location.href` 是 `about:srcdoc`。页面 URL 状态必须通过 `SeedWorldDocumentUrl` 解析宿主注入的 `flash-app-html-url`，不能直接对 `about:srcdoc` 调用 `history.replaceState`，否则主模块会在按钮监听器注册前中止。

发布器使用的源码备份必须单独构建，不能再把整个 `engine-next-dev-2.0` worktree 作为 `--source-dir`：

```bash
cd "$ENGINE_WORKTREE_ROOT/world"
pnpm build:seed-world-flash-source
```

该命令生成 Seed World 的可重建源码快照，排除测试、重复 Grasslands 源素材和生成缓存。
源码快照不包含独立 Grasslands 场景的 `public/Payloads`、`public/Regions` 预计算数据，以及独立 `screen-space-reflection` Demo 的 `assets`；Seed World 使用自己的 Project、生产素材清单和运行时生成的地形字段。
环境音频、程序化树木资源和共享源码仍保留，不通过删除运行时资源降低包体积。
它会使用当前物化 Engine 对快照执行一次独立 Vite 构建，并逐文件比较重建产物与完整源码构建的文件集合和 SHA-256，再生成压缩包检查体积。
压缩结果超过 100 MiB 时命令直接失败。
成功后源码备份目录是 `world/dist/seed-world-flash-source`，旁边的 `seed-world-flash-source.tar.gz` 只作为本地体积证据，不需要传给发布器。

在发布前可以用普通静态服务器验证独立产物，但普通页面没有 ASAP 模型通道，只用于验证 3D、资源和 Worker：

```bash
python3 -m http.server 4180 \
  --bind 127.0.0.1 \
  --directory "$ENGINE_WORKTREE_ROOT/world/dist/seed-world-flash-app"
```

打开：

```text
http://127.0.0.1:4180/?mode=world&aiChat=1
```

### 发布为灵光闪应用

发布使用内部 PUGC Flash App 发布工具管理 Artifact ID、版本、OSS 上传和注册。一个发布工具 checkout 只能绑定一个 Artifact；首次发布新 Artifact 时必须用它自己的 `scripts/init-app-context.cjs` 初始化，不能借用其他应用的 `app-context.local.json`。

```bash
ENGINE_WORKTREE_ROOT=/absolute/path/to/engine-next-dev-2.0
PUBLISHER_ROOT=/absolute/path/to/pugc-flash-app-2

cd "$ENGINE_WORKTREE_ROOT/world"
pnpm build:seed-world-flash-app
pnpm build:seed-world-flash-source

# 仅首次创建该 Artifact 时执行；后续版本继续复用同一个发布工具 checkout。
test -f "$PUBLISHER_ROOT/scripts/app-context.local.json" || \
  node "$PUBLISHER_ROOT/scripts/init-app-context.cjs"

env -u OSS_ACCESS_KEY_ID -u OSS_SECRET_ACCESS_KEY \
  node "$PUBLISHER_ROOT/scripts/deploy.cjs" \
    --project-dir "$ENGINE_WORKTREE_ROOT/world/dist/seed-world-flash-app" \
    --source-dir "$ENGINE_WORKTREE_ROOT/world/dist/seed-world-flash-source" \
    --title "Seed World AIChat" \
    --type game \
    --app-key flash-app \
    --timeout 300
```

发布只有在 OSS 上传、数据库注册、Artifact 版本更新和 Entry URL 四部分全部成功后才算完成。发布后需要打开 Entry URL，确认页面注入了当前 `window.artifactId` 和 `window.artifactVersion`，再进入 3D 世界验证 AIChat。PUGC 更新 Artifact 后，已经存在的正式分享链接仍可能固定在上一次上架的 Entry URL；必须在灵光侧重新执行正式发布/上架，并检查分享页内层 `flash-app-html-url` 已指向本次 Entry，不能只验证 Artifact 的最新 Entry。当前固定请求 `model: "dsv41flash"`；目标 ASAP 环境必须允许当前 Artifact 使用 requested-model 路由，把该别名解析为 `aisearch_dsv41flash`（DeepSeek V4.1 Flash），并完整转发原生 Tool 定义、Assistant Tool Calls、Tool Results、`tool_call_id` 与 finish reason。验收时，前端 Agent Trace 的 `debug.modelName` 应显示 `aisearch_dsv41flash`（DeepSeek V4.1 Flash）；如需核对完整路由证据，再检查 ASAP 服务端 digest 中的 `requested_model=dsv41flash`、`model_name` 和 `model_route=requested_model`。

### 常见故障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 4173 或 8081 健康检查失败 | 服务未启动、仍在初始化或端口被旧进程占用 | 查看对应前台终端；用 `lsof -nP -iTCP:4173 -sTCP:LISTEN` 和 `lsof -nP -iTCP:8081 -sTCP:LISTEN` 定位进程 |
| 页面提示没有 CandyJar 通道 | 直接打开了 4173 页面 | 必须从 8081 Wrapper 的完整测试地址进入 |
| `FlashApp.remoteSkill` 超时，ASAP 终端没有请求日志 | Wrapper 包的是 Gallery 路由，实际 Demo 位于第二层 iframe | 确认 `mini_app_url` 直接指向 `/demos/terrain/seed-world-planner/index.html?aiChat=1`，不能使用 `/#terrain/seed-world-planner` |
| ASAP 日志还没有 `Application startup complete` | 服务仍在执行资源同步和脚本预热 | 等待启动完成后刷新 Wrapper 页面 |
| 页面仍加载旧代码 | 物化目录没有同步或浏览器保留旧 Wrapper 页面 | 重新运行 `pnpm gallery:sync`，重启 4173，并修改 `wrapper_rev` 或刷新页面 |
| 最新 Entry 正常，但正式分享页仍运行旧代码 | 正式分享记录固定在上一次上架的 Artifact Entry | 在灵光侧重新发布/上架当前 Artifact 版本；确认分享页内层 `flash-app-html-url` 和主 JS hash 已切换到最新 Entry |
| Trace 未显示 `aisearch_dsv41flash`（DeepSeek V4.1 Flash） | Artifact 不在 requested-model 白名单，或服务端没有解析 `dsv41flash` | 先检查 Trace 的 `debug.modelName`，再从 ASAP 服务端 digest 核对 `requested_model` / `model_route` / `model_name` 与 Artifact 白名单 |
| 独立产物进入 3D 后资源 404 | 发布了错误目录或绕过了 production build | 重新执行 `pnpm build:seed-world-flash-app`，只发布 `world/dist/seed-world-flash-app` |
| Entry URL 能打开但资源请求指向站点根 `/assets` | 使用了非闪应用构建或修改了 Vite base | 使用仓库构建脚本；产物入口必须引用 `./assets/...` |
| Chrome 可以进入 3D，但钉钉固定停在 81% 或 93% | 钉钉 UWS 不支持 Module Worker，或 Worker 又创建了嵌套 Worker | Field 与 Heightfield Water Worker 使用 Vite classic inline Worker；Field Worker 不再创建装饰子 Worker |
| Entry URL 请求 `.br`、`.r8`、`.r16`、`.treewind` 等资源时 404 | 绕过了 PUGC 物理扩展名兼容转换 | 重新运行标准构建脚本；检查产物清单的物理路径以 `.wasm` 结尾，虚拟资源名保持不变 |
| 源码备份超过 100 MiB | 把整个 worktree 或完整 Gallery 交给了发布器 | 先运行 `pnpm build:seed-world-flash-source`，并把生成的专用目录传给 `--source-dir` |

### 关闭本地预览

分别在终端 A 和终端 B 按 `Ctrl-C`。退出后用下面的命令确认两个端口都已经释放：

```bash
lsof -nP -iTCP:4173 -sTCP:LISTEN
lsof -nP -iTCP:8081 -sTCP:LISTEN
```

两个命令都没有输出时，本地预览才算完全关闭。

运行相关回归测试：

```bash
cd world
pnpm gallery:sync
node scripts/run-engine.mjs pnpm --dir world-gallery run typecheck:terrain
node scripts/run-engine.mjs pnpm --dir world-gallery exec vitest run \
  --config demos/terrain/project-tests/vitest.config.ts \
  demos/terrain/project-tests/SeedWorldAgentApplication.spec.ts \
  demos/terrain/project-tests/SeedWorldRuntimeEnginePort.spec.ts \
  shared/ai-chat/tests/AIChatAgentLoop.spec.ts \
  shared/ai-chat/tests/AIChatAgentProtocol.spec.ts \
  shared/ai-chat/tests/AIChatSession.spec.ts \
  shared/ai-chat/tests/AIChatController.spec.ts \
  shared/ai-chat/tests/AIChatCandyJarBridge.spec.ts \
  shared/ai-chat/tests/AIChatConversationHistory.spec.ts \
  demos/terrain/project-tests/SeedWorldAIChatIntegration.spec.ts \
  demos/terrain/project-tests/SeedWorldRuntimeConsumption.spec.ts
```
