---
order: 3
title: Blinn Phong
type: Shader
group: Mesh
label: Graphics/Shader
---

[BlinnPhongMaterial](/apis/core/#BlinnPhongMaterial) is not based on physical rendering, but its efficient rendering algorithm and comprehensive optical components can still be applied to many scenarios.

<playground src="blinn-phong.ts"></playground>

## Editor Usage

<img src="https://gw.alipayobjects.com/zos/OasisHub/eaa93827-29a4-46ad-b9d3-f179fa200c57/blinn.gif" alt="blinn" style="zoom:100%;" />

## Parameter Introduction

| Parameter                                                         | Application                                                                                                               |
| :---------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| [baseColor](/apis/core/#BlinnPhongMaterial-baseColor)              | Base color. **Base color \* Base texture = Final base color.**                                                             |
| [baseTexture](/apis/core/#BlinnPhongMaterial-baseTexture)          | Base texture. Used in conjunction with base color, it is a multiplication relationship.                                     |
| [specularColor](/apis/core/#BlinnPhongMaterial-specularColor)      | Specular reflection color. **Specular reflection color \* Specular reflection texture = Final specular reflection color.** |
| [specularTexture](/apis/core/#BlinnPhongMaterial-specularTexture)  | Specular reflection texture. Used in conjunction with specular reflection color, it is a multiplication relationship.       |
| [normalTexture](/apis/core/#BlinnPhongMaterial-normalTexture)      | Normal texture. Can set a normal texture to create a visual sense of concavity and convexity, and can also control the degree of concavity and convexity through normal intensity. |
| [normalIntensity ](/apis/core/#BlinnPhongMaterial-normalIntensity) | Normal intensity. Used to control the degree of concavity and convexity.                                                   |
| [emissiveColor](/apis/core/#BlinnPhongMaterial-emissiveColor)      | Emissive color. **Emissive color \* Emissive texture = Final emissive color. Can render color even without lighting.**      |
| [emissiveTexture](/apis/core/#BlinnPhongMaterial-emissiveTexture)  | Emissive texture. Used in conjunction with emissive color, it is a multiplication relationship.                               |
| [shininess](/apis/core/#BlinnPhongMaterial-shininess)              | Specular reflection coefficient. The larger the value, the more concentrated the specular reflection effect.                |
| [tilingOffset](/apis/core/#BlinnPhongMaterial-tilingOffset)        | Scaling and offset of texture coordinates. It is a Vector4 data, which controls the scaling and offset of texture coordinates in the uv direction, refer to [example](/embed/tiling-offset) |

如果需要通过脚本使用材质，可以前往[材质的使用教程](/en/docs/graphics-material-script)。
