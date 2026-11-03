export type MaterialRole = "bark" | "leaf" | "shrub" | "grass" | "flower" | "mushroom";

export interface PlantMaterialBinding {
  /** Converted native material. The renderer retains its independent authored colour. */
  readonly material?: string;
  readonly role: MaterialRole;
  /** null uses material colour directly, without a texture resource or alpha mask. */
  readonly albedo: string | null;
  readonly alphaCutoff: number;
  /** Editable linear RGB multiplier; the image contains only grayscale detail + alpha. */
  readonly baseColor: readonly [number, number, number];
  readonly sourceMaterial?: string;
  readonly component?: "stem" | "leaf";
}
export interface PlantMaterialManifest {
  readonly version: 4;
  readonly layout: "standalone";
  readonly colourMode: "grayscale-tint";
  readonly maxTextureSize: number;
  readonly textures: Readonly<
    Record<
      string,
      {
        readonly url: string;
        readonly width: number;
        readonly height: number;
        readonly wrapU: "repeat" | "clamp";
        readonly wrapV: "repeat" | "clamp";
        readonly appearanceId: string;
      }
    >
  >;
  readonly assets: Readonly<Record<string, Readonly<Record<string, PlantMaterialBinding>>>>;
}

export function validatePlantMaterialManifest(manifest: PlantMaterialManifest): void {
  if (
    manifest.version !== 4 ||
    manifest.layout !== "standalone" ||
    manifest.colourMode !== "grayscale-tint" ||
    !manifest.textures ||
    !manifest.assets ||
    !Number.isInteger(manifest.maxTextureSize) ||
    manifest.maxTextureSize < 1 ||
    manifest.maxTextureSize > 256
  )
    throw new Error("Invalid standalone plant appearance manifest");
  for (const [id, image] of Object.entries(manifest.textures)) {
    if (
      !image.url ||
      !image.appearanceId ||
      ![image.width, image.height].every(
        (size) => Number.isInteger(size) && size > 0 && size <= manifest.maxTextureSize
      ) ||
      ![image.wrapU, image.wrapV].every((wrap) => wrap === "repeat" || wrap === "clamp")
    )
      throw new Error(`Invalid plant appearance image: ${id}`);
  }
  for (const slots of Object.values(manifest.assets)) {
    for (const binding of Object.values(slots)) {
      if (
        (binding.material !== undefined && (typeof binding.material !== "string" || !binding.material)) ||
        !["bark", "leaf", "shrub", "grass", "flower", "mushroom"].includes(binding.role) ||
        (binding.albedo !== null && !Object.prototype.hasOwnProperty.call(manifest.textures, binding.albedo)) ||
        (binding.albedo === null && binding.alphaCutoff !== 0) ||
        !Array.isArray(binding.baseColor) ||
        binding.baseColor.length !== 3 ||
        !binding.baseColor.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1) ||
        !Number.isFinite(binding.alphaCutoff) ||
        binding.alphaCutoff < 0 ||
        binding.alphaCutoff > 1
      )
        throw new Error(`Invalid plant appearance binding: ${binding.albedo}`);
    }
  }
}
