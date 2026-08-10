# 创建实体并添加组件 示例

## Summary
- 展示创建实体并添加组件的用法。
- 关键 API：Entity, Camera, Script, Layer

## Code
```ts
import { Camera, Entity, Layer, Scene, Script } from "@galacean/engine";

declare const scene: Scene;

const root = scene.createRootEntity("Root");

const player = root.createChild("Player");
player.layer = Layer.Layer1;

const cameraEntity = root.createChild("MainCamera");
cameraEntity.addComponent(Camera);

class Follow extends Script {
  onUpdate() {
    // this.entity -> Follow 组件所在的实体
    // this.scene   -> 所属场景
  }
}
player.addComponent(Follow);
```
