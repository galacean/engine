# Collider re-enable teleport regression test

> Status: implemented on `fix/physics-kinematic-sync` and tracked by draft PR #3041; not yet part of `dev/2.0`.

## Context

Commit `bab0ae0a2` fixes a PhysX lifecycle bug where a disabled collider's native
actor is removed from the simulation scene but keeps its old native pose. When a
kinematic dynamic collider is re-enabled after its entity transform changed, the
first transform sync must not use `setKinematicTarget`, otherwise PhysX treats it
as a swept move from the stale pose and can emit spurious contacts.

## Test added

- `tests/src/core/physics/DynamicCollider.test.ts` now covers a kinematic
  `DynamicCollider` in `Target` sync mode.
- The test disables the entity, moves its transform while inactive, re-enables it,
  then verifies the first physics update calls native `setWorldTransform` exactly
  once and does not call native `move`.
- A temporary local red-check that removed the pending re-enter teleport failed
  with `expected 1 to equal +0` for `moveCalls`, proving the test catches the old
  sweep path.

## Naming cleanup

The transient collider state is named `_pendingReenterTeleport` rather than
`_pendingReenterSync` because the important behavior is not generic transform
sync. It specifically forces the first sync after re-entering the physics scene
to use teleport semantics instead of swept kinematic target movement.

## Verification

- `pnpm vitest run tests/src/core/physics/DynamicCollider.test.ts -t "teleports kinematic target collider"`
- `pnpm vitest run tests/src/core/physics/DynamicCollider.test.ts`

Both passed after restoring the engine fix.
