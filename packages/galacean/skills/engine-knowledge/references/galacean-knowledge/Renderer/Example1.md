# 基础配置 示例

## Summary
- 展示基础配置的用法。
- 关键 API：MeshRenderer

## Code
```ts
import { Entity, Material, MeshRenderer } from "@galacean/engine";

declare const cubeEntity: Entity;
declare const myMaterial: Material;

const renderer = cubeEntity.getComponent(MeshRenderer);
renderer.castShadows = true;
renderer.receiveShadows = true;
renderer.priority = 1;
renderer.setMaterial(0, myMaterial);
```
