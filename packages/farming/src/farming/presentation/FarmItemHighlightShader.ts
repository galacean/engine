import pbr from "../procedural/runtime/PlantOrganTint.shader?raw";

/** Reuse the farm's PBR lighting/depth/shadow pipeline, without organ tint or an extra pass. */
export const FARM_ITEM_HIGHLIGHT_SHADER = pbr
  .replace('Shader "Farming/PlantOrganTint"', 'Shader "Farming/ItemRimLight"')
  .replace("vec4 renderer_OrganTint;", "vec4 renderer_ItemHighlight;")
  .replace("float organMask;", "")
  .replace("varyings.vertexColor = vec4(1.0);", "varyings.vertexColor = attributes.COLOR_0;")
  .replace("varyings.organMask = attributes.COLOR_0.a;", "")
  .replace(
    /  float organMembership = 0\.0;[\s\S]*?  \/\/ Can modify surfaceData here/,
    `  SurfaceData surfaceData = getSurfaceData(varyings, aoUV, gl_FrontFacing);
  // Preserve the original material inputs; highlight is added only to the final surface radiance.`
  )
  .replace(
    "color.rgb += surfaceData.emissiveColor;",
    `color.rgb += surfaceData.emissiveColor;
  // Per-renderer color/intensity keep shared material variants independent.
  float edge = max(0.0, (0.65 - surfaceData.dotNV) / 0.65);
  color.rgb += renderer_ItemHighlight.rgb * (renderer_ItemHighlight.a * edge * edge);`
  );
