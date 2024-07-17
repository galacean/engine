---
order: 1
title: Main Module
type: Graphics
group: Particle
label: Graphics/Particle
---

[MainModule](/apis/core/#MainModule) is the main module of `ParticleGeneratorModule`, containing the most basic particle generation parameters. These properties are mostly used to control the initial state of newly created particles.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*JUjgTLfiz7kAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## Properties

| Property                                                  | Description                                             |
| --------------------------------------------------------- | ------------------------------------------------------- |
| [duration](/apis/core/#MainModule-duration)                | Duration of the particle generator (in seconds)         |
| [isLoop](/apis/core/#MainModule-isLoop)                    | Specifies if the particle generator loops                |
| [startDelay](/apis/core/#MainModule-startDelay)            | Delay at the start of particle emission (in seconds)     |
| [startLifetime](/apis/core/#MainModule-startLifetime)      | Initial lifetime of particles upon emission              |
| [startSpeed](/apis/core/#MainModule-startSpeed)            | Initial speed of particles when first generated          |
| [startSize3D](/apis/core/#MainModule-startSize3D)          | Whether to specify particle size along each axis         |
| [startSize](/apis/core/#MainModule-startSize)              | Initial size of particles when first generated           |
| [startSizeX](/apis/core/#MainModule-startSizeX)            | Initial size along the x-axis when particles are emitted |
| [startSizeY](/apis/core/#MainModule-startSizeY)            | Initial size along the y-axis when particles are emitted |
| [startSizeZ](/apis/core/#MainModule-startSizeZ)            | Initial size along the z-axis when particles are emitted |
| [startRotation3D](/apis/core/#MainModule-startRotation3D)  | Whether to enable 3D particle rotation                   |
| [startRotation](/apis/core/#MainModule-startRotation)      | Initial rotation of particles when first generated       |
| [startRotationX](/apis/core/#MainModule-startRotationX)    | Initial rotation along the x-axis when particles are emitted |
| [startRotationY](/apis/core/#MainModule-startRotationY)    | Initial rotation along the y-axis when particles are emitted |
| [startRotationZ](/apis/core/#MainModule-startRotationZ)    | Initial rotation along the z-axis when particles are emitted |
| [flipRotation](/apis/core/#MainModule-flipRotation)        | Rotates some particles in the opposite direction         |
| [startColor](/apis/core/#MainModule-startColor)            | Initial color mode of particles                          |
| [gravityModifier](/apis/core/#MainModule-gravityModifier)  | Proportion of gravity defined by Physics.gravity applied to this particle generator |
| [simulationSpace](/apis/core/#MainModule-simulationSpace)  | Selects the space in which particles are simulated, either world space or local space |
| [simulationSpeed](/apis/core/#MainModule-simulationSpeed)  | Overrides the default playback speed of the particle generator |
| [scalingMode](/apis/core/#MainModule-scalingMode)          | Controls how the particle generator applies its Transform component to the particles it emits |
| [playOnEnabled](/apis/core/#MainModule-playOnEnabled)      | If set to true, the particle generator will automatically start playing when enabled |
| [maxParticles](/apis/core/#MainModule-maxParticles)        | Maximum number of particles                              |

Please paste the Markdown content you need to be translated.
