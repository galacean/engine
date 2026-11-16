/** Ordinary Material texture slots shared by runtime validation and Editor metadata. */
export interface WaterMaterialTextureSlot {
  readonly slot: string;
  readonly label: string;
  readonly group: "normal" | "caustics" | "foam" | "intersection";
  readonly isSRGBColorSpace: boolean;
}

export interface WaterMaterialTextureMetadata {
  readonly width: number;
  readonly height: number;
  readonly isSRGBColorSpace: boolean;
}

const detail = (index: number): WaterMaterialTextureSlot =>
  Object.freeze({
    slot: `material_Water_appearance_appearance_detailLayers_${index}_texture`,
    label: `Detail normal ${index}`,
    group: "normal",
    isSRGBColorSpace: false
  });
const ocean = (name: string, label: string, group: WaterMaterialTextureSlot["group"]): WaterMaterialTextureSlot =>
  Object.freeze({ slot: `material_Ocean_${name}`, label, group, isSRGBColorSpace: group !== "normal" });

export const WATER_MATERIAL_TEXTURE_SLOTS = Object.freeze({
  lake: Object.freeze([detail(0), detail(1)]),
  river: Object.freeze([
    detail(0),
    detail(1),
    Object.freeze({
      slot: "material_Water_appearance_appearance_caustics_texture",
      label: "Caustics",
      group: "caustics",
      isSRGBColorSpace: true
    } satisfies WaterMaterialTextureSlot)
  ]),
  ocean: Object.freeze([
    ocean("smoothWaves", "Smooth waves", "normal"),
    ocean("roughWaves", "Rough waves", "normal"),
    ocean("caustics", "Caustics", "caustics"),
    ocean("foam", "Foam", "foam"),
    ocean("intersectionNoise", "Intersection noise", "intersection")
  ])
});

/** Validate resolved asset metadata without changing the shared Texture's settings. */
export function validateWaterMaterialTextureMetadata(
  slot: WaterMaterialTextureSlot,
  texture: WaterMaterialTextureMetadata
): void {
  if (
    !texture ||
    !Number.isInteger(texture.width) ||
    texture.width <= 0 ||
    !Number.isInteger(texture.height) ||
    texture.height <= 0
  )
    throw new TypeError(`Water texture '${slot.slot}' requires positive integer 2D dimensions.`);
  if (texture.isSRGBColorSpace !== slot.isSRGBColorSpace)
    throw new TypeError(
      `Water texture '${slot.slot}' requires ${slot.isSRGBColorSpace ? "sRGB" : "linear"} color space.`
    );
}
