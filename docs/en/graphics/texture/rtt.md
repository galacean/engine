---
order: 3
title: Off-screen Rendering Texture
type: Graphics
group: Texture
label: Graphics/Texture
---

Off-screen rendering texture, as the name suggests, is a texture that can be obtained through off-screen rendering. The underlying technology uses [FBO](https://developer.mozilla.org/en-US/en/docs/Web/API/WebGLRenderingContext/framebufferTexture2D) to output rendering operations to a texture instead of the screen. Users can use this texture to implement post-processing effects, refraction, reflection, dynamic environment mapping, and other artistic creations.

The engine provides the [RenderTarget](/apis/core/#RenderTarget) class for off-screen rendering and obtaining the corresponding off-screen rendering texture. Currently, the engine supports generating the following types of off-screen rendering textures:

| Type | Application |
| :-- | :-- |
| Color Texture ([Texture](/apis/core/#Texture)) | Single color texture, multiple color textures (MRT), color cube texture |
| Depth Texture ([Texture](/apis/core/#Texture)) | Depth texture, depth cube texture |
| Texture Combination | Color texture + depth texture, color cube texture + depth cube texture, multiple color textures + depth texture |

## Usage

Here is an example using the `onBeginRender` script hook. Before rendering each frame, render the screen `object A` to the `off-screen texture`, then use the off-screen texture as the base texture of `object B` and render object B to the `screen`. Assuming `object A` has a layer of `Layer0` and `object B` has a layer of `Layer1`;

```
class switchRTScript extends Script {
    renderColorTexture = new Texture2D(engine, 1024, 1024);
    renderTarget = new RenderTarget(
      engine,
      1024,
      1024,
      this.renderColorTexture
    );

    constructor(entity: Entity) {
      super(entity);
	  // 将离屏纹理当作物体B的基础纹理
      materialB.baseTexture = this.renderColorTexture;
    }

    onBeginRender(camera: Camera) {
	  // 渲染物体A
      camera.renderTarget = this.renderTarget;
      camera.cullingMask = Layer.Layer0;
      camera.render();

	  // 还原 RT，接下来渲染物体B到屏幕。
      camera.renderTarget = null;
      camera.cullingMask = Layer.Layer1;
    }
  }

  cameraEntity.addComponent(switchRTScript);
```

<playground src="render-target.ts"></playground>

