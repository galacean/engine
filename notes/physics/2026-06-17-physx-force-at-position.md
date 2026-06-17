# PhysX Force At Position

## Context

`DynamicCollider.applyForceAtPosition` was previously a JS-side decomposition opportunity: a world-space force at a world-space position can be represented as `addForce(force)` plus `addTorque((position - centerOfMass) x force)`.

For the long-term API, this should live in the PhysX binding instead. PhysX already provides `PxRigidBodyExt::addForceAtPos` and related helpers, and exposing them avoids duplicating center-of-mass and coordinate-space rules in engine TypeScript.

## Change

- `physX.js` exposes the common rigid body extension helpers for world/local force, impulse, and velocity-at-position queries.
- Engine adds `DynamicCollider.applyForceAtPosition(force, position)` as the public world-space force-at-position API.
- The PhysX backend delegates directly to `PxRigidBody.addForceAtPos`.
- The lite backend keeps the same unsupported-physics behavior as `addForce` and `addTorque`.
- The default PhysX runtime URLs now point at the CDN upload produced from the same wasm build, so `new PhysXPhysics()` loads a runtime that includes `addForceAtPos`.

## Rollout Gate

`DynamicCollider.applyForceAtPosition` depends on a new PhysX binding. Tests pin the local runtime to avoid depending on CDN state, but the default user path still loads `PhysXPhysics` runtime URLs from CDN. Before merging or releasing this change, the default CDN runtime must be updated and smoke-tested for `PxRigidDynamic.prototype.addForceAtPos`.

## Verification

- Built `physX.js` release and SIMD release wasm with the default LTO configuration using `emmake make -j1`.
- Smoke-tested the generated runtime: `PxRigidDynamic.prototype` exposes `addForceAtPos`, local force/impulse helpers, and velocity-at-position helpers.
- Uploaded the four runtime files as one zip to CDN so the JS and wasm sidecars share the same URL directory.
- Verified the CDN serves JS as `application/x-javascript`, wasm as `application/wasm`, and allows cross-origin fetches.
- Smoke-tested both default CDN JS URLs in Chromium: `PxRigidDynamic.prototype.addForceAtPos`, `addImpulseAtPos`, and `getVelocityAtPos` are functions after wasm initialization.
- Rebuilt engine module output with `npm run b:module`.
- Ran `HEADLESS=true pnpm exec vitest run --config tests/vitest.config.ts tests/src/core/physics/DynamicCollider.test.ts`: 27 passed.
- Ran `HEADLESS=true pnpm exec vitest --coverage tests/src/core/physics/DynamicCollider.test.ts`: 27 passed.
- Ran `npm run coverage`: 111 files and 1450 tests passed.
- Ran `npm run b:types`.
