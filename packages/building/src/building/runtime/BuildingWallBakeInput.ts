import { Matrix } from "@galacean/engine-math";
import type { BuildingGroupDef } from "../core";
import type { BuildingFootprint } from "../partTypes";
import { DecorationMaterial } from "./ConstructionDecorationMaterial";
import type { ConstructionDecorationPart } from "./ConstructionDecorations";
import { constructionLanternColors } from "./ConstructionLanternShader";
import { bakeWallAtlas, type WallBakeLamp } from "./BuildingWallAtlas";

export interface BuildingWallLamp {
  id: string;
  ownerId: string;
  decorationId?: string;
  position: [number, number, number];
  color: [number, number, number];
  intensity: number;
  range: number;
}

/** Capture the native lamp geometry once in the worker, including filaments authored off. */
export function buildingWallLamps(parts: readonly ConstructionDecorationPart[]): BuildingWallLamp[] {
  const lamps: BuildingWallLamp[] = [];
  for (const part of parts) {
    if (part.kind !== "wall-lamp" && part.kind !== "lantern") continue;
    const position: [number, number, number] = [0, 0, 0];
    let intensity = 0,
      count = 0;
    for (let i = 0; i < part.emission.length; i++) {
      const filament = part.appearance?.kinds[i] === DecorationMaterial.lanternEmission;
      if (!filament && part.emission[i] <= 0) continue;
      const centers = filament ? part.appearance!.centers : part.positions;
      for (let axis = 0; axis < 3; axis++) position[axis] += centers[3 * i + axis];
      intensity += part.emission[i];
      count++;
    }
    if (!count) continue;
    for (let axis = 0; axis < 3; axis++) position[axis] /= count;
    lamps.push({
      id: part.id,
      ownerId: part.ownerId,
      decorationId: part.decorationId,
      position,
      color: [...constructionLanternColors[part.appearance?.colorIds[0] ?? 0]],
      intensity: intensity / count,
      range: 3.5
    });
  }
  return lamps;
}

/** Endpoints of an oriented native facade in the XZ plane. */
export type WallBakeEdge = readonly [number, number, number, number];
/** One emitter has its own UV projection even when several emitters sample the same cached image. */
export interface BuildingWallBakeInput {
  /** The solved building and lamp layout, independent of its instance and paint. */
  readonly typeKey: string;
  /** Resource key; unrelated buildings can use the same planar wall-lamp patch. */
  readonly key: string;
  readonly owner: string;
  /** Native emitter identity and the authored decoration part controlling it, local to the owner. */
  readonly lampId: string;
  readonly partId: string;
  /** Canonical frame of the entire layout; individual planar patches can face different directions. */
  readonly layoutYaw: number;
  readonly origin: [number, number, number];
  readonly planar?: true;
  /** Radius of the published exterior receiver, including the wall finish. */
  readonly circleRadius?: number;
  /** Engine rotation around +Y, in radians. Local-to-frame = T(origin) * Ry(yaw). */
  readonly yaw: number;
  readonly edges: readonly WallBakeEdge[];
  readonly lamp: WallBakeLamp;
  readonly matrix?: readonly number[];
  readonly inverse?: readonly number[];
}

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const millimetres = (v: number) => Math.round(v * 1000) / 1000;
const compareNumbers = (a: readonly number[], b: readonly number[]) => {
  for (let i = 0; i < a.length; ++i) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

function mergeStraightEdges(edges: readonly WallBakeEdge[]) {
  // The publisher samples even straight sides at regular intervals. Join straight runs
  // before quantisation so a different tessellation or an opening cannot split a type.
  const result: WallBakeEdge[] = [];
  for (const edge of edges) {
    if (Math.hypot(edge[2] - edge[0], edge[3] - edge[1]) < 0.0005) continue;
    const prev = result.at(-1);
    if (prev && Math.hypot(prev[2] - edge[0], prev[3] - edge[1]) < 0.001) {
      const dx = edge[2] - prev[0],
        dz = edge[3] - prev[1],
        length = Math.hypot(dx, dz);
      const along = (edge[0] - prev[0]) * dx + (edge[1] - prev[1]) * dz;
      if (
        along > 0 &&
        along < length * length &&
        Math.abs((edge[0] - prev[0]) * dz - (edge[1] - prev[1]) * dx) < length * 0.0005
      ) {
        result[result.length - 1] = [prev[0], prev[1], edge[2], edge[3]];
        continue;
      }
    }
    result.push(edge);
  }
  return result;
}

/** A single outward plane samples one lamp-centred patch. All other wall planes must
 * face away from the emitter; checking even distant planes keeps the choice valid
 * when instances are subsequently scaled. Actual geometry clips the patch at corners. */
function singlePlaneProjection(
  edges: readonly WallBakeEdge[],
  source: BuildingWallLamp
): Pick<BuildingWallBakeInput, "key" | "planar" | "origin" | "yaw" | "edges" | "lamp"> | undefined {
  const [lx, ly, lz] = source.position;
  let plane: { nx: number; nz: number; distance: number } | undefined;
  for (const [ax, az, bx, bz] of edges) {
    const dx = bx - ax,
      dz = bz - az,
      len = Math.hypot(dx, dz);
    const nx = -dz / len,
      nz = dx / len;
    const distance = (lx - ax) * nx + (lz - az) * nz;
    if (distance <= 0) continue;
    if (
      plane &&
      (Math.abs(nx - plane.nx) > 1e-5 || Math.abs(nz - plane.nz) > 1e-5 || Math.abs(distance - plane.distance) > 0.001)
    )
      return undefined;
    plane = { nx, nz, distance };
  }
  if (!plane) return undefined;
  const { nx, nz, distance } = plane;
  const clearance = millimetres(distance);
  const lamp: WallBakeLamp = { position: [0, 0, clearance], range: Math.fround(source.range) };
  return {
    planar: true,
    key: JSON.stringify(["plane", lamp]),
    origin: [lx - nx * distance, ly, lz - nz * distance],
    yaw: Math.atan2(nx, nz),
    edges: [[-lamp.range, 0, lamp.range, 0]],
    lamp
  };
}

export function buildingWallBakeInputs(
  groups: readonly BuildingGroupDef[],
  contours: ReadonlyMap<string, readonly WallBakeEdge[]>,
  lights: readonly BuildingWallLamp[]
): BuildingWallBakeInput[] {
  const result: BuildingWallBakeInput[] = [];
  for (const group of groups) {
    const fixtures = lights.filter((l) => l.ownerId === group.id && l.range > 0 && l.intensity >= 0);
    const contour = contours.get(group.id);
    if (!fixtures.length || !contour?.length) continue;
    const edges = mergeStraightEdges(contour);
    if (!edges.length) continue;
    const house = group.shared?.house as { footprint?: BuildingFootprint } | undefined;
    const r = house?.footprint?.rectangle,
      c = house?.footprint?.circle,
      first = edges[0];
    const [x, z] = r?.center ?? c?.center ?? first;
    const yaw = -(r?.rotation ?? c?.phase ?? Math.atan2(first[3] - first[1], first[2] - first[0]));
    const cy = Math.cos(yaw),
      sy = Math.sin(yaw);
    // Absolute installation height varies with terrain. Only relative lamp heights determine
    // this field; walls/doors still clip it with actual rendered geometry.
    const y = Math.min(...fixtures.map((l) => l.position[1]));
    function xz(px: number, pz: number): [number, number] {
      return [millimetres(cy * (px - x) - sy * (pz - z)), millimetres(sy * (px - x) + cy * (pz - z))];
    }
    const localEdges = edges
      .map(([ax, az, bx, bz]): WallBakeEdge => [...xz(ax, az), ...xz(bx, bz)])
      .sort(compareNumbers);
    // The authored radius is measured at the wall centreline. The published exterior
    // can be offset by the thickness of brick, mortar and plaster.
    const radii = c ? localEdges.map(([ax, az]) => Math.hypot(ax, az)) : [];
    const circleRadius =
      radii.length && Math.max(...radii) - Math.min(...radii) < 0.003
        ? millimetres(radii.reduce((sum, radius) => sum + radius, 0) / radii.length)
        : undefined;
    const sources = fixtures.map((source) => {
      const [lx, lz] = xz(source.position[0], source.position[2]);
      const lamp: WallBakeLamp = { position: [lx, 0, lz], range: Math.fround(source.range) };
      return { source, lamp, layout: [lx, millimetres(source.position[1] - y), lz, lamp.range] };
    });
    const typeKey = JSON.stringify([
      ...(circleRadius ? ["circle"] : []),
      localEdges,
      sources.map(({ layout }) => layout).sort(compareNumbers)
    ]);
    for (const { source, lamp } of sources) {
      const projection = circleRadius ? undefined : singlePlaneProjection(edges, source);
      result.push({
        owner: group.id,
        lampId: source.id,
        partId: source.decorationId ?? source.id,
        typeKey,
        layoutYaw: yaw,
        ...(projection ?? {
          key: JSON.stringify([circleRadius ? "circle" : "facades", localEdges, lamp]),
          ...(circleRadius && { circleRadius }),
          origin: [x, source.position[1], z] as [number, number, number],
          yaw,
          edges: localEdges,
          lamp
        })
      });
    }
  }
  return result;
}

/** Equal length and dot products of the three local basis vectors preserve every
 * distance and angle in the local light field. Translation never affects it. */
export function buildingFrameMetricKey(frame: ArrayLike<number>): string | undefined {
  const metric: number[] = [];
  for (const [a, b] of [
    [0, 0],
    [0, 4],
    [0, 8],
    [4, 4],
    [4, 8],
    [8, 8]
  ]) {
    metric.push(frame[a] * frame[b] + frame[a + 1] * frame[b + 1] + frame[a + 2] * frame[b + 2]);
  }
  if (metric.every((value, index) => Math.abs(value - [1, 0, 0, 1, 0, 1][index]) < 1e-5)) return undefined;
  // Dot products that represent orthogonal axes can differ by float roundoff after rigid rotation.
  const [xx, , , yy, , zz] = metric;
  const axisProducts = [xx, Math.sqrt(xx * yy), Math.sqrt(xx * zz), yy, Math.sqrt(yy * zz), zz];
  return metric
    .map((value, i) => (Math.abs(value) < axisProducts[i] * 1e-7 ? 0 : Number(value.toPrecision(6))))
    .join(",");
}

function wallFrame(yaw: number, frame: ArrayLike<number>) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const m = identity.slice();
  for (let row = 0; row < 3; row++) {
    m[row] = frame[row] * c - frame[8 + row] * s;
    m[row + 4] = frame[row + 4];
    m[row + 8] = frame[row] * s + frame[8 + row] * c;
  }
  return m;
}

/** Rigid placement (including reflection) preserves the world-space lighting metric.
 * For supported affine render instances pass the frame world matrix before cache lookup. */
export function withBuildingWallBakeTransform(
  input: BuildingWallBakeInput,
  frame: ArrayLike<number>
): BuildingWallBakeInput {
  const m = wallFrame(input.yaw, frame);
  const metric = buildingFrameMetricKey(m);
  if (!metric) return input;
  const layoutMetric =
    input.layoutYaw === input.yaw ? metric : buildingFrameMetricKey(wallFrame(input.layoutYaw, frame));
  const inverse = new Matrix();
  if (Matrix.invert(new Matrix().copyFromArray(m), inverse) === null)
    throw Error("Wall lighting needs an invertible building transform");
  return {
    ...input,
    typeKey: layoutMetric ? input.typeKey + "@" + layoutMetric : input.typeKey,
    key: input.key + "@" + metric,
    matrix: m,
    inverse: Array.from(inverse.elements)
  };
}

export function bakeBuildingWall(input: BuildingWallBakeInput) {
  const m = input.matrix ?? identity,
    inv = input.inverse ?? identity;
  const extent = input.planar ? input.lamp.range * Math.hypot(inv[0], inv[4], inv[8]) : 0;
  const edges: readonly WallBakeEdge[] = input.planar ? [[-extent, 0, extent, 0]] : input.edges;
  return bakeWallAtlas(edges, input.lamp, m, inv, input.planar === true, input.circleRadius);
}

export type BuildingWallBakeAtlas = ReturnType<typeof bakeBuildingWall>;
