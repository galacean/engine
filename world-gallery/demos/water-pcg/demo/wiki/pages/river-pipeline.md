River 是当前最完整的正式数据主线。它解决的不只是“画一条带状 Mesh”，而是把有向水网、汇流、水位、查询、局部流场和运行时资源作为一个确定性产物提交。

## 从 unknown 输入开始

`RiverNetworkCompiler.compile(source: unknown)` 是同步编译的正式安全入口。它内部统一完成 decode 和 validate，因此 TypeScript 示例与外部 AI JSON 不会绕过同一条校验边界。

```ts
const result = RiverNetworkCompiler.compile(source);

if (!result.valid || !result.data) {
  for (const diagnostic of result.diagnostics) {
    console.error(diagnostic.code, diagnostic.path);
  }
  return;
}
```

V1 继续兼容基础网络描述；V2 才允许网络级 `surfaceMotion` 和静态 `disturbances`。不要让单个 segment 私自覆盖全网 seed 和宏观尺度，否则汇流区会失去连续性。

## Compiler 固化了什么

一次成功编译会产出：

- 有向 `nodes`、`reaches` 和 `junctions`。
- 固定采样、连续水位和 surface/bank geometry。
- 可增量提交的 `chunks`。
- 玩法使用的稀疏 `queryIndex`。
- Terrain corridor、湿岸和排除区向量数据。
- 复杂汇流/障碍区域的 local Flow/Foam/SDF atlas。
- 确定性的 `surfaceMotion`、静态 disturbance 和实际预算统计。

Runtime 不应根据 Descriptor 再生成这些数据。否则渲染、查询和缓存可能各自得到不同版本。

## Worker 与 RiverResource

浏览器重编译通过 `RiverCompileWorkerClient` 放到 module Worker：

```ts
const workerClient = new RiverCompileWorkerClient();
const resource = await workerClient.compile(source);

await riverRuntime.replaceActiveIncremental(resource);
```

Worker 不直接传类实例化的 `RiverCompiledData`，而是序列化为带版本、descriptor hash、bake hash 和 compiled hash 的 Resource bytes，再用 Transferable `ArrayBuffer` 返回。主线程反序列化时会拒绝损坏、未知版本或 hash 不一致的数据。

`RiverResource` 使用 `retain()`、`release()` 和 `dispose()` 管理所有权。`serialize()` 返回副本；调用方不能修改 Compiler 持有的 numeric buffer。

## 为什么要原子提交

`replaceActiveIncremental()` 先在不可见 staging root 中按帧预算创建 Chunk、Mesh、Material 和共享纹理。只有新 runtime set 完整后才切换 active set，旧河流在此之前继续渲染和响应 Query。

这样能避免：

- 只上传了半条河时就出现在屏幕上。
- 新渲染结果配上旧 Query，或反过来。
- 重编译峰值一次阻塞完整帧。
- 旧 Resource 在 GPU 对象仍使用时被提前释放。

## Query 为什么不直接查 Mesh

`RiverNetworkQueryService` 使用 Compiler 生成的 reach/junction primitive 和稀疏 XZ grid。它能直接得到流向、水深、离岸距离和 volume 语义，不依赖渲染拓扑，也不做 GPU readback。

静态 API 返回 authored surface；带时间 API 使用与 GPU 同源的宏观波参数：

```ts
queryService.sampleSurface(position, outResult);
queryService.sampleSurfaceAtTime(position, elapsedTime, outResult);
queryService.queryBatch(positions, outBatch);
queryService.queryBatchAtTime(positions, elapsedTime, outBatch);
```

对普通玩法，优先经 `RiverWaterSurfaceProvider` 或 `WaterWorld` 查询最终可见水面。只有编译器、测绘和专项调试工具才应直接依赖 River 专属结果。

## 生命周期清单

1. 外部输入先 decode/validate，不直接信任 JSON。
2. 编译失败时展示 diagnostics，不生成“尽量可用”的半资源。
3. 异步请求并发时只提交仍然有效的最新结果。
4. 新 RuntimeSet 完整后再原子切换。
5. 场景退出时销毁 RuntimeSet、WorkerClient 并释放 Resource。
6. 资源格式仍是内部 V1 JSON bytes；不要把它当作长期 public 存档格式。
