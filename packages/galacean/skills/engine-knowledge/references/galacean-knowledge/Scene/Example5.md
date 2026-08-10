# 查找场景中指定类型的组件 示例

## Summary
- 展示查找场景中指定类型的组件的用法。
- 关键 API：Camera

## Code
```ts
import { Camera, Scene } from "@galacean/engine";

declare const scene: Scene;

// 收集指定类型组件（含子节点）。getComponentsIncludeChildren 会清空传入数组，需用临时数组汇总。
const cameras: Camera[] = [];
const temp: Camera[] = [];
for (const root of scene.rootEntities) {
  root.getComponentsIncludeChildren(Camera, temp); // temp 被内部清空再填充
  cameras.push(...temp);
}
// 若只要激活组件，可过滤 enabled 且 entity.isActiveInHierarchy
const activeCameras = cameras.filter((c) => c.enabled && c.entity.isActiveInHierarchy);
```
