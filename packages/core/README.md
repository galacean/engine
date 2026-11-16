A subpackage of `@galacean/engine`.

## Physics materials

`PhysicsMaterial` is a reference-counted resource. Each `ColliderShape` retains its material, including while detached from a collider. Replacing a material or destroying the shape releases that reference. Cloning an entity shares its shapes' materials and acquires the corresponding references.

- `new PhysicsMaterial()` creates a material independent of an Engine. It can be shared by engines using the same physics backend. Its last released reference destroys it immediately; an unused material that has never been assigned should be explicitly destroyed.
- `new PhysicsMaterial(engine)` registers the material with that engine's resource manager. Its lifetime follows ordinary resource GC, caching, and engine destruction. Asset loaders use this form. Such a material should be used within its owning engine.

`destroy()` refuses to release a referenced material. `destroy(true)` forces destruction and, for engine-owned materials, follows the normal end-of-frame destruction rules. Shapes reject materials that are destroyed or pending destruction. Existing no-argument constructors for materials and shapes remain available.

All coefficients must be finite. Bounciness is clamped to `[0, 1]`; friction is clamped to non-negative values and may exceed 1. Combine modes must be members of `PhysicsMaterialCombineMode`.
