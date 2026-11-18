import type {
  ActiveWaterGenerationResourcesV1,
  PreparedWaterGenerationResourcesV1
} from "@galacean/engine-water/water/runtime/index";
import type { SeedWorldAuthoringStateV1, SeedWorldWorldEditCoordinatorV1 } from "@galacean/engine-world-planning/world/SeedWorldWorldEdit";

export type SeedWorldGenerationModeV1 = "authoritative-hydrology-v1";

export interface SeedWorldGenerationOwnedResourceV1 {
  release(): void;
}

export interface SeedWorldGenerationHydrologyArtifactResourceV1 extends SeedWorldGenerationOwnedResourceV1 {
  readonly header: Readonly<{
    readonly artifactContentHash: string;
    readonly generationParametersHash: string;
  }>;
  readonly waterBodyCatalog: readonly Readonly<{ readonly bodyId: string }>[];
}

export interface ActiveSeedWorldVisibleGenerationV1 {
  readonly generationId: number;
  readonly visible: boolean;
  /** The supplied cleanup retires this generation's Water bodies after the next Scene publication. */
  deactivateForReplacement(retiredWaterCleanup: Promise<void>): void;
  retire(): void | Promise<void>;
}

export interface PreparedSeedWorldVisibleGenerationV1 {
  readonly generationId: number;
  readonly ready: true;
  readonly visible: false;
  commit(previous?: ActiveSeedWorldVisibleGenerationV1): ActiveSeedWorldVisibleGenerationV1;
  rollback(): void;
}

export interface SeedWorldGenerationCandidateInputV1 {
  readonly generationId: number;
  readonly mode: SeedWorldGenerationModeV1;
  readonly sourceDraftRevision: number;
  readonly candidateAuthoringState: Readonly<SeedWorldAuthoringStateV1>;
  readonly hydrologyAnalysisSnapshot: SeedWorldGenerationOwnedResourceV1;
  readonly baseTerrainSnapshot: SeedWorldGenerationOwnedResourceV1;
  readonly hfinalSnapshot: SeedWorldGenerationOwnedResourceV1;
  readonly hydrologyArtifact: SeedWorldGenerationHydrologyArtifactResourceV1;
  readonly preparedWaterResources: PreparedWaterGenerationResourcesV1;
  readonly preparedVisibleGeneration: PreparedSeedWorldVisibleGenerationV1;
  readonly diagnostics: Readonly<Record<string, unknown>>;
}

export interface SeedWorldGenerationTransitionDiagnosticV1 {
  readonly fromGenerationId?: number;
  readonly toGenerationId: number;
  readonly unchangedBodyIds: readonly string[];
  readonly createdBodyIds: readonly string[];
  readonly removedBodyIds: readonly string[];
  readonly observedPredecessorEdges: readonly never[];
  readonly authoritative: false;
}

export interface SeedWorldGenerationRequestV1 {
  readonly generationId: number;
  readonly mode: SeedWorldGenerationModeV1;
  readonly signal: AbortSignal;
}

export class SeedWorldGenerationCandidateV1 {
  readonly generationId: number;
  readonly mode: SeedWorldGenerationModeV1;
  readonly sourceDraftRevision: number;
  readonly candidateAuthoringState: Readonly<SeedWorldAuthoringStateV1>;
  readonly hydrologyAnalysisSnapshot: SeedWorldGenerationOwnedResourceV1;
  readonly baseTerrainSnapshot: SeedWorldGenerationOwnedResourceV1;
  readonly hfinalSnapshot: SeedWorldGenerationOwnedResourceV1;
  readonly hydrologyArtifact: SeedWorldGenerationHydrologyArtifactResourceV1;
  readonly preparedWaterResources: PreparedWaterGenerationResourcesV1;
  readonly preparedVisibleGeneration: PreparedSeedWorldVisibleGenerationV1;
  readonly diagnostics: Readonly<Record<string, unknown>>;
  private _state: "prepared" | "committed" | "rolled-back" = "prepared";

  constructor(input: Readonly<SeedWorldGenerationCandidateInputV1>) {
    if (!Number.isSafeInteger(input.generationId) || input.generationId <= 0) {
      throw new RangeError("Seed World Candidate generationId must be positive.");
    }
    if (!Number.isSafeInteger(input.sourceDraftRevision) || input.sourceDraftRevision < 0) {
      throw new RangeError("Seed World Candidate sourceDraftRevision must be non-negative.");
    }
    if (
      input.preparedWaterResources.generationId !== input.generationId ||
      input.preparedVisibleGeneration.generationId !== input.generationId
    ) {
      throw new Error("Seed World Candidate contains cross-generation prepared resources.");
    }
    if (!input.preparedWaterResources.active || !input.preparedVisibleGeneration.ready) {
      throw new Error("Seed World Candidate requires fully prepared invisible resources.");
    }
    this.generationId = input.generationId;
    this.mode = input.mode;
    this.sourceDraftRevision = input.sourceDraftRevision;
    this.candidateAuthoringState = input.candidateAuthoringState;
    this.hydrologyAnalysisSnapshot = input.hydrologyAnalysisSnapshot;
    this.baseTerrainSnapshot = input.baseTerrainSnapshot;
    this.hfinalSnapshot = input.hfinalSnapshot;
    this.hydrologyArtifact = input.hydrologyArtifact;
    this.preparedWaterResources = input.preparedWaterResources;
    this.preparedVisibleGeneration = input.preparedVisibleGeneration;
    this.diagnostics = input.diagnostics;
  }

  get state(): "prepared" | "committed" | "rolled-back" {
    return this._state;
  }

  commit(previousVisible?: ActiveSeedWorldVisibleGenerationV1): SeedWorldGenerationSnapshotV1 {
    if (this._state !== "prepared") throw new Error(`Seed World Candidate ${this.generationId} is ${this._state}.`);
    // Every fallible compile/upload step completed before Candidate creation.
    // These two commits only publish immutable references in one synchronous critical section.
    const activeVisibleGeneration = this.preparedVisibleGeneration.commit(previousVisible);
    const activeWaterResources = this.preparedWaterResources.commit();
    this._state = "committed";
    return new SeedWorldGenerationSnapshotV1({
      generationId: this.generationId,
      mode: this.mode,
      activeAuthoringState: this.candidateAuthoringState,
      hydrologyAnalysisSnapshot: this.hydrologyAnalysisSnapshot,
      baseTerrainSnapshot: this.baseTerrainSnapshot,
      hfinalSnapshot: this.hfinalSnapshot,
      hydrologyArtifact: this.hydrologyArtifact,
      activeWaterResources,
      activeVisibleGeneration,
      diagnostics: this.diagnostics
    });
  }

  rollback(): void {
    if (this._state !== "prepared") return;
    this._state = "rolled-back";
    this.preparedVisibleGeneration.rollback();
    this.preparedWaterResources.rollback();
    this.hydrologyArtifact.release();
    this.hfinalSnapshot.release();
    this.baseTerrainSnapshot.release();
    this.hydrologyAnalysisSnapshot.release();
  }
}

interface SeedWorldGenerationSnapshotInputV1 {
  readonly generationId: number;
  readonly mode: SeedWorldGenerationModeV1;
  readonly activeAuthoringState: Readonly<SeedWorldAuthoringStateV1>;
  readonly hydrologyAnalysisSnapshot: SeedWorldGenerationOwnedResourceV1;
  readonly baseTerrainSnapshot: SeedWorldGenerationOwnedResourceV1;
  readonly hfinalSnapshot: SeedWorldGenerationOwnedResourceV1;
  readonly hydrologyArtifact: SeedWorldGenerationHydrologyArtifactResourceV1;
  readonly activeWaterResources: ActiveWaterGenerationResourcesV1;
  readonly activeVisibleGeneration: ActiveSeedWorldVisibleGenerationV1;
  readonly diagnostics: Readonly<Record<string, unknown>>;
}

export class SeedWorldGenerationSnapshotV1 {
  readonly generationId: number;
  readonly mode: SeedWorldGenerationModeV1;
  readonly activeAuthoringState: Readonly<SeedWorldAuthoringStateV1>;
  readonly hydrologyAnalysisSnapshot: SeedWorldGenerationOwnedResourceV1;
  readonly baseTerrainSnapshot: SeedWorldGenerationOwnedResourceV1;
  readonly hfinalSnapshot: SeedWorldGenerationOwnedResourceV1;
  readonly hydrologyArtifact: SeedWorldGenerationHydrologyArtifactResourceV1;
  readonly activeWaterResources: ActiveWaterGenerationResourcesV1;
  readonly activeVisibleGeneration: ActiveSeedWorldVisibleGenerationV1;
  readonly diagnostics: Readonly<Record<string, unknown>>;
  private _retirePromise?: Promise<void>;

  constructor(input: Readonly<SeedWorldGenerationSnapshotInputV1>) {
    this.generationId = input.generationId;
    this.mode = input.mode;
    this.activeAuthoringState = input.activeAuthoringState;
    this.hydrologyAnalysisSnapshot = input.hydrologyAnalysisSnapshot;
    this.baseTerrainSnapshot = input.baseTerrainSnapshot;
    this.hfinalSnapshot = input.hfinalSnapshot;
    this.hydrologyArtifact = input.hydrologyArtifact;
    this.activeWaterResources = input.activeWaterResources;
    this.activeVisibleGeneration = input.activeVisibleGeneration;
    this.diagnostics = input.diagnostics;
  }

  retire(): Promise<void> {
    if (this._retirePromise) return this._retirePromise;
    this._retirePromise = Promise.resolve(this.activeVisibleGeneration.retire()).finally(() => {
      this.activeWaterResources.retire();
      this.hydrologyArtifact.release();
      this.hfinalSnapshot.release();
      this.baseTerrainSnapshot.release();
      this.hydrologyAnalysisSnapshot.release();
    });
    return this._retirePromise;
  }
}

export class SeedWorldGenerationPublisherV1 {
  private _nextGenerationId = 0;
  private readonly _mode: SeedWorldGenerationModeV1 = "authoritative-hydrology-v1";
  private _currentRequest?: Readonly<{
    generationId: number;
    mode: SeedWorldGenerationModeV1;
    abort: AbortController;
    detachExternalAbort: () => void;
  }>;
  private _activeSnapshot?: SeedWorldGenerationSnapshotV1;
  private _transitionDiagnostic?: Readonly<SeedWorldGenerationTransitionDiagnosticV1>;
  private readonly _retirements = new Set<Promise<void>>();
  private _destroyed = false;

  constructor(private readonly _authoring: SeedWorldWorldEditCoordinatorV1) {}

  beginGeneration(externalSignal?: AbortSignal): Readonly<SeedWorldGenerationRequestV1> {
    this._assertActive();
    this._abortCurrentGeneration();
    const abort = new AbortController();
    const onExternalAbort = () => abort.abort(externalSignal?.reason);
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    const request = Object.freeze({
      generationId: ++this._nextGenerationId,
      mode: this._mode,
      abort,
      detachExternalAbort: () => externalSignal?.removeEventListener("abort", onExternalAbort)
    });
    this._currentRequest = request;
    if (externalSignal?.aborted) onExternalAbort();
    return Object.freeze({ generationId: request.generationId, mode: request.mode, signal: request.abort.signal });
  }

  cancelCurrentGeneration(reason?: unknown): void {
    if (this._destroyed) return;
    this._abortCurrentGeneration(reason);
  }

  isCurrent(request: Pick<SeedWorldGenerationRequestV1, "generationId" | "mode">): boolean {
    return (
      !this._destroyed &&
      this._currentRequest?.generationId === request.generationId &&
      this._currentRequest.mode === request.mode &&
      !this._currentRequest.abort.signal.aborted
    );
  }

  publish(candidate: SeedWorldGenerationCandidateV1): SeedWorldGenerationSnapshotV1 | undefined {
    this._assertActive();
    const authoring = this._authoring.snapshot;
    if (
      !this.isCurrent(candidate) ||
      candidate.sourceDraftRevision !== authoring.draftRevision ||
      candidate.candidateAuthoringState.authoringStateHash !== authoring.draftAuthoringState.authoringStateHash
    ) {
      candidate.rollback();
      return undefined;
    }
    const previous = this._activeSnapshot;
    let next: SeedWorldGenerationSnapshotV1;
    try {
      next = candidate.commit(previous?.activeVisibleGeneration);
    } catch (error) {
      candidate.rollback();
      throw error;
    }
    this._authoring.commitDraft(candidate.sourceDraftRevision, candidate.candidateAuthoringState.authoringStateHash);
    this._currentRequest?.detachExternalAbort();
    this._activeSnapshot = next;
    this._transitionDiagnostic = createTransitionDiagnostic(previous, next);
    if (previous) {
      const retirement = previous.retire();
      this._retirements.add(retirement);
      void retirement.finally(() => this._retirements.delete(retirement));
    }
    return next;
  }

  get activeSnapshot(): SeedWorldGenerationSnapshotV1 | undefined {
    return this._activeSnapshot;
  }

  consumeTransitionDiagnostic(): Readonly<SeedWorldGenerationTransitionDiagnosticV1> | undefined {
    const diagnostic = this._transitionDiagnostic;
    this._transitionDiagnostic = undefined;
    return diagnostic;
  }

  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    this._abortCurrentGeneration();
    this._currentRequest = undefined;
    const active = this._activeSnapshot;
    this._activeSnapshot = undefined;
    this._transitionDiagnostic = undefined;
    if (active) await active.retire();
    await Promise.allSettled([...this._retirements]);
    this._retirements.clear();
  }

  private _assertActive(): void {
    if (this._destroyed) throw new Error("Seed World Generation Publisher has been destroyed.");
  }

  private _abortCurrentGeneration(reason?: unknown): void {
    const request = this._currentRequest;
    if (!request) return;
    request.detachExternalAbort();
    request.abort.abort(reason);
  }
}

function createTransitionDiagnostic(
  previous: SeedWorldGenerationSnapshotV1 | undefined,
  next: SeedWorldGenerationSnapshotV1
): Readonly<SeedWorldGenerationTransitionDiagnosticV1> {
  const previousIds = new Set(previous?.hydrologyArtifact.waterBodyCatalog.map(({ bodyId }) => bodyId) ?? []);
  const nextIds = new Set(next.hydrologyArtifact.waterBodyCatalog.map(({ bodyId }) => bodyId));
  return Object.freeze({
    ...(previous ? { fromGenerationId: previous.generationId } : {}),
    toGenerationId: next.generationId,
    unchangedBodyIds: Object.freeze([...nextIds].filter((bodyId) => previousIds.has(bodyId)).sort()),
    createdBodyIds: Object.freeze([...nextIds].filter((bodyId) => !previousIds.has(bodyId)).sort()),
    removedBodyIds: Object.freeze([...previousIds].filter((bodyId) => !nextIds.has(bodyId)).sort()),
    observedPredecessorEdges: Object.freeze([]),
    authoritative: false as const
  });
}
