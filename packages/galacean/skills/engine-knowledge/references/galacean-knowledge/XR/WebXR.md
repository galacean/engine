# 启动 WebXR 示例

## Summary
- 展示启动 WebXR的用法。
- 关键 API：XRSessionMode

## Code
```ts
import { Engine } from "@galacean/engine";
import { XRSessionMode } from "@galacean/engine-xr";

declare const engine: Engine;

// 设置 origin（必须在会话前设置）
const origin = engine.sceneManager.scenes[0].createRootEntity("XROrigin");
engine.xrManager.origin = origin;

engine.xrManager.enterXR(XRSessionMode.AR).then(
  () => console.log("Enter AR"),
  (error) => console.log("Not supported AR", error)
);
```
