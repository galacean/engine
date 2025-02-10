---
order: 2
title: Physics Manager
type: Physics
label: Physics
---

The Physics Manager (PhysicsManager) is used to manage all the physical components in the scene and is responsible for communicating with the physics backend to perform global operations related to the physical scene, such as updates and raycasting. In multi-scene projects, each Scene has its own PhysicsManager, and the physical systems between Scenes are isolated and do not affect each other.

## Physics Update

The physical scene and the rendering scene are independent of each other but continuously synchronize their data during the program's execution. Therefore, like scripts, the timing of synchronization is very important. Generally speaking, the update frequency of the physical scene is different from that of the rendering scene, and it can be set in the physics manager:

```typescript
/** The fixed time step in seconds at which physics are performed. */
fixedTimeStep: number = 1 / 60;

/** The max sum of time step in seconds one frame. */
maxSumTimeStep: number = 1 / 3;
```

In each rendering frame, the physics engine updates at a fixed time step `fixedTimeStep`.

If the time interval is greater than `fixedTimeStep`, the maximum time step for a single simulation is determined by `maxSumTimeStep`. At this time, if the default parameters listed above are used, frame chasing may occur.
In this case, you can reduce the number of physics simulation updates per frame by adjusting `maxSumTimeStep`.

If it is less than a `fixedTimeStep`, it will be postponed to the next frame for processing. Therefore, in each rendering frame, the physical scene may be updated multiple times or only once, so all updates related to physical components need to be placed in a specific update function, which is provided by `Script`:

```typescript
export class Script extends Component {
  /**
   * Called before physics calculations, the number of times is related to the physical update frequency.
   */
  onPhysicsUpdate(): void {
  }
}
```

When the physical scene is updated, in addition to calling this function, it will also synchronize the Collider and the posture of the Entity it is attached to. The timing of the physics update is as follows:

1. Call the user logic in `onPhysicsUpdate`
2. `callColliderOnUpdate` synchronizes the new posture of the modified Entity to the physical collider
3. Update the physical scene
4. `callColliderOnLateUpdate` synchronizes the updated positions of all DynamicColliders to the corresponding Entities

## Using Raycasting

<playground src="physx-raycast.ts"></playground>

A ray can be understood as an infinite line emitted from a point in a certain direction in the 3D world. Raycasting is very widely used in 3D applications. Through raycasting, you can pick objects in the 3D scene when the user clicks the screen; it can also be used in shooting games to determine whether a bullet can hit the target.

![image.png](https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*SHM1RI49Bd4AAAAAAAAAAAAAARQnAQ)
(_Image source: Internet_)

To use raycasting, you first need to import the [Ray](/apis/math/#Ray) module in the code; then generate a ray, which can be custom-generated or converted from screen input through the camera ([camera](/apis/core/#Camera-viewportPointToRay)); finally, call the [PhysicsManager.raycast](/apis/core/#PhysicsManager-raycast) method to detect the collision body hit by the ray. The code is as follows:

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

It should be particularly noted that if you want to enable raycasting for an Entity, the Entity must have a **Collider**, otherwise it cannot be triggered. If the Shapes of the Colliders hit by the ray are at the same distance, the Shape that was added first will be returned (for example: if two Entities with the same Collider completely overlap, the Entity with the Collider added first, or more accurately, the Shape added first, will be returned).

At the same time, in Galacean, an InputManager is also provided. This manager encapsulates the input sources and provides more user-friendly logic. You can refer to [here](/en/docs/input) for usage.
