---
order: 2
title: Emission Module
type: Graphics
group: Particle
label: Graphics/Particle
---

[EmissionModule](/apis/core/#EmissionModule) is the emission module of `ParticleGeneratorModule`. This module is used to handle the emission behavior of the particle system, including particle emission rate, emission shape, and burst behavior.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*G7_zS5_A3pMAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## Properties

| Property                                                        | Description                                                                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [rateOverTime](/apis/core/#EmissionModule-rateOverTime)          | This is a [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object that represents the emission rate of particles. The default value is `10`.    |
| [rateOverDistance](/apis/core/#EmissionModule-rateOverDistance)  | This is a [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object that represents the distance emission rate of particles. The default value is `0`. |
| [shape](/apis/core/#EmissionModule-shape)                        | This is a `BaseShape` object that represents the shape of the emitter.                                             |

## Methods

| Method                                                               | Description             |
| -------------------------------------------------------------------- | ------------------------ |
| [addBurst(burst: Burst)](/apis/core/#EmissionModule-addBurst)         | Adds a burst behavior    |
| [removeBurst(burst: Burst)](/apis/core/#EmissionModule-removeBurst)   | Removes a burst behavior |
| [removeBurstByIndex(index: number)](/apis/core/#EmissionModule-removeBurstByIndex) | Removes a burst behavior by index |
| [clearBurst()](/apis/core/#EmissionModule-clearBurst)                 | Clears all burst behaviors |

## Shapes

The engine currently has the following built-in emitter shapes, which provide corresponding auxiliary displays when selecting the particle component.

| Emitter Shape Type                                               | Description                           |
| ---------------------------------------------------------------- | -------------------------------------- |
| [BoxShape](/apis/core/#EmissionModule-BoxShape)                   | `BaseShape` object, emitter shape is a cube |
| [CircleShape](/apis/core/#EmissionModule-CircleShape)             | `BaseShape` object, emitter shape is a circle |
| [ConeShape](/apis/core/#EmissionModule-ConeShape)                 | `BaseShape` object, emitter shape is a cone-like |
| [HemisphereShape](/apis/core/#EmissionModule-HemisphereShape)     | `BaseShape` object, emitter shape is a hemisphere |
| [SphereShape](/apis/core/#EmissionModule-SphereShape)             | `BaseShape` object, emitter shape is a sphere |

Please paste the Markdown content you need to be translated.
