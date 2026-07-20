# Water buoyancy runtime

This directory contains the P0 buoyancy capability incubated inside `@galacean/world-gallery/demos/water-pcg`. It is an internal water-pcg runtime, not a published Galacean API and not a provisional `@galacean/engine-water` package. River, Heightfield, Ocean, authoring, runtime, debugging, and performance behavior will be completed and validated here before package extraction is evaluated separately.

“Engine-level” in this directory means that lifecycle, transforms, math, physics state, and point-force application reuse Galacean's existing public capabilities. It does not mean that water-pcg may reach into a native physics backend or that the current TypeScript contracts are already stable public API.

## P0 capability

P0 uses one to eight caller-authored spherical Pontoons to approximate displaced volume. During each normal Galacean fixed physics step, `WaterBuoyancy` (except the one guarded callback after `notifyTeleported()`):

1. transforms each enabled Pontoon center from entity-local to world space;
2. queries the current macro surface through a `WaterSurfaceProvider`;
3. computes sphere-cap immersion and a radius-cubed share of body weight;
4. computes vertical damping from the Pontoon's linear and angular point velocity;
5. applies the bounded force with `DynamicCollider.applyForceAtPosition()`.

Multiple point forces naturally produce roll and pitch correction. P0 does not add a separate upright torque. Force is parallel to anti-gravity, not to the sampled surface normal, and horizontal current/drag is not applied yet.

The current files are:

- `BuoyancySolver.ts`: backend-independent, allocation-free point-force math;
- `WaterBuoyancy.ts`: Galacean `Script` integration and fixed-step orchestration;
- `types.ts`: Pontoon, solver input/output, and scratch contracts;
- `../query/WaterSurfaceProvider.ts`: internal caller-owned surface sample contract;
- `../river/RiverWaterSurfaceProvider.ts`: the P0 dynamic River adapter.

## Usage

The entity must already belong to a Galacean scene with physics initialized. `WaterBuoyancy` and a non-kinematic `DynamicCollider` must be on the same entity, and the collider must have at least one shape.

```ts
import { BoxColliderShape, DynamicCollider, Vector3 } from "@galacean/engine";
import { WaterBuoyancy } from "./runtime/buoyancy/WaterBuoyancy";
import { RiverWaterSurfaceProvider } from "./runtime/river/RiverWaterSurfaceProvider";

// `riverRuntime` is an activated RiverRuntimeController whose render/query
// feature flags and surface clock are already configured by the water runtime.
const body = floatingEntity.addComponent(DynamicCollider);
body.mass = 40;

const shape = new BoxColliderShape();
shape.size.set(3.2, 1, 4.6);
body.addShape(shape);

const buoyancy = floatingEntity.addComponent(WaterBuoyancy);
buoyancy.surfaceProvider = new RiverWaterSurfaceProvider(riverRuntime);
buoyancy.buoyancyCoefficient = 2;
buoyancy.verticalDamping = 1.5;
buoyancy.maxForceMultiplier = 4;
buoyancy.pontoons = [
  { localPosition: new Vector3(-1.1, -0.3, -1.6), radius: 0.7, enabled: true },
  { localPosition: new Vector3(1.1, -0.3, -1.6), radius: 0.7, enabled: true },
  { localPosition: new Vector3(-1.1, -0.3, 1.6), radius: 0.7, enabled: true },
  { localPosition: new Vector3(1.1, -0.3, 1.6), radius: 0.7, enabled: true }
];
```

`surfaceProvider` is explicit. P0 has no scene-wide registry and does not search for or blend overlapping water bodies automatically. The River adapter reads the controller's active query service on every call so a runtime replacement does not leave the component with a stale query service.

## Galacean capability boundary

The runtime must use the public behavior of the existing Galacean stack:

- `Script.onPhysicsUpdate()` for fixed-step lifecycle;
- `Scene.physics.gravity` and the engine-owned physics step;
- `DynamicCollider.mass`, `linearVelocity`, `angularVelocity`, `centerOfMass`, `isKinematic`, and `applyForceAtPosition()`;
- `Entity`/`Transform.worldMatrix`/`Transform.lossyWorldScale` for spatial state;
- `Vector3` and other Galacean math types for all vector operations;
- the public `PhysXPhysics` adapter only when a demo bootstraps the currently selected Galacean physics backend.

The buoyancy solver and component must not:

- access `_nativeCollider`, `Engine._nativePhysics`, Px objects, or any other native/private physics state;
- import implementation files through `packages/*/src` or depend on `@galacean/engine-design` backend contracts;
- create their own `requestAnimationFrame`, timer, task runner, or physics loop;
- integrate position, rotation, linear velocity, or angular velocity directly to imitate a physics result;
- overwrite the body's global `linearDamping` or `angularDamping`;
- modify `packages/core`, `packages/design`, or `packages/physics-physx` to add water-specific semantics.

The backend may currently be PhysX, but that fact is confined to engine/demo bootstrap. `WaterBuoyancy` only consumes Galacean collider and scene APIs.

## Units, coordinates, and fixed-step semantics

- Pontoon `localPosition` is entity-local. Provider positions, sampled surface data, center of mass after transformation, forces, and force application points are world-space.
- Distances use Galacean world units. Linear and water velocities use world units per second; this module does not assume that one world unit is one meter.
- `DynamicCollider.angularVelocity` is degrees per second. `BuoyancySolver` converts it to radians per second exactly once before evaluating `omega x (point - centerOfMass)`.
- `onPhysicsUpdate()` is called by Galacean before each fixed simulation step. `applyForceAtPosition()` submits a continuous force, so the component must not multiply the force by `fixedTimeStep` or render-frame `deltaTime`.
- `WaterSurfaceSample.surfacePosition`, `surfaceNormal`, and `waterVelocity` are caller-owned world-space values. Providers mutate the supplied storage and do not replace its vector instances.

## Pontoon configuration and scaling

The valid configured range is one to eight Pontoons. Four equal Pontoons near the body's corners are the default recommendation for a box or simple boat. Eight is a hard hot-path budget: an oversized array reports `invalid-pontoon-count` and skips buoyancy for that fixed step instead of silently truncating the configuration.

The component transforms a Pontoon center with the entity's full world matrix. Because a Pontoon remains a sphere, its world radius is:

```text
worldRadius = localRadius * max(abs(lossyWorldScale.x),
                                abs(lossyWorldScale.y),
                                abs(lossyWorldScale.z))
```

This matches Galacean's conservative sphere scaling behavior under non-uniform scale and avoids introducing an ellipsoid solver. Debug views should display the resulting world radius so non-uniform scale is visible during authoring.

The component defaults are:

| Setting | Default | Meaning |
| --- | --: | --- |
| `buoyancyCoefficient` | `2` | Equal-weight Pontoons produce roughly one body weight in total near half immersion. |
| `verticalDamping` | `1.5` | Damps Pontoon velocity relative to the moving surface along anti-gravity. |
| `maxForceMultiplier` | `4` | Caps each point force relative to that Pontoon's radius-cubed share of body weight. |

These are stable starting values, not universal material constants. Tune Pontoon placement and radius first, then buoyancy, damping, and the safety cap. Mass-normalized force makes the same preset usable over a useful mass range, but very different hull proportions still require authoring.

## Providers and current water support

`RiverWaterSurfaceProvider` is the only P0-certified dynamic provider. It uses `RiverRuntimeController.sampleActiveSurface()` so physics follows the same:

- active River resource after runtime replacement;
- macro-displacement enable state and quality fallback;
- elapsed/overridden surface time;
- normalized static surface offset;
- actual River footprint rather than a broad candidate hit.

The bounded `FlatWaterSurfaceProvider` in the buoyancy demo is a control fixture, not a production water-body implementation.

Heightfield currently exposes only its static base-surface query. It does not provide a world-space inverse query for the final visible Gerstner surface, so P0 does not certify dynamic Heightfield buoyancy. Ocean is render-only and has no runtime surface provider. Do not substitute GPU readback, shader micro-normal, or rest-space Gerstner forward evaluation and claim render/physics parity.

## Allocation and performance contract

After construction and caller configuration, the normal fixed-step path reuses its input, output, scratch vectors, surface sample, Pontoon states, and metrics. Providers must follow the same caller-owned-output rule. Do not allocate arrays, objects, or vectors per query or per physics step.

Cost is approximately:

```text
active floating bodies x enabled valid Pontoons x provider query cost
```

Each enabled valid Pontoon can issue one scalar surface query per fixed step, including while it is horizontally outside the water. The component exposes `lastStepQueryCount`, `lastStepAppliedForceCount`, stable `pontoonStates`, and `isInWater` for verification. Set `profilingEnabled = true` only while measuring; `profilingMetrics` then reports query, solver, force-application, and total time for the latest step. The validation page profiles multi-tributary reach `1/20/100 × 4`, reach `20 × 8`, and junction `100 × 4` cases and records P50/P95 instead of assuming a device-independent millisecond budget.

The 2026-07-20 local headed-Chromium baseline was:

| Surface and load   | Queries/step |  Query P50/P95 |  Total P50/P95 | Fixed-step share P95 |
| ------------------ | -----------: | -------------: | -------------: | -------------------: |
| Reach `1 × 4`      |            4 | `0.1 / 0.2 ms` | `0.1 / 0.2 ms` |               `1.2%` |
| Reach `20 × 4`     |           80 | `2.8 / 3.1 ms` | `3.1 / 3.5 ms` |              `21.0%` |
| Reach `100 × 4`    |          400 | `7.5 / 8.0 ms` | `8.4 / 8.5 ms` |              `51.0%` |
| Reach `20 × 8`     |          160 | `3.8 / 4.3 ms` | `4.2 / 4.5 ms` |              `27.0%` |
| Junction `100 × 4` |          400 | `6.7 / 7.1 ms` | `7.4 / 7.5 ms` |              `45.0%` |

The steady-state allocation probe prewarms 100 bodies × 4 Pontoons, disables component profiling, then observes an undisturbed three-second window. CDP heap sampling attributed `0 B` to `water-pcg/runtime`, while the public PhysX bridge accounted for `16,464 B` of `33,580 B` sampled page allocations. Forced-GC heap usage ended `238,508 B` below the pre-window baseline; tracing observed 360 minor and one major GC across the whole instrumented page. This supports the feature-owned “no per-step object/array/Vector allocation” contract together with source review and identity-reuse tests. It does not claim that Galacean rendering, DevTools instrumentation, or the required PhysX public bridge allocates zero bytes.

## Teleport and callback-order limitation

Galacean calls scripts before it synchronizes colliders and advances the native simulation for that fixed step. If another script teleports the entity during the same `onPhysicsUpdate()` phase, the new Pontoon world positions can briefly disagree with the native body's current pose and produce an incorrect lever arm.

Do not use fixed-step teleport as ordinary movement. For an intentional discontinuous reset, notify buoyancy before applying the caller-owned pose and velocity changes:

```ts
buoyancy.notifyTeleported();
floatingEntity.transform.setPosition(resetPosition.x, resetPosition.y, resetPosition.z);
floatingBody.linearVelocity.copyFrom(resetLinearVelocity);
floatingBody.angularVelocity.copyFrom(resetAngularVelocity);
```

The next `WaterBuoyancy.onPhysicsUpdate()` clears the previous Pontoon/debug counters and performs zero Provider queries and zero force submissions. Galacean can then synchronize the collider pose; buoyancy resumes automatically on the following fixed step. Multiple `notifyTeleported()` calls before the skipped callback coalesce into one skipped step.

`notifyTeleported()` does not move the entity, change either collider velocity, or access/synchronize native physics state. The caller remains responsible for the transform and desired velocities, using Galacean public APIs as shown above. P0 does not change global callback order or add a private pose synchronization hook.

## Debugging and verification

Run the focused checks from the repository root:

```sh
pnpm -C world-gallery typecheck:water-pcg
pnpm -C world-gallery test:water-pcg
```

Start the gallery and open the standalone page:

```text
/demos/water-pcg/buoyancy/
```

The page provides a bounded static one-Pontoon control and a four-Pontoon dynamic River scenario, perturb/reset controls, Pontoon/surface/force debug geometry, and the five-case load matrix. Its browser smoke also creates short-lived integration fixtures for kinematic skipping, transformed-parent coordinates/radius, offshore rejection, and dynamic River re-immersion. The wake fixture remains dry and sleeping for at least five Galacean fixed steps at a measured low surface time, then switches the same Reach point to a measured high surface time and requires the public Pontoon point force to wake PhysX. Inspect:

- `isInWater`, `lastStepQueryCount`, and `lastStepAppliedForceCount`;
- `pontoonStates[i]` for hit, immersion, world radius, vertical speed, and force;
- `lastDiagnostic` for deduplicated configuration diagnostics;
- fixed-time River surface/probe agreement and the absence of force outside the actual River footprint;
- recovery from roll/pitch disturbance without an explicit upright torque;
- actual render update counts at 30/60/120 targets while the physics fixed step remains unchanged;
- root/Heightfield request logs proving that existing water pages do not load PhysX;
- browser console errors and source-attributed steady-state allocation/GC behavior.

The render-parity gate compares Provider height against the CPU mirror of the actual mesh attributes consumed by the River shader. The query service evaluates the visible reach/junction triangle with barycentric interpolation, resolves overlapping dynamic surfaces to the highest visible surface, and rejects exact bank-boundary vertices because Provider `true` means strictly inside the water footprint. The focused parity suite covers curved River, multi-tributary overlap/junctions, lake, and pool fixtures; the standalone browser page repeats the current curved-River check against real uploaded render data. P0 retains a `0.05` world-unit ceiling even though the deterministic fixture suite currently resolves these sampled visible points exactly.

## P1 and extraction policy

P1 remains inside `world-gallery/demos/water-pcg`. Candidate work includes:

- render-matched dynamic Heightfield and Ocean providers;
- relative horizontal-flow drag, angular drag, River push/alignment, and optional downstream behavior;
- water enter/exit state, Pontoon-level FX hooks, wake/splash integration;
- multiple-water overlap, priority/exclusion, broad phase, and batch queries;
- profiling-driven manager/activation policy for larger body counts;
- profiling-driven River query indexing or batching if larger active ranges make the current visible-triangle scan a measured hotspot;
- optional Box/Sphere-assisted Pontoon authoring and more advanced hull models;
- serialization, deterministic behavior, and multi-backend validation.

Do not create or predeclare `@galacean/engine-water` as part of P0 or P1. Only after the complete water capability has stable contracts across River, Heightfield, and Ocean, real consumer evidence, and measured performance should a separate architecture decision evaluate whether to extract a package, what its boundary/name should be, and how compatibility will be maintained.
