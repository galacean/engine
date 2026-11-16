A subpackage of `@galacean/engine`.

Hierarchy loading creates all ordinary and instance-added components before resolving component properties and calls. References use the template component order plus additions; removals run afterward, so deleting a component does not shift a selector before its reference is resolved. Scene and Prefab loading share this lifecycle.

## Physics material files

`.physMat` files contain a JSON object with optional `bounciness`, `staticFriction`, `dynamicFriction`, `bounceCombine`, and `frictionCombine` fields. Omitted fields retain `PhysicsMaterial` constructor defaults. Coefficients must be finite numbers; combine modes use the numeric `PhysicsMaterialCombineMode` values. The runtime applies the same coefficient clamping as direct property assignment.

Loaded materials belong to the loading Engine and participate in resource caching, GC, and Prefab dependency retention. Invalid data rejects the load and releases any partially created material. Destroying a loaded material removes its URL cache entry so the next load creates a new resource. Scene and Prefab data reference these assets with `$ref`; inline `$type: "PhysicsMaterial"` construction cannot supply the required Engine owner.
