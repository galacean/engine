# 全局 Bloom 示例

## Summary
- 展示全局 Bloom的用法。
- 关键 API：PostProcess, BloomEffect, Camera

## Code
```ts
import { BloomEffect, Camera, Entity, PostProcess, Scene } from "@galacean/engine";

declare const scene: Scene;
declare const cameraEntity: Entity;

const pp = scene.createRootEntity("PP").addComponent(PostProcess);
pp.isGlobal = true;
const bloom = pp.addEffect(BloomEffect);
bloom.intensity.value = 0.8;
bloom.threshold.value = 1.0;

const camera = cameraEntity.getComponent(Camera);
camera.enablePostProcess = true;
camera.enableHDR = true; // Bloom 推荐开启 HDR
```
