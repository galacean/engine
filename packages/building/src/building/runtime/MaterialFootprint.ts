/** Version-1 bindings use this reference specification across material families.
 * Native masonry has deliberately varied proportions (including wider quoins),
 * so author dimensions drive its characteristic spans rather than forcing every
 * piece into an identical box. Unity preserves the recovered default exactly.
 */
export interface MaterialFootprint {
  width: number;
  height: number;
  depth: number;
}
export type UnitFootprintScale = Readonly<MaterialFootprint>;
export const REFERENCE_FOOTPRINT: Readonly<MaterialFootprint> = Object.freeze({
  width: 0.5,
  height: 0.4375,
  depth: 0.1
});
export const IDENTITY_UNIT_SCALE: UnitFootprintScale = Object.freeze({ width: 1, height: 1, depth: 1 });
export function unitFootprintScale(footprint?: MaterialFootprint): UnitFootprintScale {
  if (!footprint) return IDENTITY_UNIT_SCALE;
  const scale = {
    width: footprint.width / REFERENCE_FOOTPRINT.width,
    height: footprint.height / REFERENCE_FOOTPRINT.height,
    depth: footprint.depth / REFERENCE_FOOTPRINT.depth
  };
  if (Object.values(scale).some((v) => !(Math.fround(v) > 0) || !Number.isFinite(Math.fround(v))))
    throw Error("Material dimensions must have a finite positive Float32 scale");
  return scale;
}
