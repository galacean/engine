import { parseConstructionDecorations, type ConstructionDecorationSpec } from "../runtime/ConstructionDecorations";
import { parseConstructionSource, type ConstructionBuilding } from "../runtime/ConstructionSource";

export type BuildingConfigurationField =
  | "seed"
  | "material"
  | "wall_color"
  | "wood_color"
  | "roof"
  | "foundation"
  | "plaster"
  | "floors";
export function defaultBuildingRoof(): ConstructionBuilding["roof"] {
  return {
    tip: [0, 0],
    profile: 0,
    height: 0.5,
    ridge_length: 0.5,
    eave: 0.2,
    ridge_direction: 0,
    flat_rim: 0,
    color: 0
  };
}
/** Use the actual geometry contract, including its f32 representation. Returned
 * values are owned copies; callers cannot bypass invalidation by mutating input. */
export function buildingConfigurationValue<K extends BuildingConfigurationField>(
  key: K,
  value: NonNullable<ConstructionBuilding[K]>
): NonNullable<ConstructionBuilding[K]> {
  if (value === null || value === undefined) throw Error(`Missing building ${key}`);
  const source = parseConstructionSource({
    version: 1,
    environment: { type: "host_terrain" },
    identity_order: ["validation"],
    buildings: [
      {
        id: "validation",
        height: 4,
        material: 0,
        rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
        roof: defaultBuildingRoof(),
        [key]: value
      }
    ]
  });
  return source.buildings[0][key]!;
}

export type DecorationAppearanceField = "woodColor" | "frameMaterial" | "lightIntensity" | "lightColor";
/** Null restores the producer's default/inherited value; zero is an explicit override. */
export function decorationAppearanceValue<K extends DecorationAppearanceField>(
  key: K,
  value: NonNullable<ConstructionDecorationSpec[K]> | null
): NonNullable<ConstructionDecorationSpec[K]> | null {
  if (value === null) return null;
  if (value === undefined) throw Error(`Missing decoration ${key}`);
  return parseConstructionDecorations([
    { id: "validation", kind: "window", u: 0, bottom: 0, width: 1, height: 1, [key]: value }
  ])[0][key]!;
}
