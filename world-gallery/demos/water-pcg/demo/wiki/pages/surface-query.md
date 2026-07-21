`WaterSurfaceProvider` 是玩法与水体实现之间的最小契约。调用方只关心水面，不需要知道背后是河流网格、Gerstner 波还是动态高度场。

## 标量查询

```ts
interface WaterSurfaceProvider {
  sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean;
}
```

输入和输出都由调用方持有，因此稳定运行时不需要为每次查询创建对象。

## 输出字段

| 字段              | 含义                  | 常见用途             |
| ----------------- | --------------------- | -------------------- |
| `waterBodyId`     | 最终选中的稳定水体 ID | 状态切换、调试、音效 |
| `surfacePosition` | 当前可见水面世界坐标  | 浮力、游泳高度       |
| `surfaceNormal`   | 宏观水面法线          | 船体倾斜、贴水特效   |
| `waterVelocity`   | 水体和波浪的世界速度  | 漂流、阻力、尾迹     |
| `waterDepth`      | 当前可用的水深        | 潜水、搁浅判断       |

Ocean P0 没有编译后的海床，因此其深度明确返回 `Infinity`，而不是伪造一个有限值。

## 状态与失败原因

最小 `WaterSurfaceProvider` 只返回 boolean。Ocean 和 Heightfield 具体 Provider 额外提供 `sampleSurfaceWithStatus`，用于检查逆解和 footprint 状态：

```ts
enum WaterSurfaceQueryFallback {
  None,
  OutsideFootprint,
  NonConverged,
  CandidateLimit,
  Unsupported
}
```

- `OutsideFootprint`：坐标不在真实水体范围内。
- `NonConverged`：最终波面逆解没有在迭代上限内收敛。
- `CandidateLimit`：为统一 fallback 位预留；当前 `WaterWorld` 通过 `candidateLimitExceededCount` 暴露候选上限，而不是返回这个 status。
- `Unsupported`：为调用方能力协商保留，当前具体 Provider 不用空结果伪装支持。

不要在失败时静默回退到 Y=0，这会把配置或范围问题伪装成可用结果。boolean 为 `false` 后，输出已经被 reset，也不能继续读取上一次命中值。

## 批量查询

支持批量查询的 Provider 接收扁平坐标数组，并写入结构化数组输出：

```ts
const positions = new Float32Array([0, 2, 0, 4, 2, 6, 8, 2, 12]);

const output = createWaterSurfaceBatchOutput(3);
provider.sampleSurfaceBatch(positions, output);
```

`sampleSurfaceBatch` 返回处理的点数，命中情况写入 `output.hits`。批量输出也应跨帧复用。它适合大量浮力点、粒子或 AI 探针，不适合为了一个查询临时创建数组。

## River 专属查询与统一查询

River 的 `RiverNetworkQueryService` 还提供 `insideVolume`、`submergedDepth`、`distanceToBank`、segment、Base/Local/Final Flow 等专属字段，并区分静态与带时间 API。通用玩法只需要最终表面时，优先使用 `RiverWaterSurfaceProvider` 或 `WaterWorld`，避免上层业务绑死 River 内部数据结构。
