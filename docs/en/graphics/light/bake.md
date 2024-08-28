---
order: 5
title: Baking
type: Graphics
group: Light
label: Graphics/Light
---

Baking refers to Galacean performing lighting calculations in advance and baking the results into a binary file (containing [diffuse spherical harmonics parameters](https://www.wikiwand.com/zh-hans/%E7%90%83%E8%B0%90%E5%87%BD%E6%95%B0) and [pre-filtered environment maps](https://learnopengl-cn.github.io/07%20PBR/03%20IBL/02%20Specular%20IBL/)), which are then sampled in real-time during runtime.

<img src="https://gw.alipayobjects.com/zos/OasisHub/5ff4f65b-7940-4359-9de0-f8beef4d7fb2/bake.gif" alt="bake" style="zoom:50%;" />

We provide baking tools in the [editor](https://galacean.antgroup.com/editor) and the [glTF viewer](https://galacean.antgroup.com/engine/gltf-viewer).

## Editor Usage

### 1. Baking Switch

The editor has automatic baking enabled by default. It will automatically bake after modifying the background (color, exposure, rotation, etc.) or changing the baking resolution.

<img src="https://gw.alipayobjects.com/zos/OasisHub/c1d83838-b7c8-434c-b689-118f2ddb0d9e/image-20240219164704802.png" alt="image-20240219164704802" style="zoom:50%;" />

You can also disable automatic baking and perform manual baking when needed.

<img src="https://gw.alipayobjects.com/zos/OasisHub/2e5e0965-956b-4146-a0de-0ca5a8025d4a/image-20240219164728187.png" alt="image-20240219164728187" style="zoom:50%;" />

### 2. Baking Resolution

This indicates the resolution of the pre-filtered environment map after baking. The default resolution is 128, with the baked product being approximately 500KB; a resolution of 64 results in a baked product of about 125KB. You can choose the appropriate baking resolution based on the scene.

<img src="https://gw.alipayobjects.com/zos/OasisHub/2aee8d7d-4f64-4ef9-b004-f81be968488e/image-20240219164802607.png" alt="image-20240219164802607" style="zoom:50%;" />

### 3. Setting Background

Refer to the [background tutorial](/en/docs/graphics/background/sky/) to set the scene background. The editor will perform lighting baking based on the baking resolution and baking switch settings. Any modifications to the background (color, rotation, exposure, changing HDR maps, etc.) will depend on the baking switch to decide whether to bake automatically. **If you want to set a solid color background or a transparent background but do not want to bake the solid color background, you can first turn off the automatic baking switch and then switch to the [solid color background](/en/docs/graphics/background/solidColor/).**

<img src="https://gw.alipayobjects.com/zos/OasisHub/1604407b-f6e0-442a-b179-aef4836877cf/image-20231009114455268.png" alt="image-20231009114455268" style="zoom:50%;" />

## glTF Viewer

We also provide a baking tool in the [glTF viewer](https://galacean.antgroup.com/engine/gltf-viewer) on our official website. Simply drag and drop an HDR map onto the webpage to automatically download the baked product:

![gltf viewer](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*9mGbSpQ4HngAAAAAAAAAAAAAARQnAQ)
