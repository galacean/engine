---
order: 6
title: Texture Sheet Animation Module
type: Graphics
group: Particle
label: Graphics/Particle
---

[`TextureSheetAnimationModule`](/apis/core/#TextureSheetAnimationModule) inherits from `ParticleGeneratorModule` and is used to control the texture sheet animation of a particle system.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*XhXmQadW8ToAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## Properties

| Property                                                              | Description                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [startFrame](/apis/core/#TextureSheetAnimationModule-startFrame)       | [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object representing the starting frame of the texture sheet |
| [frameOverTime](/apis/core/#TextureSheetAnimationModule-frameOverTime) | [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object representing the curve of how the frames change over time in the texture sheet |
| [type](/apis/core/#TextureSheetAnimationModule-type)                   | Enum `TextureSheetAnimationType` representing the type of texture sheet animation                |
| [cycleCount](/apis/core/#TextureSheetAnimationModule-cycleCount)       | Type `number` representing the cycle count of the texture sheet animation                        |
| [tiling](/apis/core/#TextureSheetAnimationModule-tiling)               | Object `Vector2` representing the tiling of the texture sheet. Can be accessed and modified using `get` and `set` methods |

