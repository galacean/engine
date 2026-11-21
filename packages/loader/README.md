A subpackage of `@galacean/engine`.

Hierarchy loading applies structural overrides before resolving component properties and calls. References preserve their component and child indices across removals. Component indices follow the template order with additions appended. Scene and Prefab loading share this lifecycle.

## Physics material files

`.physMat` files contain a JSON object with optional `bounciness`, `staticFriction`, `dynamicFriction`, `bounceCombine`, and `frictionCombine` fields. Omitted fields retain `PhysicsMaterial` constructor defaults. Loaded materials belong to the loading Engine and participate in resource caching, GC, and Prefab dependency retention. Destroying a loaded material removes its URL cache entry so the next load creates a new resource. Scene and Prefab data reference these assets with `$ref`; inline `$type: "PhysicsMaterial"` construction cannot supply the required Engine owner.
