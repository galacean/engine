# PR 3025 conflict resolution

PR #3025 was based on `v2.0.0-alpha.35`. The current `dev/2.0` branch has since removed the entire `physics-lite` backend in #3053, producing a modify/delete conflict in `LitePhysicsScene.ts` because the PR had added a no-op `setContactEventEnabled` implementation there.

The conflict was resolved by keeping the backend deletion. Contact-event demand remains an optional `IPhysicsScene` capability implemented by the active PhysX backend, so retaining an orphaned lite implementation would contradict the current architecture.

Verification:

- `pnpm run b:module`
- `pnpm -F @galacean/engine-core run b:types`
- `pnpm vitest run tests/src/core/physics/PhysicsScene.test.ts tests/src/core/physics/Collision.test.ts` (55 passed)
- `git diff --check`
