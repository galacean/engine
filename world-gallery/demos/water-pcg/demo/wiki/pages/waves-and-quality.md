“统一水系统”不等于“所有水体使用同一种波”。当前统一的是资产、查询和能力声明；不同 Water Body 仍选择最适合自己的运动模型。

## 水体运动策略

| 水体        | 当前宏观运动                                   | 原因                                           |
| ----------- | ---------------------------------------------- | ---------------------------------------------- |
| River       | 沿连续 flow-time 的确定性 domain-warped motion | 必须跟随拓扑和局部流向，不能变成横跨河宽的海浪 |
| Ocean       | Directional Gerstner                           | 适合开阔水面，当前是有限 Preview 网格          |
| Heightfield | 沿基础流场传播的同源波浪                       | 必须保留湿区、深度和流向                       |
| Pool        | CPU 矩形高度场叠加低幅基础波                   | 需要保存入水冲量、压力凹陷和传播历史           |

高频 Micro Normal 只改变光照，不进入玩法 Query。动态入水波纹也不是静态 `WaterWaveAsset`；它属于有状态的 Interaction/Simulation 层。

## Water Wave Asset

第一版资产使用判别联合：`None` 或 `DirectionalGerstner`。Gerstner 配置包含 seed、候选波数、波长/振幅范围、主风向、方向扩散和陡峭度。

Compiler 会：

```text
validate
  -> deterministic PRNG(seed)
  -> 生成候选波
  -> 预计算 k / omega / phase / bounds
  -> 检查自交风险
  -> 按能量排序
  -> 应用质量预算
  -> 打包固定 Shader layout 和 sourceHash
```

固定 Shader 变体为 `0 / 2 / 6 / 12` 波。资产可以保存更丰富的生成意图，但 Runtime 只消费当前档位预算，避免动态循环和变体爆炸。

## 时间与最终世界坐标

CPU 和 GPU 必须使用同一坐标系、秒制时间、相位方向、time scale 和 packed 波数据。Ocean 与 Heightfield 有水平位移，因此给定最终 world XZ 时，需要反求 rest XZ，再计算最终高度、法线和速度。

逆解在迭代上限内不收敛时，Provider 返回 `NonConverged`；坐标落在有限 Preview 或真实湿区之外时返回 `OutsideFootprint`。不要用基础平面悄悄顶替失败结果。

## 质量不是一个总开关

River Authoring 已把质量拆成 geometry、material、maps 和 query。更完整的目标策略还会拆 simulation、optics 和 local effects。

这意味着：

- 关闭折射不应降低浮力 Query 精度。
- 降低网格三角形不必关闭 CPU 最终表面查询。
- Low 可以不生成局部 Atlas，但必须如实声明相应能力或回退路径。
- High 视觉功能不能成为 gameplay correctness 的依赖。

## 当前结构预算

| 档位 | 宏观波 | 局部场与材质 | 场景纹理 |
| --- | --- | --- | --- |
| Low | 0–2 主波或 River 静态低成本表面 | 单透明 pass、共享微纹理、不采 local atlas | 默认无 depth/opaque copy |
| Medium | 最高 6 个 Gerstner 主波；River 开宏观位移 | 解析宏观法线，复杂 Chunk 才采局部 Atlas | depth absorption 可显式申请 |
| High | 最高 12 个 Gerstner 主波 | 更密网格和增强表现 | opaque refraction / SSR 仍不是当前完成承诺 |

当前运行入口都显式选择 WebGL2。历史设计和验收中存在 WebGL1 Low 路径证据，但不能据此把当前默认 Demo 描述成 WebGL1 产品承诺。

## 开发检查清单

1. 波参数是否来自可版本化资产，而不是散落 uniform。
2. 同 seed、质量和编译版本是否产生相同 hash。
3. Render 与 Query 是否使用同一时间和宏观波数据。
4. bounds 是否包含最大水平和垂直位移。
5. 是否仍保持每帧零大 Mesh 重建；Ocean 时间更新只改 Shader 状态。
6. 关闭高档光学后，玩法 Query 和浮力是否不受影响。
