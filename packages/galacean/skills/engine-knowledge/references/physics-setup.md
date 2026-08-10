# Physics Setup Guide

## Collider Types

| Type | Use Case |
|------|----------|
| **StaticCollider** | Immovable objects: ground, walls, platforms, static obstacles |
| **DynamicCollider** | Moving objects: player, projectiles, physics-driven items |

- StaticCollider has no rigidbody -- it never moves from physics forces
- DynamicCollider has a built-in rigidbody -- affected by gravity, forces, collisions

## ColliderShape Types

| Shape | Best For |
|-------|----------|
| **BoxColliderShape** | Cubes, walls, platforms, rectangular obstacles |
| **SphereColliderShape** | Spheres, coins, round pickups |
| **CapsuleColliderShape** | Player characters, humanoid entities, cylinders; avoid in default physics-lite unless the backend is known to support it |
| **PlaneColliderShape** | PhysX-only infinite plane; browser/default physics-lite does not support it, so use a thin BoxColliderShape for playable floors |

## Default Size Behavior

ColliderShape size is based on local coordinates and automatically multiplied by entity scale at runtime.

**Default shape size = (1, 1, 1)**, which already matches the entity's scale. In most cases, you do NOT need to manually set the collider size.

Example: A Cube entity with scale (2, 3, 1) and a default BoxColliderShape will have an effective collision box of (2, 3, 1) in world space.

## Common Setup Patterns

### CLI / SBX source-v2 setup

动态刚体需要两层事实：刚体属性和至少一个 ColliderShape；静态碰撞体只需要静态 collider 与 shape。用 `editor_api` 按当前意图查询 sandbox CLI 的实时紧凑调用及返回契约，只有一个已确认工具仍有字段歧义时才查询其 schema。不要把本文的运行时概念当成 source-v2 payload 合同。

### Ground with collider
- Entity: Plane mesh, scale (10, 1, 10)
- Add: StaticCollider + BoxColliderShape

### Player character with collider
- Entity: Capsule mesh, scale (0.5, 0.5, 0.5)
- Add: DynamicCollider + CapsuleColliderShape

### Static obstacle with collider
- Entity: Cube mesh, scale (1, 2, 1)
- Add: StaticCollider + BoxColliderShape

## Trigger Mode (isTrigger)

Set `isTrigger: true` on a ColliderShape to make it a trigger volume instead of a solid collider. Triggers don't block movement but fire callbacks when another collider overlaps:

- `onTriggerEnter(other: ColliderShape)` — first frame of overlap
- `onTriggerStay(other: ColliderShape)` — every frame while overlapping
- `onTriggerExit(other: ColliderShape)` — frame when overlap ends

Use triggers for: pickup zones, damage zones, obstacle hit detection in games.

## Callback Selection

Match the script callback to the collider shape mode:

| Shape mode | Correct callback | Read the other entity |
|------------|------------------|-----------------------|
| `isTrigger:false` real collision | `onCollisionEnter(collision: Collision)` | `collision.shape.collider.entity` |
| `isTrigger:true` trigger overlap | `onTriggerEnter(shape: ColliderShape)` | `shape.collider.entity` |

Do not use `onTriggerEnter` for solid DynamicCollider-to-DynamicCollider gameplay such as merge/bounce rules. For real collisions, import `Collision` and inspect the peer entity from `collision.shape.collider.entity`:

```typescript
import { Collision, Script } from "@galacean/engine";

export default class Bumper extends Script {
  public team = 1;

  onCollisionEnter(collision: Collision): void {
    const otherBumper = collision.shape.collider.entity.getComponent(Bumper);
    if (!otherBumper || otherBumper === this || otherBumper.team !== this.team) return;
    // Handle the same-team collision here.
  }
}
```

## Movement and Collision Detection

**Critical rule**: How you move an entity determines whether collision/trigger callbacks fire.

| Movement method | Trigger callbacks | Collision callbacks |
|----------------|-------------------|---------------------|
| `entity.transform.position = vec` | NO | NO |
| `DynamicCollider.move(position)` with `isKinematic=true` | YES | NO |
| `applyForce()` / `linearVelocity` | YES | YES |

**Direct `transform.position` assignment bypasses PhysX entirely.** The physics engine doesn't know the object moved, so no overlap detection occurs.

**For script-controlled movement with collision detection**, use:
```typescript
import { DynamicCollider, Script, Vector3 } from "@galacean/engine";

export default class KinematicMover extends Script {
  private _collider: DynamicCollider | null = null;
  private readonly _nextPosition = new Vector3();

  onStart(): void {
    const collider = this.entity.getComponent(DynamicCollider);
    if (!collider) return;
    collider.isKinematic = true;
    this._collider = collider;
  }

  onUpdate(deltaTime: number): void {
    const collider = this._collider;
    if (!collider) return;
    this._nextPosition.copyFrom(this.entity.transform.worldPosition);
    this._nextPosition.z += deltaTime;
    collider.move(this._nextPosition); // PhysX tracks movement, triggers fire
  }
}
```

`isKinematic = true` means: physics engine doesn't drive this body (no gravity, no forces), but it still participates in collision/trigger detection when moved via `move()`.

## Common Mistakes

1. **Forgetting ground collider** -- without a StaticCollider on the ground plane, the player with DynamicCollider will fall through infinitely
2. **Using DynamicCollider for obstacles** -- static obstacles should use StaticCollider, not DynamicCollider. DynamicCollider would cause them to be pushed around
3. **Manually setting collider size** -- the default (1,1,1) already matches entity scale. Only set custom size when the collision volume should differ from the visual mesh
4. **Missing ColliderShape** -- adding only `dynamicCollider.add` gives rigidbody properties but no shape. Add `collider.add({ componentType:"DynamicCollider", shapeType:"BoxColliderShape" })`.
5. **Direct position setting for collision** -- `entity.transform.position = x` bypasses physics. Use `DynamicCollider.move()` with `isKinematic=true` for script-controlled movement that needs trigger detection
6. **Forgetting isTrigger on obstacles** -- obstacle colliders need `isTrigger: true` when using kinematic player movement, otherwise onTriggerEnter won't fire
