---
title: Blinn Phong
---

[BlinnPhongMaterial](/en/apis/core/#BlinnPhongMaterial) material is one of the classic materials. Although it is not based on physical rendering, its efficient rendering algorithm and comprehensive optical components make it still applicable to many scenarios today.

<playground src="blinn-phong.ts"></playground>

## Editor Usage

<img src="https://gw.alipayobjects.com/zos/OasisHub/eaa93827-29a4-46ad-b9d3-f179fa200c57/blinn.gif" alt="blinn" style="zoom:100%;" />

## Parameter Introduction

| Parameter | Application |
| :-- | :-- |
| [baseColor](/en/apis/core/#BlinnPhongMaterial-baseColor) | Base color. **Base color \* Base texture = Final base color.** |
| [baseTexture](/en/apis/core/#BlinnPhongMaterial-baseTexture) | Base texture. Used in conjunction with the base color, it is a multiplicative relationship. |
| [specularColor](/en/apis/core/#BlinnPhongMaterial-specularColor) | Specular reflection color. **Specular reflection color \* Specular reflection texture = Final specular reflection color.** |
| [specularTexture](/en/apis/core/#BlinnPhongMaterial-specularTexture) | Specular reflection texture. Used in conjunction with the specular reflection color, it is a multiplicative relationship. |
| [normalTexture](/en/apis/core/#BlinnPhongMaterial-normalTexture) | Normal texture. You can set the normal texture to create a bump effect visually, and control the bump degree through normal intensity. |
| [normalIntensity](/en/apis/core/#BlinnPhongMaterial-normalIntensity) | Normal intensity. Used to control the bump degree. |
| [emissiveColor](/en/apis/core/#BlinnPhongMaterial-emissiveColor) | Emissive color. **Emissive color \* Emissive texture = Final emissive color. Even without lighting, it can render color.** |
| [emissiveTexture](/en/apis/core/#BlinnPhongMaterial-emissiveTexture) | Emissive texture. Used in conjunction with the emissive color, it is a multiplicative relationship. |
| [shininess](/en/apis/core/#BlinnPhongMaterial-shininess) | Specular reflection coefficient. The larger the value, the more concentrated the specular reflection effect. |
| [tilingOffset](/en/apis/core/#BlinnPhongMaterial-tilingOffset) | Scaling and offset of texture coordinates. It is a Vector4 data that controls the scaling and offset of texture coordinates in the uv direction. Refer to [example](/en/embed/tiling-offset) |

If you need to use the material through scripts, please refer to the [Material Usage Tutorial](/en/docs/graphics/material/script).
