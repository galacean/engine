# River 陡坡高程过渡

## 根因与修复范围

河谷使用 `Polyline`，相邻高程锚点之间是直线。坡顶、坡脚的坡度突变形成真实几何折角，增加纹理、泡沫或仅细分直线不能改变轮廓。网络编译器还会将外部提供的高程重新线性化，因此只改路径采样也不足以修复。

新增 River 编译能力 `RiverPathMode.MonotoneElevation`，由河谷 Source 显式启用；不是 Look 特效。XZ 足迹、宽度和全部高程锚点保持不变，Y 使用三次 Hermite 插值。相邻坡度采用保形的加权调和切线，平坦或反向区间的公共切线为零，下降段不会插值出新的逆坡。外部高程解析保留这份采样结果，继续校验锚点及顺流高程。

此模式将目标采样间距缩为原配置的 1/4，曲线展平误差缩为 1/10，仍受现有总采样预算约束。旧模式保留原行为；当前网络中的保形高程用于 `external-resolved`，求解器拥有水位的路径仍遵守原节点高程求解。地形不修改，原始导出数据不修改。不是悬空水舌、垂直瀑布或流体模拟。

## UE 源码对照

本地 UE `Engine/Plugins/Experimental/Water/Source/Runtime/Private/WaterBodyRiverComponent.cpp`：

- `UpdateSplineMesh`：使用 spline 的位置和切线调用 `SetStartAndEnd`。
- `GenerateWaterBodyMesh`：`ConvertSplineToPolyLineWithDistances` 以 `Square(5.f)` 的弦误差容限离散 spline（UE 厘米单位，对应 5 cm）。

`Engine/Shaders/Private/SplineMeshCommon.ush` 的 `SplineMeshEvalSplinePos` 使用三次 Hermite 位置求值；`SplineMeshEvalSplineDir` 使用曲线导数计算方向。

本实现参考“曲线位置与切线共同决定形状，再离散为网格”的机制，并增加 River 高程的单调约束。没有复制 UE 的切线选择算法；SplineMesh、WaterInfoMesh 与最终 WaterZone 水面职责不同，不能用这些源码断言 UE 自带完整陡瀑布效果。

## 2026-09-15 验证

- Water 类型检查与生产构建通过，36 个文件共 248 项 River / WaterContactEffects 测试通过。
- 路径测试：上下坡口圆滑、锚点和 XZ 不变、区间无高程越界、下降单调、重复生成一致，Polyline 负对照仍保留尖折角。
- 真实河谷编译、两段落差及河床查询通过。对可见湿区内部超过 500 个三角形中心，使用与运行时相同的 `sampleSurfaceAtTime` 验证网格高度，误差小于 2 cm。静态中心线近似查询不等同于渲染三角形查询。
- Codex 内置浏览器运行生产构建；侧面固定位置 `[25,19,-65]`，目标 `[22,16.8,-81]`，FOV 38.3°，时间 2 s，2850×2648 画幅保存前后截图，隐藏景物以观察完整轮廓。坡顶由尖角变为弧面。
- 跌水三类特效有实际像素贡献；时间冻结、回放、流速归零及恢复、外观 JSON 和非法输入保护通过。10 次场景往返与快速切换通过，11 组暖机资源计数相同：mesh 72、material 75、Texture2D 80、TextureCube 12、RenderTarget 36。检查期间无控制台 error/warn、未捕获异常或失败请求；像素读取的 WebGL error 检查通过。
- Source hash 从 `853208aa7da3fe48` 变为 `87fda90f4da24cc8`；地形 hash 保持 `bacdd0db90bb52fc`，revision 1。

本机证据目录：`/Users/xingyi/Documents/Codex/2026-09-15/river-contact-effects/`，文件 `rounded-before.png`、`rounded-after.png`、`rounded-regression.json`。这些是本地验收文件，不是运行时资产。
