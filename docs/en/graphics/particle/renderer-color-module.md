---
order: 7
title: Color Module
type: Graphics
group: Particle
label: Graphics/Particle
---

[`ColorOverLifetimeModule`](/apis/core/#ColorOverLifetimeModule) inherits from `ParticleGeneratorModule` and is used to handle color changes during the lifetime of a particle system.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*8jjgTK0-EWMAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

## Properties

| Property                                              | Description                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [color](/apis/core/#ColorOverLifetimeModule-color)     | An [ParticleCompositeGradient](/apis/core/#ParticleCompositeGradient) object representing the color gradient over the particle's lifetime |

## Gradient Editing

For the [ParticleCompositeGradient](/apis/core/#ParticleCompositeGradient) object, there is a built-in gradient editor in the editor. The top of the gradient bar represents the color key, and the bottom represents the alpha value key. Each key's position on the gradient bar represents its time. Double-clicking on an existing key creates a new key, and long-pressing a key and dragging downwards deletes the key.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*BW3dQb--WXAAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" /> <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*NHL9RKwOFTIAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />
