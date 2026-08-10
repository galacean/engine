# 创建场景与根实体 示例

## Summary
- 展示创建场景与根实体的用法。

## Code
```ts
import { Engine, Entity, Scene } from "@galacean/engine";

declare const engine: Engine;

const scene = engine.sceneManager.scenes[0]; // 默认场景
const root = scene.createRootEntity("Root");

const player = root.createChild("Player");
const camera = root.createChild("Camera");
```
