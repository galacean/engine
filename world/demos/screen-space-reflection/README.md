# SSR 质量预算与验证

引擎源码位于 `world/engine/overlay/packages/core/src/lighting/screenSpaceReflection`，此页面提供实际反射场景和性能、均衡、画质三个预设入口。

## 使用

```ts
import {
  ScreenSpaceReflection,
  ScreenSpaceReflectionQuality,
  ScreenSpaceReflectionReceiverMode,
  ScreenSpaceReflectionUpsamplingMode
} from "@galacean/engine";

// 显式应用完整预算；不会启用 SSR，也不会覆盖消费者或接收阶段的独立设置。
camera.screenSpaceReflection.applyQualityPreset(ScreenSpaceReflectionQuality.Medium);

// Water 等消费者也可选用预设，再按场景覆盖距离等字段。
const lease = camera.screenSpaceReflection.acquireConsumer("water", {
  ...ScreenSpaceReflection.getQualityPreset(ScreenSpaceReflectionQuality.Medium),
  receiverMode: ScreenSpaceReflectionReceiverMode.TransparentSampleOnly,
  maxRayDistance: 80
});

// 复杂轮廓需要更强的边缘保护时，显式选择几何感知重建。
lease.update({
  ...lease.request,
  upsamplingMode: ScreenSpaceReflectionUpsamplingMode.Bilateral
});
// 消费者销毁时释放。
lease.release();
```

| 完整预设      | 线性分辨率 | 步数 / 二分细化 | 最大距离 | 重建                     |
| ------------- | ---------- | --------------- | -------- | ------------------------ |
| Low / 性能    | 0.25       | 16 / 2          | 20 m     | 双线性直接采样           |
| Medium / 均衡 | 0.5        | 32 / 3          | 30 m     | 双线性直接采样           |
| High / 画质   | 1          | 64 / 5          | 30 m     | 全分辨率直接采样，无重建 |

Demo 保留初始场景的自定义参数，显示“自定义”，且不选中任何预设。只有实际生效的整组追踪与重建参数匹配某档完整预设时，才选中对应按钮；自定义分辨率或重建方式后会重新判断。

原有 `quality` 属性仍只调整步数与细化次数。原有默认分辨率、Terrain/Water 场景配置及消费者仲裁保持原语义；使用新完整预算需要调用 `applyQualityPreset()` 或显式传入 `getQualityPreset()` 的设置。

`upsamplingMode` 可选：

- `Bilinear`：直接消费低分辨率反射，不申请 origin、过滤或全分辨率重建纹理；轮廓处可能混入邻近表面的反射。
- `Bilateral`：保留 origin 与深度、法线、粗糙度感知重建，省去两遍高斯过滤。
- `GaussianBilateral`：原有的两遍高斯过滤加几何感知重建，仍为既有配置的默认值。

实际追踪尺寸等于输出尺寸时，三种模式都直接消费 Trace，不申请 origin 或重建纹理。颜色仍按置信度预乘；接收面、环境回退和透明消费契约不变。Scene Color、接收面 MRT 和接收深度仍为全分辨率，低档成本不会按追踪像素数等比例下降。

## 观测

`screenSpaceReflection.metrics` 增加 `sceneCopyPassCount`、`filterPassCount`、`upsamplePassCount` 和 `fullscreenPassCount`。全屏次数不包含接收面几何绘制及 mip 生成；原 `tracePassCount` 仍表示逻辑追踪阶段数。

可选的 `screenSpaceReflection.profiler` 提供共享颜色复制、mip 生成，以及每个接收阶段的 surface、trace、过滤、重建、合成采样边界。默认不启用。调用方负责异步 timer query、查询销毁和 disjoint 样本拒绝；不要使用同步 `gl.finish()` 计时，也不要把 CPU 时间当作 GPU 时间。相机克隆不会复制 profiler，相机销毁会清除引用。

`estimatedBytes` 是本帧 SSR 归因资源的估算峰值，不是共享池的总驻留显存。多个阶段共享和复用 scratch，统计不包含已经归还到池中的旧尺寸资源。

## 验证

在 `world/` 物化并安装依赖后，执行：

```bash
pnpm test:ssr
pnpm typecheck:ssr
node scripts/run-engine.mjs pnpm --dir world-gallery test:ssr:e2e
```

独立 Demo 浏览器验收可通过 `SSR_E2E_URL` 复用已有服务。用例覆盖初始自定义状态、完整预设匹配、重建参数切换，以及反射变化、非反射区域保护、置信度和离屏回退。截图与测量输出位于 Gallery 的 `output/ssr-acceptance`，Playwright 产物位于 `output/playwright/ssr-demo`。

验证结论应绑定被测版本、场景和设备；全屏绘制次数与帧内资源估算不能直接推导 GPU 耗时、FPS 或共享池总驻留显存。Demo 浏览器验收不代表 Terrain、透明水面整场景或移动设备验收。
