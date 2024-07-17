---
order: 4
title: Ambient Light
type: Graphics
group: Lighting
label: Graphics/Light
---

In addition to real-time computed direct light sources, we generally need to pre-bake ambient light as ambient light for real-time sampling. This method can effectively capture global ambient light and atmosphere, making objects better blend into their environment.

![image-20231227151844040](https://gw.alipayobjects.com/zos/OasisHub/23397353-5434-4bde-ace7-72c8731d5581/image-20231227151844040.png)

## Editor Usage

### 1. Ambient Diffuse Reflection

<img src="https://gw.alipayobjects.com/zos/OasisHub/a0bec326-364b-42ca-9172-0319b47e0256/image-20240219163916257.png" alt="image-20240219163916257" style="zoom:50%;" />

| Property | Description |
| :-- | :-- |
| Source | Specify whether the diffuse reflection source is `Background` or `Solid Color`, with the default source being `Background`. `Background` means using the baked spherical harmonic parameters as the diffuse reflection color; `Solid Color` means using a solid color as the diffuse reflection color. |
| Intensity | Diffuse reflection intensity |

### 2. Ambient Specular Reflection

<img src="https://gw.alipayobjects.com/zos/OasisHub/bec5c785-1969-4f3d-8d04-eff02595cbca/image-20240219163941010.png" alt="image-20240219163941010" style="zoom:50%;" />

| Property | Description |
| :-- | :-- |
| Source | Specify whether the specular reflection source is `Background` or `Custom`, with the default source being `Background`. `Background` means using the pre-filtered environment map obtained based on the background baking as the specular reflection; `Custom` means you can bake an HDR map separately as the environment reflection. |
| Intensity | Specular reflection intensity |

## Script Usage

After obtaining the baked product URL through the [baking tutorial](/en/docs/graphics-light-bake), load and parse it using the engine's EnvLoader:

```typescript
engine.resourceManager
  .load<AmbientLight>({
    type: AssetType.Env,
    url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin"
  })
  .then((ambientLight) => {
    scene.ambientLight = ambientLight;

    // 可以调节漫反射、镜面反射强度，默认为1
    // ambientLight.diffuseIntensity = 1;
    // ambientLight.specularIntensity = 1;

    // 预滤波环境贴图（ambientLight.specularTexture）还可以作为场景的背景
    // skyMaterial.texture = ambientLight.specularTexture;
    // 由于烘焙产物的颜色编码方式是 RGBM，因此作为背景时需要将解码设置为 textureDecodeRGBM
    // skyMaterial.textureDecodeRGBM = true;
  });
```
