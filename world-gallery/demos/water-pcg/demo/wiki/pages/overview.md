P0 的重点不是再增加一种水面，而是建立一条所有水体都能遵守的正确性链路：**画面看到的水、玩法查询的水、浮力使用的水，来自同一份最终宏观水面数据。**

> 当前能力仍在 `world-gallery/demos/water-pcg` 中孵化。它按未来引擎能力设计，但尚未从 `@galacean/engine` 或独立水系统包导出。

## 当前系统由什么组成

```text
Descriptor / Wave Asset
  -> Validator + Compiler
  -> Compiled Data / Resource
  -> Body-specific Runtime + Surface Provider
  -> WaterWorld
  -> Buoyancy / Character / AI / Particles / Debug
```

River 已走通完整 Descriptor → Compiler → Resource → Worker → Runtime 主线；Heightfield 有自己的描述、编译和运行时；Pool 与 Ocean 当前通过 Adapter 接入统一查询。四类水体共享查询契约，不强行共享几何或模拟算法。

## 一次查询经过什么

1. 玩法把世界坐标交给 `WaterWorld`。
2. `WaterWorld` 用 XZ 范围和排除区过滤无关水体。
3. 候选 Provider 计算自己的最终可见宏观水面。
4. 重叠时依次比较优先级、水面高度和稳定 ID。
5. 调用方得到位置、法线、速度、深度和水体 ID。

这条链路同时服务于浮力、游泳、角色移动、AI、粒子和调试工具。

## 当前能力矩阵

| 水体        | 最终表面 | 批量         | 速度 | 局部水流 | 形变 | 时间泡沫 | 水下体积 | 延迟 |
| ----------- | -------- | ------------ | ---- | -------- | ---- | -------- | -------- | ---- |
| River       | 支持     | 支持         | 支持 | 支持     | 支持 | 不支持   | 支持     | 0 帧 |
| Heightfield | 支持     | 支持         | 支持 | 支持     | 支持 | 不支持   | 不支持   | 0 帧 |
| Pool        | 支持     | 暂无原生批量 | 支持 | 支持     | 支持 | 不支持   | 不支持   | 0 帧 |
| Ocean       | 支持     | 支持         | 支持 | 不支持   | 支持 | 不支持   | 不支持   | 0 帧 |

矩阵来自当前 `WaterBodyCapabilities.ts`。能力为 `false` 时应显式降级或拒绝，不用空实现伪装支持。

## 三层水面

- **Base Surface**：编译后不含波浪的基础水面。
- **Visible Macro Surface**：Gerstner、River motion 或泳池高度场形成的最终大形变。
- **Micro Normal**：只影响材质高光的细节法线，不进入玩法查询。

玩法默认查询 Visible Macro Surface。如果把 Micro Normal 用于物理，浮力会被像素级噪声不断抖动。

## 三条正确性契约

1. **Render / Query parity**：宏观位移、法线和速度使用同源数据与时间。
2. **Local modifier parity**：会改变高度或玩法水流的局部数据必须有 CPU 表达，不能只有 Shader texture。
3. **Body / Geometry / Volume 分离**：水体语义、绘制范围、表面查询和介质体积不是同一个概念。

## 推荐阅读顺序

第一次接入：五分钟快速开始 → 架构与数据生命周期 → `WaterSurfaceProvider` → `WaterWorld`。开发 River、波浪、Terrain 或浮力时，再进入对应专题。上线前阅读“测试、验收与排障”和“性能规则与当前边界”。
