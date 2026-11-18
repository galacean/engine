import type { PoiLayoutConfig } from "../semantic-study/PoiDistribution";
import { NATURAL_VEGETATION_CONTROLS } from "../planning-data/NaturalVegetationProfile";
import { worldTemplate } from "./WorldTemplateCatalog";
import { WORLD_TEMPLATE_CONFIGS } from "./WorldTemplateConfig";

/** Desert habitat supplies default shrub density while authored layer settings take precedence. */
export function worldTemplateEcology(id: unknown, authored: PoiLayoutConfig): PoiLayoutConfig {
  const template = worldTemplate(id);
  const habitat = template && !WORLD_TEMPLATE_CONFIGS[template.id] ? template.vegetation : undefined;
  if (habitat !== "desert") return authored;
  const vegetation = Object.fromEntries(
    NATURAL_VEGETATION_CONTROLS.map((layer) => [layer.key, layer.key === "shrubs" ? layer.density : 0])
  );
  return {
    ...authored,
    landscape: {
      ...authored.landscape,
      vegetation: { ...vegetation, ...authored.landscape.vegetation }
    }
  };
}
