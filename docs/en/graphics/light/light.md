---
order: 0
title: Overview of Lighting
type: Graphics
group: Lighting
label: Graphics/Light
---

Proper use of lighting can provide realistic rendering effects. This section contains the following relevant information:

- Types of Light Sources
  - [Directional Light](/en/docs/graphics-light-directional)
  - [Point Light](/en/docs/graphics-light-point)
  - [Spotlight](/en/docs/graphics-light-spot)
  - [Ambient Light](/en/docs/graphics-light-ambient)
- [Baking](/en/docs/graphics-light-bake)
- [Shadows](/en/docs/graphics-light-shadow})

## Direct Light

Direct light generally shines from a specific area or direction, reflects once, and enters the eye (camera) directly, as shown in the example below:

<playground src="light-type.ts"></playground>

## Ambient Light

Ambient light emits from all directions and enters the eye, as shown in the example below:

<playground src="ambient-light.ts"></playground>

## Real-time Lighting and Baked Lighting

Real-time lighting refers to Galacean calculating lighting in real-time during runtime. Baked lighting refers to Galacean precomputing lighting and [baking](/en/docs/graphics-light-bake) the results into a binary file (including [diffuse irradiance coefficients](https://en.wikipedia.org/wiki/Spherical_harmonics) and [pre-filtered environment maps](https://learnopengl.com/PBR/IBL/Specular-IBL/)), then sampling it in real-time during runtime.
