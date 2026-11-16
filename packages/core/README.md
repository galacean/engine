A subpackage of `@galacean/engine`.

## Physics materials

`new PhysicsMaterial(engine)` creates a reference-counted resource owned by that Engine, with the same resource registration, caching, GC, and destruction rules as other materials. `clone()` preserves the Engine owner. Use a material within its owning Engine.

Each `ColliderShape` retains its explicitly assigned material, including while detached from a collider. Replacing a material or destroying the shape releases that reference. Cloning an entity shares its shapes' assigned materials and acquires the corresponding references. Releasing the last reference makes a material eligible for ordinary resource GC; it remains usable until GC, explicit destruction, or Engine destruction. Set `isGCIgnored` when a resource must survive ordinary GC without references.

Shapes retain their no-argument constructors. A null `material` uses the physics backend's shared native default without allocating a `PhysicsMaterial` asset. The backend owns that default's lifetime, so destroying one Engine does not invalidate default shapes in another Engine using the same backend. `getInstanceMaterial(engine)` creates and retains an independent, Engine-owned material on demand; if a material is already assigned, its owner must match the supplied Engine. Subsequent calls reuse the instance until another material or null is assigned.

`destroy()` refuses to release a referenced material. `destroy(true)` forces destruction and follows the normal end-of-frame destruction rules. Shapes reject materials that are destroyed or pending destruction.

All coefficients must be finite. Bounciness is clamped to `[0, 1]`; friction is clamped to non-negative values and may exceed 1. Combine modes must be members of `PhysicsMaterialCombineMode`.

### Migration

Pass the Engine to `new PhysicsMaterial(engine)` and `shape.getInstanceMaterial(engine)`. Scene and Prefab files should reference `.physMat` assets through `$ref`; inline `$type: "PhysicsMaterial"` construction without an Engine is no longer supported. Asset loaders supply their Engine automatically.
