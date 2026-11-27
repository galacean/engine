# Physics and Collision Semantics

Use this reference when choosing who owns motion, when synchronization occurs, or how long collision data remains valid.

## Simulation ownership

- Physics is opt-in through Engine configuration. Without a provider, physics components and physics-backed picking do not have a simulation owner.
- A Collider component (`BoxCollider`, `SphereCollider`, `CapsuleCollider`, `PlaneCollider`, `MeshCollider`) is the shape. The nearest `Rigidbody` on its Entity or ancestors owns it; without one it is static and follows its own Entity. Build compound bodies from several Colliders on the Rigidbody's Entity or its descendants. An Entity can have at most one Rigidbody.
- Disabling a Rigidbody removes it and its Colliders from simulation and queries without making them static; removing the Rigidbody lets the next ancestor Rigidbody take ownership or makes them static if there is no ancestor body. `PlaneCollider` and a `MeshCollider` with `convex = false` can only be static or kinematic.
- A non-kinematic Rigidbody is simulation-owned. Drive continuous motion through velocity, forces, and torque rather than competing transform writes.
- A direct Transform change is synchronized to the native actor before the next physics step or query as a teleport. It is not swept through the path between the old and new pose.
- A kinematic Rigidbody is application-owned. Use `Rigidbody.move` when interactions along the movement path matter; a direct Transform assignment still has teleport semantics.
- After each simulation step, the native pose of every enabled Rigidbody is written back to its Transform. `CharacterController.move` writes the Entity's world position immediately.

## Fixed-step order

Within a physics step, active Scripts receive `onPhysicsUpdate`, pending component and Transform changes are synchronized to the native scene, the provider simulates, simulated Rigidbody poses are read back, and collision and trigger events are dispatched.

This ordering means a pose or force chosen in `onPhysicsUpdate` affects the upcoming step. Rendered-frame callbacks must not assume exactly one simulation step has occurred.

## Colliders and events

- A Collider participates in contacts and queries only while it is enabled in a scene and, if owned, its Rigidbody is enabled. A `MeshCollider` also needs a valid `mesh`.
- 3D Script pointer targeting is physics-backed: the pointer ray is tested against eligible Colliders before callbacks are dispatched to the hit Collider's own Entity. A visible mesh alone is not a pointer target. The active Camera, culling mask, collision layer, and physics provider all participate in that selection.
- Events go to Scripts on each Collider's owning `Rigidbody` Entity, or on the Collider's own Entity when it has no `Rigidbody` (static Colliders and `CharacterController`). Trigger callbacks receive `(other, self)` Colliders. Collision callbacks receive a `Collision` whose `collider` is the other Collider and `selfCollider` is the receiving Collider (identifying the exact child Collider in a compound body); contact normals and impulses point toward the receiver.
- `Collision` and its native contact data are temporary callback data. Copy positions, normals, impulses, or other values that must outlive the callback.
- Collision layers, trigger mode, Rigidbody ownership, and provider capability all affect whether a pair produces contacts. Resolve the exact current API from the installed declarations instead of copying a provider-specific setup.

## Decision rule

Choose one motion owner per body: simulation for non-kinematic dynamics, application path motion (`Rigidbody.move`) for kinematics, or Transform teleportation for explicit repositioning. Mixing owners produces discontinuities and missed path behavior.

## Physics-backed screen picking

Built-in callbacks and manual raycasts share the selection rules above. In Editor-managed projects, configure the target and attach the Script through the Editor API. See [coordinates-and-space.md](coordinates-and-space.md) for screen coordinates and [mesh-geometry.md](mesh-geometry.md) for visual/collider dimensions.

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
