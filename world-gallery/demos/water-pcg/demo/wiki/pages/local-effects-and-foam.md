P1 局部水效果解决的是“不同来源怎样在同一片水上叠加，以及大量刚体持续移动时怎样把冲击、尾迹和泡沫控制在固定预算内”。它不是把 River FlowMap、泳池高度场和泡沫历史继续做成三套互不相认的旁路。

当前实现仍位于 `world-gallery/demos/water-pcg`，用于验证未来水系统契约；它还不是从 `@galacean/engine` 导出的稳定 API。

## 一条统一的数据链

```text
静态 River local atlas ─┐
                        ├─> WaterLocalModifier
动态 Pool deformation ─┘       + WaterLocalFieldProvider
                                  -> WaterLocalFieldComposer
                                  -> WaterBodyRuntime.localField

PhysX / gameplay contacts
  -> WaterInteractionSinkAdapter
  -> bounded WaterInteractionEventQueue
                                      ┌─> TemporalFoamField (R8 source + Q8.8 ping-pong history)
compiled authoritative current        │
  -> WaterCurrentFieldSnapshot ───────┘   (uniform / grid, revisioned current-only data)
  -> TemporalFoamTextureService
  -> Pool material source / history / final view
```

这条链把三个问题分开：

- `WaterLocalModifier` 描述“谁、在哪、写哪些通道、怎样混合”。
- `WaterLocalFieldProvider` 负责无分配地采样真实数据。
- Event Queue 只传递瞬时事件；有时间历史的泡沫由 `TemporalFoamField` 自己拥有。

这里还有一条必须遵守的性能边界：玩法、浮力或 AI 偶发查询一个点时，可以通过 `WaterSurfaceProvider` / `WaterLocalFieldProvider` 取得精确结果；泡沫、FlowMap 等一次要扫描成千上万个 texel 的密集视觉计算，只能读取数据型 `WaterCurrentFieldSnapshot`。Snapshot 不能包装任意采样回调，因此不会在像素循环里重新走完整 River Surface、噪声和动态高度查询。Uniform 表示全区域同一水平流速；Grid 持有自己的 `Float32Array` 副本并做双线性采样，消费者必须把这份数组视为只读数据。

如果让每个刚体直接改纹理或材质，调用顺序会决定结果，事件峰值会造成无界分配，CPU Query 也无法知道最终局部水面发生了什么。

## WaterLocalModifier 与统一通道

一个 modifier 的核心字段是：

```ts
interface WaterLocalModifier {
  readonly id: string;
  readonly bodyId: string;
  readonly bounds: WaterBoundsXZ;
  readonly channels: number;
  readonly priority: number;
  readonly blendMode: WaterLocalModifierBlendMode;
  readonly dynamic: boolean;
}
```

当前通道位包括：

| 通道             | 表达什么                          |
| ---------------- | --------------------------------- |
| `DisplacementY`  | 高度、垂直速度和 XZ 梯度          |
| `DisplacementXZ` | 水平位移                          |
| `CurrentLarge`   | 大尺度流向，例如 River 局部 Atlas |
| `CurrentRipple`  | 小尺度传播或尾迹流向              |
| `FoamSource`     | 本帧泡沫源，不是历史结果          |
| `SimulationMask` | 局部模拟权重或禁用区              |

`Add`、`Max` 和 `Override` 三种混合模式是显式的。Composer 先按 `priority` 从小到大排序，相同优先级再按稳定 `id` 排序，因此注册先后不会改变结果。`bounds` 先做低成本过滤，Provider 只有真正覆盖采样点时才参与混合。

采样由调用方复用输出：

```ts
const localField = new WaterLocalFieldComposer("interactive-pool");
const deformation = new RectangularWaterDeformationProvider(heightField);

localField.register(
  {
    id: "interactive-pool-deformation",
    bodyId: "interactive-pool",
    bounds: poolBounds,
    channels: WaterLocalModifierChannel.DisplacementY,
    priority: 10,
    blendMode: WaterLocalModifierBlendMode.Add,
    dynamic: true
  },
  deformation
);
```

`RectangularWaterDeformationProvider` 直接暴露高度场已有的 `Float32Array`，不会复制一份“渲染数据”。`RiverStaticLocalModifierResource` 也只创建一次 Atlas `Uint8Array`，再为各 tile 建立 Provider；River 当前把 `CurrentLarge + FoamSource` 通过同一 Composer 注册到 `WaterBodyRuntime.localField`。

注意：`WaterBodyRuntime.localField` 是局部场入口，但 `WaterWorld.sampleSurface()` 仍只负责最终水面选择。需要修改最终高度的动态模拟必须继续接进所属水体的 `surface` Provider，不能只注册 modifier 就宣称浮力已经跟随位移。交互泳池同时用高度场组成最终 surface，因此渲染、查询和浮力仍同源。

## 有界 Interaction Event Queue

`WaterInteractionEventQueue` 是结构化数组（SoA）队列。它预分配 emitter、kind、位置、速度、半径、强度、时间和优先级数组，热路径不会为每个接触创建对象。

当前事件类型包括：

- `Entry`：物体首次入水。
- `MotionTrail`：物体沿水面持续移动形成尾迹。
- `Impact`：预留给明确冲击源。
- `Rain`：预留给批量降雨源。

队列满时不是扩容：它查找最低优先级事件；新事件更强才替换，否则丢弃。`overflowCount` 记录发生过预算竞争，`droppedCount` 记录未保留的事件，`replacedCount` 记录高优先级替换。

持续尾迹还会按 emitter 聚合：

```ts
queue.enqueueMotionTrail(event, minimumDistance, minimumHorizontalSpeed);
```

- 水平速度低于阈值时拒绝，并增加 `stationaryRejectedCount`，静止刚体不会不断注入泡沫。
- 同一 emitter 没移动到最小距离时合并，并增加 `aggregatedCount`。
- emitter 表满时复用最久未出现的槽位，并增加 `emitterOverflowCount`。

P1 泳池 Demo 的硬上限为 **128 个待消费事件、16 个 emitter**。每个渲染帧用同步 `drain()` 消费后把 count 清零；历史效果不留在队列里。

建议观察：

```ts
const metrics = window.waterPcgP1?.metrics;
console.table({
  bodies: metrics?.bodyCount,
  queued: metrics?.queuedEventCount,
  accepted: metrics?.acceptedEventCount,
  dropped: metrics?.droppedEventCount,
  aggregated: metrics?.aggregatedEventCount,
  stationary: metrics?.stationaryRejectedEventCount,
  peakQueued: metrics?.peakQueuedEventCount
});
```

`droppedEventCount > 0` 不一定是错误，但持续增长说明事件预算、发射频率或聚合阈值需要重新评估，不能静默扩大容量。

## 时序泡沫为什么需要历史

解析岸边泡沫只取决于“现在”，无法留下船尾或物体经过后的痕迹。`TemporalFoamField` 用 body-local 状态保存历史：

```text
本帧 source
  + 反向采样上一帧 history（CurrentLarge + CurrentRipple 平流）
  + exp(-decayRate * dt) 衰减
  -> 下一张 history
  -> ping-pong 交换
```

CPU source 使用 R8；双 history 使用 Q8.8 `Uint16` 累计，再量化为稳定的 R8 upload view。保留亚字节衰减是必要的：如果每帧直接 round 回 R8，低强度尾部会卡在非零字节，造成泡沫永久不消失和持续上传。无 source 且 history 已归零时会直接跳过。`clear()` 会强制下一帧同步一次全零纹理，随后停止上传。区域中心移动时按 texel 吸附并平移已有历史，不做任意亚像素重采样。

泳池使用 `128 × 64` 的场，衰减率为 `0.8 / s`。`TemporalFoamTextureService` 对应创建一张 source 和两张 history R8 纹理，共 `128 × 64 × 3 = 24,576` 个显式 GPU 纹理字节，不包含驱动对齐和 CPU Q8.8 累计缓冲。

它保证同一个 render-frame id 最多一次 `setPixelBuffer()`：

- `source` 视图上传本帧源，适合检查事件是否生成。
- `history` 视图上传累积历史，适合检查平流和衰减。
- `final` 视图仍采样 history，但以正式水材质合成。

`foamTextureUploadsPerRenderFrame` 必须保持在 `0 / 1`；`foamPeakHistoryValue`、`foamActiveHistoryPixelCount`、`foamUpdateCount` 和 `foamIdleSkipCount` 用来判断泡沫是否生成、是否消退以及空闲优化是否生效。

### Current Snapshot 与 30 Hz 更新

交互泳池的编译结果是一条直线、所有采样点流速一致，因此启动时校验每个 `tangent × flowSpeed` 与参考值的差异不超过 `1e-5`，再只构建一次 `uniform` Snapshot，当前 revision 为 `0`。不满足一致性时会拒绝把它错误降级成 Uniform。每次泡沫更新只读取一次这个常量 Current，不再对 `128 × 64 = 8,192` 个 texel 调用完整 Surface Query。通用契约也提供带 revision 的 `grid` Snapshot 数据和采样器；动态 Current 的 builder、dirty 区域刷新和 GPU 路径仍是后续工作，不能把它们写成当前已经实现。

`TemporalFoamTextureService` 默认最多以 **30 Hz** 推进 CPU history。渲染帧率更高时复用最近完成的泡沫纹理；卡顿后也只做一次较大 `dt` 的更新，不用 `while` 循环补跑历史帧。30 Hz 是上限，不是强制补齐的固定频率：例如渲染 50 FPS 时当前调度会得到约 25 次 history update。这样能限制 CPU 扫描和 R8 上传频率，同时保持 60 / 120 FPS 渲染平滑。

可观察指标：

- `foamCurrentSnapshotKind / Revision / BuildCount`：泳池应稳定为 `uniform / 0 / 1`。
- `foamCurrentLookupCount`：Uniform 每次 history update 只增加 1。
- `foamFullSurfaceQueryCount`：只统计泡沫更新区间，必须始终为 0。
- `foamTargetUpdateRateHz`：默认 30；`foamUpdateCount` 在活跃窗口内不得超过该频率预算。
- `foamRateLimitedFrameCount`：高渲染帧率下复用上一张纹理的帧数。

## 1 / 4 / 8 / 16 刚体与上传策略

P1 Demo 保留原来的落水球，再创建最多 15 个共享 Mesh/Material 的浮力刚体。它提供 1、4、8、16 四档，用来验证多 emitter、方向性尾迹、队列聚合与 CPU Query，而不是模拟完整 3D 流体。

`resolvePoolSurfaceUploadPolicy()` 比较三种候选：

| 策略                  |                  每帧估算字节 | 当前含义                                    |
| --------------------- | ----------------------------: | ------------------------------------------- |
| `CpuVertex`           | simulation sample × 10 floats | 直接上传模拟网格全部顶点属性                |
| `CpuInterpolated`     |     render vertex × 10 floats | CPU 插值到渲染网格后上传                    |
| `TextureDisplacement` |   simulation sample × 2 bytes | 顶点纹理采样高度/速度，要求 VTF + R8 upload |

Policy 只会从“有 benchmark 且设备支持”的策略中选最快者；否则使用调用方显式 fallback。当前 Demo 没有内置设备 benchmark，因此真实结果是 `CpuInterpolated + caller-fallback`，不是已经证明纹理位移在所有设备更快。

无论选哪种上传方式：

- `maxUploadsPerRenderFrame` 固定为 1。
- `querySource` 固定为 `cpu-height-field`。
- `requiresGpuReadback` 固定为 false。

不能为了减少渲染上传把浮力改成读取 GPU 结果；Web 上同步 readback 会造成明显停顿，并破坏 fixed-step 查询稳定性。

## Low / Medium / High 回退

| 档位 | 局部位移与玩法 Query | 时序泡沫 | 上传与回退 |
| --- | --- | --- | --- |
| Low | 保留 CPU 高度场、接触和浮力 | 不创建三张 R8 纹理，使用解析水面高光/泡沫 | 当前使用较低网格预算和 CPU 路径，零 GPU readback |
| Medium | 保留同一 CPU 高度场 | 启用 `128 × 64` source + ping-pong history | 每渲染帧至多一次泡沫纹理上传；表面仍为显式 CPU fallback |
| High | 泳池 Showcase 使用 High 光学，并保留同源 CPU 高度场与浮力 | 继续使用有界 `128 × 64` 历史；没有 Compute 版本 | 5-tap Planar / 折射走 High 展示路径，仍保持零 GPU readback |

关闭动态效果只会清空事件与泡沫历史；最终水面查询和基础浮力仍继续工作。Low 的目标是先保住 gameplay correctness，而不是显示一个看似精细但查询不同步的水面。

## Demo 操作

启动开发服务器：

```sh
pnpm -C world-gallery exec vite . --config vite.config.js --host 127.0.0.1 --port 4179
```

只观察最终尾迹与泡沫时打开公共 `#feature-wake-foam`。需要 1 / 4 / 8 / 16 刚体和 Source / History / Final 控制时，打开隐藏的 Developer 诊断：

```text
http://127.0.0.1:4179/demos/water-pcg/?quality=medium&bodies=16&localEffectsDebug=final#developer-pool-diagnostics
```

页面中可以：

1. 切换 1 / 4 / 8 / 16 个刚体，观察队列峰值是否仍小于 128。
2. 点击“重启尾迹”，让移动刚体重新开始驱动。
3. 依次切换 Source、History、Final：先确认移动物体产生 source，再确认静止后 history 继续衰减。
4. 关闭“动态效果”，确认泡沫消失但基础水面、落水球和 Query 仍工作。

浏览器自动化也可使用：

```js
window.waterPcgP1?.setBodyCount(16);
window.waterPcgP1?.setDebugView("source");
window.waterPcgP1?.restartWakes();
window.waterPcgP1?.setDynamicEffectsEnabled(false);
window.waterPcgP1?.metrics;
```

## 测试与当前限制

聚焦验证：

```sh
pnpm -C world-gallery exec vitest run --config vitest.config.ts \
  demos/water-pcg/tests/runtime/WaterLocalFieldComposer.test.ts \
  demos/water-pcg/tests/runtime/LocalModifierAdapters.test.ts \
  demos/water-pcg/tests/runtime/WaterInteractionEventQueue.test.ts \
  demos/water-pcg/tests/runtime/WaterCurrentFieldSnapshot.test.ts \
  demos/water-pcg/tests/runtime/TemporalFoamField.test.ts \
  demos/water-pcg/tests/runtime/PoolSurfaceUploadPolicy.test.ts \
  demos/water-pcg/tests/demo/TemporalFoamTextureService.test.ts \
  demos/water-pcg/tests/demo/P1WaterShowcaseContract.test.ts \
  demos/water-pcg/tests/demo/PoolBodyFleet.test.ts \
  demos/water-pcg/tests/demo/PoolP1ShowcaseConfig.test.ts
pnpm -C world-gallery typecheck:water-pcg
```

浏览器 Gate 至少应确认：移动刚体产生方向性尾迹；静止刚体不持续注入；source 会进入 history；history 会平流并最终归零；1 / 4 / 8 / 16 切换后没有非有限状态；每帧表面 Mesh 与泡沫纹理上传分别不超过一次。

性能 Gate 还要针对 4 / 8 / 16 刚体分别执行“动态关闭 → 开启 → 再关闭”的同机 A/B：泡沫活跃期完整 Surface Query 增量必须为 0，更新率不得超过 30 Hz；默认要求动态开启 FPS 至少为两侧关闭态控制组的 65%，P95 帧间隔不超过控制组的 2.5 倍。参考机器可以通过环境变量再启用绝对 FPS / P95 预算。

当前还不支持：

- GPU Compute 高度场或时序泡沫；
- 跨 Water Body 的全局局部场 Atlas；
- 雨滴批处理、船体几何尾流和涡旋求解；
- 自动设备 benchmark 与持久化策略选择；
- 动态 Grid Snapshot 的 dirty tile builder 与 revision 自动刷新；
- 多于 16 个活跃 emitter 的质量承诺；
- 从正式水系统 npm 包导出的稳定 API。
