---
order: 0
title: Post Process Overview
type: Graphics
group: Post Process
label: Graphics/PostProcess
---

The post-processing system can "process" the results of scene rendering.

Turn off post-processing:

![](https://gw.alipayobjects.com/zos/OasisHub/3a50ed18-c2d4-4b33-a4e6-af79f2c273f8/2024-07-18%25252018.08.30.gif)

Turn on post-processing:

![](https://gw.alipayobjects.com/zos/OasisHub/4bd5f985-1b82-4aca-b6fa-fd521aab8f57/2024-07-18%25252018.15.30.gif)

## Use post-processing

### 1. Post-processing configuration

The post-processing configuration is placed in the `scene` panel. To prevent performance waste, the `main switch` is turned off by default. Users only need to turn on the main switch to activate all post-processing effects:

<img src="https://gw.alipayobjects.com/zos/OasisHub/50f6a2aa-0463-4b66-b54e-edff71187077/image-20240718193530098.png" alt="image-20240718193530098" style="zoom:50%;" />

> For specific post-processing effect configuration, please refer to [Post-processing effects list](/en/docs/graphics-postProcess-effects)

As of version 1.3, the engine does not export a public API (because the API may change after supporting post-processing extensions). We recommend that users perform post-processing operations in the editor. If you want to use the internal experimental interface, you can call:

```typescript
// Get Post-Processing manager
// @ts-ignore
const postProcessManager = scene._postProcessManager;
// Get BloomEffect
const bloomEffect = postProcessManager._bloomEffect as BloomEffect;
// Get TonemappingEffect
const tonemappingEffect = postProcessManager._tonemappingEffect as TonemappingEffect;

// Activate the main switch
postProcessManager.isActive = true;

// Adjusting BloomEffect Properties
bloomEffect.enabled = true;
bloomEffect.downScale = BloomDownScaleMode.Half;
bloomEffect.threshold = 0.9;
bloomEffect.scatter = 0.7;
bloomEffect.intensity = 1;
bloomEffect.tint.set(1, 1, 1, 1);

// Adjusting TonemappingEffect Properties
tonemappingEffect.enabled = true;
tonemappingEffect.mode = TonemappingMode.ACES;
```

### 2.Camera component switch

The camera component has a switch that can determine whether to enable post-processing, as well as whether to enable post-processing related properties such as HDR and MSAA. (Although the camera has post-processing enabled by default, you need to turn on the post-processing configuration master switch to take effect. This is to more flexibly control multiple cameras to apply post-processing configuration)

> More camera configuration, please refer to [Camera component](/en/docs/graphics-camera-component)

<img src="https://gw.alipayobjects.com/zos/OasisHub/3232935d-a765-4da4-b08e-021aac61458e/image-20240718210947199.png" alt="image-20240718210947199" style="zoom:50%;" />

### 3.Viewport switch

In addition to the camera preview area, the post-processing effect can also be seen in the viewport. The camera in the viewport is independent, but it also has post-processing switches like the camera component (same as above, also pay attention to the switches in the post-processing configuration); the switches in the viewport only affect the viewport window, and will not affect the actual effect of the project export:

<img src="https://gw.alipayobjects.com/zos/OasisHub/f9f13d02-931f-4638-af91-4a007007c99f/image-20240718193359413.png" alt="image-20240718193359413" style="zoom:50%;" />

## Recommended configuration for mobile devices

Generally speaking, some post-processing configurations in the red box below will affect performance:

 <img src="https://gw.alipayobjects.com/zos/OasisHub/7e5e272c-fc1e-45cd-92b0-a687c58826c7/image-20240719104328198.png" alt="image-20240719104328198" style="zoom:50%;" />

And some configurations of the camera:

<img src="https://gw.alipayobjects.com/zos/OasisHub/5d96cd31-2e12-43eb-8493-f8751e40eb82/image-20240719112101652.png" alt="image-20240719112101652" style="zoom:50%;" />

- Regarding the `HDR` switch in the camera, if the color of most pixels in the scene does not exceed 1 (for example, no HDR texture is used), try not to turn on HDR. After turning it on, the engine will first render to the RenderTarget in the `R11G11B10_UFloat` format, and then render to the screen, which has performance overhead.
- Regarding the `MSAA` option in the camera, it is recommended to adjust this value only when post-processing is turned on and strict requirements are placed on aliasing performance. The larger the value, the greater the performance overhead.
- In the bloom effect, the default value of `Down Scale` is `Half`, which means that the initial downsampling resolution is half of the canvas. If the accuracy requirement is not so high, you can switch to `Quarter` to save 1/4 of the canvas.
- In the tone mapping effect, although `ACES` has better color contrast and saturation, the calculation is more complicated and may cause serious frame drops on low-end models. You can use `Neutral` as an alternative.
