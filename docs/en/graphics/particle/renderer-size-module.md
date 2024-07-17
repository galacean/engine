---
order: 3
title: Lifecycle Size Module
type: Graphics
group: Particle
label: Graphics/Particle
---

[`SizeOverLifetimeModule`](/apis/core/#SizeOverLifetimeModule) is a subclass of `ParticleGeneratorModule` used to handle size changes of particles during their lifecycle.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*e0FeQqj-HvAAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## Properties

| Property                                                         | Description                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [separateAxes](/apis/core/#SizeOverLifetimeModule-separateAxes)   | A boolean value that specifies whether the size changes independently on each axis               |
| [sizeX](/apis/core/#SizeOverLifetimeModule-sizeX)                 | A [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object representing the size change curve on the x-axis |
| [sizeY](/apis/core/#SizeOverLifetimeModule-sizeY)                 | A [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object representing the size change curve on the y-axis |
| [sizeZ](/apis/core/#SizeOverLifetimeModule-sizeZ)                 | A [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object representing the size change curve on the z-axis |
| [size](/apis/core/#SizeOverLifetimeModule-size)                   | A [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object to get or set the size change curve of particles |

## Curve Editor

For the [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object, a curve editor is built into the editor for visual adjustment of the curve.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*70KGQpOg85oAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

Alternatively, in code:

```ts
sizeOverLifetime.enabled = true;
sizeOverLifetime.size.mode = ParticleCurveMode.Curve;

const curve = sizeOverLifetime.size.curve;
const keys = curve.keys;
keys[0].value = 0.153;
keys[1].value = 1.0;
curve.addKey(0.057, 0.37);
curve.addKey(0.728, 0.958);
```
