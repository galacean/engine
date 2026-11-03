import {
  DEFAULT_PLANT_SHAPE,
  type PlantGrowthRecipe,
  type PlantPoint,
  type PlantShape,
  type PlantUV
} from "./PlantGrowthRecipe";
import { sampleGrowthCurve, pointMix } from "./curves";
import { writeMeshOrganPoint } from "./PlantMeshOrgan";
import { evaluatePlant, transformPlantPoint } from "./evaluatePlant";

export interface PlantOrganRange {
  readonly id: string;
  readonly kind: string;
  readonly start: number;
  readonly count: number;
}
export interface PlantGeometry {
  readonly positions: PlantPoint[];
  readonly normals: PlantPoint[];
  readonly uvs: PlantUV[];
  readonly tintMask: number[];
  readonly indices: number[];
  readonly bounds: Readonly<{ min: PlantPoint; max: PlantPoint }>;
  readonly age: number;
  readonly maturity: number;
  readonly leafCount: number;
  readonly fruitCount: number;
  readonly organs: PlantOrganRange[];
}
type MutablePoint = [number, number, number];
const subtract = (a: PlantPoint, b: PlantPoint): PlantPoint => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: PlantPoint, b: PlantPoint): PlantPoint => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const unit = (p: PlantPoint): PlantPoint => {
  const length = Math.hypot(...p);
  return length > 1e-12 ? [p[0] / length, p[1] / length, p[2] / length] : [0, 1, 0];
};

/** Fixed topology within one recipe; any number of stems, leaf surfaces and ellipsoidal organs. */
export function generatePlantGrowthGeometry(
  recipe: PlantGrowthRecipe,
  value: number,
  shape: PlantShape = DEFAULT_PLANT_SHAPE
): PlantGeometry {
  const state = evaluatePlant(recipe, value, shape);
  const positions: PlantPoint[] = [],
    normals: PlantPoint[] = [],
    uvs: PlantUV[] = [],
    indices: number[] = [],
    tintMask: number[] = [];
  const organs: PlantOrganRange[] = [];
  const vertex = (p: PlantPoint, uv: PlantUV, mask = 0, normal: PlantPoint = [0, 0, 0]) => {
    positions.push(p);
    uvs.push(uv);
    tintMask.push(mask);
    normals.push(normal);
  };
  for (const stem of state.stems) {
    const { sides, uv, id } = stem.definition,
      path = stem.path;
    const start = positions.length;
    for (let i = 0; i < path.length; i++) {
      const tangent: PlantPoint =
        i === 0
          ? unit(stem.definition.startDirection ?? subtract(path[1], path[0]))
          : unit(subtract(path[Math.min(i + 1, path.length - 1)], path[i - 1]));
      const right = unit(cross(tangent, Math.abs(tangent[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0]));
      const up = unit(cross(right, tangent));
      for (let side = 0; side < sides; side++) {
        const angle = (side / sides) * Math.PI * 2;
        const normal = [0, 1, 2].map(
          (axis) => right[axis] * Math.cos(angle) + up[axis] * Math.sin(angle)
        ) as MutablePoint;
        vertex(
          [
            path[i][0] + normal[0] * stem.radii[i],
            path[i][1] + normal[1] * stem.radii[i],
            path[i][2] + normal[2] * stem.radii[i]
          ],
          uv
        );
        if (i > 0) {
          const a = start + (i - 1) * sides + side,
            b = start + (i - 1) * sides + ((side + 1) % sides);
          indices.push(a, b, a + sides, b, b + sides, a + sides);
        }
      }
    }
    for (const ring of [0, path.length - 1]) {
      const center = positions.length;
      vertex(path[ring], uv);
      for (let side = 0; side < sides; side++) {
        const a = start + ring * sides + side,
          b = start + ring * sides + ((side + 1) % sides);
        indices.push(center, ring === 0 ? b : a, ring === 0 ? a : b);
      }
    }
    organs.push({ id, kind: "stem", start, count: positions.length - start });
  }
  for (const leaf of state.leaves) {
    const start = positions.length,
      { columns, rows, uvs: leafUVs } = leaf.surface;
    for (let i = 0; i < leaf.points.length; i++) {
      const p = leaf.points[i].map((v) => v * leaf.scale) as MutablePoint;
      vertex(transformPlantPoint(p, leaf.anchor.position, leaf.anchor.azimuth, shape.leafSpread), leafUVs[i]);
    }
    for (let row = 0; row < rows - 1; row++)
      for (let col = 0; col < columns - 1; col++) {
        const a = start + row * columns + col,
          b = a + 1,
          c = a + columns,
          d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    organs.push({ id: leaf.definition.id, kind: "leaf", start, count: positions.length - start });
  }
  let meshLeafCount = 0,
    meshFruitCount = 0;
  for (const mesh of recipe.meshes ?? []) {
    const start = positions.length,
      anchor = state.anchors.get(mesh.anchor)!;
    const pose = sampleGrowthCurve(mesh.poses, state.age, (a, b, t) => ({
      scale: pointMix(a.scale, b.scale, t),
      unfold: a.unfold + (b.unfold - a.unfold) * t,
      tilt: (a.tilt ?? 0) + ((b.tilt ?? 0) - (a.tilt ?? 0)) * t
    }));
    if (pose.scale.some((v) => v > 1e-5)) {
      if (mesh.kind === "leaf") meshLeafCount++;
      if (mesh.kind === "fruit") meshFruitCount++;
    }
    for (let i = 0; i < mesh.positions.length; i++) {
      const out: MutablePoint = [0, 0, 0];
      writeMeshOrganPoint(
        out,
        mesh.positions[i],
        pose,
        pose,
        0,
        anchor.position,
        anchor.azimuth,
        mesh.kind === "leaf" ? shape.leafSpread : 1,
        mesh.kind === "fruit" ? shape.fruitScale : 1
      );
      vertex(out, mesh.uvs[i], mesh.tint ? 1 : 0);
    }
    for (const index of mesh.indices) indices.push(start + index);
    organs.push({ id: mesh.id, kind: mesh.kind, start, count: mesh.positions.length });
  }
  const smoothNormals = normals as MutablePoint[];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i],
      b = indices[i + 1],
      c = indices[i + 2];
    const n = cross(subtract(positions[b], positions[a]), subtract(positions[c], positions[a]));
    for (const v of [a, b, c]) for (let axis = 0; axis < 3; axis++) smoothNormals[v][axis] += n[axis];
  }
  for (let i = 0; i < normals.length; i++) normals[i] = unit(normals[i]);
  let fruitCount = meshFruitCount;
  for (const volume of state.volumes) {
    const start = positions.length,
      { center, radii, scale } = volume;
    if (volume.definition.kind === "fruit" && scale > 1e-5 && radii.some((r) => r > 1e-5)) fruitCount++;
    for (const p of ICOSAHEDRON_POINTS)
      vertex(
        [center[0] + p[0] * radii[0] * scale, center[1] + p[1] * radii[1] * scale, center[2] + p[2] * radii[2] * scale],
        volume.definition.uv,
        volume.definition.tint ? 1 : 0,
        unit([p[0] / Math.max(1e-12, radii[0]), p[1] / Math.max(1e-12, radii[1]), p[2] / Math.max(1e-12, radii[2])])
      );
    for (const index of ICOSAHEDRON_INDICES) indices.push(start + index);
    organs.push({ id: volume.definition.id, kind: volume.definition.kind, start, count: positions.length - start });
  }
  const min: MutablePoint = [Infinity, Infinity, Infinity],
    max: MutablePoint = [-Infinity, -Infinity, -Infinity];
  for (const p of positions)
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], p[axis]);
      max[axis] = Math.max(max[axis], p[axis]);
    }
  return {
    positions,
    normals,
    uvs,
    tintMask,
    indices,
    bounds: { min, max },
    age: state.age,
    maturity: state.maturity,
    fruitCount,
    leafCount: meshLeafCount + state.leaves.filter((l) => l.scale > 1e-5).length,
    organs
  };
}

const PHI = (1 + Math.sqrt(5)) / 2;
export const ICOSAHEDRON_POINTS: readonly PlantPoint[] = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1]
].map((p) => p.map((v) => v / PHI) as MutablePoint);
const ICOSAHEDRON_INDICES = [
  0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3,
  2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
];
