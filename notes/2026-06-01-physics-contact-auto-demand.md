# Physics contact event auto demand

> Status: implemented on `fix/physics-shaderlab-split` and tracked by draft PR #3025; not yet
> part of `dev/2.0`. The physics-lite no-op described below belongs to the pre-#3053 base and
> must be dropped when the PR rebases onto the current branch.

## Problem

CatchPigGame dense 2D physics traces showed a large share of time under PhysX `fetchResults`, specifically the JS contact callback path:

```text
PhysXPhysicsScene.update
  _fetchResults
    onContactPersist
      _bufferContactEvent
        copy contact points from WASM to JS
```

The affected migrated scene had no active collision callbacks. The engine still requested and buffered every contact event, so dense resting contacts paid event-marshalling cost even when no script could consume those events.

## Root Cause

`physX.js` currently configures non-trigger pairs with contact notification flags in its simulation filter shader:

```text
eCONTACT_DEFAULT
eNOTIFY_TOUCH_FOUND
eNOTIFY_TOUCH_PERSISTS
eNOTIFY_TOUCH_LOST
eNOTIFY_CONTACT_POINTS
```

Galacean then unconditionally copied those reports into `_contactEvents` in `PhysXPhysicsScene._bufferContactEvent()`.

This was a systemic engine boundary issue: the Core layer already knows which active `Script` instances can receive `onCollisionEnter`, `onCollisionStay`, or `onCollisionExit`, but the native physics scene had no demand signal for contact buffering.

## Fix

Add an explicit native physics scene demand API:

```ts
IPhysicsScene.setContactEventEnabled(enabled: boolean): void
```

Core synchronizes contact-event demand immediately before each fixed physics step and only
rescans consumers after script or collider lifecycle changes mark the cache dirty:

- scan collider entities' active `entity._scripts`
- compare collision lifecycle methods against `Script.prototype`
- enable contact buffering only if at least one active script overrides `onCollisionEnter`, `onCollisionStay`, or `onCollisionExit`

PhysX honors that demand by skipping `_bufferContactEvent()` when disabled and clearing stale contact count on disable. Physics-lite implements the API as a no-op because it only produces trigger events.

This keeps trigger events unchanged and preserves collision callbacks for projects that actually declare them.

## Why This Is Not A Workaround

The previous migration-layer mitigation monkey-patched the private PhysX `_bufferContactEvent` method based on generated config. That fixed one class of migrated output but depended on private engine internals.

The engine fix moves the policy to the owning layers:

- Core owns script lifecycle and can know whether collision callbacks exist.
- Design exposes a backend-agnostic demand API.
- PhysX owns whether to buffer contact reports.

No project-specific or migration-specific data is needed.

## Boundary

This avoids the expensive JS-side buffering and contact-point copying when there is no consumer. It does not yet change the underlying `physX.js` simulation filter shader, which still asks native PhysX to produce contact reports for non-trigger pairs. A deeper future optimization could add native pair-flag demand support in `physX.js`, but that requires changing the wrapper/filter-shader layer rather than the Galacean TypeScript packages.

## Files

- `packages/design/src/physics/IPhysicsScene.ts`
- `packages/core/src/physics/PhysicsScene.ts`
- `packages/physics-physx/src/PhysXPhysicsScene.ts`
- `packages/physics-lite/src/LitePhysicsScene.ts`
- `tests/src/core/physics/PhysicsScene.test.ts`

## Verification

Passed:

```bash
pnpm -r --filter @galacean/engine-design --filter @galacean/engine-core --filter @galacean/engine-physics-lite --filter @galacean/engine-physics-physx run b:types
pnpm exec eslint packages/core/src/physics/PhysicsScene.ts packages/physics-physx/src/PhysXPhysicsScene.ts packages/physics-lite/src/LitePhysicsScene.ts packages/design/src/physics/IPhysicsScene.ts tests/src/core/physics/PhysicsScene.test.ts --ext .ts
```

Targeted Vitest command was attempted but blocked before tests executed by the local Rollup native optional dependency being rejected by macOS system policy:

```text
Error: Cannot find module @rollup/rollup-darwin-arm64
cause: ERR_DLOPEN_FAILED ... library load denied by system policy
```

The new tests cover:

- no active collision callback -> native contact events are disabled
- active collision callback -> native contact events are enabled
- disabling that script -> native contact events are disabled again
- trigger-only callbacks -> native contact events remain disabled
