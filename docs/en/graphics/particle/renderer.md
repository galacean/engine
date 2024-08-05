---
order: 0
title: Particle Renderer
type: Graphics
group: Particle
label: Graphics/Particle
---

The Particle Renderer [ParticleRenderer](/apis/core/#ParticleRenderer) of Galacean Engine is a commonly used rendering component with rich properties, allowing for vibrant particle effects by adjusting various property values.

![avatar](https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*CObVSaCKF_4AAAAAAAAAAAAADtKFAQ/original)

## Particle Component

The particle component can be added to an already activated Entity in the scene through a shortcut on the hierarchy tree panel or the inspector panel.

![avatar](https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*fD8iTZUbiI4AAAAAAAAAAAAADtKFAQ/original)

Once added, you can view the particle properties in the inspector panel. The particle panel at the bottom left of the view window can control the playback of particle effects in the view window.

![avatar](https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*rwF_RLlHNt0AAAAAAAAAAAAADtKFAQ/original)

You can also attach the particle component in scripts.

```ts
// 创建实体
const entity = root.createChild("particleEntity");
// 创建粒子组件
let particleRenderer = particleEntity.addComponent(ParticleRenderer);
```

## Rendering Material

[ParticleMaterial](/apis/core/#ParticleMaterial) is the default material for particles.

In the editor, create a particle material by adding a material and selecting the particle material. After editing, go back to the particle observer panel to select and use the material.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*l8WoQbbd6lMAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

Or in scripts:

```ts
// Add particle material
const material = new ParticleMaterial(engine);
particleRenderer.setMaterial(material);
```

| Property                                              | Description |
| ----------------------------------------------------- | ----------- |
| [baseColor](/apis/core/#ParticleMaterial-baseColor)    | Base color  |
| [baseTexture](/apis/core/#ParticleMaterial-baseColor)  | Base texture |

## Playback Control

The particle panel that appears when selecting an entity with a particle component allows you to control the playback of particle effects in the view window.

It is important to note that adjustments made to particle playback on this panel are only for preview purposes in the view window and do not change the properties of the particle component. If you need to change the playback-related properties of the particle, adjustments need to be made in the observer panel.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*2ZnqSqCymCUAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

| Preview Options | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| Restart         | Stop the current particle effect playback and immediately restart |
| Stop            | Stop the playback of the particle effect and reset to the initial state |
| Pause           | Pause the particle effect on the selected entity and its child nodes |
| Play            | Start playing the particle effect on the selected entity and its child nodes |
| Speed           | Adjust the current playback speed                                   |
| Preview         | Choose to play the particle effect on the selected entity and its child nodes, or play all particle effects in the scene |

## Particle Generator

The `ParticleRenderer`'s [generator](/apis/core/#ParticleGenerator) property is mainly responsible for particle generation and playback functions. The functions related to particle generation consist of multiple modules, including the main module, emitter module, life size module, life color module, life speed module, life rotation module, and texture table animation module. In the editor's particle observer panel, you can visually see each module and its sub-options.

## Other Parameters

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*MiCESpgK-LwAAAAAAAAAAAAADtKFAQ/original" alt="avatar" style="zoom:50%;" />

| Property                                                      | Description                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| [velocityScale](/apis/core/#ParticleRenderer-velocityScale)    | Specifies the extent to which particles stretch based on their velocity |
| [lengthScale](/apis/core/#ParticleRenderer-lengthScale)        | Defines the extent to which particles stretch in their direction of motion, defined as the ratio of the particle's length to its width |
| [pivot](/apis/core/#ParticleRenderer-pivot)                    | The pivot of the particle                                        |
| [renderMode](/apis/core/#ParticleRenderer-renderMode)          | The rendering mode of the particle                               |
| [mesh](/apis/core/#ParticleRenderer-mesh)                      | The mesh of the particle, valid when `renderMode` is `Mesh`      |

{ /*examples*/ }
