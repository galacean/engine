---
order: 4
title: Camera Textures
type: Graphics
group: Camera
label: Graphics/Camera
---

## Depth Texture

The camera can enable the depth texture through the [depthTextureMode](/apis/galacean/#Camera) property. Once enabled, the depth texture can be accessed in the Shader via the `camera_DepthTexture` property. Depth textures can be used to implement soft particles and water edge transitions, as well as some simple post-processing effects.

<playground src="camera-depth-texture.ts"></playground>

Note: Depth textures only render non-transparent objects.

## Opaque Texture

The camera can enable the opaque texture through the [opaqueTextureEnabled](/apis/galacean/#Camera) property. Once enabled, the `camera_OpaqueTexture` can be used in the shader of the transparent queue. Additionally, you can set downsampling according to clarity requirements and performance demands by configuring [opaqueTextureDownsampling](/apis/galacean/#Camera).
