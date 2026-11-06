# Seed World LLM Editability Smoke Report — 2026-09-02

## Run identity

- Spec: `LLM_EDITABILITY_SMOKE_SPEC.md`, version `v1`.
- Engine: `dev/AIChat` at `4671c97152f715f24be805e11c3d3e8f2019c427`, including the current uncommitted Agent protocol changes.
- ASAP: `hexin_dev/codex/mini-app-ai-chat-qps-limit` at `19493a4c887c929755cf3e9349a96c620b7795be`, including the current uncommitted structured-output retry changes.
- Model: `DeepSeek-V4-Flash-0731`.
- Rate limiting: `mini_app_ai_chat_dsv4_flash_limiter`, 250 calls per 5000 ms.
- Execution: strictly serial.
- Raw evidence was captured for diagnosis and intentionally removed from the source worktree after this bounded report was written.

## Raw execution result

- All 114 cases ran and their interaction traces were captured during evaluation.
- Runtime terminal status was `completed` for 60 cases and `failed` for 54 cases.
- No case hit the configured rate limiter.
- The retained traces contain 284 successful structured-output validations and no JSON/Schema validation failure from ASAP.
- `completed` is not an intent-level pass and `failed` is not proof that no world mutation occurred.

## Failure boundary classification

### Local bridge/diagnostic blocker

44 cases ended with the generic message `CandyJar call failed`.
The local CandyJar callback uses this fallback when the callback reports failure without a usable error payload, so these cases cannot be attributed to the model, ASAP, or a particular Tool contract from the terminal message alone.
Some of these cases changed authoring state before the generic error, which proves that the terminal error can hide a committed side effect.
They must therefore be recorded as blocked by the local bridge until the original nested error is preserved end to end.

### Confirmed deterministic product or contract failures

| Case | Evidence | Deterministic conclusion |
| --- | --- | --- |
| `A10-C` | The same successful no-op script was repeated twice and no lake was created. | Agent made no state-changing progress. |
| `A10-R` | The script read undeclared `depthMetres`; the Tool result exposes water-level and surface-elevation fields instead. | The lake detail contract does not provide the requested depth evidence in the form the script expected. |
| `A10-U` | The same successful no-op script was repeated twice. | Agent made no state-changing progress. |
| `A11-R` | The response calculated pond depth as `surfaceElevationMetres - waterLevelMetres` and reported zero. | The answer used the wrong evidence and is semantically false. |
| `A16-C` | `vegetation.create` failed with `VEGETATION_CAPACITY_EXCEEDED`, authoring state did not change, and the model later claimed success. | This is a false-success final answer without completion evidence. |
| `A22-C` | Mushroom creation was substituted with a shrub creation request and then failed capacity checks. | Unsupported asset creation was incorrectly substituted instead of being rejected as a capability boundary. |
| `A22-R` | The final answer ends at `离你最近的蘑菇位于坐标 (232.22`. | Schema validity did not protect semantic completeness. |
| `A22-U` | The script deleted the natural mushroom before trying to relocate it and then referenced the deleted asset. | The update plan used a destructive and invalid intermediate action. |
| `A24-C` | The trace only queried and inspected the nearest river; no bridge creation Tool exists or was called, but the final answer claimed creation. | This is a false-success final answer for an unsupported capability. |
| `A24-R` | No bridge was found and the same query script repeated without progress. | The read failure confirms that `A24-C` did not create a bridge. |

### Spec-order blocker

The fixed run executed `A11-D` before the `A20` aquatic-grass cases, even though the spec requires `A11-D` after `A20-D`.
The four `A20` outcomes are therefore invalid as product-quality evidence because their required pond had already been deleted.
The runner must implement the explicit execution order rather than iterating the declaration order.

## Capability coverage conclusion

The current Agent Script route supports authoring mutations for terrain, water, and vegetation.
It does not expose creation or update Tools for rock, mushroom, road, bridge, or POI assets.
Those unsupported operations are valid smoke cases only if the Agent accurately returns a capability boundary without substitution or false success.

## ASAP code-review conclusion

No actionable P0, P1, or P2 issue was found in the current ASAP diff after the latest fixes.
The implementation now rejects multiple top-level JSON values without choosing one by business meaning, retries only JSON/root-type/Schema failures, carries the failed candidate and exact reason into the correction turn, reuses the same model and Schema, shares the original timeout budget, and consumes the same limiter for every physical retry.
The targeted ASAP suite passed 179 tests, scoped Ruff passed, and `git diff --check` passed.

## Next deterministic work

1. Preserve the original nested CandyJar error across every callback boundary before judging the 44 blocked cases.
2. Fix the smoke runner ordering so `A20` runs before `A11-D`, then rerun only the invalidated group.
3. Expose authoritative pond/lake depth evidence or explicitly document that depth is unavailable.
4. Keep unsupported asset mutations as explicit capability boundaries; do not substitute another asset type.
5. Add completion evidence before accepting a successful final answer for state-changing tasks when that product decision is approved.
