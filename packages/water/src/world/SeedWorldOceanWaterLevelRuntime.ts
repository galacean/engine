import {
  OCEAN_WATER_LEVEL_RUNTIME_DEVELOPMENT_PORT_KIND,
  type OceanWaterLevelRuntimeDevelopmentPort,
  type OceanWaterLevelRuntimeReadback
} from "../water/runtime/index";

export interface SeedWorldOceanWaterLevelRuntimeStateConfig {
  readonly bodyId: string;
  readonly defaultWaterLevelMetres: number;
  /** Symmetric runtime-only range above and below the generated Ocean datum. */
  readonly adjustmentRangeMetres: number;
  /** Applies a render-only offset to the active Ocean runtime. */
  readonly applySurfaceLevelOffset: (bodyId: string, offsetMetres: number) => boolean;
}

/**
 * Page-generation runtime state for Seed World's single authoritative Ocean.
 *
 * The generated Ocean descriptor remains immutable. Runtime debugging may move
 * the rendered surface both above and below its default datum within the
 * supplied finite range, and starts at zero offset for every new datum.
 */
export class SeedWorldOceanWaterLevelRuntimeState {
  readonly bodyId: string;
  readonly defaultWaterLevelMetres: number;
  readonly minimumWaterLevelMetres: number;
  readonly maximumWaterLevelMetres: number;
  readonly developmentPort: Readonly<OceanWaterLevelRuntimeDevelopmentPort>;

  private _effectiveWaterLevelMetres: number;
  private readonly _adjustmentRangeMetres: number;
  private readonly _applySurfaceLevelOffset: (bodyId: string, offsetMetres: number) => boolean;

  constructor(config: Readonly<SeedWorldOceanWaterLevelRuntimeStateConfig>) {
    if (config.bodyId.trim().length === 0) throw new TypeError("Seed World Ocean runtime body id must be non-empty.");
    if (!Number.isFinite(config.defaultWaterLevelMetres)) {
      throw new RangeError("Seed World Ocean default water level must be finite.");
    }
    if (!Number.isFinite(config.adjustmentRangeMetres) || config.adjustmentRangeMetres <= 0) {
      throw new RangeError("Seed World Ocean water-level adjustment range must be finite and positive.");
    }
    this.bodyId = config.bodyId;
    this.defaultWaterLevelMetres = config.defaultWaterLevelMetres;
    this._adjustmentRangeMetres = config.adjustmentRangeMetres;
    this.minimumWaterLevelMetres = config.defaultWaterLevelMetres - config.adjustmentRangeMetres;
    this.maximumWaterLevelMetres = config.defaultWaterLevelMetres + config.adjustmentRangeMetres;
    this._effectiveWaterLevelMetres = config.defaultWaterLevelMetres;
    this._applySurfaceLevelOffset = config.applySurfaceLevelOffset;
    const state = this;
    this.developmentPort = Object.freeze({
      kind: OCEAN_WATER_LEVEL_RUNTIME_DEVELOPMENT_PORT_KIND,
      get readback() {
        return state.readback;
      },
      setWaterLevelMetres(waterLevelMetres: number) {
        return state.setWaterLevelMetres(waterLevelMetres);
      }
    });
  }

  get readback(): Readonly<OceanWaterLevelRuntimeReadback> {
    return Object.freeze({
      bodyId: this.bodyId,
      defaultWaterLevelMetres: this.defaultWaterLevelMetres,
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
    return this._effectiveWaterLevelMetres - this.defaultWaterLevelMetres;
  }

  isCompatible(defaultWaterLevelMetres: number, adjustmentRangeMetres: number): boolean {
    return (
      defaultWaterLevelMetres === this.defaultWaterLevelMetres && adjustmentRangeMetres === this._adjustmentRangeMetres
    );
  }

  setWaterLevelMetres(waterLevelMetres: number): Readonly<OceanWaterLevelRuntimeReadback> {
    if (!Number.isFinite(waterLevelMetres)) {
      throw new RangeError("Seed World Ocean runtime water level must be finite.");
    }
    const clamped = Math.min(this.maximumWaterLevelMetres, Math.max(this.minimumWaterLevelMetres, waterLevelMetres));
    if (clamped === this._effectiveWaterLevelMetres) return this.readback;
    const offsetMetres = clamped - this.defaultWaterLevelMetres;
    if (!this._applySurfaceLevelOffset(this.bodyId, offsetMetres)) {
      throw new Error(`Seed World Ocean runtime '${this.bodyId}' is not active.`);
    }
    this._effectiveWaterLevelMetres = clamped;
    return this.readback;
  }
}
