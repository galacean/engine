水下能力解决的是“相机已经完全进入水体后，谁来判定状态、选择哪片水、申请相机资源，以及怎样统一水的颜色衰减”。它不是在相机高度低于某个固定平面时简单加一层蓝色滤镜。

当前版本只处理 **fully underwater（相机完全在水下）**。半潜水线、镜头水滴、焦散和水面上下同时可见属于更高阶能力。

## 一条完整的数据链

```text
Camera world position
  -> WaterWorld.findContainingVolume
  -> WaterVolumeProvider
  -> priority + finite vertical containment
  -> UnderwaterController hysteresis
  -> CameraWaterFeatureBroker
  -> depth prepass + UnderwaterPostProcessPass
```

每一层只负责一件事：

- `WaterVolumeProvider` 回答“这个世界坐标是否在这片水的有限体积中”。
- `WaterWorld` 从重叠水体中确定唯一赢家。
- `UnderwaterController` 保存相机进入、停留、切换和离开的状态。
- `CameraWaterFeatureBroker` 合并相机功能请求，避免多片水重复改相机。
- `UnderwaterPostProcessPass` 使用共享光学参数处理最终画面。

这样做的价值是水面查询、浮力和水下状态继续使用同一片 `WaterBodyRuntime`。如果绕开注册表，直接用相机 Y 与一个全局水位比较，室内泳池、叠层水体、排除区和动态波面都会产生错误判定。

## WaterVolumeProvider 与水面查询为什么分开

`WaterSurfaceProvider` 返回最终水面位置、法线、流速和水深，主要回答“水面在哪里”。`WaterVolumeProvider` 返回：

- `surfaceHeight` 与 `bottomHeight`；
- 相机到水面的有符号距离 `signedSurfaceDistance`；
- 已浸没深度 `submergedDepth`；
- 是否命中水平 footprint，以及是否真正位于有限水柱内。

两者分开后，River、Pool、Lake 或未来的自定义体积可以沿用同一套状态机，却不必假设所有水体都有相同的底部形状。

`SurfaceDepthWaterVolumeProvider` 是当前有限 Pool/Lake 的轻量适配器。它复用最终水面查询，并用：

```text
bottomHeight = surfaceHeight - waterDepth
```

得到有限底部。水面高度随波浪变化时，体积顶部也随同一 Provider 更新；`waterDepth` 非有限值或小于零时直接判定失败，不会把错误数据扩散到相机状态。

这个适配器适合“每个 XZ 位置都能由最终水面和水深描述”的水体。洞穴水、任意网格封闭体或多层垂直水柱应实现自己的 `WaterVolumeProvider`。

## WaterWorld 如何选择重叠水体

`findContainingVolume` 的顺序是：

1. 检查水体启用状态、XZ `bounds` 和基础 `exclusionBounds`。
2. 调用精确体积 Provider，并先确认相机位于水面与有限底部之间。
3. 只在真正包含相机的候选之间比较 `priority`。
4. 同优先级时先选更高的水面，再以更小的 body id 保证确定性。

“垂直包含优先于 priority”很重要：楼上高优先级泳池的 XZ 范围即使覆盖楼下相机，只要相机不在它的有限水柱中，就不能抢走楼下水体。

Controller 已经处于某片水时，会额外使用 `sampleBodyVolume(bodyId, ...)` 读取当前水体。这个 API 即使相机刚刚越过水面、`insideVolume` 已变为 false，也会保留有效的表面距离，供滞回判断使用。它不会重新走一套旁路水位算法。

和水面查询一样，体积查询有候选数硬上限，并暴露 `volumeQueryCount`、`volumeHitCount`、`lastVolumeCandidateCount`、`lastVolumePreciseQueryCount` 与溢出计数。

## 滞回避免水面附近闪烁

动态波面会在相机附近上下变化。如果进入和退出都以 `0 m` 为阈值，连续两帧可能在 underwater 与 outside 之间反复切换。

`UnderwaterController` 默认使用不对称阈值：

| 状态条件 |                    默认值 | 作用                           |
| -------- | ------------------------: | ------------------------------ |
| 进入水下 |     至少低于水面 `0.08 m` | 过滤刚碰到水面的噪声           |
| 离开水下 |     高于水面超过 `0.12 m` | 给动态波面留出稳定区间         |
| 穿过底部 | 低于有限底部超过 `0.04 m` | 防止相机在池底以下仍被当作水中 |

每帧 `update()` 会优先查找当前坐标的最佳候选。相机进入另一片满足进入阈值的高优先级水体时，Controller 会确定性切换 body；没有新候选时，再检查当前 body 是否仍在滞回范围内。

Controller 只在状态变化时添加或移除 Broker 请求、启停后处理；每帧复用 caller-owned sample，不在查询热路径创建 Vector、数组或闭包。`metrics` 提供进入、退出、body 切换、当前距离、浸没深度和后处理执行次数。

## 共享 WaterOpticalProfile

每片 `WaterBodyRuntime` 可以携带一个 `WaterOpticalProfile`：

```ts
const poolOptics: WaterOpticalProfile = {
  absorptionCoefficient: [0.2, 0.075, 0.035],
  scatteringColor: [0.045, 0.28, 0.34],
  scatteringCoefficient: 0.18,
  maximumViewDistance: 32
};
```

它同时表达 Beer-Lambert RGB 吸收、入射散射颜色、散射系数和最大视距。Controller 切换水体时把同一份 profile 交给后处理；body 没有 profile 时使用显式 fallback，而不是保留上一片水的颜色。

CPU 侧的 `evaluateWaterOpticalMedium` 与 Shader 使用同一公式，便于无渲染测试和诊断：

```text
transmittance = exp(-absorption * distance)
scattering    = 1 - exp(-scatteringCoefficient * distance)
result        = sceneColor * transmittance + scatteringColor * scattering
```

水面材质后续也应消费同一 profile，避免“从水面看是清水，进入水下却突然变成另一种水”。

## UnderwaterPostProcessPass 做了什么

Pass 注册在 `PostProcessPassEvent.BeforeUber`，默认 `isActive = false`。启用后它：

1. 读取 `renderer_BlitTexture` 的场景颜色。
2. 从 `camera_DepthTexture` 还原眼空间距离。
3. 把距离限制在 `maximumViewDistance` 内。
4. 计算 RGB 吸收和入射散射，并保留源 alpha。

它不采样 opaque texture，因此水下请求不会额外开启 CopyColor。当前 Shader 是自包含的，并有 WebGL2 GLSL ES 3.00 真实预编译测试，避免只用字符串断言误判可编译性。

当前模型假设相机已经完全位于同一种水介质中，因此用相机到可见几何的深度近似光程。它还没有计算视线与水体出口的交点；看向有限泳池之外时，远处几何可能被过度着色。这是 fully-underwater v1 的明确边界。

## CameraWaterFeatureBroker 的请求与回退

进入水下时，Controller 提交一个请求：

```ts
{
  depthTexture: true,
  opaqueTexture: false,
  reflection: "none",
  caustics: false,
  underwater: true,
  quality: "medium"
}
```

Broker 将 `underwater` 解释为“必须有 depth prepass，并启用相机 post process”。它继续与其他 River/Ocean 请求合并，所以同一相机最多只有一次深度拷贝；水下本身不要求颜色拷贝。最后一个水下调用方离开后，Broker 恢复相机原来的 depth、opaque、downsampling 和 post-process 状态。

如果相机 target 没有 `enablePostProcess`，水下请求会立即报错。这个 fail-fast 回退比“状态已经进入水下但画面没有变化”更容易定位。body 缺少光学配置时则回退到 `DEFAULT_WATER_OPTICAL_PROFILE`。

## 最小接入示例

```ts
const volume = new SurfaceDepthWaterVolumeProvider(surfaceProvider);
waterWorld.register(
  new WaterBodyRuntimeAdapter({
    id: "pool",
    type: "pool",
    surface: surfaceProvider,
    volume,
    opticalProfile: poolOptics,
    bounds,
    priority: 20,
    capabilities,
    metrics
  })
);

const cameraFeatures = new CameraWaterFeatureBroker(camera);
const underwaterPass = new UnderwaterPostProcessPass(engine);
engine.addPostProcessPass(underwaterPass);
const underwater = new UnderwaterController({
  world: waterWorld,
  getCameraPosition: () => cameraEntity.transform.worldPosition,
  cameraFeatures,
  postProcess: underwaterPass,
  quality: "medium"
});

// 在相机位置和最终水面都更新后调用。
underwater.update();
```

场景释放时调用 `underwater.destroy()`、移除或销毁 Pass，并在所有相机功能调用方释放后调用 `cameraFeatures.destroy()`。

## Low 与 Medium 的真实边界

当前交互泳池 Demo 的 Low 和 Medium 都保留相同的体积判定、深度纹理与 fullscreen 水下效果，保证状态正确性一致；Low 目前只降低交互高度场网格预算，**没有**自动把水下效果替换成廉价色调，也没有省掉 depth/fullscreen 成本。

因此：

- Medium 是当前水下视觉的基准验收档。
- Low 仍可用于功能验证，但不能被描述成“水下零 RT”档位。
- 产品如果需要严格低功耗策略，应在质量策略层不创建或不启用 Controller/Pass，并回退到普通场景画面；不能关闭体积查询后仍声称水下状态正确。
- High 尚未增加焦散、体积光、SSR 或更精确的水体出口光程。

## 性能、限制与验证

相机在水外时，Pass 保持 inactive，不执行 fullscreen draw，也不由水下请求开启 depth/post process。当前 Demo 会在启动时创建一次 Pass 和 Material，并不是延迟到入水才构造；“完全零初始化分配”仍不是当前承诺。

进入水下后的主要新增成本是一次深度 prepass 和一次 fullscreen pass。引擎既有 Uber 后处理还可能带来额外 blit，应以实际 GPU capture 为准。建议持续观察：

- `CameraWaterFeatureBroker.metrics.depthCopyPassCount` 是否为 `0 / 1`；
- `opaqueTextureRequested` 是否仍为 false；
- `estimatedRenderTargetBytes` 是否符合视口大小；
- `UnderwaterController.metrics.postProcessExecutionCount` 是否只在入水后增长；
- WaterWorld 体积候选数和溢出计数是否有界。

当前还不支持：

- 半潜水线、水面上下同时可见和镜头水滴；
- 焦散、体积光、时间累积浑浊或生物群落；
- 任意网格体积、垂直多层水柱和 3D exclusion；
- 无限 Ocean 水下体积；
- 透明物体的独立水下深度修正；
- 从 `@galacean/engine` 导出的稳定公共 API。

开发时至少运行：

```sh
pnpm -C world-gallery exec vitest run --config vitest.config.ts \
  demos/water-pcg/tests/runtime/SurfaceDepthWaterVolumeProvider.test.ts \
  demos/water-pcg/tests/runtime/WaterWorld.test.ts \
  demos/water-pcg/tests/runtime/WaterOpticalProfile.test.ts \
  demos/water-pcg/tests/runtime/CameraWaterFeatureBroker.test.ts \
  demos/water-pcg/tests/runtime/UnderwaterController.test.ts \
  demos/water-pcg/tests/runtime/UnderwaterPostProcessPass.test.ts
pnpm -C world-gallery typecheck:water-pcg
```

自动化覆盖 finite bottom、动态水面、invalid depth、重叠优先级、exclusion、进入/退出滞回、body 切换、Broker 状态恢复、光学公式和 WebGL2 Shader 预编译。浏览器 Gate 还应固定执行 outside → surface → inside → outside，并确认水面附近不闪烁、离开后执行次数不再增长、运行时无错误。
