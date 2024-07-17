---
order: 5
title: Baking
type: Graphics
group: Lighting
label: Graphics/Light
---

Baking refers to Galacean precomputing lighting calculations and baking the results into a binary file (including [diffuse spherical harmonics parameters](https://en.wikipedia.org/wiki/Spherical_harmonics) and [pre-filtered environment maps](https://learnopengl.com/PBR/IBL/Specular-IBL/)), then sampling them in real-time during runtime.

<img src="https://gw.alipayobjects.com/zos/OasisHub/5ff4f65b-7940-4359-9de0-f8beef4d7fb2/bake.gif" alt="bake" style="zoom:50%;" />

We provide baking tools in the [Editor](https://galacean.antgroup.com/editor) and [glTF Viewer](https://galacean.antgroup.com/#/gltf-viewer).

## Editor Usage

### 1. Baking Switch

The editor defaults to automatic baking, which will automatically bake when modifying the background (color, exposure, rotation, etc.) or changing the baking resolution.

<img src="https://gw.alipayobjects.com/zos/OasisHub/c1d83838-b7c8-434c-b689-118f2ddb0d9e/image-20240219164704802.png" alt="image-20240219164704802" style="zoom:50%;" />

You can also turn off automatic baking and manually bake when needed.

<img src="https://gw.alipayobjects.com/zos/OasisHub/2e5e0965-956b-4146-a0de-0ca5a8025d4a/image-20240219164728187.png" alt="image-20240219164728187" style="zoom:50%;" />

### 2. Baking Resolution

Represents the resolution of the pre-filtered environment map after baking, defaulting to 128 resolution. The baked product is about 500KB at 128 resolution; the product at 64 resolution is about 125KB. You can choose the appropriate baking resolution based on the scene.

<img src="https://gw.alipayobjects.com/zos/OasisHub/2aee8d7d-4f64-4ef9-b004-f81be968488e/image-20240219164802607.png" alt="image-20240219164802607" style="zoom:50%;" />

### 3. Setting Background

Refer to the [background tutorial](/en/docs/graphics-background-sky) to set the scene's background. The editor will perform lighting baking based on the set baking resolution and baking switch. Any modifications to the background (color, rotation, exposure, changing HDR textures, etc.) will be automatically baked according to the baking switch. **If you want to set a solid color or transparent background without baking the solid color background, you can first turn off the automatic baking switch, then switch to a [solid color background](/en/docs/graphics-background-solidColor).**

<img src="https://gw.alipayobjects.com/zos/OasisHub/1604407b-f6e0-442a-b179-aef4836877cf/image-20231009114455268.png" alt="image-20231009114455268" style="zoom:50%;" />

## glTF Viewer

We also provide baking tools in the official [glTF Viewer](https://galacean.antgroup.com/#/gltf-viewer). Simply drag and drop an HDR texture onto the webpage to automatically download the baked product:

![gltf viewer](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*9mGbSpQ4HngAAAAAAAAAAAAAARQnAQ)
