# Pro Code（json + atlas） 示例

## Summary
- 展示Pro Code（json + atlas）的用法。

## Code
```ts
import { Entity, Engine } from "@galacean/engine";
import { LottieAnimation } from "@galacean/engine-lottie";

declare const engine: Engine;
declare const root: Entity;

const lottieEntity = await engine.resourceManager.load<Entity>({
  urls: ["effect.json", "effect.atlas"],
  type: "lottie"
});
root.addChild(lottieEntity);
const lottie = lottieEntity.getComponent(LottieAnimation);
lottie.play("clip1"); // 播放切片
```
