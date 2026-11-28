import defaults from "../planning-data/tree-whitebox.json";
import type { PlanLandscape } from "./IslandPlanModel";
import type { V2Box } from "../spatial/V2Model.ts";
/** Separate trunk collision from the canopy envelope using only OBBs.
 * Canopy envelopes remain opaque approximations, not leaf-level asset visibility guarantees.
 */
export function treeWhiteboxes(tree: PlanLandscape, base: number): V2Box[] {
  const q = tree.treeShape ?? defaults;
  if (![q.trunkWidthRatio, q.crownBaseRatio, q.crownTopRatio].every((n) => Number.isFinite(n) && n > 0 && n < 1))
    throw new Error("树木OBB形状比例无效");
  const make = (suffix: string, w: number, d: number, bottom: number, height: number, collision: boolean): V2Box => ({
    id: `${tree.id}:${suffix}`,
    label: suffix,
    center: tree.center,
    sizeX: w,
    sizeZ: d,
    sizeY: height,
    yaw: tree.yaw,
    elevation: base + bottom,
    collision,
    occlusion: true
  });
  const crownBottom = tree.height * q.crownBaseRatio,
    crownHeight = tree.height - crownBottom;
  return [
    make(
      "trunk",
      tree.width * q.trunkWidthRatio,
      tree.depth * q.trunkWidthRatio,
      0,
      crownBottom + crownHeight * 0.6,
      true
    ),
    make("crown", tree.width, tree.depth, crownBottom, crownHeight * 0.65, false),
    make(
      "crown-top",
      tree.width * q.crownTopRatio,
      tree.depth * q.crownTopRatio,
      crownBottom + crownHeight * 0.55,
      crownHeight * 0.45,
      false
    )
  ];
}
