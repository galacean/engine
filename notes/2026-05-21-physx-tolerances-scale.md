# PhysX tolerance scale configuration

## Context

Cocos 2D migration can run physics in pixel-like units. PhysX supports non-meter
unit systems through `PxTolerancesScale`, but Galacean previously always created
PhysX with default `length=1` and `speed=10`.

## Code facts

- `PhysXPhysics._init()` creates one `PxTolerancesScale`, then passes it to both
  `PxCreatePhysics` and `PxCookingParams`.
- PhysX requires scene scale to match the scale used to create `PxPhysics`.
- PhysX derives defaults such as contact offset and sleep threshold from this scale.
- Galacean core previously stored fixed defaults:
  - `ColliderShape._contactOffset = 0.02`
  - `DynamicCollider._sleepThreshold = 0.005`
  and synced them unconditionally to native, overriding scaled PhysX defaults.

## Fix

- `PhysXPhysics` now accepts `PhysXPhysicsOptions.tolerancesScale`.
- The scale is applied before creating `PxPhysics` and `PxCookingParams`.
- `PhysXPhysics` exposes scaled default contact offset and sleep threshold.
- Core `ColliderShape` and `DynamicCollider` leave native defaults untouched unless
  the user explicitly sets `contactOffset` or `sleepThreshold`.

## Boundary

This change does not scale damping or solver iterations. Those are not PhysX
tolerance defaults. Callers should still set explicit damping only when the
source project authored it.
