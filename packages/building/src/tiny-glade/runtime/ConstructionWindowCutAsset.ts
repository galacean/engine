/** CPU layer metadata and its GPU atlas are one VFS asset contract. Logical
 * indices are generator slots; `layer` selects a physical texture-array slice. */
export interface ConstructionWindowCutAsset {
  texture: string;
  layers: readonly {
    layer: number;
    bounds: { min: readonly number[]; max: readonly number[] };
  }[];
}

export function validateConstructionWindowCuts(
  input: unknown,
  textures: Record<string, { width: number; height: number; layers?: number }>
): asserts input is ConstructionWindowCutAsset {
  const value = input as ConstructionWindowCutAsset | undefined;
  const texture =
    value && typeof value.texture === "string" && Object.hasOwn(textures, value.texture)
      ? textures[value.texture]
      : undefined;
  if (
    !texture ||
    !Number.isInteger(texture.layers) ||
    texture.layers! <= 0 ||
    !Array.isArray(value?.layers) ||
    !value.layers.length
  )
    throw Error("Window-cut metadata requires a VFS texture array");
  for (const entry of value.layers) {
    if (
      !entry ||
      !Number.isInteger(entry.layer) ||
      entry.layer < 0 ||
      entry.layer > 0xffffff ||
      entry.layer >= texture.layers! ||
      !entry.bounds ||
      ![entry.bounds.min, entry.bounds.max].every(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          point.every((v) => typeof v === "number" && Number.isFinite(Math.fround(v)))
      ) ||
      entry.bounds.min.some((v: number, i: number) => !(Math.fround(entry.bounds.max[i]) > Math.fround(v)))
    )
      throw Error("Invalid window-cut layer or bounds");
  }
}

export function requireConstructionWindowCuts(
  asset: ConstructionWindowCutAsset | undefined
): ConstructionWindowCutAsset {
  if (!asset) throw Error("Construction VFS window-cut metadata is required");
  return asset;
}
