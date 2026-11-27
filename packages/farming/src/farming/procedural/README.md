# 程序化植物：单一源格式

所有可种植内容使用同一条 `createPlantingCatalog → PlantRenderState → createPlantInstance → PlantGeometryEvaluator / ProceduralPlant` 链路，详见 [公共 API](../README.md)。本目录负责形态，不负责玩法时钟。

## 源文件与编译结果

当前只接受一个源格式：`PlantGrowthRecipeDocument`，`schemaVersion: 1`、正整数 `revision`。历史 `version: 2/3` 文档、已序列化的内部编译结构和阶段模型均不可加载。格式号是解析契约，修订号是内容引用，两者不可混用。

```ts
interface PlantGrowthRecipeDocument {
  schemaVersion: 1;
  revision: number;
  id: string;
  anchors: PlantAnchor[];
  surfaces: PlantSurface[];
  leafTemplates: PlantLeafTemplate[];
  stems: PlantStem[];
  leaves: (PlantLeaf | PlantTemplateLeaf)[];
  volumes: PlantVolume[];
  meshes?: PlantMeshOrgan[];
  supports: PlantSupport[];
  maturity: GrowthCurve<number>;
}
```

- `anchors`：父子挂点、局部位移和方位曲线。检查重名、引用缺失和连接环。
- `surfaces/leaves`：保留实测叶面网格及各 age 的采样姿态。
- `leafTemplates`：参数叶型，包含长宽、弯曲、下垂和中脊曲线；叶片实例声明模板和尺寸。
- `stems`：挂点路径、半径曲线和截面；`volumes`：椭球式花、果实、根或其他器官。
- `meshes`：实测器官顶点、UV、索引和缩放/展开/倾斜曲线，保留 Farmlands 成熟器官拓扑。
- `supports`：独立静态支架；`maturity`：材质变色采样参数，不是领域成熟判定。

`parsePlantGrowthRecipe` 校验源文档、展开叶型模板并冻结内容，得到不含格式号的内部 `PlantGrowthRecipe`。内部结果只在进程内复用；重新反序列化的内部对象不会被当作另一种源格式接受。单个解析结果可供多个求值器共享，个体工作数组始终独立。

`plant.json` 同样使用 `schemaVersion: 1` 与 `revision`，保存身份、来源、材质和预览注释。`recipe.json` 的修订独立于材质/元数据修订，`CropDefinition.appearance` 同时引用两者。`atlas.png` 是唯一纹理入口；图集区域变更应更新引用它的内容修订。

生产文件：`catalog/plants/<plant-id>/procedural/{plant.json,recipe.json,atlas.png}` 及相邻 `ATTRIBUTION.md`。不再需要 `manifest.json`，周期和阶段只在公共物种内容定义。

## 求值与资源

`PlantGeometryEvaluator.update(age, shape)` 初始化后复用拓扑、位置、法线和工作数组；返回的是借用的可变几何视图，需要保存历史结果时自行复制。一次性独立计算可使用 `generatePlantGrowthGeometry`。非法曲线、非有限值、索引越界、网格 UV 数量不符都在创建 GPU 资源前被拒绝。

`ProceduralPlant` 上传动态位置/法线，索引、UV 和着色遮罩保持固定。器官在出生前缩为零，跨阶段不换模型。`createPlantInstance.update` 同时更新 age、株型、材质颜色和出苗缩放；阶段由周期确认进度计算，不能从器官数量或美术文字推断。

`ProceduralPlant.setAnchorOffsets(offsets)` 接收 `Map<anchorId, [x, y, z]>`，位移位于该锚点的父锚点坐标系；属于实例级表现状态，不修改源配方或成长进度。它保留网格拓扑、材质和缓冲身份，更新现有位置/法线缓冲及包围盒；返回是否发生更新。相同位移跳过上传，空 Map 清除位移，未知锚点或非有限位移原子拒绝。

`createPlantInstance` 在确认进度达到 1 后，按 Engine、配方身份与修订/内容、图集/材质及精确株型共享成熟资源。成熟读档直接借用资源；生长中的实例保留独占显示，准备完成后在原根节点与 Renderer 上切换。位置、朝向与缩放不进入共享键，由引擎已有自动实例化合批。朝向由实例 ID 确定，读档与跨成熟切换保持一致。

共享几何冻结；进度回退、株型或锚点修改先恢复独占资源。存在自定义锚点位移的植株保持独占，清除位移后可重新共享。直接调用 `createProceduralPlant` 的编辑预览继续使用独占生长资源。收获只克隆目标材质，借用原网格；动画结束或取消后再释放或恢复绑定。

实例释放实体及自有网格、缓冲和材质，最后一个借用者归还后回收共享资源。图集继续归 ResourceManager，未引入全局清缓存。`query().resources` 提供绑定状态、共享键、引用数和 Mesh/Material ID；Presenter 诊断单独累计共享上传，避免逐株重复计数。宿主挂点、缩放及 60 米隐藏/50 米恢复策略沿用原宿主逻辑。

## 内容重建

- 13 个 Farmlands 配方：[离线转换说明](tools/farmlands/README.md)。`generate.py` 输出当前单一源格式与元数据，不再生成阶段 manifest。
- 水稻：`catalog/plants/rice-quaternius/procedural/generate.py` 输出相同格式，以模板叶片和穗表达生长。
- 旧番茄参考：`tests/fixtures/reference-plants/tomato-bumroker/procedural/import.py` 输出同一源格式，提取证据独立保存为 `source-measurements.json`；仅供离线与测试，生产目录不注册。

保留成熟几何及来源署名；地下种子破壳、无限分枝、季节/再生循环、风和 LOD 不在当前契约中。历史开发记录 [连续生长](CONTINUOUS-GROWTH.md) 与 [移动配方精简](MOBILE-RECIPES.md) 只用于追溯，不是当前 API 或本轮验收结果。
