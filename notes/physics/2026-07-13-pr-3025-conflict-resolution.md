# PR 3025 conflict resolution

PR #3025 was based on `v2.0.0-alpha.35`. The current `dev/2.0` branch has since removed the entire `physics-lite` backend in #3053, producing a modify/delete conflict in `LitePhysicsScene.ts` because the PR had added a no-op `setContactEventEnabled` implementation there.

The conflict was resolved by keeping the backend deletion. Contact-event demand remains an optional `IPhysicsScene` capability implemented by the active PhysX backend, so retaining an orphaned lite implementation would contradict the current architecture.

The post-merge review also collapsed contact-demand ownership to one dirty bit in `PhysicsScene`. `Script` owns the callback predicate, `PhysicsScene` rescans active collider scripts only after lifecycle invalidation, and the native backend owns the current enabled state. This removes duplicated predicates and Core-side cache state without replacing the exact scan with a lossy scene-wide counter.

Verification:

- `pnpm run b:module`
- `pnpm run b:types`
- `pnpm vitest run tests/src/core/physics/PhysicsScene.test.ts tests/src/core/physics/Collision.test.ts` (55 passed)
- `git diff --check`
