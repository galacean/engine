---
order: 2
title: Camera Controls
type: Graphics
group: Camera
label: Graphics/Camera
---

Camera controls are components that work together with the camera component to display a 3D scene. These components customize corresponding parameters based on different functions and control the display of the 3D scene by affecting the camera's properties.

Camera controls inherit from powerful scripts and are mounted on an `Entity` that contains the `Camera` component. Therefore, they can naturally access the `Camera`, respond to external inputs in lifecycle functions, and perform corresponding operations. **These controls cannot currently be added in the editor and must be added by developers in the script.**

> Note that before adding camera controls, make sure the node has already added the `Camera` component.

## Orbit Controller

`OrbitControl` is used to simulate orbit interaction, suitable for 360-degree rotation interaction around a target object. Note that **the orbit controller must be added after the camera component**.

<playground src="gltf-basic.ts"></playground>

| Property         | Description                                                        |
| :--------------- | :----------------------------------------------------------------- |
| `target`         | The target position to observe                                     |
| `autoRotate`     | Whether to auto-rotate, default is false, can adjust speed via autoRotateSpeed |
| `autoRotateSpeed`| Speed of auto-rotation                                             |
| `enableDamping`  | Whether to enable camera damping, default is true                  |
| `dampingFactor`  | Rotation damping parameter, default is 0.1                         |
| `enableKeys`     | Whether to support keyboard operations (arrow keys)                |
| `enablePan`      | Whether to support camera panning, default is true                 |
| `keyPanSpeed`    | Magnitude of operation when the keyboard is continuously pressed   |
| `enableRotate`   | Whether to support camera rotation, default is true                |
| `rotateSpeed`    | Camera rotation speed, default is 1.0                              |
| `enableZoom`     | Whether to support camera zoom, default is true                    |
| `minAzimuthAngle`| Minimum azimuth angle for horizontal operations during onUpdate, default is negative infinity |
| `maxAzimuthAngle`| Maximum azimuth angle for horizontal operations during onUpdate, default is positive infinity |
| `minDistance`    | Minimum distance for reasonable operations during onUpdate         |
| `maxDistance`    | Maximum distance for reasonable operations during onUpdate         |
| `minPolarAngle`  | Minimum polar angle for vertical operations during onUpdate        |
| `maxPolarAngle`  | Maximum polar angle for vertical operations during onUpdate        |

## Free Controller

`FreeControl` is generally used for roaming control, commonly seen in game scenes. Note that **the free controller must be added after the camera component**.

<playground src="controls-free.ts"></playground>

| Property        | Description                               |
| :-------------- | :---------------------------------------- |
| `floorMock`     | Whether to simulate the ground, default is true |
| `floorY`        | Used with `floorMock`, declares the ground position |
| `movementSpeed` | Movement speed                            |
| `rotateSpeed`   | Rotation speed                            |

#### Orthographic Controller

`OrthoControl` is generally used to control zooming and panning in 2D scenes:

<playground src="ortho-control.ts"></playground>

| Property    | Description |
| :---------- | :-----------|
| `zoomSpeed` | Zoom speed  |
