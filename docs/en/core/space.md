---
order: 6
title: Coordinate System
type: Core
label: Core
---

The coordinate system plays a crucial role in the rendering engine, ensuring the accuracy of rendering results and interactions. By reading this document, you can understand most of the coordinate systems involved in Galacean. It is important to note that the definitions of various spaces differ among different rendering engines. This document only discusses the spatial standards in Galacean.

This document will horizontally compare various coordinate spaces based on aspects such as `space definition` and `coordinate system type`. The term `coordinate system type` specifically refers to `left-handed coordinate system` and `right-handed coordinate system`, as shown in the following image:

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*YBAmSamxy_0AAAAAAAAAAAAADleLAQ/original" width="50%" height="50%">

Being defined as a `left-handed coordinate system` or a `right-handed coordinate system` will affect the orientation of `forward` and the direction of rotation (counterclockwise or clockwise). For the definition of orientation, you can imagine aligning your right hand with `+X` and your head with `+Y`, where the direction your face is pointing is considered `forward`. You can easily compare the differences between Galacean and Unity:

- In Unity, both the local and world coordinate systems are `left-handed coordinate systems`. When performing pose transformations, rotations are done in a clockwise direction, and the `forward` direction corresponds to `+Z`. Therefore, the camera's orientation (viewing direction) is in the `+Z` direction.

- In Galacean, both the local and world coordinate systems are `right-handed coordinate systems`. When performing pose transformations, rotations are done in a counterclockwise direction, and the `forward` direction corresponds to `-Z`. Therefore, the camera's orientation (viewing direction) is in the `-Z` direction.

## Local Space

Local space is relative, using the object's own position as the reference coordinate system. Therefore, when describing it, it is usually expressed as "a point in Node A's local space." Local space is a `right-handed coordinate system`, and the `Transform` component automatically calculates the positions of various points in world space according to the following formula.

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*4ZLrSLEJPigAAAAAAAAAAAAADleLAQ/original" width="100%" height="100%">

## World Space

World space is absolute, with the root node placed in `world space`, and its child nodes inherit its spatial relationships. Similar to `local space`, `world space` is also a `right-handed coordinate system`. When two nodes are not in the same `local space`, they can be transformed to world space to compare their relative positions.

## Editor Usage

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*vU40Rb-2s5QAAAAAAAAAAAAADtKFAQ/original" alt="merge" style="zoom:50%;" />

Determining the gizmo's posture in the scene

| Icon                                                                                                                              | Option       | Description                                         |
| :-------------------------------------------------------------------------------------------------------------------------------- | :--------- | :------------------------------------------------ |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*of8ATKP_4u0AAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `Local Coordinates` | Maintains the Gizmo's rotation relative to the selected entity |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*Okm5S64_LqEAAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `Global Coordinates` | Fixes the Gizmo in the direction of world space. It aligns with the grid direction in the scene |

## View Space

`View space` refers to the camera's local space. Taking a perspective camera as an example:

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*isMHSpe21ZMAAAAAAAAAAAAAARQnAQ" width="50%" height="50%">

## Screen Space {/examples}

The definition of screen space is consistent with the front-end specifications, which is a two-dimensional coordinate system with the canvas's top-left corner as the origin. The value range within the space is consistent with the canvas size and is often used in interactions and screen space conversions.

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*qG0eTrkP4MUAAAAAAAAAAAAADleLAQ/original" width="50%" height="50%">

## Viewport Space {/examples}

The definition of viewport space is consistent with the front-end specifications. By setting the camera's viewport, you can control the target rendering area.

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*ZxwVQYgXLooAAAAAAAAAAAAADleLAQ/original" width="50%" height="50%">

## 2D Sprites {/examples}

When rendering sprites or masks and other 2D elements, they are placed on the XoY plane in the local coordinate system by default.

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*_5fjTp0r2KEAAAAAAAAAAAAAARQnAQ" width="50%" height="50%">
