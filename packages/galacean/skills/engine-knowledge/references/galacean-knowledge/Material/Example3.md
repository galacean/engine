# 实例化材质防止污染 示例

## Summary
- 展示实例化材质防止污染的用法。
- 关键 API：MeshRenderer

## Code
```ts
import { Entity, MeshRenderer } from "@galacean/engine";

declare const entity: Entity;

const renderer = entity.getComponent(MeshRenderer);
const inst = renderer.getInstanceMaterial(0); // 克隆
inst.shaderData.setFloat("u_Offset", 0.5);
renderer.setMaterial(0, inst);
```
