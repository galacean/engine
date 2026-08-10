# 加载编辑器 Lottie 资产 示例

## Summary
- 展示加载编辑器 Lottie 资产的用法。
- 关键 API：LottieAnimation

## Code
```ts
import { Entity, Engine } from "@galacean/engine";
import { LottieAnimation, LottieResource } from "@galacean/engine-lottie";

declare const engine: Engine;
declare const root: Entity;

const res = await engine.resourceManager.load<LottieResource>({ url: "effects/glow.json", type: "EditorLottie" });
const entity = root.createChild("Lottie");
const lottie = entity.addComponent(LottieAnimation);
lottie.resource = res;
lottie.isLooping = true;
lottie.speed = 1.2;
lottie.play(); // Promise，可 await 结束
```
