# 世界 + HUD 多相机 示例

## Summary
- 展示世界 + HUD 多相机的用法。
- 关键 API：Camera, CameraClearFlags, Layer, Vector4

## Code
```ts
import { Camera, CameraClearFlags, Entity, Layer, Vector4 } from "@galacean/engine";

declare const root: Entity;

// 世界相机
const worldCam = root.createChild("WorldCam").addComponent(Camera);
worldCam.clearFlags = CameraClearFlags.ColorDepth;
worldCam.cullingMask = Layer.Everything;

// HUD 相机：只渲染 Layer1，覆盖在上
const hudCamEntity = root.createChild("HudCam");
const hudCam = hudCamEntity.addComponent(Camera);
hudCam.isOrthographic = true;
hudCam.orthographicSize = 5;
hudCam.clearFlags = CameraClearFlags.Depth; // 保留世界颜色，仅刷新深度
hudCam.cullingMask = Layer.Layer1;
hudCam.priority = worldCam.priority + 1;
hudCam.viewport = new Vector4(0, 0, 1, 1); // 需重新赋值
```
