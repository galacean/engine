---
order: 4
title: 相机纹理
type: 图形
group: 相机
label: Graphics/Camera
---

## 深度纹理

相机可以通过 [depthTextureMode](/apis/galacean/#Camera) 属性开启深度纹理，开启深度纹理后可以通过 `camera_DepthTexture` 属性在 Shader 中访问深度纹理。深度纹理可以用于实现软粒子和水面边缘过渡，以及一些简单的后处理效果。

<playground src="camera-depth-texture.ts"></playground>

注意：深度纹理仅渲染非透明物体。

## 非透明纹理

相机可以通过 [opaqueTextureEnabled](/apis/galacean/#Camera) 属性开启非透明纹理，开启后可以在透明队列的 shader 中使用 `camera_OpaqueTexture`，同时可以设置降采样，根据清晰度需求和性能要求来设置 [opaqueTextureDownsampling](/apis/galacean/#Camera)。
