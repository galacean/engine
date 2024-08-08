---
title: PBR
---

PBR 全称是 **Physically Based Rendering**，中文意思是**基于物理的渲染**，最早由迪士尼在 2012 年提出，后来被游戏界广泛使用。跟传统的 **Blinn-Phong** 等渲染方法相比，PBR 遵循能量守恒，符合物理规则，美术们只需要调整几个简单的参数，即使在复杂的场景中也能保证正确的渲染效果。PBR 遵循能量守恒，是基于物理的渲染，并且引入了 [IBL](/docs/graphics/light/ambient) 模拟全局光照，通过金属度、粗糙度等参数，更加方便地调节渲染效果。

<playground src="pbr-base.ts"></playground>

## 编辑器使用

根据真实世界中光线与材质的交互，绝缘体（即当金属度为 0 时）材质也能反射大约 4% 纯色光线，从而渲染出周边环境，如下模型金属度为 0 但是还能隐约看到反射的周边环境：

<img src="https://gw.alipayobjects.com/zos/OasisHub/1017d75b-03a3-4c06-8971-524544373429/image-20231007153753006.png" alt="image-20231007153753006" style="zoom:50%;" />

我们调节材质的金属度，可以发现，金属度越大，周围的环境越清晰，并且开始从白色纯色变成彩色。这是因为电介质（即金属度为 1 时）材质会将光线 100% 全部反射出物体表面，即反射出彩色的周边环境：

<img src="https://gw.alipayobjects.com/zos/OasisHub/711f8b97-247c-465e-8cf2-4896b0c78534/metal.gif" alt="metal" style="zoom:100%;" />

除此之外，还有很多通用属性可以配置，比如各向异性，粗糙度、环境遮蔽、自发射光、透明度等等：

<img src="https://gw.alipayobjects.com/zos/OasisHub/2c8dde75-9557-41db-a1d0-6ca9352530e4/material-anisotropy.gif" alt="material-anisotropy" style="zoom:100%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/4806589e-386f-404a-82e5-d273e98b707d/other.gif" alt="other" style="zoom:100%;" />

## 参数介绍

| 参数 | 应用 |
| :-- | :-- |
| [metallic](/apis/core/#PBRMaterial-metallic) | 金属度。模拟材质的金属程度，金属值越大，镜面反射越强，即能反射更多周边环境。 |
| [roughness](/apis/core/#PBRMaterial-roughness) | 粗糙度。模拟材质的粗糙程度，粗糙度越大，微表面越不平坦，镜面反射越模糊。 |
| [roughnessMetallicTexture](/apis/core/#PBRMaterial-roughnessMetallicTexture) | 金属粗糙度纹理。搭配金属粗糙度使用，是相乘的关系。 |
| [baseColor](/apis/core/#PBRBaseMaterial-baseColor) | 基础颜色。**基础颜色** \* **基础颜色纹理** = **最后的基础颜色**。基础颜色是物体的反照率值,与传统的漫反射颜色不同，它会同时贡献镜面反射和漫反射的颜色，我们可以通过上面提到过的金属度、粗糙度，来控制贡献比。 |
| [emissiveColor](/apis/core/#PBRBaseMaterial-emissiveColor) | 自发光颜色。使得即使没有光照也能渲染出颜色。 |
| [baseTexture](/apis/core/#PBRBaseMaterial-baseTexture) | 基础颜色纹理。搭配基础颜色使用，是个相乘的关系。 |
| [normalTexture](/apis/core/#PBRBaseMaterial-normalTexture) | 法线纹理。可以设置法线纹理 ，在视觉上造成一种凹凸感，还可以通过法线强度来控制凹凸程度。 |
| [emissiveTexture](/apis/core/#PBRBaseMaterial-emissiveTexture) | 自发射光纹理。我们可以设置自发光纹理和自发光颜色（[emissiveFactor](/apis/core/#PBRBaseMaterial-emissiveTexture)）达到自发光的效果，即使没有光照也能渲染出颜色。 |
| [occlusionTexture](/apis/core/#PBRBaseMaterial-occlusionTexture) | 阴影遮蔽纹理。我们可以设置阴影遮蔽纹理来提升物体的阴影细节。 |
| [tilingOffset](/apis/core/#PBRBaseMaterial-tilingOffset) | 纹理坐标的缩放与偏移。是一个 Vector4 数据，分别控制纹理坐标在 uv 方向上的缩放和偏移，参考 [案例](/embed/tiling-offset) |
| [clearCoat](/apis/core/#PBRBaseMaterial-clearCoat) | 透明涂层的强度，默认为 0，既不开启透明涂层效果，参考 [案例](/embed/pbr-clearcoat) 。 |
| [clearCoatTexture](/apis/core/#PBRBaseMaterial-clearCoatTexture) | 透明涂层强度纹理，和 clearCoat 是相乘的关系。 |
| [clearCoatRoughness](/apis/core/#PBRBaseMaterial-clearCoatRoughness) | 透明涂层的粗糙度。 |
| [clearCoatRoughnessTexture](/apis/core/#PBRBaseMaterial-clearCoatRoughnessTexture) | 透明涂层粗糙度纹理，和 clearCoatRoughness 是相乘的关系。 |
| [clearCoatNormalTexture](/apis/core/#PBRBaseMaterial-clearCoatNormalTexture) | 透明涂层法线纹理，如果没有设置则会共用原材质的法线。 |

除了以上通用参数，PBR 提供了 **金属-粗糙度** 和 **高光-光泽度** 两种工作流，分别对应 [PBRMaterial](/apis/core/#PBRMaterial) 和 [PBRSpecularMaterial](/apis/core/#PBRSpecularMaterial)。

### PBRMaterial

| 参数 | 应用 |
| :-- | :-- |
| [metallic](/apis/core/#PBRMaterial-metallic) | 金属度。模拟材质的金属程度，金属值越大，镜面反射越强，即能反射更多周边环境。 |
| [roughness](/apis/core/#PBRMaterial-roughness) | 粗糙度。模拟材质的粗糙程度，粗糙度越大，微表面越不平坦，镜面反射越模糊。 |
| [roughnessMetallicTexture](/apis/core/#PBRMaterial-roughnessMetallicTexture) | 金属粗糙度纹理。搭配金属粗糙度使用，是相乘的关系。 |
| [anisotropy](/apis/core/#PBRMaterial-anisotropy) | 各向异性强度。默认为 0，关闭各项异性计算。参考 [案例](/embed/pbr-anisotropy) 。 |
| [anisotropyRotation](/apis/core/#PBRMaterial-anisotropyRotation) | 各向异性旋转角度。沿切线、副切线空间旋转相应角度。 |
| [anisotropyTexture](/apis/core/#PBRMaterial-anisotropyTexture) | 各向异性纹理。RG 通道保存着各向异性方向，会和 anisotropyRotation 计算结果相乘；B 通道保存着各向异性强度，会和 anisotropy 相乘。 |

### PBRSpecularMaterial

| 参数 | 应用 |
| :-- | :-- |
| [specularColor](/apis/core/#PBRMaterial-specularColor) | 高光度。不同于金属粗糙度工作流的根据金属度和基础颜色计算镜面反射，而是直接使用高光度来表示镜面反射颜色。(注，只有关闭金属粗糙工作流才生效) 。 |
| [glossiness](/apis/core/#PBRMaterial-glossiness) | 光泽度。模拟光滑程度，与粗糙度相反。(注，只有关闭金属粗糙工作流才生效)。 |
| [specularGlossinessTexture](/apis/core/#PBRMaterial-specularGlossinessTexture) | 高光光泽度纹理。搭配高光光泽度使用，是相乘的关系。 |

> **注**：PBR 必须开启[环境光](/docs/graphics/light/ambient)

如果需要通过脚本使用材质，可以前往[材质的使用教程](/docs/graphics/material/script)。
