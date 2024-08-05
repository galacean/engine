---
order: 4
title: 环境光
type: 图形
group: 光照
label: Graphics/Light
---

除了实时计算的直接光源，我们一般还要提前离线烘焙光照作为环境光照来实时采样，这种方式可以有效地捕捉环境的全局光照和氛围，使物体更好地融入其环境。

![image-20231227151844040](https://gw.alipayobjects.com/zos/OasisHub/23397353-5434-4bde-ace7-72c8731d5581/image-20231227151844040.png)

## 编辑器使用

### 1. 环境漫反射

<img src="https://gw.alipayobjects.com/zos/OasisHub/a0bec326-364b-42ca-9172-0319b47e0256/image-20240219163916257.png" alt="image-20240219163916257" style="zoom:50%;" />

| 属性 | 作用 |
| :-- | :-- |
| Source | 指定漫反射来源是 `Background` 还是 `Solid Color`，默认来源 `Background`。`Background` 表示使用烘焙得到的球谐参数作为漫反射颜色; `Solid Color` 表示使用纯色作为漫反射颜色 |
| Intensity | 漫反射强度 |

### 2. 环境镜面反射

<img src="https://gw.alipayobjects.com/zos/OasisHub/bec5c785-1969-4f3d-8d04-eff02595cbca/image-20240219163941010.png" alt="image-20240219163941010" style="zoom:50%;" />

| 属性 | 作用 |
| :-- | :-- |
| Source | 指定镜面反射来源是 `Background` 还是 `Custom`，默认来源 `Background`。`Background` 表示使用根据背景烘焙得到的预滤波环境贴图作为镜面反射; `Custom` 表示可以单独烘焙一张 HDR 贴图作为环境反射。 |
| Intensity | 镜面反射强度 |

## 脚本使用

通过[烘焙教程](/docs/graphics/light/bake/)拿到烘焙产物的 url 后，通过引擎的 EnvLoader 进行加载解析：

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
