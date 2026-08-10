# 使用内置几何体 示例

## Summary
- 展示使用内置几何体的用法。
- 关键 API：MeshRenderer

## Code
```ts
import { Engine, Entity, MeshRenderer, PrimitiveMesh } from "@galacean/engine";

declare const engine: Engine;
declare const entity: Entity;

const cube = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
const renderer = entity.addComponent(MeshRenderer);
renderer.mesh = cube;
```
