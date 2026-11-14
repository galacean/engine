import { Loader, Script } from "@galacean/engine";
import { SeedWorldGroundWindTuningRuntime } from "@galacean/engine-vegetation/world/SeedWorldGroundWindTuning";
import { SEED_WORLD_DEFAULT_GROUND_WIND_TUNING, validateGroundWindTuning, type SeedWorldGroundWindTuning } from "@galacean/engine-vegetation/world/SeedWorldGroundWindTuningModel";

/** Scene-owned wind calibration. Source properties and public history own authoring; the clock is transient. */
export class PlanningGroundWind extends Script {
  private values = { ...SEED_WORLD_DEFAULT_GROUND_WIND_TUNING };
  private runtime?: SeedWorldGroundWindTuningRuntime;
  get windEnabled(): boolean { return this.values.enabled; }
  set windEnabled(value: boolean) { this.set({ enabled: value }); }
  get speedMps(): number { return this.values.speedMps; }
  set speedMps(value: number) { this.set({ speedMps: value }); }
  get directionDegrees(): number { return this.values.directionDegrees; }
  set directionDegrees(value: number) { this.set({ directionDegrees: value }); }
  get waveStrength(): number { return this.values.waveStrength; }
  set waveStrength(value: number) { this.set({ waveStrength: value }); }
  get waveScaleMeters(): number { return this.values.waveScaleMeters; }
  set waveScaleMeters(value: number) { this.set({ waveScaleMeters: value }); }
  get meanBend(): number { return this.values.meanBend; }
  set meanBend(value: number) { this.set({ meanBend: value }); }
  get rootStiffness(): number { return this.values.rootStiffness; }
  set rootStiffness(value: number) { this.set({ rootStiffness: value }); }
  get noiseSpeedMps(): number { return this.values.noiseSpeedMps; }
  set noiseSpeedMps(value: number) { this.set({ noiseSpeedMps: value }); }
  get noiseStrength(): number { return this.values.noiseStrength; }
  set noiseStrength(value: number) { this.set({ noiseStrength: value }); }
  get colorStrength(): number { return this.values.colorStrength; }
  set colorStrength(value: number) { this.set({ colorStrength: value }); }
  get colorContrast(): number { return this.values.colorContrast; }
  set colorContrast(value: number) { this.set({ colorContrast: value }); }
  private set(patch: Partial<SeedWorldGroundWindTuning>): void {
    const next = { ...this.values, ...patch };
    validateGroundWindTuning(next);
    this.values = next;
    this.runtime?.setTuning(next);
  }
  onEnable(): void {
    this.runtime ??= new SeedWorldGroundWindTuningRuntime(this.scene!);
    this.runtime.setTuning(this.values);
  }
  onUpdate(seconds: number): void { this.runtime?.update(seconds); }
  onDisable(): void { this.runtime?.setTuning({ enabled: false }); }
}
Loader.registerClass("PlanningGroundWind", PlanningGroundWind);
