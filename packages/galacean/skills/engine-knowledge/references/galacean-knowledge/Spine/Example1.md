# 动态加载与实例化 示例

## Summary
- 展示动态加载与实例化的用法。
- 关键 API：SpineAnimationRenderer

## Code
```ts
import { Entity, Engine } from "@galacean/engine";
import { SpineAnimationRenderer, SpineResource } from "@galacean/engine-spine";

declare const engine: Engine;
declare const root: Entity;

const spineRes = await engine.resourceManager.load<SpineResource>({
  url: "spine/hero.json", // 或 .skel，对应 atlas/贴图同名
  type: "Spine"
});

const spineEntity = spineRes.instantiate();
const spine = spineEntity.getComponent(SpineAnimationRenderer)!;
spine.defaultConfig.animationName = "idle";
spine.defaultConfig.loop = true;
root.addChild(spineEntity);
```
