import type { TerrainProjectLodGroup, TerrainProjectPrototypeLod } from "../project/TerrainProjectContract";

/** Canonical LOD threshold consumed by the renderer-side state runtime. */
export type TerrainLodLevelRuntimeConfig = Readonly<Pick<TerrainProjectPrototypeLod, "screenRelativeTransitionHeight">>;

/** Canonical LODGroup fields shared by all instances of one prototype. */
export type TerrainLodGroupRuntimeConfig = Readonly<
  Pick<TerrainProjectLodGroup, "fadeMode" | "animateCrossFading" | "localReferencePoint" | "size">
> & {
  /** LODs ordered by strictly decreasing screen-relative transition height. */
  readonly lods: readonly TerrainLodLevelRuntimeConfig[];
};

/** One visible renderer set and its source-compatible signed dither factor. */
export interface TerrainLodRendererSetState {
  /** Zero-based index into the canonical LOD renderer sets. */
  readonly lodIndex: number;
  /** Positive values retain lower dither samples; negative values retain the complementary pixels. */
  readonly signedFade: number;
  /** Whether the renderer must apply cross-fade dithering for this state. */
  readonly crossFading: boolean;
}

/**
 * Mutable caller-owned slot used only by the allocation-free submission path.
 * Its values are overwritten whenever its scratch is used for an animated transition.
 */
export interface TerrainLodRendererSetScratchState {
  lodIndex: number;
  signedFade: number;
  crossFading: true;
}

/**
 * Two reusable renderer-state slots, enough for every source/target LOD cross-fade.
 * The returned animated state array is transient and remains valid only until this scratch is reused.
 */
export interface TerrainLodRendererSetScratch {
  readonly slots: readonly [TerrainLodRendererSetScratchState, TerrainLodRendererSetScratchState];
  readonly singleRendererSet: readonly [TerrainLodRendererSetScratchState];
  readonly rendererSets: readonly [TerrainLodRendererSetScratchState, TerrainLodRendererSetScratchState];
}

/** Creates one caller-owned scratch for immediate, allocation-free LOD submission. */
export function createTerrainLodRendererSetScratch(): TerrainLodRendererSetScratch {
  const first = { lodIndex: 0, signedFade: 1, crossFading: true as const };
  const second = { lodIndex: 0, signedFade: 1, crossFading: true as const };
  return { slots: [first, second], singleRendererSet: [first], rendererSets: [first, second] };
}

/** One absolute-time observation of a surface instance. */
export type TerrainLodInstanceObservation =
  | {
      /** Monotonic runtime time in seconds. Absolute time lets cell culling skip updates without pausing transitions. */
      readonly timeSeconds: number;
      /** Invisible observations emit no renderer sets while preserving this instance's transition state. */
      readonly visible: false;
    }
  | {
      /** Monotonic runtime time in seconds. Absolute time lets cell culling skip updates without pausing transitions. */
      readonly timeSeconds: number;
      readonly visible: true;
      /** Projected reference height divided by screen height. Zero requests the terminal fade to no LOD. */
      readonly screenRelativeHeight: number;
    };

/** Independent transition state owned by exactly one rendered surface instance. */
export interface TerrainLodGroupInstance {
  /**
   * Advances this instance and returns only the LOD renderer sets that should be submitted now.
   * @remarks Invisible or omitted observations preserve state and absolute time settles elapsed work on re-entry. Reversing toward the source preserves both LOD coverages; a third target restarts from the currently dominant endpoint.
   * @param observation Current absolute time, visibility, and projected height when visible.
   * @returns Zero sets while invisible or culled, one stable set, or the active cross-fade sets.
   * @throws If time is non-finite, negative, or moves backwards, or if a visible projected height is invalid.
   */
  update(observation: TerrainLodInstanceObservation): readonly TerrainLodRendererSetState[];

  /**
   * Advances this instance using caller-owned storage for the active cross-fade result.
   * Stable and invisible states still return the shared immutable result; animated results are valid only until `scratch` is reused.
   */
  updateInto(
    observation: TerrainLodInstanceObservation,
    scratch: TerrainLodRendererSetScratch
  ): readonly TerrainLodRendererSetState[];

  /**
   * Cancels any active transition and selects the stable LOD for one visible observation.
   * @param observation Current absolute time and projected height.
   * @returns The single stable renderer set selected for this observation, or no set beyond the terminal threshold.
   * @throws If time is non-finite, negative, or moves backwards, or if the projected height is invalid.
   */
  snap(
    observation: Extract<TerrainLodInstanceObservation, { readonly visible: true }>
  ): readonly TerrainLodRendererSetState[];
}

/**
 * Immutable canonical LODGroup definition that creates isolated per-instance transition state.
 * Cell, prototype, range, and category objects may share this definition but never an instance returned by `createInstance`.
 */
export class TerrainLodGroupRuntime {
  /** Detached authored local-space reference point used by projection code. */
  readonly localReferencePoint: readonly [x: number, y: number, z: number];
  /** Authored local-space reference diameter used by projection code. */
  readonly size: number;

  private readonly _thresholds: readonly number[];
  private readonly _animatedCrossFade: boolean;
  private readonly _crossFadeDurationSeconds: number;

  /** Whether this definition can emit animated source/target renderer pairs. */
  get usesAnimatedCrossFade(): boolean {
    return this._animatedCrossFade;
  }

  /**
   * Creates one shared runtime definition from validated canonical LODGroup fields.
   * @param config Canonical reference geometry, fade semantics, and decreasing LOD thresholds.
   * @param crossFadeDurationSeconds Scene-owned animated cross-fade duration in seconds. Zero disables animation.
   * @throws If the duration is negative or non-finite.
   */
  constructor(config: TerrainLodGroupRuntimeConfig, crossFadeDurationSeconds = 0) {
    if (!Number.isFinite(crossFadeDurationSeconds) || crossFadeDurationSeconds < 0) {
      throw new Error("Terrain LODGroup cross-fade duration must be finite and non-negative");
    }
    this.localReferencePoint = [...config.localReferencePoint];
    this.size = config.size;
    this._thresholds = config.lods.map((lod) => lod.screenRelativeTransitionHeight);
    this._animatedCrossFade =
      config.fadeMode === "CrossFade" && config.animateCrossFading && crossFadeDurationSeconds > 0;
    this._crossFadeDurationSeconds = crossFadeDurationSeconds;
    for (let lodIndex = 0; lodIndex < this._thresholds.length; lodIndex++) stableRendererSets(lodIndex);
  }

  /**
   * Creates state for one instance. The first visible observation selects its LOD without an entrance fade.
   * @returns A new state object with no clock or transition shared with any prior instance.
   */
  createInstance(): TerrainLodGroupInstance {
    return new TerrainLodGroupInstanceState(this._thresholds, this._animatedCrossFade, this._crossFadeDurationSeconds);
  }
}

const EMPTY_RENDERER_SETS = Object.freeze([]) as readonly TerrainLodRendererSetState[];
const STABLE_RENDERER_SETS: Array<readonly TerrainLodRendererSetState[]> = [];
const RENDERER_SETS_EMPTY = 0;
const RENDERER_SETS_STABLE = 1;
const RENDERER_SETS_TRANSITION = 2;

class TerrainLodGroupInstanceState implements TerrainLodGroupInstance {
  private _settledLod: number | null | undefined;
  private _transitionFromLod: number | null = null;
  private _transitionToLod: number | null = null;
  private _transitionStartTimeSeconds = 0;
  private _transitionActive = false;
  private _lastTimeSeconds = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly _thresholds: readonly number[],
    private readonly _animatedCrossFade: boolean,
    private readonly _crossFadeDurationSeconds: number
  ) {}

  update(observation: TerrainLodInstanceObservation): readonly TerrainLodRendererSetState[] {
    const state = this._update(observation);
    if (state === RENDERER_SETS_EMPTY) return EMPTY_RENDERER_SETS;
    if (state === RENDERER_SETS_STABLE) return stableRendererSets(this._settledLod);
    return transitionRendererSets(
      this._transitionFromLod,
      this._transitionToLod,
      this._transitionStartTimeSeconds,
      observation.timeSeconds,
      this._crossFadeDurationSeconds
    );
  }

  updateInto(
    observation: TerrainLodInstanceObservation,
    scratch: TerrainLodRendererSetScratch
  ): readonly TerrainLodRendererSetState[] {
    const state = this._update(observation);
    if (state === RENDERER_SETS_EMPTY) return EMPTY_RENDERER_SETS;
    if (state === RENDERER_SETS_STABLE) return stableRendererSets(this._settledLod);
    return transitionRendererSetsInto(
      this._transitionFromLod,
      this._transitionToLod,
      this._transitionStartTimeSeconds,
      observation.timeSeconds,
      this._crossFadeDurationSeconds,
      scratch
    );
  }

  private _update(observation: TerrainLodInstanceObservation): number {
    this._acceptObservation(observation);
    const { timeSeconds } = observation;
    this._finishElapsedTransition(timeSeconds);
    if (!observation.visible) return RENDERER_SETS_EMPTY;

    const desiredLod = selectLod(this._thresholds, observation.screenRelativeHeight);
    if (this._settledLod === undefined) {
      this._settledLod = desiredLod;
      return RENDERER_SETS_STABLE;
    }
    if (!this._animatedCrossFade) {
      this._transitionActive = false;
      this._settledLod = desiredLod;
      return RENDERER_SETS_STABLE;
    }

    if (this._transitionActive) {
      if (desiredLod === this._transitionToLod) {
        return RENDERER_SETS_TRANSITION;
      }
      if (desiredLod === this._transitionFromLod) {
        this._reverseTransition(timeSeconds);
        return this._transitionActive ? RENDERER_SETS_TRANSITION : RENDERER_SETS_STABLE;
      }
      this._settledLod = dominantTransitionLod(
        this._transitionFromLod,
        this._transitionToLod,
        this._transitionStartTimeSeconds,
        timeSeconds,
        this._crossFadeDurationSeconds
      );
      this._transitionActive = false;
    }

    if (desiredLod !== this._settledLod) {
      this._transitionFromLod = this._settledLod;
      this._transitionToLod = desiredLod;
      this._transitionStartTimeSeconds = timeSeconds;
      this._transitionActive = true;
      return RENDERER_SETS_TRANSITION;
    }
    return RENDERER_SETS_STABLE;
  }

  snap(
    observation: Extract<TerrainLodInstanceObservation, { readonly visible: true }>
  ): readonly TerrainLodRendererSetState[] {
    this._acceptObservation(observation);
    this._transitionActive = false;
    this._settledLod = selectLod(this._thresholds, observation.screenRelativeHeight);
    return stableRendererSets(this._settledLod);
  }

  private _acceptObservation(observation: TerrainLodInstanceObservation): void {
    const { timeSeconds } = observation;
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || timeSeconds < this._lastTimeSeconds) {
      throw new Error("Terrain LODGroup instance time must be finite, non-negative, and monotonic");
    }
    if (
      observation.visible &&
      (!Number.isFinite(observation.screenRelativeHeight) || observation.screenRelativeHeight < 0)
    ) {
      throw new Error("Terrain LODGroup screen-relative height must be finite and non-negative");
    }
    this._lastTimeSeconds = timeSeconds;
  }

  private _finishElapsedTransition(timeSeconds: number): void {
    if (
      this._transitionActive &&
      transitionProgress(this._transitionStartTimeSeconds, timeSeconds, this._crossFadeDurationSeconds) >= 1
    ) {
      this._settledLod = this._transitionToLod;
      this._transitionActive = false;
    }
  }

  private _reverseTransition(timeSeconds: number): void {
    const reversedProgress =
      1 - transitionProgress(this._transitionStartTimeSeconds, timeSeconds, this._crossFadeDurationSeconds);
    if (reversedProgress >= 1) {
      this._settledLod = this._transitionFromLod;
      this._transitionActive = false;
      return;
    }
    const fromLod = this._transitionFromLod;
    this._settledLod = this._transitionToLod;
    this._transitionFromLod = this._transitionToLod;
    this._transitionToLod = fromLod;
    this._transitionStartTimeSeconds = timeSeconds - reversedProgress * this._crossFadeDurationSeconds;
  }
}

function selectLod(thresholds: readonly number[], screenRelativeHeight: number): number | null {
  if (screenRelativeHeight === 0) {
    return null;
  }
  for (let lodIndex = 0; lodIndex < thresholds.length; lodIndex++) {
    if (screenRelativeHeight >= thresholds[lodIndex]) return lodIndex;
  }
  return null;
}

function transitionProgress(
  transitionStartTimeSeconds: number,
  timeSeconds: number,
  crossFadeDurationSeconds: number
): number {
  return Math.min(1, Math.max(0, (timeSeconds - transitionStartTimeSeconds) / crossFadeDurationSeconds));
}

function dominantTransitionLod(
  fromLod: number | null,
  toLod: number | null,
  transitionStartTimeSeconds: number,
  timeSeconds: number,
  crossFadeDurationSeconds: number
): number | null {
  return transitionProgress(transitionStartTimeSeconds, timeSeconds, crossFadeDurationSeconds) < 0.5 ? fromLod : toLod;
}

function stableRendererSets(lodIndex: number | null | undefined): readonly TerrainLodRendererSetState[] {
  if (lodIndex === null || lodIndex === undefined) return EMPTY_RENDERER_SETS;
  let rendererSets = STABLE_RENDERER_SETS[lodIndex];
  if (!rendererSets) {
    rendererSets = Object.freeze([Object.freeze({ lodIndex, signedFade: 1, crossFading: false })]);
    STABLE_RENDERER_SETS[lodIndex] = rendererSets;
  }
  return rendererSets;
}

function transitionRendererSets(
  fromLod: number | null,
  toLod: number | null,
  transitionStartTimeSeconds: number,
  timeSeconds: number,
  crossFadeDurationSeconds: number
): readonly TerrainLodRendererSetState[] {
  const remaining = 1 - transitionProgress(transitionStartTimeSeconds, timeSeconds, crossFadeDurationSeconds);
  const sourceFade = transitionSourceFade(fromLod, toLod, remaining);
  const rendererSets: TerrainLodRendererSetState[] = [];
  if (fromLod !== null) {
    rendererSets.push({ lodIndex: fromLod, signedFade: sourceFade, crossFading: true });
  }
  if (toLod !== null) {
    rendererSets.push({ lodIndex: toLod, signedFade: -sourceFade, crossFading: true });
  }
  return rendererSets;
}

function transitionRendererSetsInto(
  fromLod: number | null,
  toLod: number | null,
  transitionStartTimeSeconds: number,
  timeSeconds: number,
  crossFadeDurationSeconds: number,
  scratch: TerrainLodRendererSetScratch
): readonly TerrainLodRendererSetState[] {
  const remaining = 1 - transitionProgress(transitionStartTimeSeconds, timeSeconds, crossFadeDurationSeconds);
  const sourceFade = transitionSourceFade(fromLod, toLod, remaining);
  let count = 0;
  if (fromLod !== null) {
    const state = scratch.slots[count++]!;
    state.lodIndex = fromLod;
    state.signedFade = sourceFade;
    state.crossFading = true;
  }
  if (toLod !== null) {
    const state = scratch.slots[count++]!;
    state.lodIndex = toLod;
    state.signedFade = -sourceFade;
    state.crossFading = true;
  }
  if (count === 0) return EMPTY_RENDERER_SETS;
  return count === 1 ? scratch.singleRendererSet : scratch.rendererSets;
}

function transitionSourceFade(fromLod: number | null, toLod: number | null, remaining: number): number {
  // Keep the higher-detail LOD on the same dither pixels when the camera reverses
  // At transition start, use the full/empty endpoints because the shader cannot distinguish signed zero
  return remaining === 1 || toLod === null || (fromLod !== null && fromLod < toLod) ? remaining : remaining - 1;
}
