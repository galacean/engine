---
order: 1
title: Overview of Physics
type: Physics
label: Physics
---

The physics engine is a very important part of the game engine. The industry generally adopts PhysX to introduce related functions. However, for lightweight scenarios, PhysX makes the final application size very large, exceeding the limits of these projects. Galacean is designed based on multiple backends. On one hand, it compiles [PhysX.js](https://github.com/galacean/physX.js) through WebAssembly; on the other hand, it also provides a lightweight physics engine. Both are consistent in [API](https://github.com/galacean/engine/tree/main/packages/design/src/physics) design. Users only need to choose a specific physics backend when initializing the engine. It can meet the needs of various scenarios such as lightweight applications and heavyweight games. For the overall design of the physics components, you can refer to the [Wiki](https://github.com/galacean/engine/wiki/Physical-system-design).

For scenarios that need to use various physics components and `InputManager` that require Raycast picking, the physics engine needs to be initialized before use. Currently, the Galacean engine provides two built-in physics engine backend implementations:

 - [physics-lite](https://github.com/galacean/engine/tree/main/packages/physics-lite)
 - [physics-physx](https://github.com/galacean/engine/tree/main/packages/physics-physx)

Developers can set the physics backend in the **Project Settings** panel opened from the [Main Menu](/en/docs/interface/menu) interface.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*LO_FRIsaIzIAAAAAAAAAAAAADsJ_AQ/original)
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*ZvWdQqEfIKoAAAAAAAAAAAAADsJ_AQ/original)

If initializing the engine through a script, you only need to pass the physics backend object into the `Engine`:

```typescript
import {LitePhysics} from "@galacean/engine-physics-lite";

const engine = await WebGLEngine.create({
  canvas: htmlCanvas,
  physics: new LitePhysics(),
});
```

## Loading and Initializing the PhysX Version of the Physics Engine

```typescript
import { PhysXPhysics } from "@galacean/engine-physics-physx";

const engine = await WebGLEngine.create({
  canvas: htmlCanvas,
  physics: new PhysXPhysics(),
});
```

## Choosing a Physics Backend
Choosing a physics backend needs to consider three factors: functionality, performance, and package size:
1. Functionality: For complete physics engine functionality and high-performance physics simulation, it is recommended to choose the PhysX backend. The Lite backend only supports collision detection.
2. Performance: PhysX will automatically downgrade to pure JavaScript code on platforms that do not support WebAssembly, so performance will also decrease. However, due to the built-in data structures for scene search, the performance is still better than the Lite backend.
3. Package Size: Choosing the PhysX backend will additionally introduce nearly 2.5mb of wasm files (the size of the pure JavaScript version is similar), increasing the package size while reducing the application's initialization speed.
