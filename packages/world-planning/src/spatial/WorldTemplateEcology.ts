import type { PoiLayoutConfig } from "../semantic-study/PoiDistribution";
import { NATURAL_VEGETATION_CONTROLS } from "../planning-data/NaturalVegetationProfile";
import { worldTemplate } from "./WorldTemplateCatalog";

/** Habitat is an effective template input, separate from persisted plant authoring.
 * Ordinary worlds inherit their complete ecology. Frozen and bare references
 * omit plants; deserts retain sparse shrubs. Submerged references use their
 * authored reef assets, never a recoloured terrestrial forest.
 * Explicit world, tier and per-place controls retain their normal precedence. */
export function worldTemplateEcology(id: unknown, authored: PoiLayoutConfig): PoiLayoutConfig {
  const habitat = worldTemplate(id)?.vegetation;
  if (!habitat) return authored;
  const vegetation = Object.fromEntries(
    NATURAL_VEGETATION_CONTROLS.map((layer) => [
      layer.key,
      habitat === "desert" && layer.key === "shrubs" ? layer.density : 0
    ])
  );
  return {
    ...authored,
    landscape: { ...authored.landscape, vegetation: { ...vegetation, ...authored.landscape.vegetation } }
  };
}
