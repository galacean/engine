---
order: 2
title: Physics Manager
type: Physics
label: Physics
---

The Physics Manager is responsible for managing all the physics components in the scene and communicating with the physics backend to perform global operations related to the physics scene, such as updates and raycasting, etc. In a multi-scene project, each Scene has its own Physics Manager, and the physics systems between Scenes are isolated and do not affect each other.

## Physics Update

The physics scene and the rendering scene are independent of each other but continuously synchronize their data during program execution. Therefore, just like scripts, the synchronization timing is crucial. Generally, the update frequency of the physics scene is different from the rendering scene, and it can be set in the Physics Manager:

```typescript
/** The fixed time step in seconds at which physics are performed. */
fixedTimeStep: number = 1 / 60;

/** The max sum of time step in seconds one frame. */
maxSumTimeStep: number = 1 / 3;
```

In each rendering frame, the physics engine updates at a fixed time step `fixedTimeStep`.

If the time interval is greater than `fixedTimeStep`, the maximum time step for a single simulation is determined by `maxSumTimeStep`. In this case, with the default parameters listed above, frame skipping may occur. To reduce the number of physics simulation updates per frame, you can adjust `maxSumTimeStep`.

If the time interval is less than `fixedTimeStep`, the update is deferred to the next frame. Therefore, in each rendering frame, the physics scene may be updated multiple times or only once. Thus, any updates related to physics components need to be placed in specific update functions. `Script` provides this interface:

```typescript
export class Script extends Component {
  /**
   * Called before physics calculations, the number of times is related to the physical update frequency.
   */
  onPhysicsUpdate(): void {
  }
}
```

During the physics scene update, besides calling this function, the Collider and the Entity it is attached to will have their poses synchronized. The timing of the physics update is as follows:

1. Call user logic in `onPhysicsUpdate`
2. `callColliderOnUpdate` synchronizes the modified Entity's new pose to the physics collider
3. Update the physics scene
4. `callColliderOnLateUpdate` synchronizes the updated positions of all DynamicColliders to the corresponding Entities

## Using Raycasting

<playground src="physx-raycast.ts"></playground>

A ray can be understood as an endless line projected from a point in a specific direction in a 3D world. Raycasting is widely used in 3D applications. Through raycasting, you can pick objects in a 3D scene when the user clicks on the screen, or determine if a bullet can hit a target in a shooting game.

![image.png](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*SHM1RI49Bd4AAAAAAAAAAAAAARQnAQ)
(_Image source: Internet_)

When using raycasting, you first need to import the [Ray](/apis/math/#Ray) module in your code. Then, generate a ray - the ray can be custom-generated or converted from screen input to a ray through the camera ([camera](/apis/core/#Camera-viewportPointToRay)). Finally, call the [PhysicsManager.raycast](/apis/core/#PhysicsManager-raycast) method to detect collisions hit by the ray. The code is as follows:

```typescript
// 加载 Raycast 模块
import {WebGLEngine, HitResult, Ray} from "@galacean/engine";
import {LitePhysics} from "@galacean/engine-physics-lite";

const engine = await WebGLEngine.create({
  canvas: "canvas",
  physics: new LitePhysics(),
});
engine.canvas.resizeByClientSize();

// 将屏幕输入转换成Ray
document.getElementById('canvas').addEventListener('click', (e) => {
  const ratio = window.devicePixelRatio;
  let ray = new Ray();
  camera.screenPointToRay(new Vector2(e.offsetX, e.offsetY).scale(ratio), ray);
  const hit = new HitResult();
  result = engine.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything, hit);
  if (result) {
    console.log(hit.entity.name);
  }
});
```

It is important to note that for an Entity to be raycast-enabled, the Entity must have a **Collider**; otherwise, it will not trigger. If the Colliders hit by the ray have the same distance, the Collider added first will be returned (for example, if two Entities with identical Colliders completely overlap, the Entity with the Collider added first will be returned more accurately).

Additionally, in Galacean, an InputManager is provided, which encapsulates the input source and provides a more user-friendly logic. For usage, you can refer to [here](/en/docs/input).

