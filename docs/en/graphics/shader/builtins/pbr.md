---
title: PBR
---

PBR stands for **Physically Based Rendering**, which means **physically based rendering** in Chinese. It was first proposed by Disney in 2012 and later widely used in the gaming industry. Compared to traditional rendering methods like **Blinn-Phong**, PBR follows the principle of energy conservation, conforms to physical rules, and allows artists to achieve correct rendering effects in complex scenes by adjusting a few simple parameters. PBR follows energy conservation, is physically based, and introduces [IBL](/en/docs/graphics/light/ambient) to simulate global illumination. By adjusting parameters such as metallic and roughness, it is more convenient to tweak the rendering effects.

<playground src="pbr-base.ts"></playground>

## Editor Usage

Based on the interaction of light and materials in the real world, insulators (i.e., when the metallic value is 0) can reflect about 4% of pure color light, rendering the surrounding environment. As shown in the model below, the metallic value is 0, but the surrounding environment can still be faintly seen in the reflection:

<img src="https://gw.alipayobjects.com/zos/OasisHub/1017d75b-03a3-4c06-8971-524544373429/image-20231007153753006.png" alt="image-20231007153753006" style="zoom:50%;" />

By adjusting the metallic value of the material, we can observe that the higher the metallic value, the clearer the surrounding environment becomes, and it starts to change from white to colorful. This is because dielectric materials (i.e., when the metallic value is 1) will reflect 100% of the light off the surface of the object, reflecting the colorful surrounding environment:

<img src="https://gw.alipayobjects.com/zos/OasisHub/711f8b97-247c-465e-8cf2-4896b0c78534/metal.gif" alt="metal" style="zoom:100%;" />

In addition, there are many common properties that can be configured, such as anisotropy, roughness, ambient occlusion, emissive light, transparency, etc.:

<img src="https://gw.alipayobjects.com/zos/OasisHub/2c8dde75-9557-41db-a1d0-6ca9352530e4/material-anisotropy.gif" alt="material-anisotropy" style="zoom:100%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/4806589e-386f-404a-82e5-d273e98b707d/other.gif" alt="other" style="zoom:100%;" />

## Parameter Introduction

| Parameter | Application |
| :-- | :-- |
| [metallic](/en/apis/core/#PBRMaterial-metallic) | Metallic. Simulates the metallic degree of the material. The higher the metallic value, the stronger the specular reflection, which can reflect more of the surrounding environment. |
| [roughness](/en/apis/core/#PBRMaterial-roughness) | Roughness. Simulates the roughness of the material. The higher the roughness, the less smooth the micro-surface, and the more blurred the specular reflection. |
| [roughnessMetallicTexture](/en/apis/core/#PBRMaterial-roughnessMetallicTexture) | Metallic roughness texture. Used in conjunction with metallic roughness, it is a multiplicative relationship. |
| [baseColor](/en/apis/core/#PBRBaseMaterial-baseColor) | Base color. **Base color** \* **Base color texture** = **Final base color**. The base color is the reflectance value of the object. Unlike traditional diffuse color, it contributes to both specular and diffuse colors. We can control the contribution ratio through the metallic and roughness mentioned above. |
| [emissiveColor](/en/apis/core/#PBRBaseMaterial-emissiveColor) | Emissive color. Allows rendering of color even without lighting. |
| [baseTexture](/en/apis/core/#PBRBaseMaterial-baseTexture) | Base color texture. Used in conjunction with the base color, it is a multiplicative relationship. |
| [normalTexture](/en/apis/core/#PBRBaseMaterial-normalTexture) | Normal texture. Can set the normal texture to create a bump effect visually, and the bump degree can be controlled by the normal strength. |
| [emissiveTexture](/en/apis/core/#PBRBaseMaterial-emissiveTexture) | Emissive texture. We can set the emissive texture and emissive color ([emissiveFactor](/en/apis/core/#PBRBaseMaterial-emissiveTexture)) to achieve the emissive effect, rendering color even without lighting. |
| [occlusionTexture](/en/apis/core/#PBRBaseMaterial-occlusionTexture) | Ambient occlusion texture. We can set the ambient occlusion texture to enhance the shadow details of the object. |
| [tilingOffset](/en/apis/core/#PBRBaseMaterial-tilingOffset) | Scaling and offset of texture coordinates. It is a Vector4 data that controls the scaling and offset of texture coordinates in the uv direction. Refer to [example](/en/embed/tiling-offset). |
| [clearCoat](/en/apis/core/#PBRBaseMaterial-clearCoat) | Clear coat strength, default is 0, which means the clear coat effect is not enabled. Refer to [example](/en/embed/pbr-clearcoat). |
| [clearCoatTexture](/en/apis/core/#PBRBaseMaterial-clearCoatTexture) | Clear coat strength texture, which is a multiplicative relationship with clearCoat. |
| [clearCoatRoughness](/en/apis/core/#PBRBaseMaterial-clearCoatRoughness) | Clear coat roughness. |
| [clearCoatRoughnessTexture](/en/apis/core/#PBRBaseMaterial-clearCoatRoughnessTexture) | Clear coat roughness texture, which is a multiplicative relationship with clearCoatRoughness. |
| [clearCoatNormalTexture](/en/apis/core/#PBRBaseMaterial-clearCoatNormalTexture) | Clear coat normal texture. If not set, it will share the normal of the original material. |

除了以上通用参数，PBR 提供了 **金属-粗糙度** 和 **高光-光泽度** 两种工作流，分别对应 [PBRMaterial](/en/apis/core/#PBRMaterial) 和 [PBRSpecularMaterial](/en/apis/core/#PBRSpecularMaterial)。

### PBRMaterial

| 参数 | 应用 |
| :-- | :-- |
| [metallic](/en/apis/core/#PBRMaterial-metallic) | 金属度。模拟材质的金属程度，金属值越大，镜面反射越强，即能反射更多周边环境。 |
| [roughness](/en/apis/core/#PBRMaterial-roughness) | 粗糙度。模拟材质的粗糙程度，粗糙度越大，微表面越不平坦，镜面反射越模糊。 |
| [roughnessMetallicTexture](/en/apis/core/#PBRMaterial-roughnessMetallicTexture) | 金属粗糙度纹理。搭配金属粗糙度使用，是相乘的关系。 |
| [anisotropy](/en/apis/core/#PBRMaterial-anisotropy) | 各向异性强度。默认为 0，关闭各项异性计算。参考 [案例](/en/embed/pbr-anisotropy) 。 |
| [anisotropyRotation](/en/apis/core/#PBRMaterial-anisotropyRotation) | 各向异性旋转角度。沿切线、副切线空间旋转相应角度。 |
| [anisotropyTexture](/en/apis/core/#PBRMaterial-anisotropyTexture) | 各向异性纹理。RG 通道保存着各向异性方向，会和 anisotropyRotation 计算结果相乘；B 通道保存着各向异性强度，会和 anisotropy 相乘。 |

### PBRSpecularMaterial

| 参数 | 应用 |
| :-- | :-- |
| [specularColor](/en/apis/core/#PBRMaterial-specularColor) | 高光度。不同于金属粗糙度工作流的根据金属度和基础颜色计算镜面反射，而是直接使用高光度来表示镜面反射颜色。(注，只有关闭金属粗糙工作流才生效) 。 |
| [glossiness](/en/apis/core/#PBRMaterial-glossiness) | 光泽度。模拟光滑程度，与粗糙度相反。(注，只有关闭金属粗糙工作流才生效)。 |
| [specularGlossinessTexture](/en/apis/core/#PBRMaterial-specularGlossinessTexture) | 高光光泽度纹理。搭配高光光泽度使用，是相乘的关系。 |

> **注**：PBR 必须开启[环境光](/en/docs/graphics/light/ambient)

如果需要通过脚本使用材质，可以前往[材质的使用教程](/en/docs/graphics/material/script)。
