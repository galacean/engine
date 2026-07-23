水系统不是一个“大组件”，而是一条有明确所有权的数据流水线。最重要的原则是：**编辑数据只负责表达意图，Compiler 固化昂贵结果，Runtime 只消费资源，玩法只通过 Query 读取事实。**

## 全链路

```text
AI / JSON / 示例配置
  -> Schema Decoder + Validator
  -> Body-specific Compiler
  -> 不可变 Compiled Data / Resource
  -> Runtime Controller + Provider
  -> WaterWorld
  -> 浮力、角色、AI、粒子与调试
```

River 已完整走通 Descriptor、Compiler、Resource、Worker、Runtime 和 Query。Heightfield 也有独立 Descriptor、Validator、Compiler 与 Worker；Pool 和 Ocean 当前通过薄 Adapter 接入统一运行时契约，不应因此宣称四种水体已经有完全相同的资产管线。

同一份权威 Current 会按消费者密度分成两条读路径：

```text
Compiled / Runtime Current -> SurfaceProvider -> WaterWorld -> gameplay / buoyancy / underwater
                         └-> Uniform/Grid Snapshot(revision) -> Foam <=30Hz -> latest R8 -> material
```

第一条服务少量精确点查；第二条是密集视觉读模型。Snapshot 当前由 Pool consumer 显式持有，还没有进入 `WaterBodyRuntime` 公共契约，以免在只有一个实际消费者时过早冻结 API。

## 四层分别做什么

| 层 | 职责 | 当前源码入口 |
| --- | --- | --- |
| Authoring | 表达拓扑、形状、材质意图、预算和可复现参数 | `authoring/river`、`authoring/heightfield`、`authoring/wave` |
| Compiler | 校验、拓扑排序、采样、生成几何/查询索引/局部场和诊断 | `compiler/river`、`compiler/heightfield`、`compiler/wave` |
| Resource / Runtime | 管理资源所有权、GPU 对象、激活替换和最终水面 Provider | `runtime/river`、`runtime/heightfield`、`runtime/ocean` |
| Demo / Debug | 组装场景、输入、面板、浏览器验收和可见案例 | `demo`、`e2e`、`tests` |

不要让依赖方向倒过来：Compiler 不应持有 `Engine`、DOM、GPU 纹理或 Terrain 对象；通用 Query 和浮力层也不应 import 某个具体 Demo。

## 三份容易混淆的数据

- **Descriptor**：人或 AI 想要什么，可以编辑、校验和版本化。
- **Compiled Data / Resource**：Compiler 已经算好的确定性产物，Runtime 不应重新解拓扑或重采样。
- **Runtime State**：当前激活的 Entity、Mesh、Material、纹理、时间与动态交互状态，生命周期跟随场景。

River 的 `RiverResource` 目前仍是 `world-gallery` 内部引用资源，带版本和 hash，但不是正式 `ReferResource`，也不是已经承诺长期兼容的公开二进制格式。

## 正确性不变量

1. 相同输入、编译版本、质量预算必须得到相同结果和 hash。
2. Runtime 只消费编译产物，不把路径采样、拓扑修复重新搬回每帧。
3. 玩法查询不读取渲染 Mesh，也不做 GPU readback。
4. Shader 改变宏观可见表面时，CPU Query 必须有同源表达。
5. Terrain、水面、河床分别拥有自己的数据和生命周期。
6. 多水体只通过 `WaterWorld` 统一选择，不让每个玩法系统重复判断水体类型。
7. Camera scene texture 由一个 Broker 合并和恢复，不能由单片水直接永久修改相机。
8. 稀疏玩法查询可以读取精确 Surface/Local Provider；密集视觉场必须消费带 revision 的只读 Snapshot，禁止在 texel 循环中调用完整 Surface Query。
9. 静态 Current 的 revision 不变时不得重复构建 Snapshot；未来动态 Grid 由数据 owner 按 revision/dirty 发布，不能让 Foam 自己反查权威 Surface。
10. 视觉模拟频率与渲染频率解耦；当前 Foam 以不超过 30 Hz 的 CPU 更新复用最新纹理，卡顿后不循环追帧。

P1 在 `WaterBodyRuntime` 上增加了两个可选能力入口：`localField` 表达静态或动态的局部位移、流向、泡沫源与模拟 mask；`volume + opticalProfile` 表达有限水下体积和光学介质。它们是同一水体注册记录的一部分，不应另建脱离 WaterWorld 生命周期的全局单例。

## 扩展新能力时放在哪

| 新需求 | 推荐落点 |
| --- | --- |
| 新增可序列化参数 | Authoring 类型、Decoder、Validator 与版本迁移 |
| 可离线计算的几何或场 | Compiler，并进入不可变资源和 hash |
| 新水体的最终表面 | 实现 `WaterSurfaceProvider`，再声明真实 capabilities |
| 多水体选择规则 | `WaterWorld`，不要写在角色或浮力组件中 |
| 动态局部水面状态 | 独立 Interaction/Simulation 层，并让 Render 与 Query 共享 |
| 静态与动态局部效果 | `WaterLocalModifier` + `WaterLocalFieldComposer`，显式 bounds、通道和混合 |
| 泡沫等密集 Current 消费 | `WaterCurrentFieldSnapshot`；静态 Uniform 构建一次，动态 Grid 只在 revision/dirty 变化时刷新 |
| 相机深度、颜色纹理 | `CameraWaterFeatureBroker` 请求，不在 MaterialFactory 中隐式开启 |
| Sky/Probe/Planar 反射 | 每相机 `WaterReflectionService`，最多一个 Planar owner |

## 当前产品化边界

这些能力仍处于 Demo 内孵化期，没有从 `@galacean/engine` 导出，也没有 `@galacean/engine-water`。当前契约适合继续验证和形成未来 API，但业务项目若直接复制内部路径，需要自行承担目录与接口调整成本。
