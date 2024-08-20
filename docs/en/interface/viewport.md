---
order: 6
title: Viewport
type: Basics
group: Interface
label: Basics/Interface
---

## Introduction

The viewport window is an interactive interface used to select, position, and change various types of entities and components in the current scene.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*So6vR6JM9U0AAAAAAAAAAAAADtKFAQ/original" alt="drag5" style="zoom:50%;" />

## Browsing the Scene

There are two ways to browse the scene: standard mode and flight mode. Standard mode rotates around the center viewpoint, while flight mode is suitable for browsing large scenes, where the scene camera moves forward, backward, left, right, up, and down in three-dimensional space.

| Mode          | Operation       | Shortcut Key                                                           |
| :------------ | :-------------- | ---------------------------------------------------------------------- |
| **Standard Mode** | Orbit         | `alt` + left mouse button                                              |
|                | Pan            | `alt` + `command` + left mouse button, or press the mouse wheel         |
|                | Zoom           | `alt` + `control` + left mouse button, or scroll the mouse wheel, or swipe with two fingers on the touchpad |
| **Flight Mode** | Look around    | `alt` + right mouse button                                             |
|                | Move forward   | Up arrow key, or right mouse button + `W`                               |
|                | Move backward  | Down arrow key, or right mouse button + `S`                             |
|                | Move left      | Left arrow key, or right mouse button + `A`                             |
|                | Move right     | Right arrow key, or right mouse button + `D`                            |
|                | Move up        | Right mouse button + `E`                                                |
|                | Move down      | Right mouse button + `Q`                                                |
|                | Change flight speed | Right mouse button + mouse wheel                                      |

## Toolbar

The toolbar is located at the top of the viewport window. Hovering the mouse over each item will display its shortcut key or description.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*XJN-T5q2L_AAAAAAAAAAAAAADtKFAQ/original" alt="image-20240131181207870" style="zoom:50%;" />

| Icon | Name | Description | Shortcut Key |
| --- | --- | --- | --- |
| <img src="https://gw.alipayobjects.com/zos/OasisHub/1bfc4f69-a88e-4efb-a001-cc1d145d9639/image-20240131175906508.png" alt="image-20240131175906508" style="zoom:50%;" /> | Drag | Drag the view |  |
| <img src="https://gw.alipayobjects.com/zos/OasisHub/538ee5d8-a97c-4d88-98c7-f207873d74ab/image-20240131180117064.png" alt="image-20240131180117064" style="zoom:50%;" /><br /><img src="https://gw.alipayobjects.com/zos/OasisHub/72016aba-4f42-4683-9d26-b2525cd207be/image-20240131180217044.png" alt="image-20240131180217044" style="zoom:50%;" /><br /><img src="https://gw.alipayobjects.com/zos/OasisHub/56cdaed5-fddf-4aa7-813d-8c00056c2802/image-20240131180256738.png" alt="image-20240131180256738" style="zoom:50%;" /> | Move<br />Rotate<br />Scale | Transform the selected entity | `W` <br /> `E` <br />`R` |
| <img src="https://gw.alipayobjects.com/zos/OasisHub/33b47020-ab3d-4acd-baa9-b7d111e1c5d0/image-20240131180403373.png" alt="image-20240131180403373" style="zoom:50%;" /><br /><img src="https://gw.alipayobjects.com/zos/OasisHub/40faa545-0352-47c6-a704-880821e542ca/image-20240131180513384.png" alt="image-20240131180513384" style="zoom:50%;" /> | Center Pivot/Hub Pivot | Switch the pivot of the selected entity |  |
| <img src="https://gw.alipayobjects.com/zos/OasisHub/41fa937d-f4e8-4475-a0a5-9278c3ce69da/image-20240131180709163.png" alt="image-20240131180709163" style="zoom:50%;" /><br /><img src="https://gw.alipayobjects.com/zos/OasisHub/664c3454-9c2c-4932-a6e1-841e20cef76d/image-20240131180731465.png" alt="image-20240131180731465" style="zoom:50%;" /> | Local Coordinates/World Coordinates | Switch the coordinates of the selected entity |  |
| <img src="https://gw.alipayobjects.com/zos/OasisHub/57a9b6be-14ff-4eb3-994f-2175bd7c4d75/image-20240131181105676.png" alt="image-20240131181105676" style="zoom:50%;" /> | Focus | Focus the scene camera on the selected entity | `F` |
| <img src="https://gw.alipayobjects.com/zos/OasisHub/dd1abc49-d43b-4a4b-8941-e3fc5e3575ec/image-20240131181429677.png" alt="image-20240131181429677" style="zoom:50%;" /> | Scene Camera | The scene camera menu contains options for configuring the scene camera, mainly used to solve the problem of objects not being visible when the clipping plane is too far or too close while building the scene. These adjustments will not affect the settings of entities with camera components in the scene. |  |
| <img src="https://gw.alipayobjects.com/zos/OasisHub/cf528af5-d928-4eb5-94b3-849d7c561524/image-20240131181144755.png" alt="image-20240131181144755" style="zoom:50%;" /> | Settings | The settings menu contains options for adjusting auxiliary displays in the view, including grids, auxiliary icons (graphics associated with specific components in the scene, including cameras, directional lights, point lights, spotlights), and auxiliary wireframes |  |
| <img src="https://gw.alipayobjects.com/zos/OasisHub/f05e1699-9495-49fd-b123-6e501af0e023/image-20240131181242445.png" alt="image-20240131181242445" style="zoom:50%;" /><br /><img src="https://gw.alipayobjects.com/zos/OasisHub/739fb9f1-309b-497a-86b6-f3d4ef89d7ee/image-20240131181524219.png" alt="image-20240131181524219" style="zoom:50%;" /> | Scene Camera Type | Switch between perspective/orthographic camera |  |
| <img src="https://gw.alipayobjects.com/zos/OasisHub/8a596654-17f6-4c97-b18e-b0188b05220d/image-20240131181459432.png" alt="image-20240131181459432" style="zoom:50%;" /><br /><img src="https://gw.alipayobjects.com/zos/OasisHub/7f101795-7966-40b8-a61a-1504a3224e7a/image-20240131181607999.png" alt="image-20240131181607999" style="zoom:50%;" /> | Mode | Convenient for switching between 2D/3D scene modes with a click. In 2D mode, navigation components, orthographic/perspective switching are disabled, and orbiting in navigation is no longer effective. |  |
| <img src="https://gw.alipayobjects.com/zos/OasisHub/408bf2c2-8238-4c23-98f4-ee02787fd69f/image-20240131182235406.png" alt="image-20240131182235406" style="zoom:50%;" /> | Fullscreen/Restore | Maximize the viewport window, minimize the hierarchy, assets, and inspector |  |
| <img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*zsduSKvepO0AAAAAAAAAAAAADtKFAQ/original" style="zoom:50%;" /> | Play | Play all particles and animations in the scene |
| <img src="https://gw.alipayobjects.com/zos/OasisHub/c37591e0-6eb0-48ae-9faa-2d5b1a0e7941/image-20240131182303867.png" alt="image-20240131182303867" style="zoom:50%;" /> | Screenshot | Take a snapshot of the current scene. Only user-created entities in the scene are displayed; a series of auxiliary display tools such as icons, grids, and gizmos will not be included. After taking a screenshot, the snapshot will be used as the project thumbnail on the homepage. |

### Auxiliary Elements Settings Interface

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*KnrvSLcYSkcAAAAAAAAAAAAADtKFAQ/original" style="zoom:50%;" />

| Attribute | Content |
| --- | --- |
| Grid | Whether the grid in the view is displayed |
| 3D Icons | Whether auxiliary icons scale based on the distance between the component and the camera |
| Navigation Gimzo | Used to display the current direction of the scene camera and can quickly modify the view and projection mode (orthographic/perspective) through mouse operations. When enabled, it will be displayed in the lower right corner of the screen.<br /><img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*tooGS4MTpTUAAAAAAAAAAAAADtKFAQ/original" alt="image-20240131184405058" style="zoom:50%;" /> |
| Outline | Whether to display the outline when an entity is selected. The outline color of the selected entity is orange, and the outline of child nodes is blue |
| Camera | Display the selected camera component as a cone |
| Light | Display light source components |
| Static Collider | Display the shape of static colliders |
| Dynamic Collider | Display the shape of dynamic colliders |
| Emission Shape | Display the shape of particle emitters |

### Scene Camera Settings Interface

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*TFE1ToVVVawAAAAAAAAAAAAADtKFAQ/original" alt="image-20240131185805023" style="zoom:50%;" />

| Attribute                     | Content                                                         | Default Value         |
| :---------------------------- | :-------------------------------------------------------------- | :-------------------- |
| Fov                           | The field of view of the scene camera                           | 60                    |
| Dynamic Clipping              | Automatically calculate the near and far clipping planes of the scene camera relative to the selected entity and the scene camera position | Off                   |
| Near Plane                    | Manually adjust the nearest point relative to the scene camera  | Enabled when dynamic clipping is unchecked |
| Far Plane                     | Manually adjust the farthest point relative to the scene camera | Enabled when dynamic clipping is unchecked |
| Speed                         | The movement speed of the camera in flight mode                 | 10                    |
| Opaque Texture                | Enable opaque texture for the scene camera                      | Off                   |
| HDR                           | Enable HDR for the scene camera                                 | Off                   |
| Post Process                  | Enable post-processing for the scene camera                     | On                    |

## Preview

When an entity with a camera component is selected, a real-time preview of the camera will be displayed in the lower left corner of the view window. This helps users to adjust the camera and scene position in real-time. The preview window can be dragged, locked, and switched to different device aspect ratios.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*6IztTr2AERQAAAAAAAAAAAAADtKFAQ/original" alt="image-20240131190013320" style="zoom:50%;" />


| Attribute | Content                         |
| :-------- | :------------------------------ |
| Drag      | Freely drag the preview window   |
| Position  | Position the camera in the scene |
| Switch Ratio | Switch windows of different devices and ratios |
| Lock      | Lock the camera preview window   |

In the hierarchy tree, objects containing camera components can directly synchronize the relevant properties of the scene camera in the view, making it convenient to adjust the position and perspective.

<img src="https://mdn.alipayobjects.com/huamei_qbugvr/afts/img/A*IEaMQYLe1HgAAAAAAAAAAAAADtKFAQ/original" style="zoom:50%;" />

