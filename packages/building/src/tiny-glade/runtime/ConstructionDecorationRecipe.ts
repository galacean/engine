import { cottageDormerWidth } from "./RecoveredCottageDormerPlacement";
import { decorationMeshBounds, type ConstructionDecorationMeshes } from "./ConstructionDecorationMeshes";

/** Fixed parts come exclusively from the authored Prefab. Conditional caps and
 * repeated roof sections remain procedural and participate in installation bounds. */
export function constructionDecorationRecipe(
  assets: ConstructionDecorationMeshes | undefined,
  type: string,
  rank: number
) {
  if (type === "opening-arch") return undefined;
  const assembly = assets?.assemblies?.[`${type}/${rank}`];
  if (!assembly) throw Error(`Missing decoration assembly in construction VFS: ${type}/${rank}`);
  const { selected } = assembly;
  const boundNames = selected.map(([name]) => name);
  if (type === "window-gothic" || type === "door-gothic" || type === "dormer-gothic-half")
    boundNames.push(
      type === "door-gothic" ? `balcony_door_gothic_rank${rank}_hat` : `window_gothic_${rank}x1_hat_full`
    );
  if (type === "dormer-arrow-slit-half") boundNames.push(`arrow_slit_1x${rank}_hat`);
  const defaultScale = type === "roof-lantern" ? 0.8 : 1;
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const name of boundNames) {
    const source = decorationMeshBounds(assets, name);
    for (let axis = 0; axis < 3; axis++) {
      bounds.min[axis] = Math.min(bounds.min[axis], source.min[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], source.max[axis]);
    }
  }
  const installationSize = bounds.max.map((v, i) => (v - bounds.min[i]) * defaultScale);
  if (type === "dormer-cottage") {
    // Native repeats the rank-1 body along a roof section. This is the unfolded
    // frame span, not the curved assembly's world AABB or its small roof extent.
    installationSize[0] += (cottageDormerWidth(rank as 1 | 2 | 3) * (rank - 1)) / rank;
  }
  return { selected, bounds, defaultScale, installationSize };
}
