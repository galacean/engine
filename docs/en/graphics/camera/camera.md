---
order: 0
title: Camera Overview
type: Graphics
group: Camera
label: Graphics/Camera
---

A camera is an abstract concept in a graphics engine for [3D projection](https://en.wikipedia.org/wiki/3D_projection), similar to a camera or eyes in the real world. Without a camera, the canvas will render nothing. Galacean's camera implements automatic frustum culling, rendering only objects within the frustum.

## Types of Cameras

### Perspective Projection

Perspective projection conforms to our model of objects appearing larger when closer and smaller when farther away. Here is a diagram of the perspective model:

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*isMHSpe21ZMAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:50%;" />

As shown in the diagram above, the near clipping plane ([nearClipPlane](/apis/core/#Camera-nearClipPlane)), far clipping plane ([farClipPlane](/apis/core/#Camera-farClipPlane)), and field of view ([fieldOfView](/apis/core/#Camera-fieldOfView)) form a view frustum ([_View Frustum_](https://en.wikipedia.org/wiki/Viewing_frustum)). Objects within the frustum are projected into the camera and rendered on the canvas, while objects outside the frustum are clipped.

### Orthographic Projection

In orthographic projection, objects appear the same size regardless of their distance from the camera. The visible area created by orthographic projection is called a box-shaped view volume, as shown below:

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*KEuGSqX-vXsAAAAAAAAAAAAAARQnAQ" alt="image.png" style="zoom:50%;" />

As shown in the diagram above, there are top, bottom, left, and right boundaries. Galacean simplifies orthographic properties to better suit developers' habits, using only [orthographicSize](/apis/core/#Camera-orthographicSize). The relationships between the various properties and [orthographicSize](/apis/core/#Camera-orthographicSize) are as follows:

- `top = orthographicSize`
- `bottom = -orthographicSize`
- `right = orthographicSize * aspectRatio`
- `left = -orthographicSize * aspectRatio`

### How to Choose

Comparing perspective projection and orthographic projection reveals their differences:

- View volume model
- Whether objects appear larger when closer and smaller when farther away

The following example visually demonstrates the difference between rendering with an orthographic camera and a perspective camera. In short, choose an orthographic camera for 2D effects and a perspective camera for 3D effects.

<playground src="ortho-switch.ts"></playground>

## Camera Orientation

In Galacean, both local and world coordinates follow the `right-hand coordinate system`, so the camera's `forward` direction is the `-Z` axis, and the camera's viewing direction is also the `-Z` direction.

## Getting Started

Having introduced the basic concepts of the camera, let's get started:

- Add a [camera component](/en/docs/graphics/camera/component/) to the scene
- Use [camera controls](/en/docs/graphics/camera/control/) to more conveniently manipulate the [camera component](/en/docs/graphics/camera/component/)
- Use [multiple cameras](/en/docs/graphics/camera/multiCamera/) in the scene
- Obtain [camera textures](/en/docs/graphics/camera/texture/)

