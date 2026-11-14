import type { PoiLayoutConfig } from "../semantic-study/PoiDistribution";
import { NATURAL_VEGETATION_CONTROLS } from "../planning-data/NaturalVegetationProfile";
import { worldTemplate } from "./WorldTemplateCatalog";
import { WORLD_TEMPLATE_CONFIGS } from "./WorldTemplateConfig";

/** Habitat is an effective template input, separate from persisted plant authoring.
 * Ordinary worlds inherit their complete ecology. Frozen and bare references
 * omit plants; deserts retain sparse shrubs. Submerged references use their
 * authored reef assets, never a recoloured terrestrial forest.
 * Explicit world, tier and per-place controls retain their normal precedence. */
export function worldTemplateEcology(id: unknown, authored: PoiLayoutConfig): PoiLayoutConfig {
  const template = worldTemplate(id);
  const habitat = template && !WORLD_TEMPLATE_CONFIGS[template.id] ? template.vegetation : undefined;
  if (!habitat) return authored;
  const vegetation = Object.fromEntries(
    NATURAL_VEGETATION_CONTROLS.map((layer) => [
      layer.key,
      (habitat === "desert" && layer.key === "shrubs") || (habitat === "grass" && layer.key === "grass")
        ? layer.density
        : 0
    ])
  );
  return {
    ...authored,
    landscape: {
      ...authored.landscape,
      ...(habitat === "grass" ? { density: 0 } : {}),
      vegetation: { ...vegetation, ...authored.landscape.vegetation }
    }
  };
}
