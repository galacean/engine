import {
  createWaterSemanticFieldSnapshot,
  type WaterSemanticFieldSnapshotV1
} from "@galacean/engine-water/water/runtime/index";
import { PromptNoiseGenerationWorkerClient } from "./PromptNoiseGenerationWorkerClient.ts";
import { resolvePromptNoiseRiverSet } from "@galacean/engine-world-planning/generation/noise/PromptNoiseRiverHydrologyResolver";
import type { PromptNoiseRiverWaterRuntime } from "./PromptNoiseRiverWaterRuntime.ts";
import type { PromptNoiseTerrainBinding } from "./PromptNoiseTerrainBinding.ts";
import type { PromptNoiseOperatorBoundsV1, PromptNoiseTerrainProgram } from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";
import {
  resolveWaterLayoutInvalidationBounds,
  type PromptNoiseWaterLayoutAuditV1,
  type PromptNoiseWaterLayoutCandidateV1
} from "./PromptNoiseWaterLayout.ts";

export interface PromptNoiseWorldRevisionSnapshotV1 {
  readonly activeRevision: number;
  readonly stagingRevision?: number;
  readonly semanticGeneration: number;
  readonly semanticSourceHash: string;
  readonly layoutEpoch: number;
  readonly layoutInvalidation: PromptNoiseOperatorBoundsV1 | null;
  readonly wetVegetationCount: number;
  readonly ordinaryPrefabCount: number;
  readonly excludedLayoutCandidateCount: number;
  readonly abortedRevisionCount: number;
  readonly staleRevisionCount: number;
  readonly rolledBackRevisionCount: number;
  readonly error: string | null;
}

/** Fully prepared, fallible work for one Prompt scene-consumer revision. */
export interface PreparedPromptNoiseSceneRevisionV1 {
  readonly revision: number;
  readonly audit: PromptNoiseWaterLayoutAuditV1;
  /** Infallible active-root swap performed with the other synchronous world publishes. */
  publish(): void;
  /** Idempotent disposal of a candidate that never became active. */
  rollback(): void;
}

/** Optional C2-D consumer kept behind the Terrain-owned world transaction. */
export interface PromptNoiseSceneRevisionConsumerV1 {
  prepare(
    program: PromptNoiseTerrainProgram,
    semanticField: WaterSemanticFieldSnapshotV1,
    revision: number,
    signal: AbortSignal
  ): Promise<PreparedPromptNoiseSceneRevisionV1>;
}

/** Terrain-layer candidate owner for Terrain, Water, Semantic Field, and Layout publication. */
export class PromptNoiseWorldRevisionCoordinator {
  private _activeRevision = 0;
  private _nextRevision = 1;
  private _stagingRevision?: number;
  private _semanticField = createWaterSemanticFieldSnapshot(0, "empty-water-semantic-field-v1", []);
  private _layoutAudit: PromptNoiseWaterLayoutAuditV1 = Object.freeze({
    semanticGeneration: 0,
    accepted: Object.freeze([]),
    excludedCount: 0,
    wetVegetationCount: 0,
    ordinaryPrefabCount: 0
  });
  private _layoutEpoch = 0;
  private _layoutInvalidation: PromptNoiseOperatorBoundsV1 | null = null;
  private _abortController?: AbortController;
  private _abortedRevisionCount = 0;
  private _staleRevisionCount = 0;
  private _rolledBackRevisionCount = 0;
  private _error: string | null = null;
  private _destroyed = false;

  constructor(
    private readonly _binding: PromptNoiseTerrainBinding,
    private readonly _water: PromptNoiseRiverWaterRuntime,
    private readonly _worker: PromptNoiseGenerationWorkerClient,
    private readonly _sceneConsumer?: PromptNoiseSceneRevisionConsumerV1
  ) {}

  get semanticField(): WaterSemanticFieldSnapshotV1 {
    return this._semanticField;
  }

  async stageAndCommit(program: PromptNoiseTerrainProgram): Promise<void> {
    this._assertActive();
    const revision = this._nextRevision++;
    this._abortController?.abort();
    this._water.cancelPending();
    const abortController = new AbortController();
    this._abortController = abortController;
    this._stagingRevision = revision;
    const previousSemantic = this._semanticField;
    let preparedScene: PreparedPromptNoiseSceneRevisionV1 | undefined;
    try {
      const resolved = resolvePromptNoiseRiverSet(program);
      const semanticField = createWaterSemanticFieldSnapshot(
        revision,
        resolved.sourceHash,
        resolved.rivers.map(({ semanticBody }) => semanticBody)
      );
      const invalidation = resolveWaterLayoutInvalidationBounds(
        previousSemantic.bodies.map(({ bounds }) => bounds),
        semanticField.bodies.map(({ bounds }) => bounds)
      );
      preparedScene = this._sceneConsumer
        ? await this._sceneConsumer.prepare(program, semanticField, revision, abortController.signal)
        : undefined;
      const layoutAudit = preparedScene
        ? preparedScene.audit
        : await this._worker.auditWaterLayout(semanticField, createWaterLayoutAuditCandidates(semanticField));
      this._throwIfStale(revision, abortController.signal);
      if (preparedScene && preparedScene.revision !== revision) {
        throw new Error(
          `Prompt scene consumer prepared revision ${preparedScene.revision} for world revision ${revision}.`
        );
      }
      if (layoutAudit.semanticGeneration !== semanticField.generation) {
        throw new Error("Prompt scene consumer published a mismatched Semantic Field generation.");
      }
      if (layoutAudit.wetVegetationCount !== 0 || layoutAudit.ordinaryPrefabCount !== 0) {
        throw new Error("Layout Worker published vegetation or ordinary prefabs inside Water.");
      }
      await this._water.synchronize(program, revision);
      this._throwIfStale(revision, abortController.signal);

      // All fallible asynchronous consumers are ready. These synchronous swaps
      // happen in one microtask before the next render frame.
      this._binding.setTerrainProgram(program);
      this._semanticField = semanticField;
      this._layoutAudit = layoutAudit;
      this._layoutInvalidation = invalidation;
      this._layoutEpoch++;
      this._activeRevision = revision;
      this._stagingRevision = undefined;
      this._error = null;
      preparedScene?.publish();
      preparedScene = undefined;
    } catch (error) {
      preparedScene?.rollback();
      if (error instanceof DOMException && error.name === "AbortError") {
        this._abortedRevisionCount++;
      } else if (revision === this._stagingRevision) {
        this._error = error instanceof Error ? error.message : String(error);
      }
      if (revision === this._stagingRevision) {
        this._stagingRevision = undefined;
        this._rolledBackRevisionCount++;
      }
      throw error;
    }
  }

  getSnapshot(): PromptNoiseWorldRevisionSnapshotV1 {
    return Object.freeze({
      activeRevision: this._activeRevision,
      stagingRevision: this._stagingRevision,
      semanticGeneration: this._semanticField.generation,
      semanticSourceHash: this._semanticField.sourceHash,
      layoutEpoch: this._layoutEpoch,
      layoutInvalidation: this._layoutInvalidation,
      wetVegetationCount: this._layoutAudit.wetVegetationCount,
      ordinaryPrefabCount: this._layoutAudit.ordinaryPrefabCount,
      excludedLayoutCandidateCount: this._layoutAudit.excludedCount,
      abortedRevisionCount: this._abortedRevisionCount,
      staleRevisionCount: this._staleRevisionCount,
      rolledBackRevisionCount: this._rolledBackRevisionCount,
      error: this._error
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._abortController?.abort();
    this._water.cancelPending();
    this._stagingRevision = undefined;
  }

  private _throwIfStale(revision: number, signal: AbortSignal): void {
    if (signal.aborted || revision !== this._stagingRevision) {
      this._staleRevisionCount++;
      throw new DOMException("Prompt Noise World candidate revision is stale.", "AbortError");
    }
  }

  private _assertActive(): void {
    if (this._destroyed) throw new Error("Prompt Noise World Revision Coordinator has been destroyed.");
  }
}

function createWaterLayoutAuditCandidates(
  semanticField: WaterSemanticFieldSnapshotV1
): readonly PromptNoiseWaterLayoutCandidateV1[] {
  const kinds = ["tree", "shrub", "flower", "grass", "prefab"] as const;
  const candidates: PromptNoiseWaterLayoutCandidateV1[] = [];
  for (const body of semanticField.bodies) {
    const [start, control, end] = body.curve;
    const midpoint = {
      x: start.x * 0.25 + control.x * 0.5 + end.x * 0.25,
      z: start.z * 0.25 + control.z * 0.5 + end.z * 0.25
    };
    const points = [start, midpoint, end];
    for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
      for (const kind of kinds) {
        candidates.push(
          Object.freeze({
            id: `${body.id}:${kind}:${pointIndex}`,
            kind,
            x: points[pointIndex].x,
            z: points[pointIndex].z
          })
        );
      }
    }
  }
  return Object.freeze(candidates);
}
