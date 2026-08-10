# 投射/接收控制 示例

## Summary
- 展示投射/接收控制的用法。
- 关键 API：MeshRenderer

## Code
```ts
import { Entity, MeshRenderer } from "@galacean/engine";

declare const meshEntity: Entity;

const renderer = meshEntity.getComponent(MeshRenderer);
renderer.castShadows = true;
renderer.receiveShadows = true;
```
