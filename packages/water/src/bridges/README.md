# 参数化木吊桥与引道

| 模块 | 职责 |
| --- | --- |
| SuspensionBridge | 无 Engine 依赖的米制参数、下垂曲线、四柱与模板合批几何 |
| SuspensionBridgeView | GLB 加载、Engine 素材租约、候选与 GPU 释放 |
| BridgeApproach | 岸上道路与路肩的整地目标；不创建独立渲染平面或材质 |
| Planner 的 PlanningSuspensionBridges | 干岸、物理承载路段、结构碰撞、坡度/净空及作者事务 |

## 几何与发布契约

- 长度为两桥头水平距离，widthM 为可通行净宽；桥面 `lerp(a.y,b.y,t)-4*sagM*t*(1-t)`。柱高/护绳高相对当地桥面，净空不通过改河床满足。长度重复源木板、宽度改变跨度，板厚与绳半径保留。
- 四柱分别采样真实柱脚占地最低 Terrain，下埋 0.1 米，顶部为桥面加柱高；模型、白盒与碰撞消费同一 towers。立柱与护绳不得侵入实际角色道路走廊。
- 引道沿原路预留 max(2,widthM×1.5) 米目标过渡并按坡度延伸；道路不足仍检查原末端支撑/台阶/干岸，不延入水域、障碍或移动无关 POI。桥口使用桥轴方向、净宽和端点高度生成完整共享入口边；引道越过入口平面的部分裁回该边，并使用相同高度。短引道也完成横坡过渡，调整后完整路面仍检查水域与障碍。
- 岸上引道只参与原固定分辨率 Terrain 的整地，最终行走消费实际地形高度；木桥范围内才使用桥面支撑，不保留悬空的独立引道支撑。入口使用桥轴全宽边，岸坡按干岸/障碍接受范围向桥端收口；桥口按现有地形网格对角线预留干岸范围，地形承接区以桥面下退 0.08 米为目标并沿真实下垂曲线过渡，桥板端部嵌入岸坡；通用整地封口还保留桥面下 0.04 米上限。路肩沿原坡度过渡，水域内始终保留自然床面。没有独立引道 MeshRenderer、专用 Shader 或泥土贴图，外观完全沿用地形道路覆盖和配色。
- 自动桥头沿既有承载路段找最近可行落点，显式跨度围绕确定性自动中心求解。作者配置经 Session/schema；失败保留旧作者与场景，不设置 Seed 特例或关闭碰撞。
- 预览与 SeedWorld 消费同一 suspension/approach，不二次计算桥高。共享资源最后 owner 退休才释放，构建失败释放拥有的 Vertex/Index Buffer，借用纹理不由候选提前销毁。
- SeedWorld 整组桥未变化时保留原有整组复用；部分桥变化时，按完整单桥数据快照复用未变桥的 GPU 网格及交互几何。候选有独立 Entity/Renderer 和拾取材质，取消或旧场景退休只释放自身租约；最后使用者才销毁网格与 Buffer。首次创建、变化的桥及不同 Engine 之间不复用。通行、模型精度和引道不受此缓存影响。

## 两档渲染 LOD

`SuspensionBridgeView.updateLod(camera)` 在相机移动后、渲染前更新；SeedWorld 的 late frame 已接入。相机到整桥 LOD0 世界 AABB 最近距离 **≤25 米为 LOD0，>25 米为 LOD1**。使用包围盒距离保留桥头附近的细节；这是整桥切换，长桥上没有分段选档。

LOD0 保留原 GLB、几何与材质。LOD1 使用原 FBX 的 LOD1 木板/立柱、LOD0 小绳结，并将程序绳索从 8 边/0.25 米采样改为 4 边/1 米采样。九种木板的数量、位置、净宽和桥面曲线规则保持；局部轮廓使用原素材的 LOD1；引道、编译 deckPath 与通行高度查询不参与 LOD。两个 Renderer 只替换网格，材质与阴影开关不变，没有渐变期间的额外绘制。交互 BVH 继续使用 LOD0，LOD1 包围盒包含 LOD0 几何，防止粗筛漏掉交互命中。

每桥两档网格常驻并一起参与资源复用；切换不生成网格、不上传 Buffer。代价是额外网格内存与首次构造工作，LOD 不代表总显存下降。低模 GLB 为约 86 KiB 的纯几何，复用已有六张纹理。离线重建：

```sh
blender --background --factory-startup --python tools/build_farmlands_bridge.py -- --source /path/to/Farmlands --lod 1
```

交互测试入口：`demos/terrain/project-tests/SuspensionBridgeLod.browser.html`，支持 Orbit 左键旋转、滚轮缩放、右键平移，距离与 LOD 实时更新；可切换 24/26/60 米恢复固定视角，并在当前视角对比原 LOD0；`?length=200` 检查长桥。历史 A/B 用 `?verify=1`：先把基线提交的 View 与生成器保存为相邻 `SuspensionBridgeView.before.ts`、`SuspensionBridge.before.ts`，将基线 View 导入改为 `./SuspensionBridge.before`，再 `gallery:sync`。完成后删除临时基线文件。性能与验证范围见实施记录；低模外观仍需用户验收。

## 外观与素材重建

源为 `Polyart/PolyartStudio/Farmlands/Meshes/Props/Exterior/SM_Farm_Bridge_{End,Middle}_01.fbx`。GLB 包含九种木板、立柱、绳结以及 WoodKitbash/Rope 六张贴图；只提交这一份内嵌图片，不保留重复的独立 wood/rope PNG。单位/LOD 来源见 [source.json](assets/source.json)。

```sh
blender --background --factory-startup --python tools/build_farmlands_bridge.py -- --source /path/to/Farmlands --output /path/to/export
```

导出器仅生成 GLB 和 source.json，贴图无损转换在临时目录完成后内嵌；个人 Blender 工程/预览工具留在离线工作区。运行时不执行导出器。

桥头插入 Terrain 本身的整地表面；Seed 的桥头与河岸通过普通 TerrainLayer 复用庄园泥土纹理，道路仍使用颜色层。原独立引道平面、MI_DirtPath 材质以及四张专用泥土贴图已按用户要求删除；木桥模型自带的木板与绳索纹理保持。

静态桥不模拟动力学，不生成挡土墙或改道掩盖空间不足。实际曲面仍经过三角网格/R16 离散，受限岸坡不能保证所有地形的美术效果。真实过桥、几何与资源验证及未验收范围见 [实施记录](../../demos/terrain/seed-world-planner/V2_IMPLEMENTATION.md)；自动化通过不代表美术通过。
