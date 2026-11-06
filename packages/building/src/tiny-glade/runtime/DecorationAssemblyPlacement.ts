import { RoofCurve } from "./RecoveredRoofMath";
import { closestWallCurveCoordinate } from "./RecoveredWallSpace";
import { SurfaceProjector } from "./SurfaceProjector.js";
import {
  decorationWallCoordinate,
  type DecorationMountFrame,
  type DecorationWallChart
} from "./DecorationMountGeometry";
import type { DecorationAssembly } from "./ConstructionDecorationAssembly";
import type { ConstructionDecorationSpec, ConstructionDecorationStone } from "./ConstructionDecorations";
import { decorationAssemblyGeometry } from "./ConstructionDecorationGeometry";
import { constructionDecorationFrame } from "./ConstructionDecorationFrames";

/** Resolved mounting geometry. This is transient design output, not another
 * author recipe. Exact affine columns preserve native producer precision. */
export interface DecorationAssemblyMount {
  origin: readonly number[];
  axes: readonly [readonly number[], readonly number[], readonly number[]];
  /** Per-member frames inside one selected asset assembly (for example corner lintels). */
  partMounts?: Record<string, DecorationMountFrame>;
  glassOrigin?: readonly number[];
  lightPosition?: readonly [number, number, number];
  stones: ConstructionDecorationStone[];
  chart:
    | { kind: "mesh"; geometry: any }
    | (DecorationWallChart & { kind: "wall-perimeter"; minimumY: number; height: number })
    | { kind: "wall-curve"; points: number[][]; referenceU: number; minimumY: number; height: number }
    | { kind: "wall"; u: number; centerX: number; scaleX: number; length: number; minimumY: number; height: number }
    | {
        kind: "flat-roof";
        x: number;
        z: number;
        cosine: number;
        sine: number;
        normalX: number;
        normalZ: number;
        scale: number;
        width: number;
        depth: number;
      };
}
export interface DecorationAssemblyPlacement {
  building: { id: string; woodColor: number };
  spec: ConstructionDecorationSpec;
  assembly: DecorationAssembly;
  kind: string;
  frameAttributes?: {
    seed: number;
    wallSlot: number;
    wallRange: readonly [number, number];
    meshSizeX: number;
    woodenWall: boolean;
  };
}
export interface PlannedDecorationAssembly {
  decorationId: string;
  mount: DecorationAssemblyMount;
  placement: DecorationAssemblyPlacement;
}
/** Place the chosen asset at already solved mounts. No occupancy, opening or
 * host discovery happens here; all of those belong to the design stage. */
export function placeDecorationAssembly(
  mount: DecorationAssemblyMount,
  input: DecorationAssemblyPlacement,
  preparedProjector?: SurfaceProjector
) {
  const { building, spec, assembly, kind, frameAttributes } = input;
  const { origin, axes, chart } = mount;
  const projector = chart.kind === "mesh" ? (preparedProjector ?? new SurfaceProjector(chart.geometry)) : undefined;
  const curve = chart.kind === "wall-curve" ? new RoofCurve(chart.points) : undefined;
  const editUV = (source: readonly number[], world: readonly number[]) => {
    if (chart.kind === "mesh") return (projector!.anchor(world) as [number[], unknown])[0].slice();
    if (chart.kind === "wall-perimeter")
      return [decorationWallCoordinate(chart, world), (world[1] - chart.minimumY) / Math.max(0.01, chart.height)];
    if (chart.kind === "wall-curve") {
      const u = closestWallCurveCoordinate(curve!, [world[0], world[2]]);
      let wallU = curve!.knots[u.index] * (1 - u.t) + curve!.knots[u.index + 1] * u.t;
      wallU += Math.round(chart.referenceU - wallU);
      return [wallU, (world[1] - chart.minimumY) / Math.max(0.01, chart.height)];
    }
    if (chart.kind === "wall")
      return [
        chart.u + ((source[0] - chart.centerX) * chart.scaleX) / chart.length,
        (world[1] - chart.minimumY) / Math.max(0.01, chart.height)
      ];
    const dx = (chart.normalZ * source[0] + chart.normalX * source[2]) * chart.scale;
    const dz = (-chart.normalX * source[0] + chart.normalZ * source[2]) * chart.scale;
    const x = chart.x + chart.cosine * dx + chart.sine * dz;
    const z = chart.z - chart.sine * dx + chart.cosine * dz;
    return [x + chart.width / 2, chart.depth / 2 - z];
  };
  const wallFrames = spec.frameMaterial === "wall" ? assembly.parts.filter((p) => p.binding.role === "frame") : [];
  if (wallFrames.length && !frameAttributes) throw Error("Missing native frame attributes for " + spec.type);
  const frames = wallFrames.map((frame) =>
    constructionDecorationFrame({
      id: building.id + "/" + spec.id + "/" + frame.suffix,
      ownerId: building.id,
      decorationId: spec.id,
      mesh: frame.name,
      binding: frame.binding,
      origin,
      axes,
      ...frameAttributes!
    })
  );
  const parts = assembly.parts
    .filter((p) => !wallFrames.includes(p))
    .flatMap((part) =>
      decorationAssemblyGeometry(building, spec, { bounds: assembly.bounds, parts: [part] }, kind, {
        origin:
          mount.partMounts?.[part.suffix]?.origin ??
          (part.binding.role === "glass" && mount.glassOrigin ? mount.glassOrigin : origin),
        axes: mount.partMounts?.[part.suffix]?.axes ?? axes,
        lightPosition: mount.lightPosition,
        editUV
      })
    );
  return { parts, frames, stones: mount.stones.slice() };
}
