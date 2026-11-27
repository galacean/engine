import type { ShaderData } from "@galacean/engine-core";
import { Vector2, Vector4 } from "@galacean/engine-math";
import type { WaterSurfaceAppearanceBindingV2 } from "./WaterSurfaceAppearanceRuntimeTypes";

/** Binds the same optional projection contract in River and Heightfield. */
export function bindWaterSurfaceCaustics(
  shaderData: ShaderData,
  binding: Readonly<WaterSurfaceAppearanceBindingV2>
): void {
  const c = binding.appearance.caustics;
  if (!c) {
    shaderData.setTexture("material_AppearanceV2CausticsTexture", null!);
    shaderData.setVector4("material_AppearanceV2CausticsResponse", new Vector4(0, 0, 1, 0));
    shaderData.setVector4("material_AppearanceV2CausticsTransform", new Vector4(1, 1, 0, 0));
    shaderData.setVector2("material_AppearanceV2CausticsParallax", new Vector2(0, 1));
    return;
  }
  const texture = binding.textureBindings.find((b) => b.layerId === c.id)?.texture;
  if (!texture) throw Error(`Caustics '${c.id}' has no prepared texture binding.`);
  shaderData.setTexture("material_AppearanceV2CausticsTexture", texture);
  shaderData.setVector4("material_AppearanceV2CausticsTransform", new Vector4(...c.scale, ...c.velocity));
  shaderData.setVector4(
    "material_AppearanceV2CausticsResponse",
    new Vector4(c.intensity, c.distortion, c.fadeCoefficientPerMeter, c.opacityContribution)
  );
  shaderData.setVector2("material_AppearanceV2CausticsParallax", new Vector2(c.parallaxOffset, c.parallaxBias));
}
