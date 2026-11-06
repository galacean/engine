/** Material identity survives batching and LOD; it is not the attachment kind.
 * Keep the packed payload exactly representable as a Float32 vertex attribute. */
export const DecorationMaterial = {
  solid: 0,
  frame: 1,
  lattice: 2,
  glass: 3,
  doorWood: 4,
  doorMetal: 5,
  lanternBody: 6,
  lanternEmission: 7,
  texturedLattice: 8,
  texturedGlass: 9
} as const;
export const decorationMaterialStride = 16;
export function validDecorationMaterial(kind: number, color: number): boolean {
  return (
    Number.isInteger(kind) &&
    kind >= 0 &&
    kind <= DecorationMaterial.texturedGlass &&
    Number.isInteger(color) &&
    color >= 0 &&
    color <=
      (kind === DecorationMaterial.frame || kind === DecorationMaterial.doorWood
        ? 10
        : kind === DecorationMaterial.lanternEmission
          ? 4
          : 0)
  );
}
export function packDecorationMaterial(kind: number, color: number): number {
  if (!validDecorationMaterial(kind, color)) throw Error("Invalid decoration material");
  return kind + decorationMaterialStride * color;
}
