/** Uncultivated ground becomes a level, plantable bed in one committed action. */
export type SoilPreparation = "raw" | "leveled";
export type SoilWorkKind = "hoe" | "rake";

export function isPlantableSoil(preparation: SoilPreparation): boolean {
  return preparation === "leveled";
}

/** Raking cannot open raw ground; an existing bed is already level. */
export function soilWorkTarget(_preparation: SoilPreparation, kind: SoilWorkKind): SoilPreparation | null {
  return kind === "hoe" ? "leveled" : null;
}
