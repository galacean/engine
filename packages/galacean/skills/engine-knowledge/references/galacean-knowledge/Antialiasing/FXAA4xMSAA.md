# 开启 FXAA + 4x MSAA 示例

## Summary
- 展示开启 FXAA + 4x MSAA的用法。
- 关键 API：AntiAliasing, MSAASamples

## Code
```ts
import { AntiAliasing, Camera, MSAASamples } from "@galacean/engine";

declare const camera: Camera;

camera.antiAliasing = AntiAliasing.FXAA;
camera.msaaSamples = MSAASamples.FourX;
```
