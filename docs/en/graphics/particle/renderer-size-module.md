---
order: 3
title: Size Over Lifetime Module
type: Graphics
group: Particle
label: Graphics/Particle
---

[`SizeOverLifetimeModule`](/apis/core/#SizeOverLifetimeModule) is a subclass of `ParticleGeneratorModule` used to handle size changes over the lifetime of a particle system.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*e0FeQqj-HvAAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## Properties

| Property                                                      | Description                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [separateAxes](/apis/core/#SizeOverLifetimeModule-separateAxes) | Boolean value specifying whether the size changes independently for each axis                       |
| [sizeX](/apis/core/#SizeOverLifetimeModule-sizeX)               | [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object representing the size change curve along the x-axis |
| [sizeY](/apis/core/#SizeOverLifetimeModule-sizeY)               | [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object representing the size change curve along the y-axis |
| [sizeZ](/apis/core/#SizeOverLifetimeModule-sizeZ)               | [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object representing the size change curve along the z-axis |
| [size](/apis/core/#SizeOverLifetimeModule-size)                 | [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object to get or set the size change curve of particles      |

## Polyline Editing

For the [ParticleCompositeCurve](/apis/core/#ParticleCompositeCurve) object, a polyline editor is built into the editor for visual curve adjustments.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*70KGQpOg85oAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

Or in code:

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
