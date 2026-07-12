# RFC: Physics fixed-step catch-up cap

> Status: resolved locally by `a18a3d4a2` with `PhysicsScene.maximumDeltaTime`. The proposed
> `maxSubSteps` API was not adopted.

## Resolution

The implemented boundary caps the frame delta admitted into the fixed-step accumulator:

```ts
const simulateTime = this._restTime + Math.min(deltaTime, this._maximumDeltaTime);
```

This follows Unity's maximum-delta model, preserves unlimited catch-up by default with
`Infinity`, and avoids adding a second step-count API. Migration callers can set
`maximumDeltaTime` explicitly when source-runtime compatibility requires a cap.

## Problem

`PhysicsScene._update(deltaTime)` currently consumes all accumulated fixed steps in a single engine frame:

```ts
const simulateTime = this._restTime + deltaTime;
const step = Math.floor(simulateTime / fixedTimeStep);
this._restTime = simulateTime - step * fixedTimeStep;
```

This is mathematically valid for simulation catch-up, but it has no public cap. When frame time fluctuates around `fixedTimeStep`, gameplay code that writes forces or velocity in `onPhysicsUpdate()` can observe uneven render-frame motion such as:

```text
0 physics step in one render frame
2 physics steps in the next render frame
```

The issue is not specific to migration. Any Galacean project that drives gameplay through `onPhysicsUpdate()` can hit the same tradeoff between simulation catch-up and render-frame smoothness.

## External references

Unity exposes this concept through `Time.fixedDeltaTime` plus `Time.maximumDeltaTime` / Project Settings `Maximum Allowed Timestep`.

Unity's docs describe that:

- fixed updates can backlog when frame rate is lower than the fixed timestep rate
- Unity executes multiple fixed updates to catch up
- there is a maximum timestep period beyond which Unity does not keep catching up
- `Maximum Allowed Timestep` caps the worst-case time spent on physics and FixedUpdate in a low-frame-rate frame

Cocos Creator 3D also exposes the concept directly as `PhysicsSystem.maxSubSteps`; in Cocos Creator 3.8.8 the default is `1`.

## Proposed engine capability

Add a public physics catch-up cap to Galacean, for example:

```ts
class PhysicsScene {
  fixedTimeStep: number;
  maxSubSteps: number;
}
```

Suggested semantics:

```ts
const rawStep = Math.floor((restTime + deltaTime) / fixedTimeStep);
const step = Math.min(rawStep, maxSubSteps);
restTime = simulateTime - step * fixedTimeStep;
```

Open default-value question:

- `Infinity` preserves current Galacean behavior and makes this a non-breaking API addition.
- `Math.floor(engine.time.maximumDeltaTime / fixedTimeStep)` aligns with Unity's `maximumDeltaTime` style, but changes behavior if applied by default.
- `1` matches Cocos Creator's default, but would be a behavioral change for native Galacean projects.

Conservative recommendation: add `maxSubSteps` as engine API with a non-breaking default first, then let migration/runtime layers explicitly set it to Cocos defaults when needed.

## Non-goals

- Do not solve render interpolation in this RFC.
- Do not change `Engine.targetFrameRate` or vSync behavior in the same change.
- Do not silently change native Galacean projects' physics catch-up behavior without a compatibility decision.

## Validation plan

Add focused engine tests for:

- `maxSubSteps = Infinity` preserves current multi-step catch-up behavior.
- `maxSubSteps = 1` executes at most one `onPhysicsUpdate()` and one native physics update per engine update.
- accumulated `restTime` is preserved when the cap prevents full catch-up.
- `maxSubSteps = 0` disables fixed-step simulation while preserving accumulated time, or is rejected/clamped depending on the chosen API contract.

## Migration relevance

For migrated Cocos projects, the migration compat layer can set `scene.physics.maxSubSteps = 1` to match Cocos 3D default behavior. That should be explicit migration policy, not an implicit engine default forced onto all Galacean projects.
