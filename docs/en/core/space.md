---
order: 6
title: Coordinate System
type: Core
label: Core
---

The coordinate system plays a very important role in the rendering engine, ensuring the accuracy of rendering results and interactions. By reading this document, you can understand most of the coordinate systems involved in Galacean. It is important to note that the definitions of various spaces differ among different rendering engines. This article only discusses the space standards in Galacean.

This article will horizontally compare various coordinate spaces according to the `definition of space` and `types of coordinate systems`. The `types of coordinate systems` specifically refer to the `left-handed coordinate system` and the `right-handed coordinate system`, as shown in the figure below:

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*YBAmSamxy_0AAAAAAAAAAAAADleLAQ/original" width="50%" height="50%">

Defining as a `left-handed coordinate system` or `right-handed coordinate system` will affect the direction of `forward` and the direction of rotation (clockwise or counterclockwise). For the definition of direction, you can imagine aligning your right hand with `+X` and the top of your head with `+Y`. The direction your face is facing is `forward`. You can simply compare the differences between Galacean and Unity:

- Unity's local coordinates and world coordinate system are both `left-handed coordinate systems`. The pose transformation rotates in a clockwise direction, and the corresponding `forward` direction is `+Z`. Therefore, the camera's direction (viewing direction) is `+Z`.

- Galacean's local coordinates and world coordinate system are both `right-handed coordinate systems`. The pose transformation rotates in a counterclockwise direction, and the corresponding `forward` direction is `-Z`. Therefore, the camera's direction (viewing direction) is `-Z`.

## Local Space

Local space is relative, using the object's own position as the reference coordinate system. Therefore, it is usually described as: "a point in the local space of node A". The local space is a `right-handed coordinate system`. The `Transform` component will automatically calculate the position of each point in the world space according to the following formula.

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*4ZLrSLEJPigAAAAAAAAAAAAADleLAQ/original" width="100%" height="100%">

## World Space

World space is absolute. The root node is placed in `world space`, and its child nodes inherit its spatial relationship. Like `local space`, `world space` is also a `right-handed coordinate system`. When two nodes are not in the same `local space`, they can be converted to world space to compare their relative positions.

## Editor Usage

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*vU40Rb-2s5QAAAAAAAAAAAAADtKFAQ/original" alt="merge" style="zoom:50%;" />

Determine the posture of the gizmo in the scene

| Icon                                                                                                                              | Option       | Content                                              |
| :-------------------------------------------------------------------------------------------------------------------------------- | :----------- | :--------------------------------------------------- |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*of8ATKP_4u0AAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `Local Space` | Keep the Gizmo's rotation relative to the selected entity |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*Okm5S64_LqEAAAAAAAAAAAAADtKFAQ/original" width="24" height="24"> | `Global Space` | Fix the Gizmo to the world space direction, consistent with the grid direction in the scene |

## View Space

`View space` is the local space of the camera. Taking a perspective camera as an example:

<img src="https://gw.alipayobjects.com/mdn/rms_d27172/afts/img/A*isMHSpe21ZMAAAAAAAAAAAAAARQnAQ" width="50%" height="50%">

## Screen Space

The definition of screen space is consistent with front-end specifications. It is a two-dimensional coordinate system with the origin at the top-left corner of the canvas. The value range within this space is consistent with the dimensions of the canvas. It is often used in interactions and screen space transformations.

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*qG0eTrkP4MUAAAAAAAAAAAAADleLAQ/original" width="50%" height="50%">

## Viewport Space

The definition of viewport space is consistent with front-end specifications. By setting the camera's viewport, you can control the target area for rendering.

<img src="https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*ZxwVQYgXLooAAAAAAAAAAAAADleLAQ/original" width="50%" height="50%">

## 2D Sprites

When rendering sprites or other 2D elements such as masks, the default is to place the plane on the XoY plane in the local coordinate system:

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*_5fjTp0r2KEAAAAAAAAAAAAAARQnAQ" width="50%" height="50%">

