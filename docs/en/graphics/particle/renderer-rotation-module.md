---
order: 4
title: Lifecycle Rotation Module
type: Graphics
group: Particle
label: Graphics/Particle
---

[`RotationOverLifetimeModule`](/apis/core/#RotationOverLifetimeModule) inherits from `ParticleGeneratorModule` and is used to control the rotation changes of particles within the lifecycle of a particle system.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*mEUfRa3o7V8AAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## Properties

| Property                                                           | Description                                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [separateAxes](/apis/core/#RotationOverLifetimeModule-separateAxes) | A `boolean` indicating whether rotation is done separately on each axis. If disabled, only the z-axis will be used |
| [rotationX](/apis/core/#RotationOverLifetimeModule-rotationX)       | A [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object representing the x-axis rotation of particles within their lifetime |
| [rotationY](/apis/core/#RotationOverLifetimeModule-rotationY)       | A [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object representing the y-axis rotation of particles within their lifetime |
| [rotationZ](/apis/core/#RotationOverLifetimeModule-rotationZ)       | A [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object representing the z-axis rotation of particles within their lifetime |

