A subpackage of `@galacean/engine`.

## Physics materials

`new PhysicsMaterial(engine)` creates a `ReferResource` owned by that Engine, participating in resource registration, caching, GC, and destruction. `clone()` preserves the Engine owner.

Each `Collider` component retains its assigned material until replaced or destroyed. Cloning an entity shares its Colliders' assigned materials and acquires references. A null `material` uses the physics backend's shared native default; assigning a material owned by another Engine throws. To modify a single Collider without affecting others sharing the material, assign a cloned or newly created `PhysicsMaterial`.

### Migration

Pass the Engine to `new PhysicsMaterial(engine)`. Collider shapes are now Collider components (`BoxCollider`, `SphereCollider`, `CapsuleCollider`, `PlaneCollider`, `MeshCollider`), so `shape.material` becomes `collider.material`, and `shape.getInstanceMaterial()` is removed (assign `collider.material?.clone() ?? new PhysicsMaterial(engine)` instead). Scene and Prefab files should reference `.physMat` assets through `$ref`; inline `$type: "PhysicsMaterial"` construction without an Engine is no longer supported.
