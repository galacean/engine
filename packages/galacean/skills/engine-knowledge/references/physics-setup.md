# Physics and Collision Semantics

Use this reference when choosing who owns motion, when physics synchronization occurs, how long collision data stays valid, or how physics-backed picking works.

## Simulation ownership

- Physics is opt-in through Engine configuration (e.g., `physics: new PhysXPhysics()`). Without a provider, physics components and physics-backed picking have no simulation owner.
- Choose one motion owner per body; mixing owners causes discontinuities and missed path interactions:
  - **Non-kinematic dynamic body**: simulation-owned; drive continuous motion through velocity, forces, and torque rather than competing Transform writes.
  - **Kinematic dynamic body**: application-owned; use its supported path-motion operation when sweep/path interactions matter.
  - **Direct Transform assignment**: synchronized to the native collider on a physics step as an instantaneous teleport (not swept along the path).
- After simulation, the native pose of an active non-kinematic body is written back to its Transform.

## Fixed-step order

Within a physics step, active Scripts receive `onPhysicsUpdate`, pending Transform poses sync to native colliders, the provider simulates, dynamic poses read back to Transforms, and collision/trigger events dispatch.

Because `onPhysicsUpdate` runs before sync and simulation, forces or poses set there affect the upcoming step. Rendered-frame callbacks (`onUpdate`, `onLateUpdate`) must not assume exactly one physics step ran since the last frame.

## Shapes and events

- A collider needs at least one `ColliderShape` to participate in contacts or queries.
- 3D Script pointer callbacks (`onPointer*`) are physics-backed: the pointer ray tests eligible collider shapes before dispatching to the hit Entity (a visible mesh alone is not a pointer target). Active Camera, culling mask, collision layer, shape raycast flag, and physics provider all gate hits.
- Trigger callbacks receive the peer `ColliderShape`; collision callbacks receive a `Collision` whose `shape` identifies the peer shape.
- `Collision` and its native contact data are temporary callback objects; copy positions, normals, impulses, or other values that must outlive the callback.
- Collision layers, trigger mode, collider type, and provider capability all govern whether a pair produces contacts; check installed declarations for provider-specific options.

## Physics-backed screen picking

Built-in pointer callbacks and manual `scene.physics.raycast` share the selection rules above. See [coordinates-and-space.md](coordinates-and-space.md) for screen coordinates and [mesh-geometry.md](mesh-geometry.md) for visual vs collider dimensions.

```ts
import { Camera, HitResult, Layer, PointerEventData, Ray, Scene, Script, Vector2 } from "@galacean/engine";

export class Pickable extends Script {
  onPointerDown(event: PointerEventData): void {
    console.log(this.entity.name, event.worldPosition);
  }
}

export function pickFromScreen(
  camera: Camera,
  scene: Scene,
  point: Vector2,
  outHit: HitResult,
  maxDistance: number = camera.farClipPlane,
  layerMask: Layer = camera.cullingMask
): boolean {
  const ray = camera.screenPointToRay(point, new Ray());
  return scene.physics.raycast(ray, maxDistance, layerMask, outHit);
}
```
