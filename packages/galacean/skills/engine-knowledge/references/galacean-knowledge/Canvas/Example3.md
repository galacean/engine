# 高清屏节能缩放 示例

## Summary
- 展示高清屏节能缩放的用法。

## Code
```ts
import { Engine } from "@galacean/engine";

declare const engine: Engine;

// 将高 DPI 设备的渲染倍率封顶到 2x，CSS 显示尺寸保持不变。
const resolutionScale = Math.min(1, 2 / window.devicePixelRatio);
engine.canvas.setAutoResolution(resolutionScale);
```
