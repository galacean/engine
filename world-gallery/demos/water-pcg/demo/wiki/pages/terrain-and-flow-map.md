River Compiler 会输出 Terrain 交互数据和局部 FlowMap，但它**不会直接修改真实 Terrain**。这条边界能避免水系统同时拥有河面、地形和河床，导致编辑、缓存与销毁互相覆盖。

## 三种表面的所有权

| 对象            | 所有者             | 当前水系统输出                                       |
| --------------- | ------------------ | ---------------------------------------------------- |
| Water Surface   | 水系统             | 高度、几何、材质、Query 和动态运动                   |
| Terrain Surface | Terrain 系统       | 水系统只给 carve/wetness/exclusion corridor 指令     |
| River Bed       | Terrain 或关卡内容 | Demo 可生成验证河床，但不是正式生产 Terrain consumer |

`terrainInteraction` 里的 corridor 是可消费的向量数据，包含水面高程、河床高程、河宽、湿岸宽度、植被和建筑排除半径。看到 Debug 中的 Terrain Corridor，只能说明数据已编译，不能说明真实地形已经被挖开。

## 为什么只在局部使用 Atlas

普通直线 Reach 的流向可以由中心线、切线和速度解析得到，不需要整条河都铺纹理。只有下面区域才值得烘焙二维局部场：

- 多条水流汇合的 Junction。
- 障碍物前缘、绕流和尾迹。
- 一维中心线方向无法准确表达的局部复杂区。

当前质量预算是：Low 不生成 local atlas，Medium 每 tile `48 × 48`，High 每 tile `64 × 64`，padding 为 `2px`，Atlas 最大行宽为 `512px`。

## RGBA 通道合同

| 通道 | 数据                       | 用途                               |
| ---- | -------------------------- | ---------------------------------- |
| R    | 归一化局部 flow X          | Shader 输运与 CPU gameplay current |
| G    | 归一化局部 flow Z          | Shader 输运与 CPU gameplay current |
| B    | foam / turbulence source   | 汇流混合、障碍压缩和尾迹表现       |
| A    | signed distance / interior | 边界衰减、内域权重和局部效果包络   |

每个 tile 还带 `worldToUv`、`uvRect`、类型和汇流标记。Chunk 只绑定自己覆盖的 tile；普通 Reach 不增加 Atlas 采样成本。

## CPU 与 Shader 如何保持一致

River Query 与材质共享以下规则：

1. 用同一 `worldToUv` 把世界 XZ 转成 Atlas UV。
2. 限制到同一 tile 内域并做双线性 RG 采样。
3. 从 A 通道恢复 signed distance 和 interior 权重。
4. 汇流区再应用相同的 confluence blend。
5. 把 Base Flow 与 Local Flow 混合成 Final Flow。

最终玩法速度来自 `WaterSurfaceSample.waterVelocity.xz`。不能只在 Shader 中旋转流向，否则画面中的漂流方向会与浮力、粒子和 AI 分离。

## 推荐排障顺序

1. **Base Flow**：先确认拓扑方向和 Reach 流速。
2. **Local Flow**：确认 tile、UV 范围和 RG 解码。
3. **Final Flow**：确认 SDF、内域和汇流混合权重。
4. **Query Arrow**：确认 CPU 最终结果与画面同向。
5. **Terrain Corridor**：只检查交接数据，不把 Demo 河床误判为 Terrain 修改结果。

## 当前未完成

- 正式 Terrain consumer 和真实地形回写。
- 运行时动态 modifier 的统一协议。
- Atlas streaming、mipmap 和跨大世界加载。
- 时间累积泡沫与动态尾流状态。

因此新增地形功能时，应让 Terrain 系统消费 corridor；新增动态水面交互时，应建立独立 Interaction 层。两者都不应直接篡改 River Compiler 的静态局部 Atlas。
