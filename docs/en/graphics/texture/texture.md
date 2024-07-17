---
order: 0
title: Texture Overview
type: Graphics
group: Texture
label: Graphics/Texture
---

Textures ([Texture](/apis/core/#Texture)) are the most commonly used resources in 3D rendering. When shading models, we need to assign a color value to each fragment. Besides manually setting the color value, we can also choose to read texels from textures for shading to achieve more sophisticated artistic effects.

> It is worth noting that images, canvas drawings, raw data, videos, etc., can all be used as textures. The Galacean engine currently supports all standard WebGL textures.

We will find that many issues in the engine stem from mappings between different spaces (such as MVP transformations), and textures are no exception. Developers not only need to understand the mapping relationship from image space to texture space but also need to understand the mapping rules from texels to pixels.

This document will mainly cover:

- Texture types, texture space, and common properties
- [2D Texture](/en/docs/graphics-texture-2d)
- [Cube Texture](/en/docs/graphics-texture-cube)
- [Playing Video with Textures](/en/docs/graphics-texture-2d)
- [Setting Skybox Textures](/en/docs/graphics-background-sky)
- [Offscreen Rendering Textures](/en/docs/graphics-texture-rtt)
- Using [Compressed Textures](/en/docs/graphics-texture-compression)

## Texture Types

| Type                                      | Description                                                                 |
| :---------------------------------------- | :-------------------------------------------------------------------------- |
| [2D Texture](/en/docs/graphics-texture-2d)  | The most commonly used artistic resource, sampled using 2D UV coordinates    |
| [Cube Texture](/en/docs/graphics-texture-cube}) | Composed of 6 2D textures, a cube texture can be used for skyboxes, environment reflections, and other effects |

## Texture Space

Texture space is determined by the shape of the texture. 2D textures require the use of 2D spatial vectors for texture sampling, while cube textures require the use of 3D spatial vectors for texture sampling.

<div style="display: flex; gap: 20px;">
  <figure style="flex:1;">
  <img alt="Texture 2D" src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*lQ29R7W1ufsAAAAAAAAAAAAADhuCAQ/original" style="zoom:50%;" >
  <figcaption style="text-align:center; color: #889096;font-size:12px">Texture 2D</figcaption>
	</figure>
  <figure style="flex:1;">
    <img alt="Texture Cube" src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*X752S5pQSB0AAAAAAAAAAAAAARQnAQ" style="zoom:80%;">
    <figcaption style="text-align:center; color: #889096;font-size:12px">Texture Cube</figcaption>
  </figure>
</div>

## Common Properties

Although texture types vary, they all have some similar basic properties and settings:

| Property                                                        | Value                                                                                                                                 |
| :-------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| U Wrap Mode ([wrapModeU](/apis/core/#Texture-wrapModeU))          | Clamping ([Clamp](/apis/core/#TextureWrapMode-Clamp)), Repeating ([Repeat](/apis/core/#TextureWrapMode-Repeat)), Mirrored Repeat ([Mirror](/apis/core/#TextureWrapMode-Mirror)) |
| V Wrap Mode ([wrapModeV](/apis/core/#Texture-wrapModeV))          | Clamping ([Clamp](/apis/core/#TextureWrapMode-Clamp)), Repeating ([Repeat](/apis/core/#TextureWrapMode-Repeat)), Mirrored Repeat ([Mirror](/apis/core/#TextureWrapMode-Mirror)) |
| Filter Mode ([filterMode](/apis/core/#Texture-filterMode))        | Point Filtering ([Point](/apis/core/#TextureFilterMode-Point)), Bilinear Filtering ([Bilinear](/apis/core/#TextureFilterMode-Bilinear)), Trilinear Filtering ([Trilinear](/apis/core/#TextureFilterMode-Trilinear)) |
| Anisotropic Filtering Level ([anisoLevel](/apis/core/#Texture-anisoLevel)) | 1 to 16, depending on device support                                                                                                 |

### Loop Mode

The texture sampling range is `[0,1]`, so when the texture UV coordinates exceed this range, we can control how to sample the out-of-range parts by setting the loop mode.

| Sampling Loop Mode | Explanation                        |
| :----------------- | :--------------------------------- |
| Clamp              | Sample edge pixels when out of range |
| Repeat             | Re-sample from [0,1] when out of range |
| Mirror             | Mirror sampling from [1,0] when out of range |

<playground src="wrap-mode.ts"></playground>

### Filter Mode

Generally, pixels and screen pixels do not correspond exactly. We can control the filtering mode for magnification (Mag) and minification (Min) modes by setting the filter mode.

| Sampling Filter Mode | Explanation                        |
| :------------------- | :--------------------------------- |
| Point                | Use the nearest pixel to the sampling point |
| Bilinear             | Use the average value of the nearest 2*2 pixel matrix |
| Trilinear            | In addition to bilinear filtering, also average over mipmap levels |

<playground src="filter-mode.ts"></playground>

### Anisotropic Filtering Level

Anisotropic filtering technology can make textures look clearer at oblique angles. As shown in the figure below, the end of the texture becomes clearer as the anisotropic filtering level increases. However, please use it carefully, as the larger the value, the greater the computational load on the GPU.

<playground src="texture-aniso.ts"></playground>

## General Settings

| Setting           | Value                      |
| :---------------- | :-------------------------  |
| mipmap            | Multi-level texture blending (enabled by default) |
| flipY             | Flip Y-axis (disabled by default) |
| premultiplyAlpha  | Premultiply alpha channel (disabled by default) |
| format            | Texture format (default R8G8B8A8) |

### Mipmap

The engine defaults to enabling [mipmap](/apis/core/#Texture-generateMipmaps) (multi-level texture blending). Mipmap is used to address the accuracy and performance issues when sampling high-resolution textures from low-resolution screens, allowing for the selection of different resolution textures at appropriate distances, as shown below:

![image.png](https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*mTBvTJ7Czt4AAAAAAAAAAAAAARQnAQ)

It is important to note that WebGL 2.0 supports textures of **any resolution**, which will generate mipmaps layer by layer according to the [mipmap algorithm](http://download.nvidia.com/developer/Papers/2005/NP2_Mipmapping/NP2_Mipmap_Creation.pdf). However, if you are in a WebGL 1.0 environment, be sure to upload **textures with power-of-two dimensions**, such as 1024 \* 512, otherwise Galacean will detect that mipmaps cannot be used in the environment and automatically disable the mipmap feature, leading to unexpected visual results.

If you need to change the default behavior of mipmap, you can achieve this through scripting. For detailed parameters, refer to the [API](/apis/core/#Texture2D-constructor):

```typescript
const texture = new Texture2D(
  engine,
  width,
  height,
  TextureFormat.R8G8B8A8,
  false
); // 第 5 个参数
```

For cube texture scripting, refer to the [API](/apis/core/#TextureCube-constructor):

```typescript
const cubeTexture = new TextureCube(
  engine,
  size,
  TextureFormat.R8G8B8A8,
  false
); // 第 4 个参数
```

<playground src="texture-mipmap.ts"></playground>

### flipY

flipY is used to control whether the texture is flipped along the Y-axis, i.e., upside down. The engine and editor default to disabled. If you need to change the default behavior of flipY, you can achieve this through the [setImageSource](/apis/core/#Texture2D-setImageSource) method:

```typescript
const texture = new Texture2D(engine, width, height);
texture.setImageSource(img, 0, true); // 第 3 个参数
```

### premultiplyAlpha

premultiplyAlpha is used to control whether the texture pre-multiplies the alpha (transparency) channel. **The engine and editor have it turned off by default**. If you need to change the default behavior of premultiplyAlpha, you can do so by using the [setImageSource](/apis/core/#Texture2D-setImageSource) method:

```typescript
const texture = new Texture2D(engine, width, height);
texture.setImageSource(img, 0, undefined, true); // 第 4 个参数
```

### format

The engine defaults to using `TextureFormat.R8G8B8A8` as the texture format, which means red, green, blue, and alpha channels each use 1 byte, allowing color values in the range of 0 to 255 for each channel. The engine supports configuring different texture formats, for more details refer to [TextureFormat](/apis/core/#TextureFormat). For example, if we don't need to use the alpha channel, we can use `TextureFormat.R8G8B8`:

```typescript
const texture = new Texture2D(engine, width, height, TextureFormat.R8G8B8);
```

