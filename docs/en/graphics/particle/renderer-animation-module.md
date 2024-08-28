---
order: 6
title: Texture Sheet Animation Module
type: Graphics
group: Particle
label: Graphics/Particle
---

[`TextureSheetAnimationModule`](/apis/core/TextureSheetAnimationModule) inherits from `ParticleGeneratorModule` and is used to control the texture sheet animation of the particle system.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*XhXmQadW8ToAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## Properties

| Property                                                              | Description                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [startFrame](/apis/core/TextureSheetAnimationModule#startFrame)       | [ParticleCompositeCurve](/apis/core/ParticleCompositeCurve) object, representing the start frame of the texture sheet             |
| [frameOverTime](/apis/core/TextureSheetAnimationModule#frameOverTime) | [ParticleCompositeCurve](/apis/core/ParticleCompositeCurve) object, representing the curve of the texture sheet frame over time |
| [type](/apis/core/TextureSheetAnimationModule#type)                   | `TextureSheetAnimationType` enum, representing the type of texture sheet animation                                           |
| [cycleCount](/apis/core/TextureSheetAnimationModule#cycleCount)       | `number` type, representing the cycle count of the texture sheet animation                                                          |
| [tiling](/apis/core/TextureSheetAnimationModule#tiling)               | `Vector2` object, representing the tiling of the texture sheet. Can be accessed and modified through `get` and `set` methods                         |

