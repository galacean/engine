import { decorationMesh, type ConstructionDecorationMeshes } from "./ConstructionDecorationMeshes";
import type { ConstructionDecorationCollisions } from "./ConstructionDecorationCollisions";
import type { DecorationAssembly } from "./ConstructionDecorationAssembly.ts";
import {
  decorationMountPosition,
  decorationWallCoordinate,
  type DecorationMountFrame
} from "./DecorationMountGeometry";
import type { PlannedDecorationAssembly } from "./DecorationAssemblyPlacement";
import { DecorationMaterial } from "./ConstructionDecorationMaterial.ts";
import type { DecorationSurfaceOwner } from "./DecorationSurfaceOwner";
import type { ResolvedConstructionDecorationSpec, CompiledConstructionDecorations } from "./ConstructionDecorations.ts";
import type { PublishedWallProfile } from "./PublishedWallProfile.ts";
import type { WallConnectionShape, WallConnectionWipHole } from "./WallConnectionTypes.ts";
import {
  recoveredCottageCornerPlacement,
  recoveredRectangleCornerDirections
} from "./RecoveredCottageCornerPlacement.ts";
import { shapeCurve } from "./RecoveredWallConnectionHoles.ts";

export interface WallDecorationOccupancy {
  id: string;
  u: number;
  bottom: number;
  width: number;
  height: number;
}

/** Rectangular-host adapter for the recovered rigid corner assembly. Author
 * resizing scales XZ together to preserve the corner angle, and Y separately.
 * Automatic clothesline endpoints and flower boxes are separate decorators, not window
 * components. This producer never infers such components from asset names. */
export function planConstructionCornerDecoration(
  collisions: ConstructionDecorationCollisions | undefined,
  assets: ConstructionDecorationMeshes | undefined,
  building: DecorationSurfaceOwner,
  shape: WallConnectionShape,
  profile: PublishedWallProfile,
  spec: ResolvedConstructionDecorationSpec,
  assembly: DecorationAssembly,
  excludedHoles: readonly WallConnectionWipHole[],
  occupied: WallDecorationOccupancy[],
  result: CompiledConstructionDecorations,
  mountOffset = 0
): PlannedDecorationAssembly | undefined {
  const reject = (
    code: CompiledConstructionDecorations["diagnostics"][number]["code"],
    reason: string,
    relatedIds?: string[]
  ) => result.diagnostics.push({ id: spec.id, code, reason, ...(relatedIds ? { relatedIds } : {}) });
  if (shape.type !== "rectangle") {
    reject(
      "UNSUPPORTED_ATTACHMENT",
      "This corner window requires a rectangular wall corner; curved-host corner attachment is not connected"
    );
    return;
  }
  const curve = shapeCurve(shape, 0.5),
    wallU = spec.u!;
  const cornerId = curve.knots.slice(0, 4).findIndex((k) => Math.abs(k - wallU) <= 1e-7);
  if (cornerId < 0) {
    reject(
      "UNSUPPORTED_ATTACHMENT",
      `Corner window requires a corner u: ${curve.knots.slice(0, 4).join(", ")}; received ${wallU}`
    );
    return;
  }
  const sample = (u: number, values: readonly number[]) => {
    const [i, t] = profile.projected.coord(((u % 1) + 1) % 1);
    return values[i] * (1 - t) + values[i + 1] * t;
  };
  const datum = curve.points[cornerId];
  const dx = datum[0] - shape.center[0],
    dz = datum[1] - shape.center[1];
  const [c, s] = shape.orientation;
  const ox = Math.sign(c * dx + s * dz) * mountOffset,
    oz = Math.sign(-s * dx + c * dz) * mountOffset;
  const corner: [number, number] = [datum[0] + c * ox - s * oz, datum[1] + s * ox + c * oz],
    sx = spec.width / (assembly.bounds.max[0] - assembly.bounds.min[0]),
    sy = spec.height / (assembly.bounds.max[1] - assembly.bounds.min[1]),
    pivotY = sample(wallU, profile.bottom) + spec.bottom - assembly.bounds.min[1] * sy;
  const recovered = recoveredRectangleCornerDirections(cornerId as 0 | 1 | 2 | 3, shape.orientation);
  const native = recoveredCottageCornerPlacement(collisions, {
    rank: spec.rank,
    corner,
    ...recovered,
    wallX: wallU * curve.length,
    pivotY: 0,
    wooden: building.wallMaterial === 1
  });
  const chart = {
    kind: "wall-perimeter" as const,
    points: curve.points.map((p) => [...p]),
    knots: [...curve.knots],
    minimumY: profile.minGround,
    height: profile.topY - profile.minGround
  };
  const project = (world: readonly number[]) => decorationWallCoordinate(chart, world);
  const frame = (origin: readonly number[], normal: readonly number[], scaleX = 1) => ({
    origin: [
      corner[0] + (origin[0] - corner[0]) * sx,
      pivotY + origin[1] * sy,
      corner[1] + (origin[2] - corner[1]) * sx
    ],
    axes: [
      [normal[1] * scaleX * sx, 0, -normal[0] * scaleX * sx],
      [0, sy, 0],
      [normal[0] * sx, 0, normal[1] * sx]
    ] as [number[], number[], number[]]
  });
  const mainMount = frame(native.origin, native.normalXZ);
  const partMounts: Record<string, DecorationMountFrame> = {};
  const selected: DecorationAssembly = { bounds: assembly.bounds, parts: assembly.parts.slice() };
  const lintel = decorationMesh(assets, "setdressing_window_lintel");
  native.lintels.forEach((placement, i) => {
    const suffix = `lintel-${i}`;
    selected.parts.push({
      name: "setdressing_window_lintel",
      suffix,
      mesh: lintel,
      material: DecorationMaterial.frame,
      binding: { role: "body" }
    });
    partMounts[suffix] = frame(placement.origin, placement.normalXZ, placement.scaleX);
  });
  const holes = [
    native.hole,
    ...(native.lintelHole ? [{ ...native.lintelHole, decorationRecess: true as const }] : [])
  ].map((h) => ({
    ...h,
    centerY: pivotY + h.centerY * sy,
    width: h.width * sx,
    height: h.height * sy
  }));
  let reach = Math.max(...holes.map((h) => h.width * 0.5)),
    minY = Infinity,
    maxY = -Infinity;
  const cyclic = (a: number, b: number) => Math.abs(((a - b + curve.length * 1.5) % curve.length) - curve.length * 0.5);
  // Fit the source geometry without allocating normals, material data or render meshes.
  for (const part of selected.parts)
    for (let i = 0; i < part.mesh.positions.length; i += 3) {
      const p = decorationMountPosition(partMounts[part.suffix] ?? mainMount, part.mesh.positions.slice(i, i + 3)),
        u = project(p);
      reach = Math.max(reach, cyclic(u * curve.length, wallU * curve.length));
      for (const dir of recovered.edgeDirs)
        reach = Math.max(reach, (p[0] - corner[0]) * dir[0] + (p[2] - corner[1]) * dir[1]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
      if (p[1] > sample(u, profile.top) + 0.02) {
        reject("INSUFFICIENT_SPACE", "Corner window or its lintels exceed the incident wall height");
        return;
      }
    }
  const beforeLength =
    (curve.knots[cornerId] - (cornerId ? curve.knots[cornerId - 1] : curve.knots[3] - 1)) * curve.length;
  const afterLength = (curve.knots[cornerId + 1] - curve.knots[cornerId]) * curve.length;
  // Use the unprojected native reach as well: projection clamps to a face end
  // and must not make an overlarge frame appear to fit a very small house.
  reach = Math.max(reach, native.halfReach * sx);
  if (reach + 0.04 >= Math.min(beforeLength, afterLength)) {
    reject("INSUFFICIENT_SPACE", `Corner window needs ${reach + 0.04} metres along both incident walls`);
    return;
  }
  const width = reach * 2,
    u = wallU * curve.length;
  if (
    excludedHoles.some(
      (h) =>
        cyclic(u, h.centerU) < (width + h.width) * 0.5 &&
        maxY > h.centerY - h.height * 0.5 &&
        minY < h.centerY + h.height * 0.5
    )
  ) {
    reject("HOST_REMOVED", "Corner window intersects a wall removed by an adjacent building");
    return;
  }
  const overlaps = occupied.filter(
    (p) => cyclic(u, p.u) < (width + p.width) * 0.5 && maxY > p.bottom && minY < p.bottom + p.height
  );
  if (overlaps.length) {
    reject(
      "OVERLAP",
      "Corner window overlaps an existing attachment",
      overlaps.map((p) => p.id)
    );
    return;
  }
  occupied.push({ id: spec.id, u, bottom: minY, width, height: maxY - minY });
  result.holes.push(...holes.map((h) => ({ ...h, decorationId: spec.id })));
  const cutFrame = frame(native.windowCut.origin, native.windowCut.normalXZ);
  result.windowCuts.push({
    id: spec.id,
    cut: {
      ...native.windowCut,
      anchor: [native.windowCut.anchor[0], pivotY],
      origin: [cutFrame.origin[0], cutFrame.origin[1], cutFrame.origin[2]],
      scaleXY: [sx, sy]
    }
  });
  return {
    decorationId: spec.id,
    mount: { ...mainMount, partMounts, chart, stones: [] },
    placement: {
      building: { id: building.id, woodColor: building.woodColor },
      spec,
      assembly: selected,
      kind: "window"
    }
  };
}
