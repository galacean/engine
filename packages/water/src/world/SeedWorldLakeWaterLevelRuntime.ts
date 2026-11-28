import {
  LAKE_WATER_LEVEL_RUNTIME_DEVELOPMENT_PORT_KIND,
  type LakeWaterLevelRuntimeDevelopmentPort,
  type LakeWaterLevelRuntimeReadback
} from "../water/runtime/index";

export interface SeedWorldLakeWaterLevelRuntimeStateConfig {
  readonly bodyId: string;
  readonly canonicalWaterLevelMetres: number;
  readonly maximumDepthMetres: number;
  readonly initialWaterLevelMetres?: number;
  /** Water level already baked into the active Runtime descriptor. Defaults to the canonical level. */
  readonly runtimeBaseWaterLevelMetres?: number;
  /** Applies a render-only offset to the active Heightfield runtime. */
  readonly applySurfaceLevelOffset: (bodyId: string, offsetMetres: number) => boolean;
  readonly onWaterLevelChanged?: (readback: Readonly<LakeWaterLevelRuntimeReadback>) => void;
}

/**
 * Runtime state for one active Seed World Lake.
 *
 * Persistent authoring is projected before this state is created. Development
 * controls then move the active surface relative to that published base, while
 * the canonical datum remains the hard upper bound.
 */
export class SeedWorldLakeWaterLevelRuntimeState {
  readonly bodyId: string;
  readonly canonicalWaterLevelMetres: number;
  readonly minimumWaterLevelMetres: number;
  readonly maximumWaterLevelMetres: number;
  readonly developmentPort: Readonly<LakeWaterLevelRuntimeDevelopmentPort>;

  private _effectiveWaterLevelMetres: number;
  private readonly _runtimeBaseWaterLevelMetres: number;
  private readonly _applySurfaceLevelOffset: (bodyId: string, offsetMetres: number) => boolean;
  private readonly _onWaterLevelChanged?: (readback: Readonly<LakeWaterLevelRuntimeReadback>) => void;

  constructor(config: Readonly<SeedWorldLakeWaterLevelRuntimeStateConfig>) {
    if (config.bodyId.trim().length === 0) throw new TypeError("Seed World Lake runtime body id must be non-empty.");
    if (!Number.isFinite(config.canonicalWaterLevelMetres)) {
      throw new RangeError("Seed World Lake canonical water level must be finite.");
    }
    if (!Number.isFinite(config.maximumDepthMetres) || config.maximumDepthMetres <= 0) {
      throw new RangeError("Seed World Lake maximum depth must be finite and positive.");
    }
    this.bodyId = config.bodyId;
    this.canonicalWaterLevelMetres = config.canonicalWaterLevelMetres;
    this.maximumWaterLevelMetres = config.canonicalWaterLevelMetres;
    this.minimumWaterLevelMetres = config.canonicalWaterLevelMetres - config.maximumDepthMetres;
    const initialWaterLevelMetres = config.initialWaterLevelMetres ?? config.canonicalWaterLevelMetres;
    const runtimeBaseWaterLevelMetres = config.runtimeBaseWaterLevelMetres ?? config.canonicalWaterLevelMetres;
    if (
      !Number.isFinite(initialWaterLevelMetres) ||
      initialWaterLevelMetres < this.minimumWaterLevelMetres ||
      initialWaterLevelMetres > this.maximumWaterLevelMetres
    ) {
      throw new RangeError("Seed World Lake initial water level must stay inside its supported range.");
    }
    if (
      !Number.isFinite(runtimeBaseWaterLevelMetres) ||
      runtimeBaseWaterLevelMetres < this.minimumWaterLevelMetres ||
      runtimeBaseWaterLevelMetres > this.maximumWaterLevelMetres
    ) {
      throw new RangeError("Seed World Lake Runtime base water level must stay inside its supported range.");
    }
    this._effectiveWaterLevelMetres = initialWaterLevelMetres;
    this._runtimeBaseWaterLevelMetres = runtimeBaseWaterLevelMetres;
    this._applySurfaceLevelOffset = config.applySurfaceLevelOffset;
    this._onWaterLevelChanged = config.onWaterLevelChanged;
    const state = this;
    this.developmentPort = Object.freeze({
      kind: LAKE_WATER_LEVEL_RUNTIME_DEVELOPMENT_PORT_KIND,
      get readback() {
        return state.readback;
      },
      setWaterLevelMetres(waterLevelMetres: number) {
        return state.setWaterLevelMetres(waterLevelMetres);
      }
    });
  }

  get readback(): Readonly<LakeWaterLevelRuntimeReadback> {
    return Object.freeze({
      bodyId: this.bodyId,
      canonicalWaterLevelMetres: this.canonicalWaterLevelMetres,
      minimumWaterLevelMetres: this.minimumWaterLevelMetres,
      maximumWaterLevelMetres: this.maximumWaterLevelMetres,
      effectiveWaterLevelMetres: this._effectiveWaterLevelMetres,
      surfaceLevelOffsetMetres: this.surfaceLevelOffsetMetres
    });
  }

  /** Allocation-free effective datum used by per-frame navigation sampling. */
  get effectiveWaterLevelMetres(): number {
    return this._effectiveWaterLevelMetres;
  }

  get surfaceLevelOffsetMetres(): number {
    return this._effectiveWaterLevelMetres - this._runtimeBaseWaterLevelMetres;
  }

  isCompatible(canonicalWaterLevelMetres: number, maximumDepthMetres: number): boolean {
    return (
      canonicalWaterLevelMetres === this.canonicalWaterLevelMetres &&
      canonicalWaterLevelMetres - maximumDepthMetres === this.minimumWaterLevelMetres
    );
  }

  setWaterLevelMetres(waterLevelMetres: number): Readonly<LakeWaterLevelRuntimeReadback> {
    if (!Number.isFinite(waterLevelMetres)) {
      throw new RangeError("Seed World Lake runtime water level must be finite.");
    }
    const clamped = Math.min(this.maximumWaterLevelMetres, Math.max(this.minimumWaterLevelMetres, waterLevelMetres));
    if (clamped === this._effectiveWaterLevelMetres) return this.readback;
    const offsetMetres = clamped - this._runtimeBaseWaterLevelMetres;
    if (!this._applySurfaceLevelOffset(this.bodyId, offsetMetres)) {
      throw new Error(`Seed World Lake runtime '${this.bodyId}' is not active.`);
    }
    this._effectiveWaterLevelMetres = clamped;
    const readback = this.readback;
    this._onWaterLevelChanged?.(readback);
    return readback;
  }
}
