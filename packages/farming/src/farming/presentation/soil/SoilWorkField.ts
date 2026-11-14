import { isPlantableSoil, soilWorkTarget, type SoilPreparation, type SoilWorkKind } from "../../domain/SoilCultivation";
export type { SoilWorkKind } from "../../domain/SoilCultivation";
export interface SoilWorkSample {
  readonly time: number;
  readonly x: number;
  readonly z: number;
  /** Unit vector along the blade / rake head, in plot space. */
  readonly rightX: number;
  readonly rightZ: number;
  readonly width: number;
}

/** Tool state only. Cultivation never changes the surface geometry. */
export class SoilWorkField {
  private preparation: SoilPreparation = "raw";
  private target: SoilPreparation | null = null;
  private completed = false;

  setPreparation(preparation: SoilPreparation): void {
    this.preparation = preparation;
    this.target = null;
    this.completed = false;
  }
  cancel(): void {
    this.setPreparation(this.preparation);
  }
  begin(kind: SoilWorkKind): boolean {
    this.cancel();
    this.target = soilWorkTarget(this.preparation, kind);
    return this.target !== null;
  }
  finish(): boolean {
    if (!this.target || this.completed) return false;
    const changed = this.preparation !== this.target;
    this.preparation = this.target;
    this.completed = true;
    return changed;
  }
  summary() {
    return {
      preparation: this.preparation,
      canPlant: isPlantableSoil(this.preparation),
      target: this.target,
      completed: this.completed
    };
  }
}
