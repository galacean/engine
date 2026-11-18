// The size online installed each decoration type and rank at (width, height and depth in metres),
// frozen with the other online values. Acceptance cases install their decorations at these sizes,
// so that what they compare with online starts from the same input.
import { frozen } from "./baseline";

const SIZES = frozen<Record<string, Record<string, [number, number, number]>>>("CoreDecorationSizes");

export function decorationSize(type: string, rank: number) {
  const size = SIZES[type]?.[rank];
  if (!size) throw Error(`No frozen size for ${type}/${rank}`);
  return { rank, width: size[0], height: size[1], depth: size[2], installationSize: size };
}
