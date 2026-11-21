# Mobile-First SSR v2 Showcase

本案例演示 Galacean Engine 全新重构的移动端优先 Screen-Space Reflection (SSR v2) 管线，采用 `Pre-Forward Dual-Stream Hi-Z + Non-MSAA MRT Receiver + Forward Direct Linear Sample + Single Shared Resolve` 架构。

## 场景演示要素

1. **Glossy Onyx Floor + Neon Pillars（HDR / LDR 切换）**：验证清晰准确的反射、零 LDR 黑点/NaN 与边缘淡出。
2. **Clear Coat Sphere + Opt-Out Sphere**：验证 Clear Coat 与基础层的主反射瓣筛选（`roughness = 0.72` 底漆覆盖 `clearCoatRoughness = 0.04` 仍获得清漆 SSR），以及 `material.screenSpaceReflectionIntensity = 0` 主动退出。
3. **Water over Submerged Tiles（最近接收面契约）**：浅水透明接收面覆盖水底高光瓷砖时，仅最近层（水面）接收 SSR，水底瓷砖干净回退 IBL。
4. **Dual-Transparent Overlap（玻璃叠加水面）**：前层透明玻璃覆盖水面时，Forward 接收面深度校验阻断跨层反射泄漏。
5. **Waterfall Curtain（可选透明深度贡献）**：演示 `material.contributeScreenSpaceReflectionDepth = true` 写入透明遮挡深度并在地面形成倒影。
6. **Temporal Convergence & Camera Cut**：运动发光球检验邻域方差 Clamp 无拖尾，`camera.notifyScreenSpaceReflectionCut()` 触发平滑重置。

## 使用

```ts
import { ScreenSpaceReflectionQuality } from "@galacean/engine";

// Scene 级统一配置
const ssr = scene.screenSpaceReflection;
ssr.enabled = true;
ssr.quality = ScreenSpaceReflectionQuality.Medium; // Low (0.25x) | Medium (0.5x + TA) | High (0.5x + Bilat) | XHigh (1.0x Full)
ssr.maxRoughness = 0.6;
ssr.maxDistance = 24;
ssr.thickness = 0.18;

// Camera 级启用与可选覆盖
camera.enableScreenSpaceReflection = true;
camera.screenSpaceReflectionOverride = null; // null = 跟随 Scene
camera.notifyScreenSpaceReflectionCut(); // 镜头瞬切时清空历史

// Material 级控制
material.screenSpaceReflectionIntensity = 1.0; // 0 = 退出 SSR 接收与 Forward Sampler
material.contributeScreenSpaceReflectionDepth = true; // 可选透明物深度贡献
```

## 本地运行

```bash
pnpm run build
pnpm --dir examples exec vite --config screen-space-reflection/vite.config.mjs
```

打开 http://127.0.0.1:5199/ 观察运行状态（`camera.screenSpaceReflectionDiagnostics`）。
