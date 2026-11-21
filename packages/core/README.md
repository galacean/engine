A subpackage of `@galacean/engine`.

## Physics materials

`new PhysicsMaterial(engine)` creates a `ReferResource` owned by that Engine, participating in resource registration, caching, GC, and destruction. `clone()` preserves the Engine owner.

Each `ColliderShape` retains its assigned material until replaced or destroyed. Cloning an entity shares its shapes' assigned materials and acquires references. Shapes retain no-argument constructors; a null `material` uses the physics backend's shared native default. `getInstanceMaterial(engine)` creates and retains an independent, Engine-owned material on demand and rejects an assigned material owned by another Engine.

### Migration

Pass the Engine to `new PhysicsMaterial(engine)` and `shape.getInstanceMaterial(engine)`. Scene and Prefab files should reference `.physMat` assets through `$ref`; inline `$type: "PhysicsMaterial"` construction without an Engine is no longer supported.
