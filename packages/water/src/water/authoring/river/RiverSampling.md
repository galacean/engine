# River 路径与采样契约

`curve.semantics` 省略或为 `control-curve` 时，输入是作者控制曲线，继续支持 Polyline、Catmull-Rom、Bezier 和 MonotoneElevation。为 `resolved-path` 时，输入是上游已经发布的路径，必须使用 Polyline；解码、修复和采样不能删除有效锚点，也不能通过另一条平滑曲线重塑路径。`surfaceAuthority` 仍独立声明水位权威，不能将外部水位和路径已完成求解混为一个概念。

规划器直接传入水文发布的全部中心线断面、水位与河宽，不传整个地形网格作为河流路径，也不再使用 DP 简化去满足后端点数预算。最终地形快照继续单独提供双线性床高；实际 depth 为 `max(0, waterY-bedY)`，不受作者 depth 占位值影响。

输入点数没有产品上限。Polyline 的每段按长度和 `segmentLength` 补点；平滑控制曲线按空间间距与 `quality.geometry.maxChordError` 自适应细分，三次曲线的 Bezier 凸包提供保守弦误差界。每个输入锚点及其局部属性被保留。没有固定递归层数到达后接受误差的回退；无法继续满足浮点细分精度时明确失败。

`quality.geometry.maxSegmentCount` 和 `descriptor.budget` 是可选的调用方资源约束。预设和网络默认值不再注入固定的采样、顶点、reach 或 chunk 预算。需求超过显式预算时报告需求和可用值，不重新分配采样、不提高间距、不降低误差标准。有效间距与弦误差必须是正有限数。WaterBody 的 Representation 保留声明的采样精度及显式预算；High 运行质量只会增加精度。

真实编码能力继续校验：Uint32 样本/顶点索引、数组长度和数值溢出。Mesh 按已有 Uint16 chunk 容量切分，chunk 数由几何规模决定。实际纹理上传检查设备的 `MAX_TEXTURE_SIZE`，失败报告请求尺寸和设备能力。有限数、最少两点、重复/退化、端点、拓扑和下游非上升水位检查继续生效。

回归覆盖超过 4096 个 resolved 锚点、超过 32 个 authored 锚点与生成器发布、长度/曲率增长、显式预算拒绝、网格切分，以及平坦水位的 Float32 舍入误判。参见 `tests/compiler/RiverDynamicSampling.test.ts`、`RiverPathSampler.test.ts` 和 `tests/runtime/RiverGeneration.test.ts`。
