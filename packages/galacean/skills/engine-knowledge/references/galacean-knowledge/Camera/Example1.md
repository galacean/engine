# 基础透视相机 示例

## Summary
- 展示基础透视相机的用法。

## Code
```ts
import {
  WebGLEngine,
  Camera,
  CameraClearFlags,
  Layer,
  Vector3,
  Vector4
} from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });
const scene = engine.sceneManager.scenes[0];
const root = scene.createRootEntity("Root");

const cameraEntity = root.createChild("MainCamera");
const camera = cameraEntity.addComponent(Camera);

camera.isOrthographic = false;
camera.fieldOfView = 60;
camera.nearClipPlane = 0.1;
camera.farClipPlane = 100;
camera.clearFlags = CameraClearFlags.ColorDepth;
camera.cullingMask = Layer.Everything;
camera.priority = 0;
camera.viewport = new Vector4(0, 0, 1, 1); // 修改后重新赋值

cameraEntity.transform.setPosition(0, 3, 10);
cameraEntity.transform.lookAt(new Vector3(0, 1, 0));

engine.run();
```
