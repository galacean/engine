# 基础启动 示例

## Summary
- 展示基础启动的用法。
- 关键 API：WebGLEngine, Camera, Vector3

## Code
```ts
import { WebGLEngine, Camera, Vector3 } from "@galacean/engine";

// 创建引擎，canvas 可传元素或 id
const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.scenes[0];
const root = scene.createRootEntity("Root");

// 相机
const camEntity = root.createChild("Camera");
const camera = camEntity.addComponent(Camera);
camEntity.transform.setPosition(0, 3, 10);
camEntity.transform.lookAt(new Vector3(0, 1, 0));

engine.run();
```
