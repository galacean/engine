# 纯色背景（透明） 示例

## Summary
- 展示纯色背景（透明）的用法。
- 关键 API：BackgroundMode

## Code
```ts
import { Background, BackgroundMode } from "@galacean/engine";

declare const scene: { background: Background };

const bg = scene.background;
bg.mode = BackgroundMode.SolidColor;
bg.solidColor.set(0, 0, 0, 0); // 透出页面
```
