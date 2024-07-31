---
order: 4
title: Camera Depth Texture
type: Graphics
group: Camera
label: Graphics/Camera
---


The camera can enable depth texture through the [depthTextureMode](<(/apis/core/#Camera-depthTextureMode)>) property. After enabling the depth texture, you can access the depth texture in the Shader through the `camera_DepthTexture` property. Depth texture can be used to implement soft particles, water surface edge transitions, and some simple post-processing effects.

<playground src="camera-depth-texture.ts"></playground>

Note: Depth texture only renders non-transparent objects.

