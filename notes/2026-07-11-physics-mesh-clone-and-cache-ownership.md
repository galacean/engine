# Physics mesh clone and cache ownership

## Context

CatchPig's converted 2D polygon colliders exercise dynamic prefab cloning, convex mesh cooking, non-unit scale, and project-specific PhysX tolerance scale. Open PR `galacean/engine#3042` addressed the same mesh-shape and scaled-default boundary and was integrated before local follow-up work.

## Integrated upstream commits

- `fix(physics): rebuild mesh shapes and scaled defaults`
- `fix(physics): keep mesh recooking transactional`

The integration preserved the current `dev/2.0` PhysX CDN configuration and the removal of physics-lite.

## Follow-up design

- `Collider` is the sole owner of native shape attachment and detachment.
- `ColliderShape` records whether its native shape is currently attached.
- `MeshColliderShape` clone and recook paths construct detached native shapes; Collider attaches each shape exactly once.
- Mesh recooking remains transactional: a failed cook retains the previous usable native shape.
- Mesh resource references are balanced across clone and destroy.
- `DynamicCollider` copies explicit center of mass and inertia tensor only when the corresponding automatic mode is disabled.
- `ResourceManager.getFromCache` normalizes virtual paths through the same remote-URL mapping as load requests.

## Verification

- Module and declaration builds passed.
- Focused suites passed 78 tests total: MeshColliderShape 31, DynamicCollider 31, ResourceManager 16.
- Tests cover delayed mesh assignment, inaccessible meshes, failed recooking, exact native attach/detach counts, clone ref-count balance, and virtual-path cache lookup.
- CatchPig ran with gravity `y = -640`, tolerance scale `{ length: 32, speed: 640 }`, 30 attached dynamic colliders, stable bounds, and successful pointer-driven gameplay after Editor selector lowering was corrected.
