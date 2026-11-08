# 建筑 Prefab 规范

2026-10-28：固定组合已全部迁入原生 Prefab；运行时不能再按模型文件名维护第二份组合清单。

## 责任边界

- **Prefab 定义固定组成**：节点层级、零件数量、相对位姿、Mesh、Material 和固定的发光中心。配套窗框和玻璃、灯壳和内件可以在同一个 Prefab；不同材质不要求不同 Prefab。
- **Entity / Component 定义实例编辑**：放置位置、整体尺寸、启用状态以及灯光强度等公开参数。
- **程序定义环境相关生成**：沿墙开洞、曲面贴合、按长度重复单元、生成老虎窗的小屋顶。程序不能再维护同一个 Prefab 的第二份固定零件清单。
- **合批消费 Prefab**：读取原生 Renderer 及其材质、累计子节点变换，生成可丢弃的渲染数据。禁止为每块砖实例化常驻编辑 Entity；多材质按实际材质拆批，对象拾取身份不随批次变化。
- **原生资源是唯一持久化来源**：CPU 查询、Worker 编译和渲染从同一 Mesh 与 Prefab 派生。不另存一份可编辑的组合 JSON 或顶点目录。
- **作者保存与消费结果独立**：通用编辑器检查 Source 格式、层级和引用完整性；建筑消费能力在 Apply 时检查，通过 `runtimeErrors` 报告。预览失败仍可保存作者修改，不自动撤销。

## 组合结构（以壁灯为例）

VFS：`Building/Units/Prefabs/wall-lantern.prefab`。

```text
壁灯（BuildingAssemblyComponent）
├─ body（BuildingUnitComponent + MeshRenderer）
└─ light（BuildingUnitComponent + MeshRenderer）
```

资产包通过 `assemblies["wall-lantern/1"]` 引用它；键只选择公开类型及规格，不描述其内部零件。

- 子节点的 `MeshRenderer` 持有原生 Mesh 和 Material。`BuildingUnitComponent.surfaceKind` 声明现有装饰 Shader 的表面语义（灯壳 / 发光内件等），不用于推导零件名称或层级。
- `emissionOrigin` 是模型局部发光中心，随该节点的累计变换进入编译结果。壁灯与屋顶灯均在 Prefab 中定义；屋顶灯的发光内件必须提供它。保留既有灯光语义：Shader 灯芯随实例尺寸缩放，屋顶 PointLight 的安装偏移不随实例尺寸缩放；两者都从同一资产坐标派生。
- 支持中间分组、嵌套子节点、平移、Euler 旋转（度）和正数缩放。法线按逆转置处理，几何与包围范围均从变换后的 Mesh 派生；不改写共享 Mesh。
- 节点名称组成派生零件路径：非根节点名字非空、不含 `/`，同一路径不能重名。改名不改变整盏灯的编辑／拾取对象身份。
- 当前支持展开的、启用的静态 Source 层级；每个渲染节点一个 MeshRenderer、一个完整三角形 submesh 和一个 Material。暂不支持嵌套 Prefab 实例、Script、动画、禁用的资产子节点、镜像或退化缩放；建筑 Apply 必须报告错误而非静默丢弃。实例灯的启用仍由 WallLampComponent 管理。
- 壁灯的原生 Mesh、Material 由完整壁灯 Prefab 引用。
- `assemblies` 的 Worker 描述和扁平化几何只存在于运行时派生快照；不写回 VFS。

## 全部固定组合

- 30 个组合 Prefab 覆盖 36 个公开类型／rank：Cottage / Gothic / 箭缝普通窗、Cottage 转角窗、完整与半屋顶窗、Cottage / Gothic 门、两类屋顶舱门、壁灯和屋顶灯。
- Cottage 完整屋顶窗的三个 rank 共享单联 Prefab，由算法按 rank 重复；普通 Gothic 窗与 Gothic 半屋顶窗共享固定窗体，由各自算法安装。`assemblies` 仅选择组合资源，不描述内部零件。
- `BuildingUnitComponent.attachment` 为 `body`（默认）、`frame` 或 `glass`，声明安装／材质切换能力，不依赖 Entity 的名称。Cottage 半窗的玻璃具有独立贴墙位姿；其他零件跟随主体。子节点可改名、分组、添加，算法遍历实际层级。
- 可切换石材的窗框通过 `stoneFrame` 引用原生排列 Prefab。木框、石框均应用该节点的累计变换；共享石框资源仍使用相同排列单元，避免因组合路径不同拆出重复批次。
- 拱洞没有固定模型组合，仍由开洞算法生成。环境相关石帽、屋顶瓦片、百叶和窗台继续按安装环境生成／重复；资产包只保留 16 个被这些算法实际引用的独立装饰／碰撞单元。
- 来源工程 `engine-next` 的离线导出器（`world/scripts/building-assets/export-native.py`）保留已经编写的组合 Source，从 kit 引用读取资产选择并清理不可达资源，不通过 TS/Python 配方重新生成组合。本仓库不包含这个导出器。

现有专用排列单元仍有 Shader/顶点布局约束；当前实现不表示任意 Shader、动画或嵌套 Prefab 实例均已支持建筑合批。

## 建筑预制件（新架构）

新架构的墙上预制件不使用 `assemblies`，而使用 `prefabs`。两者的区别：

- `prefabs` 的成员位姿就是安装位姿。窗框离墙、玻璃内缩、灯离墙都写在子节点的 `position` 里，程序不再补偏移。
- 根节点是 `BuildingPrefabComponent`。属性 `openings: [{ min: [x, y], max: [x, y] }, ...]` 是预制件在墙上开的洞，用预制件自身坐标；多个矩形合起来是一个洞。`curvedNarrowing` 是洞在弯曲的墙上变窄的宽度（米）。
- 用排列单元绘制的成员（例如石帽）挂 `BuildingUnitMemberComponent`：`unit` 引用资源包里的石材排列单元；`span: [x0, x1]` 表示成员在这段 x 范围内沿墙弯曲，没有 `span` 时按节点位姿固定放置。
- 成员不需要 `attachment`。所有成员随预制件一起放置。
- 资源包编译时，成员网格以 `prefab/<类型>/<规格>/<路径>` 命名，包围盒由烘焙后的网格得出。

当前的建筑预制件：`window-cottage/1..3`、`door-cottage/1..3`、`wall-lantern/1`、`window-gothic/1..3`、`door-gothic/1..3`、`window-arrow-slit/1..3`。

### 资产包的消费契约

`BuildingAssetContract.ts` 定义建筑生成器必需的排列能力及实例记录布局；它约束语义键和 ABI，
不绑定某个 Prefab 路径。建筑运行时原生资源提取执行该契约，不作为通用编辑器的保存门禁。
替换砖瓦、木构的 Prefab 必须仍可消费相应生成器的记录；Gothic 框/玻璃沿资产包实际引用检查。
未使用的捕获模板（例如 `units.plaster`）不是必需依赖。

纹理检查复用排列单元的 `textureSlots` 以及装饰、灰泥、石地板的实际绑定声明；
调色模式同时需要中性色纹理和原始 RGBA 调色数据。缺少这些引用在 Apply 的资源提取阶段报告，保存仍独立完成。这个契约不代替网络/GPU失败处理，也不声称
能静态证明任意自编 GLSL 的正确性。

组合取数时，单位矩阵保留原生属性和包围盒；只有真正发生变换的空间属性才进行
float32舍入和包围盒重算。共享 Mesh 不变，颜色/UV/整数属性不做无意义的数组往返转换。

## 验收条件

1. 所有默认组合的几何、材质、发光和拾取正确。
2. 修改子节点位姿、添加第三个零件、更换子节点材质，无需改 TS 拼装配方即可生效。
3. 新 Engine 从保存的 VFS 重载得到相同结果；撤销恢复旧结果。
4. 错误引用、重复路径、循环层级在通用准备阶段失败；建筑不支持的节点状态在 Apply 报错，作者数据仍可保存。
5. 派生快照与资源生命周期正确；一个资产编辑不得修改旧快照或无关共享资产。

包内测试通过 `packages/building/tests/fixtures/constructionAssets.ts` 读取产品原生资产。来源工程的一致性验收见 `world/scripts/acceptance/README.md`。


## 原生几何与 Worker 边界（2026-10-28）

- 原生 Mesh 的可读顶点、索引和包围盒是几何来源。当前 BufferMesh 通过 Engine `BufferUtil.getVertexElementData/getIndexData` 读取标准格式；业务层只映射算法需要的语义并累计 Prefab 变换，不再生成 `sources/buffers/fields` 文件目录或二次解码。此改造没有把现有 Mesh 资产改成 glTF；glTF 读取 CPU 数据仍须加载时保留 `keepMeshData`。
- `BuildingCpuClient` 统一预览、安装校验和精细编译的 Worker 消息边界。Scene/Entity/Component、资源引用及 GPU 对象留在主线程；输入为参数、地形、从原生资源派生的几何数据。
- 每个 BuildingManager 使用一个按需创建的 Worker。粗模、开洞后的结构几何及查询数据在 Worker 生成；精细砖瓦仍按驻留需求编译，复用同一快照的贴地、接触和装饰安装结果。算法内部曲线对象保留在 Worker，不能当成普通数组传回再试图恢复其原型方法。
- 视图拥有可释放的编译句柄。替换、取消、地形候选丢弃和 Scene 销毁清理对应状态；迟到结果不能提交。相同原生几何和地形采样在 Worker 内按引用共享，最后一个快照释放时清理。
- 主线程继续绑定 Material、创建/上传渲染资源并处理运行时交互。精细支持面和粗模的表现输出仍有各自计算；不宣称全部 CPU 工作已移出主线程或全部阶段完全零重复。固定组合由上文的全部原生 Prefab 提供。


## 消费失败与恢复（2026-10-29）

- 专用排列单元当前只消费启用的根 Entity、BuildingUnitComponent 和 MeshRenderer，根位姿为单位矩阵且没有子节点。根变换、禁用或附加子节点在建筑 Apply 阶段报告错误，不再静默丢弃；通用资产保存仍成功。固定组合继续使用上文支持层级与累计变换的 assembly Prefab。
- Worker 实例故障与 Scene 编译服务销毁分开：前者拒绝在途请求、使其快照失效，后续编辑重新建立 Worker 及输入缓存；Scene 销毁才永久关闭服务。失效视图会重新准备，旧句柄和迟到消息不能作用到新 Worker。
- 世界入场时钟随宿主首次绑定初始化，独立于每次几何准备；建筑消费失败也允许编辑器揭幕。未交付候选的失败路径取消内部工作，不能依赖外层仍能找到候选对象。
