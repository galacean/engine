P0 是正确性底座，不是完整商业水系统。开发新能力前，应先确认下面的边界。

## API 稳定性

当前实现仍位于 `world-gallery/demos/water-pcg`：

- 没有从 `@galacean/engine` 导出。
- 没有独立 `@galacean/engine-water` 包。
- 内部相对导入路径可能调整。
- 当前能力矩阵可以扩展，但不应虚假声明未实现能力。

业务项目现在可以参考契约和示例，但不应把 Demo 内部路径当作长期稳定入口。

## 渲染环境

当前 River/Ocean、Heightfield、Pool 和 Buoyancy 四个可运行入口都在 `WebGLEngine.create()` 中显式选择 WebGL2。Wiki 页面本身不启动 WebGL 或 PhysX。

历史设计与泳池验收里保留了 WebGL1 Low 的兼容证据，但当前默认入口代码已经选择 WebGL2。除非重新开放入口并复跑完整 Gate，不应把历史证据表述成当前 WebGL1 产品承诺。

## 热路径规则

- 复用 `WaterSurfaceSample`、状态和批量输出。
- 不在每个查询中创建 Vector、数组或闭包。
- 用有限 `bounds` 限制 WaterWorld 候选。
- 保留候选水体硬上限，并监控溢出计数。
- 批量查询使用连续 `Float32Array`。
- 动态水面每个渲染帧最多一次有界 Mesh upload；解析波面不逐帧重建 Mesh。
- P1 交互事件使用固定 SoA 容量和 emitter 聚合；时序泡沫空闲时跳过更新。
- Ocean Ring 是有限的 camera-relative 覆盖；正常镜头移动只移动根节点，不重建或上传 Patch Mesh。
- 每个主相机最多一个 Planar reflection camera，失败必须回 Probe/Sky。

性能问题应通过 P95、候选数和上传次数定位，不要只观察平均帧率。

## 当前没有承诺的能力

- FFT 或频谱海洋。
- 真正无限几何、地球曲率或大世界 Ocean Streaming；解析 Query 的 unbounded 不代表渲染无限。
- 半潜水线、任意网格水体积与无限 Ocean 水下体积。
- GPU Compute 时序泡沫和跨水体全局局部场 Atlas。
- 通用岸线冲刷与焦散系统。
- 正式编辑器工作流和资产包。
- 向后兼容的公共 npm API。
- 正式 Terrain consumer、Terrain streaming 和大世界 Water Zone。
- 超过 16 个活跃 emitter 的质量承诺、船体涡旋或完整 3D 流体。
- SSR、自动环境 Probe 生成和粗糙度卷积反射。

这些能力进入后续阶段时，仍应继续使用统一水面查询和 WaterBody 能力声明，而不是建立第二套旁路。

## 文档和源码谁是准则

按可信度排序：当前源码与测试 → 最新验收记录 → 架构方案 → Wiki。Wiki 用于降低上手成本；如果 Wiki 与代码或 Gate 冲突，应先修正文档或明确实现回归，不能让两套结论长期并存。
