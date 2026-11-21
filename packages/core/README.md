A subpackage of `@galacean/engine`.

## Physics materials

`new PhysicsMaterial(engine)` creates a `ReferResource` owned by that Engine, participating in resource registration, caching, GC, and destruction. `clone()` preserves the Engine owner.

Each `Collider` component retains its assigned material until replaced or destroyed. Cloning an entity shares its Colliders' assigned materials and acquires references. A null `material` uses the physics backend's shared native default; assigning a material owned by another Engine throws. `getInstanceMaterial()` clones the assigned material, or creates a default one from the Collider's Engine, retains it, and reuses it until `material` is set to a different material or null.

### Migration

Pass the Engine to `new PhysicsMaterial(engine)`. Collider shapes are now Collider components (`BoxCollider`, `SphereCollider`, `CapsuleCollider`, `PlaneCollider`, `MeshCollider`), so `shape.material` and `shape.getInstanceMaterial(engine)` become `collider.material` and `collider.getInstanceMaterial()`. Scene and Prefab files should reference `.physMat` assets through `$ref`; inline `$type: "PhysicsMaterial"` construction without an Engine is no longer supported.
