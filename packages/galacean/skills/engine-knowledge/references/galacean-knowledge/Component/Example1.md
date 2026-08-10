# 添加与获取组件 示例

## Summary
- 展示添加与获取组件的用法。
- 关键 API：Camera, Script, DirectLight

## Code
```ts
import { Camera, DirectLight, Scene, Script } from "@galacean/engine";

declare const scene: Scene;

const root = scene.createRootEntity("Root");
const camera = root.addComponent(Camera);

const lightEntity = root.createChild("Sun");
const light = lightEntity.addComponent(DirectLight);

// 获取同类组件或递归查找
const firstCamera = root.getComponent(Camera);
const allScripts: Script[] = [];
root.getComponentsIncludeChildren(Script, allScripts);
```
