---
order: 2
title: Emission Module
type: Graphics
group: Particle
label: Graphics/Particle
---

[EmissionModule](/en/apis/core/EmissionModule) is the emission module of `ParticleGeneratorModule`. This module is used to handle the emission behavior of the particle system, including particle emission rate, emission shape, and burst behavior.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*G7_zS5_A3pMAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## Properties

| Property                                                        | Description                                                                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [rateOverTime](/en/apis/core/EmissionModule#rateOverTime)       | This is a [ParticleCompositeCurve](/en/apis/core/ParticleCompositeCurve) object, representing the particle emission rate. The default value is `10`.    |
| [rateOverDistance](/en/apis/core/EmissionModule#rateOverDistance) | This is a [ParticleCompositeCurve](/en/apis/core/ParticleCompositeCurve) object, representing the particle distance emission rate. The default value is `0`. |
| [shape](/en/apis/core/EmissionModule#shape)                     | This is a `BaseShape` object, representing the shape of the emitter.                                             |

## Methods

| Method                                                                             | Description               |
| ---------------------------------------------------------------------------------- | ------------------------- |
| [addBurst(burst: Burst)](/en/apis/core/EmissionModule#addBurst)                    | Add a burst behavior      |
| [removeBurst(burst: Burst)](/en/apis/core/EmissionModule#removeBurst)              | Remove a burst behavior   |
| [removeBurstByIndex(index: number)](/en/apis/core/EmissionModule#removeBurstByIndex) | Remove a burst behavior by index |
| [clearBurst()](/en/apis/core/EmissionModule#clearBurst)                            | Clear all burst behaviors |

## Shapes

Currently, the engine has the following built-in emitter shapes, providing corresponding shape auxiliary displays when the particle component is selected.

| Emitter Shape Type                                              | Description                          |
| --------------------------------------------------------------- | ------------------------------------ |
| [BoxShape](/en/apis/core/EmissionModule#BoxShape)               | `BaseShape` object, emitter shape is a cube |
| [CircleShape](/en/apis/core/EmissionModule#CircleShape)         | `BaseShape` object, emitter shape is a circle |
| [ConeShape](/en/apis/core/EmissionModule#ConeShape)             | `BaseShape` object, emitter shape is a cone |
| [HemisphereShape](/en/apis/core/EmissionModule#HemisphereShape) | `BaseShape` object, emitter shape is a hemisphere |
| [SphereShape](/en/apis/core/EmissionModule#SphereShape)         | `BaseShape` object, emitter shape is a sphere |

It looks like you haven't pasted the Markdown content yet. Please provide the content you want translated, and I'll help you with the translation while adhering to the rules you've specified.
