四类水体遵守相同查询契约，但它们生成最终水面的方式不同。能力矩阵应如实描述差异，不要用空实现伪装支持。

## River

River 从编译后的 Reach、Junction 和局部 Atlas 查询水面：

- 基础流向来自河道拓扑。
- Local FlowMap 修正弯道与汇流区方向。
- CPU 与 Shader 使用同一套 RG、水体权重和双线性采样规则。
- 最终速度同时包含河流方向与宏观水面运动。
- River 专属 Query 当前还能判断有限水下 volume；这不等于其他三类水体也拥有相同能力。

调试时依次查看 Base Flow、Local Flow、Final Flow 和 Query Arrow。

## Ocean

Ocean Preview 使用方向性 Gerstner 波：

- 先根据目标世界 XZ 反求未变形坐标。
- 再计算最终高度、法线和波浪速度。
- 渲染使用相机相对的中心网格与 2 / 3 层 Ring，覆盖范围跟随相机按 cell 吸附。
- Ring Mesh 有限，但 Provider 当前以 `unbounded` 解析模式查询；两者共享世界坐标波浪和时间。
- 镜头移动只平移 Ring root，不逐帧重建 Mesh；逐 patch bounds 负责视锥裁剪。
- 没有海床数据，因此深度为 `Infinity`。

如果逆解不收敛，会返回 `NonConverged`，而不是使用基础平面。

## Heightfield

Heightfield 在编译后的湿区网格上叠加沿流向传播的宏观波：

- 干燥孔洞不会返回水面。
- CPU 波浪求值与 Shader 参数保持同步。
- 支持批量查询和调用方复用输出。
- 当前只声明表面与深度查询，不拥有完整水下体积。

## Pool

交互式泳池使用 CPU 矩形高度场：

- PhysX 刚体入水会向高度场写入压力和速度。
- 渲染网格与浮力读取同一份高度场。
- P1 可切换 1 / 4 / 8 / 16 个刚体，并用 128-event / 16-emitter 有界队列聚合尾迹。
- Medium 使用 R8 source + Q8.8 CPU ping-pong history，并量化成 R8 纹理供材质采样；Low 回退到解析表面效果。
- `WaterLocalFieldComposer` 将高度场作为 `DisplacementY` modifier 注册，不复制 solver buffer。
- 当前保留标量 Provider 快路径，尚未声明原生批量查询。
- 池壁、有限范围和动态水面都属于泳池自身契约。
- 当前 Pool 没有独立正式 Authoring schema，基础 footprint 仍由 River-backed fixture 提供。

## 如何选择

| 场景                   | 推荐水体    |
| ---------------------- | ----------- |
| 有拓扑、支流和明确流向 | River       |
| 开阔、规则、远景波浪   | Ocean       |
| 任意二维湿区与流场     | Heightfield |
| 小范围双向物理交互     | Pool        |

## Adapter-first 意味着什么

`WaterBodyRuntimeAdapter` 把现有 Runtime 包装成统一的 id、type、capabilities、surface、bounds、priority 和 metrics。它减少上层分支，但不会自动补齐某种水体缺失的批量查询、水下体积或局部水流。至少两个真实 consumer 证明契约稳定前，这些 Adapter 继续留在 Demo 内部。
