# 初始化物理（PhysX） 示例

## Summary
- 展示初始化物理（PhysX）的用法。
- 关键 API：WebGLEngine

## Code
```ts
import { WebGLEngine } from "@galacean/engine";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
const engine = await WebGLEngine.create({ canvas: "canvas", physics: new PhysXPhysics() });
```
