# 控制与结束回调 示例

## Summary
- 展示控制与结束回调的用法。

## Code
```ts
import { LottieAnimation } from "@galacean/engine-lottie";

declare const lottie: LottieAnimation;

await lottie.play(); // 等待动画结束
// do something
lottie.pause();
```
