# 播放音效 示例

## Summary
- 展示播放音效的用法。
- 关键 API：AudioClip, AudioSource

## Code
```ts
import { AudioClip, AudioSource, Engine, Entity } from "@galacean/engine";

declare const engine: Engine;
declare const entity: Entity;

const clip = await engine.resourceManager.load<AudioClip>("sounds/explode.mp3");
const source = entity.addComponent(AudioSource);
source.clip = clip;
source.loop = false;
source.play();
```
