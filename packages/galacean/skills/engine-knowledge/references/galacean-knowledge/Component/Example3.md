# 启停与销毁 示例

## Summary
- 展示启停与销毁的用法。
- 关键 API：MeshRenderer

## Code
```ts
import { Entity, MeshRenderer } from "@galacean/engine";

declare const cube: Entity;

const renderer = cube.getComponent(MeshRenderer);
renderer.enabled = false; // 临时关闭

// 完全移除组件
renderer.destroy();
```
