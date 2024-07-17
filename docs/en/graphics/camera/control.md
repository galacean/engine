---
order: 2
title: Camera Controls
type: Graphics
group: Camera
label: Graphics/Camera
---

Camera controls are components used in conjunction with camera components to display three-dimensional scenes. These components customize corresponding parameters based on different functions, controlling the display of the three-dimensional scene by affecting the camera's properties.

Camera controls inherit powerful scripts and are mounted on an `Entity` containing the `Camera` component. Therefore, they can naturally access the `Camera` and respond to external inputs and perform corresponding operations in lifecycle functions. **These controls cannot currently be added or operated in the editor and must be added by developers in scripts.**

## Orbit Controller

`OrbitControl` is used to simulate orbit interaction, suitable for 360-degree rotation interaction around a target object. It is important to note that **the orbit controller must be added after adding the camera component**.

<playground src="gltf-basic.ts"></playground>

| Property          | Description                                                     |
| :---------------- | :-------------------------------------------------------------- |
| `target`          | The position to observe                                          |
| `autoRotate`      | Whether to auto-rotate, default is false, rotation speed can be adjusted through autoRotateSpeed |
| `autoRotateSpeed` | The speed of auto-rotation                                      |
| `enableDamping`   | Whether to enable camera damping, default is true               |
| `dampingFactor`   | Rotation damping parameter, default is 0.1                      |
| `enableKeys`      | Whether to support keyboard operation (arrow keys)              |
| `enablePan`       | Whether to support camera panning, default is true              |
| `keyPanSpeed`     | Magnitude of operation when the key is continuously pressed     |
| `enableRotate`    | Whether to support camera rotation, default is true             |
| `rotateSpeed`     | Camera rotation speed, default is 1.0                           |
| `enableZoom`      | Whether to support camera zoom, default is true                 |
| `minAzimuthAngle` | Minimum radians for reasonable range of horizontal operations on onUpdate, default is negative infinity |
| `maxAzimuthAngle` | Maximum radians for reasonable range of horizontal operations on onUpdate, default is positive infinity |
| `minDistance`     | Minimum value for reasonable range of distance operations on onUpdate |
| `maxDistance`     | Maximum value for reasonable range of distance operations on onUpdate |
| `minPolarAngle`   | Minimum radians for reasonable range of vertical operations on onUpdate |
| `maxPolarAngle`   | Maximum radians for reasonable range of vertical operations on onUpdate |

## Free Controller

`FreeControl` is generally used for roaming control, commonly seen in game scenes. It is important to note that **the free controller must be added after adding the camera component**.

<playground src="controls-free.ts"></playground>

| Property        | Description                              |
| :-------------- | :--------------------------------------- |
| `floorMock`     | Whether to simulate the floor, default is true |
| `floorY`        | Used in conjunction with `floorMock` to declare the position information of the floor |
| `movementSpeed` | Movement speed                           |
| `rotateSpeed`   | Rotation speed                           |

#### Orthogonal Controller

`OrthoControl` is typically used to control scaling and translation in 2D scenes:

<playground src="ortho-control.ts"></playground>

| Property    | Description |
| :---------- | :---------- |
| `zoomSpeed` | Zoom speed  |

