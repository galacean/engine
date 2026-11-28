import type { FarmingAreaComponent } from "./FarmingAreaComponent";
import type { FarmingCatalogResource, FarmingRulesResource } from "./FarmingResources";

/** A normal ComponentSchema; the host persists refs and Scene/Prefab URLs. */
export async function farmingAreaComponentData(
  area: FarmingAreaComponent,
  reference: (resource: FarmingCatalogResource | FarmingRulesResource) => number
) {
  await area.ready;
  const config = area.configuration;
  if (!config) throw new Error("MISSING_DEPENDENCY: 区域尚未配置");
  const snapshot = area.initialized ? await area.service.checkpoint() : config.snapshot;
  const { catalog, rules, ...settings } = config;
  return {
    type: "FarmingAreaComponent",
    props: {
      enabled: area.enabled,
      configuration: { ...settings, snapshot, catalog: { $ref: reference(catalog) }, rules: { $ref: reference(rules) } }
    }
  };
}
