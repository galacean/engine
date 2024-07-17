---
order: 1
title: Physics Overview
type: Physics
label: Physics
---

The physics engine is a crucial component in game engines. The industry commonly adopts PhysX for its related functionalities. However, for lightweight scenarios, PhysX results in a very large final application size, exceeding the limits of these projects. Galacean is based on a multi-backend design. On one hand, it compiles to [PhysX.js](https://github.com/galacean/physX.js) through WebAssembly; on the other hand, it also provides a lightweight physics engine. Both are consistent in [API](https://github.com/galacean/engine/tree/main/packages/design/src/physics) design. Users only need to select a specific physics backend when initializing the engine. It can meet the requirements of various scenarios such as lightweight applications and heavyweight games. For the overall design of the physics components, refer to the [Wiki](https://github.com/galacean/engine/wiki/Physical-system-design).

For scenarios requiring various physics components and Raycast picking, such as `InputManager`, the physics engine needs to be initialized before use. Currently, the Galacean engine provides two built-in physics engine backend implementations:

- [physics-lite](https://github.com/galacean/engine/tree/main/packages/physics-lite)
- [physics-physx](https://github.com/galacean/engine/tree/main/packages/physics-physx)

Developers can set the physics backend in the **Project Settings** panel opened in the [main menu](/en/docs/interface-menu) interface.

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*LO_FRIsaIzIAAAAAAAAAAAAADsJ_AQ/original)
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*ZvWdQqEfIKoAAAAAAAAAAAAADsJ_AQ/original)

If initializing the engine via script, simply pass the physics backend object into `Engine`:

```typescript
import {LitePhysics} from "@galacean/engine-physics-lite";

const engine = await WebGLEngine.create({
  canvas: htmlCanvas,
  physics: new LitePhysics(),
});
```

## PhysX Physics Engine Loading and Initialization

```typescript
import { PhysXPhysics } from "@galacean/engine-physics-physx";

const engine = await WebGLEngine.create({
  canvas: htmlCanvas,
  physics: new PhysXPhysics(),
});
```

## Selecting a Physics Backend
When selecting a physics backend, consider the following factors: functionality, performance, and package size:
1. Functionality: For complete physics engine functionality and high-performance physics simulation, it is recommended to choose the PhysX backend. The Lite backend only supports collision detection.
2. Performance: PhysX will automatically degrade to pure JavaScript code on platforms that do not support WebAssembly, resulting in reduced performance. However, due to the built-in data structures for scene searching, the performance is still better than the Lite backend.
3. Package Size: Choosing the PhysX backend will introduce an additional wasm file of nearly 2.5mb (the size of the pure JavaScript version is similar), increasing the package size while decreasing the application initialization speed. 

