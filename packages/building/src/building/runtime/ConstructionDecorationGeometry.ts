import { type DecorationMesh } from "./ConstructionDecorationMeshes";
import { decorationMountPosition } from "./DecorationMountGeometry";
import { DecorationMaterial as M } from "./ConstructionDecorationMaterial.ts";
import type { ConstructionDecorationPart, ConstructionDecorationSpec } from "./ConstructionDecorations.ts";
import type { DecorationSurfaceOwner } from "./DecorationSurfaceOwner";

/** The meshes of one decoration as its asset kit assembles them. */
export interface DecorationAssemblyPart {
  name: string;
  suffix: string;
  mesh: DecorationMesh;
  material: number;
  emissionOrigin?: number[];
  binding: import("../resources/BuildingAssembly").AssemblyBinding;
}
export interface DecorationAssembly {
  parts: DecorationAssemblyPart[];
  /** One bounds/pivot for the entire original assembly. Parts never recenter. */
  bounds: { min: number[]; max: number[] };
}

export interface DecorationPlacementFrame {
  /** Original assembly origin and scaled, mutually orthogonal basis columns. */
  origin: readonly number[];
  axes: readonly [readonly number[], readonly number[], readonly number[]];
  /** Published world-space point light; independent of the model scale. */
  lightPosition?: readonly [number, number, number];
  editUV: (source: readonly number[], world: readonly number[]) => number[];
}

/** One source-to-host transform for every component, its interior and emitter.
 * Material UVs stay in model space; edit UVs belong to the host surface.
 */
export function decorationAssemblyGeometry(
  building: Pick<DecorationSurfaceOwner, "id" | "woodColor">,
  spec: Pick<ConstructionDecorationSpec, "id" | "woodColor" | "lightColor" | "lightIntensity">,
  assembly: DecorationAssembly,
  kind: string,
  frame: DecorationPlacementFrame
): ConstructionDecorationPart[] {
  const transform = (p: readonly number[]) => decorationMountPosition(frame, p);
  const inverseNormals = frame.axes.map((axis) => {
    const length2 = axis.reduce((sum, v) => sum + v * v, 0);
    if (!(length2 > 0) || !Number.isFinite(length2)) throw Error("Invalid decoration placement basis");
    return axis.map((v) => v / length2);
  });
  return assembly.parts.map(({ name, suffix, mesh, material, emissionOrigin }) => {
    const lightCenter = emissionOrigin ? transform(emissionOrigin) : frame.origin;
    const part: ConstructionDecorationPart = {
      assetUnit: name,
      id: building.id + "/" + spec.id + "/" + suffix,
      ownerId: building.id,
      decorationId: spec.id,
      kind,
      tintRole: material === M.frame || material === M.doorWood ? "wooden_plank" : undefined,
      tintMask: material === M.doorWood ? mesh.metal.map((value) => value !== 1) : undefined,
      positions: [],
      normals: [],
      colors: [],
      emission: [],
      indices: mesh.indices.slice(),
      uvs: [],
      appearance: { materialUVs: [], kinds: [], colorIds: [], centers: [] }
    };
    if (material === M.lanternEmission && frame.lightPosition) part.lightPosition = [...frame.lightPosition];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const source = mesh.positions.slice(i, i + 3),
        world = transform(source);
      for (const value of world) part.positions.push(value);
      const normal = [0, 1, 2].map(
        (axis) =>
          inverseNormals[0][axis] * mesh.normals[i] +
          inverseNormals[1][axis] * mesh.normals[i + 1] +
          inverseNormals[2][axis] * mesh.normals[i + 2]
      );
      let length = Math.hypot(...normal);
      // The original glass includes vertices without normals. Use its pane axis.
      if (!length) {
        for (let axis = 0; axis < 3; axis++) normal[axis] = frame.axes[2][axis];
        length = Math.hypot(...normal);
      }
      for (const value of normal) part.normals.push(value / length);
      const surfaceKind =
        material === M.lattice && mesh.glass[i / 3] === 1
          ? M.glass
          : material === M.doorWood && mesh.metal[i / 3] === 1
            ? M.doorMetal
            : material;
      const lit =
        surfaceKind === M.lanternEmission ||
        material === M.lattice ||
        material === M.texturedLattice ||
        material === M.texturedGlass;
      part.appearance!.materialUVs.push(mesh.materialUVs[i / 3]?.slice() ?? [0, 0]);
      part.appearance!.kinds.push(surfaceKind);
      part.appearance!.colorIds.push(
        surfaceKind === M.frame || surfaceKind === M.doorWood
          ? (spec.woodColor ?? building.woodColor ?? 0)
          : surfaceKind === M.lanternEmission
            ? (spec.lightColor ?? 0)
            : 0
      );
      const center = surfaceKind === M.lanternBody || surfaceKind === M.lanternEmission ? lightCenter : frame.origin;
      for (const value of center) part.appearance!.centers.push(value);
      for (let axis = 0; axis < 3; axis++) part.colors.push(mesh.colors[i + axis]);
      part.emission.push(lit ? (spec.lightIntensity ?? (kind === "window" ? 0.12 : 1.4)) : 0);
      part.uvs!.push(frame.editUV(source, world));
    }
    return part;
  });
}
