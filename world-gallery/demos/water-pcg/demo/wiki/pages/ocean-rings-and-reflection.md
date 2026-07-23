P1 海洋能力解决两个直接相关的问题：镜头移动后怎样始终拥有足够远的水面、又不每帧重建大网格；以及 Sky、环境探针和平面反射怎样在一台相机内按固定预算选择和降级。

当前实现是 **Gerstner Ocean Preview**：渲染端使用围绕相机移动的有限 Rings 覆盖，不是 FFT 频谱海洋，也不是真正无限或已经产品化的大世界 Streaming 海洋包。

## 相机相对环带的数据流

```text
OceanPreviewConfig
  -> compileWaterWaveAsset
  -> immutable OceanRingGeometry
       central patch + 2/3 rings
       per-patch bounds + renderer culling
  -> camera XZ snapped to base cell
  -> move ring root only
  -> world-space Gerstner phase

same CompiledWaterWaveSet + same time
  -> WaterWaveMaterial
  -> OceanWaterSurfaceProvider
```

关键不变量是：**相机移动只改变环带根节点的位置，不重新创建或上传 Mesh；波浪相位用世界坐标计算，不跟随根节点一起滑动。** 否则每跨一个网格单元，海面纹理和波峰会“粘在镜头上”跳动，CPU Query 也会与画面失配。

## 中心网格与 2 / 3 层 Ring

`OceanRingGeometry` 根据 `size`、`ringCount` 和 `patchSegments` 一次性创建拓扑：

- 1 个高密度 central patch。
- 每层 Ring 使用 `4 × 4` 布局，去掉中心 `2 × 2` 孔，得到 12 个 patch。
- Low 为 2 层 Ring，共 `1 + 12 × 2 = 25` 个 patch。
- Medium / High 为 3 层 Ring，共 `1 + 12 × 3 = 37` 个 patch。
- 相邻层 patch 尺寸按 2 倍增长，形成 2:1 LOD 过渡。

较细层在外边缘生成向下 skirt，遮住不同分辨率交界处的裂缝。Skirt 只增加初始化拓扑，不会改变水平水面采样网格。

`size` 表示环带围绕相机的**有限渲染覆盖直径**。`coverageHalfExtent = size / 2`；它不是 Ocean 在世界中的固定 AABB，也不表示已经实现无限 Streaming。当前 `OceanWaterSurfaceProvider` 使用解析 Gerstner 并配置为 unbounded，所以玩法查询可以在环带移动后继续使用世界坐标求值；解析查询不受有限 Rings 覆盖约束，不等于渲染几何无限。

每个 patch 都有独立 Renderer 和包含以下余量的 bounds：

```text
horizontal = patch half size + maxHorizontalDisplacement
vertical   = waterLevel +/- maxVerticalDisplacement
bottom     = waterLevel - maxVerticalDisplacement - skirtDepth
```

因此 Galacean 可以逐 patch 做视锥裁剪，`visiblePatchCount`、`visibleTriangleCount` 和 `drawCount` 反映当前真正可见的预算。Ring 默认放在 `Layer30`，平面反射相机会排除全部水层，避免递归渲染水面自身。

## Camera snap 与零每帧上传

镜头 XZ 会吸附到 `baseCellSize`：

```ts
oceanPreview.update(deltaTime, cameraEntity.transform.worldPosition);
```

只有吸附坐标变化时才移动 `OceanRingGeometry.root`，并增加 `originSnapCount`。以下指标必须成立：

```ts
const metrics = window.waterPcgGetOceanMetrics?.();
console.table({
  rings: metrics?.ringCount,
  patches: metrics?.patchCount,
  visible: metrics?.visiblePatchCount,
  draws: metrics?.drawCount,
  snaps: metrics?.originSnapCount,
  uploads: metrics?.meshUploadCount,
  perFrameUpload: metrics?.perFrameMeshUpload
});
```

`perFrameMeshUpload` 固定为 false。修改水位或振幅只更新材质、Provider 和 bounds；只有 `size / ringCount / patchSegments` 的 topology key 变化时才重建环带。质量档位切换可能改变 Ring 数，因此它属于显式重配置，不是正常每帧成本。

`setLodDebug(true)` 会把每层 LOD 着成不同颜色，用于检查同心布局、过渡和裁剪；这只是调试视图，不应进入正式材质截图。

## Sky / Probe / Planar 反射层级

反射来源由 `WaterReflectionSource` 表达：

- `sky`：最低成本，只使用天空近似。
- `probe`：使用调用方注入的 `TextureCube` 环境探针。
- `planar`：使用镜像相机渲染的 2D RenderTarget，最准确也最昂贵。

水体向每相机 `WaterReflectionService` 提交请求：

```ts
reflectionService.setRequest({
  id: "ocean-preview",
  preferredSource: "planar",
  quality: "medium",
  visible: true,
  priority: 0,
  planeY: 0,
  cullingMask: Layer.Everything,
  waterLayerMask: Layer.Layer30
});
```

每相机最多选一个 Planar owner。候选先按 priority 从高到低排序，再按 id 字典序稳定打破平局。其他请求不会再创建反射相机，而是回退到 Probe；没有 Probe 时继续回退 Sky。

Policy 会保留 `requestedSource`、`resolvedSource` 和原因：

| 原因                  | 表示什么                                  |
| --------------------- | ----------------------------------------- |
| `low-quality`         | Low 主动禁用 Planar                       |
| `planar-unavailable`  | 视口、分配或渲染失败，Planar 不可用       |
| `planar-not-selected` | 同相机已有更高优先级 Planar owner         |
| `probe-unavailable`   | 请求 Probe，但调用方没有注入 Cube Texture |

业务逻辑应显示 resolved source，而不是只显示用户请求值，否则设备降级后 UI 会误报“Planar 正在工作”。

## WaterReflectionService 生命周期

每个主相机拥有一个 Service：

```ts
const reflections = new WaterReflectionService(engine, root, camera);
reflections.setViewportSize(engine.canvas.width, engine.canvas.height);
oceanPreview.setReflectionService(reflections);
oceanPreview.setReflectionSource("planar");

// 每帧：先更新水体和请求，再更新反射，最后绑定结果。
oceanPreview.update(deltaTime, cameraEntity.transform.worldPosition);
reflections.update();
oceanPreview.refreshReflectionBinding();
```

Resize 时必须重新调用 `setViewportSize()`。模式切换后应调用 `setReflectionVisible(isOcean)`，隐藏水体不能继续占用 Planar owner；Controller 会同时清空材质上的旧 binding，避免 RT 销毁后残留纹理引用，恢复可见时再重新解析。销毁时先 `oceanPreview.destroy()` 移除 consumer，再 `reflections.destroy()` 释放相机、RenderTarget 和纹理。

反射相机默认 disabled，只由 Service 手动 `render()`；它复制主相机的 FOV、正交参数、裁剪面和 clear flags，把位置、forward 与 up 关于 `planeY` 镜像，并从 culling mask 排除所有已注册水层。

创建 RT 或 `camera.render()` 抛错时，Service 会释放已创建资源、增加 `planarFailureCount`，并重新规划为 Probe/Sky。调用 `retryPlanar()` 可以在外部环境恢复后显式重试；它不会在每帧失败后无限重建资源。

## Low / Medium / High 固定预算

| 档位   |              Ring |                Planar |    更新频率 | 回退        |
| ------ | ----------------: | --------------------: | ----------: | ----------- |
| Low    | 2 层 / 25 patches | 禁用，不创建相机或 RT |           0 | Probe → Sky |
| Medium | 3 层 / 37 patches |       视口 1/4 分辨率 | 每 2 帧一次 | Probe → Sky |
| High   | 3 层 / 37 patches |       视口 1/2 分辨率 |    每帧一次 | Probe → Sky |

Planar 宽高会分别限制在 64 到 1024。RT 使用 RGBA8 color + Depth24；当前指标按 8 bytes/pixel 估算 color + depth，总值可从 `estimatedRenderTargetBytes` 读取。这个估算不包含驱动对齐、mipmap 或浏览器内部复制，应以 GPU capture 为最终依据。

Low 仍保留解析 Ocean Query 和固定波浪时间，不会因为关闭反射而降低浮力正确性。没有注入 Probe 的当前 Demo 即使选择 `probe`，resolved source 也会是 `sky`，这是正常降级，不是自动生成了环境探针。

## 指标与诊断

`OceanPreviewMetrics` 覆盖：

- `ringCount / patchCount / visiblePatchCount / drawCount`；
- `triangleCount / visibleTriangleCount / vertexCount`；
- `meshCreateCount / meshUploadCount / meshDestroyCount`；
- `originSnapCount / originX / originZ / baseCellSize`；
- `reflectionSource`，它是当前 resolved source；
- `activeWaveCount / shaderWaveCount / sourceHash / frameCount`。

`WaterReflectionService.metrics` 还应观察：

- `activeConsumerCount / planarRequestCount / planarOwnerId`；
- `planarCameraCount`，只能是 0 或 1；
- `planarUpdateCount / planarSkippedUpdateCount / planarFailureCount`；
- RT 创建/销毁次数、宽高与估算字节；
- `lastPlanarDrawCount / totalPlanarDrawCount`；
- CPU 渲染耗时与 P95；若外部 profiler 调用 `recordPlanarGpuTime()`，再看 GPU sample。

引擎当前没有公开的 per-camera draw counter 和通用 GPU timer，因此 draw 数可以由 Demo adapter 估算，GPU 时间也只能由可选 profiler 注入。没有样本时不要把 `0 ms` 解读为真实 GPU 免费。

## Demo 操作

启动开发服务器：

```sh
pnpm -C world-gallery exec vite . --config vite.config.js --host 127.0.0.1 --port 4179
```

打开 Ocean 并直接指定档位：

```text
http://127.0.0.1:4179/demos/water-pcg/?quality=medium&reflection=planar&oceanLodDebug=1#developer-ocean-lod
```

建议按以下顺序检查：

1. 打开 LOD Debug，移动相机，确认同心 Patch 只在 base cell 边界吸附，波峰没有跟镜头滑动。
2. 关闭 LOD Debug，依次选择 Sky、Probe、Planar，并查看 resolved `reflectionSource`。
3. 切换 Low / Medium / High，确认 25 / 37 / 37 patches，以及 Planar 0 / 1/4 / 1/2 策略。
4. 调整 Water Level 或 Amplitude，确认 `meshUploadCount` 不因逐帧更新增长。
5. 调用 `window.waterPcgStressOcean?.(100)`，确认重配置后 active Mesh/Material 数稳定。

如果当前没有注入环境 Cube Texture，Probe 回退 Sky 是预期行为。Planar 切换需要场景已创建 `WaterReflectionService` 且视口非零。

自动化可以直接使用 Demo 的调试入口：

```js
window.waterPcgSetOceanReflectionSource?.("planar");
window.waterPcgSetOceanLodDebug?.(true);
window.waterPcgSetOceanCameraPosition?.(48, 32);
window.waterPcgGetOceanMetrics?.();
window.waterPcgGetReflectionMetrics?.();
```

这些 `window` 方法只服务浏览器验收，不是业务项目 API。

## 测试与当前限制

聚焦验证：

```sh
pnpm -C world-gallery exec vitest run --config vitest.config.ts \
  demos/water-pcg/tests/runtime/OceanRingGeometry.test.ts \
  demos/water-pcg/tests/runtime/WaterReflectionPolicy.test.ts \
  demos/water-pcg/tests/runtime/WaterReflectionService.test.ts \
  demos/water-pcg/tests/runtime/OceanWaterSurfaceProvider.test.ts \
  demos/water-pcg/tests/runtime/WaterWaveMaterialFactory.test.ts \
  demos/water-pcg/tests/demo/OceanPreviewController.test.ts
pnpm -C world-gallery typecheck:water-pcg
```

浏览器 Gate 至少应检查：镜头跨多个 cell 时无裂缝和相位跳变；每帧 Mesh upload 为零；视锥外 patch 会被裁剪；同相机只有一个 Planar camera；Low 不分配 RT；参考环境的 Medium 必须真正得到 Planar、隔帧更新并相对稳定 Sky 基线产生可测画面差异；显式 fallback 模式再验证创建/渲染失败后不抛到主循环且能回退。

当前还不支持：

- FFT、频谱风场、多尺度浪群和喷溅；
- 地球曲率、真正无限几何或大世界 Water Zone streaming；
- SSR、粗糙度卷积 Probe、局部反射探针自动选择；
- 斜裁剪面与所有平台上的完美水下/水上交界裁剪；
- 自动生成环境 Cube Texture；
- 内建 GPU timer 与精确 per-camera draw 统计；
- 从正式水系统 npm 包导出的稳定 API。
