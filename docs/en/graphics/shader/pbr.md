---
order: 1
title: PBR
type: Shader
group: Mesh
label: Graphics/Shader
---

PBR stands for **Physically Based Rendering**, which means **Physically Based Rendering** in Chinese. It was first proposed by Disney in 2012 and later widely used in the gaming industry. Compared to traditional rendering methods like **Blinn-Phong**, PBR follows energy conservation, adheres to physical rules, and allows artists to achieve correct rendering effects even in complex scenes by adjusting a few simple parameters. PBR, based on physical rendering, introduces [IBL](/en/docs/graphics-light-ambient) to simulate global illumination, making it easier to adjust rendering effects through parameters such as metallicness and roughness.

<playground src="pbr-base.ts"></playground>

## Editor Usage

Based on the interaction between light and materials in the real world, insulators (i.e., when metallicness is 0) can still reflect about 4% of pure light, rendering the surrounding environment. In the model below, the metallicness is 0, but you can still vaguely see the reflection of the surrounding environment:

<img src="https://gw.alipayobjects.com/zos/OasisHub/1017d75b-03a3-4c06-8971-524544373429/image-20231007153753006.png" alt="image-20231007153753006" style="zoom:50%;" />

By adjusting the metallicness of the material, you can observe that the higher the metallicness, the clearer the surrounding environment becomes, and it transitions from white pure color to colored. This is because dielectric materials (i.e., when metallicness is 1) reflect all light 100% from the object's surface, resulting in a colored reflection of the surrounding environment:

<img src="https://gw.alipayobjects.com/zos/OasisHub/711f8b97-247c-465e-8cf2-4896b0c78534/metal.gif" alt="metal" style="zoom:100%;" />

In addition, there are many common properties that can be configured, such as anisotropy, roughness, ambient occlusion, emissive light, transparency, and more:

<img src="https://gw.alipayobjects.com/zos/OasisHub/2c8dde75-9557-41db-a1d0-6ca9352530e4/material-anisotropy.gif" alt="material-anisotropy" style="zoom:100%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/4806589e-386f-404a-82e5-d273e98b707d/other.gif" alt="other" style="zoom:100%;" />

## Parameter Introduction

| Parameter | Application |
| :-- | :-- |
| [metallic](/apis/core/#PBRMaterial-metallic) | Metallicness. Simulates the material's degree of metallicity. A higher metallic value results in stronger specular reflection, reflecting more of the surrounding environment. |
| [roughness](/apis/core/#PBRMaterial-roughness) | Roughness. Simulates the material's roughness. A higher roughness value makes the microsurface less smooth, resulting in a blurry specular reflection. |
| [roughnessMetallicTexture](/apis/core/#PBRMaterial-roughnessMetallicTexture) | Metallic roughness texture. Used in conjunction with metallic roughness, it is a multiplication relationship. |
| [baseColor](/apis/core/#PBRBaseMaterial-baseColor) | Base color. **Base color** \* **Base color texture** = **Final base color**. The base color is the object's albedo value, different from traditional diffuse colors, as it contributes to both specular and diffuse colors. We can control the contribution ratio through the aforementioned metallicness and roughness. |
| [emissiveColor](/apis/core/#PBRBaseMaterial-emissiveColor) | Emissive color. Allows rendering of color even without lighting. |
| [baseTexture](/apis/core/#PBRBaseMaterial-baseTexture) | Base color texture. Used in conjunction with the base color, it is a multiplication relationship. |
| [normalTexture](/apis/core/#PBRBaseMaterial-normalTexture) | Normal texture. Can be set to create a visual bump effect and control the bump intensity through the normal strength. |
| [emissiveTexture](/apis/core/#PBRBaseMaterial-emissiveTexture) | Emissive texture. By setting an emissive texture and emissive color ([emissiveFactor](/apis/core/#PBRBaseMaterial-emissiveTexture})), an emissive effect can be achieved, rendering color even without lighting. |
| [occlusionTexture](/apis/core/#PBRBaseMaterial-occlusionTexture) | Occlusion texture. Enhances object shadow details by setting an occlusion texture. |
| [tilingOffset](/apis/core/#PBRBaseMaterial-tilingOffset) | Texture coordinate scaling and offset. A Vector4 data that controls the scaling and offset of texture coordinates in the UV direction, refer to the [example](${examples}tiling-offset). |
| [clearCoat](/apis/core/#PBRBaseMaterial-clearCoat) | Strength of the clear coat, default is 0, which means the clear coat effect is not enabled, refer to the [example](${examples}pbr-clearcoat). |
| [clearCoatTexture](/apis/core/#PBRBaseMaterial-clearCoatTexture) | Clear coat strength texture, multiplied with clear coat. |
| [clearCoatRoughness](/apis/core/#PBRBaseMaterial-clearCoatRoughness) | Roughness of the clear coat. |
| [clearCoatRoughnessTexture](/apis/core/#PBRBaseMaterial-clearCoatRoughnessTexture) | Clear coat roughness texture, multiplied with clear coat roughness. |
| [clearCoatNormalTexture](/apis/core/#PBRBaseMaterial-clearCoatNormalTexture) | Clear coat normal texture. If not set, it will share the original material's normal. |

In addition to the above common parameters, PBR provides two workflows: **Metal-Roughness** and **Specular-Glossiness**, corresponding to [PBRMaterial](/apis/core/#PBRMaterial) and [PBRSpecularMaterial](/apis/core/#PBRSpecularMaterial), respectively.

### PBRMaterial

| Parameter | Description |
| :-- | :-- |
| [metallic](/apis/core/#PBRMaterial-metallic) | Metallic. Simulates the metallicity of the material. The higher the metallic value, the stronger the specular reflection, reflecting more of the surrounding environment. |
| [roughness](/apis/core/#PBRMaterial-roughness) | Roughness. Simulates the roughness of the material. The higher the roughness value, the more uneven the microsurface, resulting in a blurry specular reflection. |
| [roughnessMetallicTexture](/apis/core/#PBRMaterial-roughnessMetallicTexture) | Metallic Roughness Texture. Used in conjunction with metallic roughness, it is a multiplication relationship. |
| [anisotropy](/apis/core/#PBRMaterial-anisotropy) | Anisotropy Strength. Default is 0, disabling anisotropic calculations. Refer to [example](${examples}pbr-anisotropy). |
| [anisotropyRotation](/apis/core/#PBRMaterial-anisotropyRotation) | Anisotropy Rotation Angle. Rotate along the tangent and bitangent space by the corresponding angle. |
| [anisotropyTexture](/apis/core/#PBRMaterial-anisotropyTexture) | Anisotropy Texture. The RG channels store the anisotropic direction, which will be multiplied by the result of anisotropyRotation; the B channel stores the anisotropic strength, which will be multiplied by anisotropy. |

### PBRSpecularMaterial

| Parameter | Description |
| :-- | :-- |
| [specularColor](/apis/core/#PBRMaterial-specularColor) | Specular Color. Unlike the metal roughness workflow, which calculates specular reflection based on metallicity and base color, this directly uses specular color to represent the specular reflection color. (Note: Only effective when the metal roughness workflow is disabled). |
| [glossiness](/apis/core/#PBRMaterial-glossiness) | Glossiness. Simulates the smoothness, opposite to roughness. (Note: Only effective when the metal roughness workflow is disabled). |
| [specularGlossinessTexture](/apis/core/#PBRMaterial-specularGlossinessTexture) | Specular Glossiness Texture. Used in conjunction with specular glossiness, it is a multiplication relationship. |

> **Note**: PBR must enable [ambient light](/en/docs/graphics-light-ambient).

If you need to use materials through scripts, you can refer to the [material usage tutorial](/en/docs/graphics-material-script).
