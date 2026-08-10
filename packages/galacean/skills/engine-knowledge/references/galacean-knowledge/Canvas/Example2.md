# 基础创建与自适应 示例

## Summary
- 展示基础创建与自适应的用法。
- 关键 API：WebGLEngine

## Code
```ts
import { WebGLEngine } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
// 自动跟随 Canvas 的 CSS 显示尺寸和设备像素比；内部使用 ResizeObserver。
engine.canvas.setAutoResolution();
```
