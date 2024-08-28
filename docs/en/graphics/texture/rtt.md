---
order: 3
title: Offscreen Render Texture
type: Graphics
group: Texture
label: Graphics/Texture
---

Offscreen render texture, as the name suggests, can be obtained through offscreen rendering. It uses [FBO](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferTexture2D) technology at the underlying level, redirecting rendering operations from the screen to a texture. This texture can be used to achieve post-processing effects, refraction, reflection, dynamic environment mapping, and other artistic creations.

The engine provides the [RenderTarget](/apis/core/#RenderTarget) class for offscreen rendering and obtaining the corresponding offscreen render texture. Currently, the engine supports generating the following offscreen render textures:

| Type | Application |
| :-- | :-- |
| Color Texture ([Texture](/apis/core/#Texture)) | Can input a single color texture, multiple color textures (MRT), or a color cube texture |
| Depth Texture ([Texture](/apis/core/#Texture)) | Can input a depth texture or a depth cube texture |
| Texture Combination | Color texture + depth texture, color cube texture + depth cube texture, multiple color textures + depth texture |

## Usage

Here is an example using the `onBeginRender` hook script. Before rendering each frame, first render the screen `Object A` to the `offscreen texture`, then use the offscreen texture as the base texture for `Object B`, and render Object B to the `screen`. Assume the layer of `Object A` is `Layer0` and the layer of `Object B` is `Layer1`;

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
