import type { WaterBodyComponent } from "./WaterBodyComponent";
import type { WaterBodyResource, WaterLookResource, WaterQualityResource } from "./WaterResources";

/** Produces the standard engine Component.props block; the host owns Scene/Prefab serialization and URL storage. */
export function waterBodyComponentData(
  body: WaterBodyComponent,
  reference: (resource: WaterBodyResource | WaterLookResource | WaterQualityResource) => number
) {
  const config = body.configuration;
  if (!config) throw new Error("MISSING_DEPENDENCY: Water component has no accepted configuration.");
  const { asset, look, quality, ...settings } = config;
  return {
    type: "WaterBodyComponent",
    props: {
      waterId: body.waterId,
      enabled: body.enabled,
      configuration: {
        ...settings,
        asset: { $ref: reference(asset) },
        look: { $ref: reference(look) },
        quality: { $ref: reference(quality) }
      }
    }
  };
}
