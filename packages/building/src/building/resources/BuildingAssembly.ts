import { Matrix, Vector3 } from "@galacean/engine-math";
import { validDecorationMaterial } from "../runtime/ConstructionDecorationMaterial";

/** Read-only compilation output of a native prefab hierarchy. */
export interface AssemblyBinding {
  role: "body" | "frame" | "glass";
  stoneTemplate?: string;
  localMatrix?: number[];
}
export function assemblyRole(value: string): AssemblyBinding["role"] {
  if (!["body", "frame", "glass"].includes(value)) throw Error("Invalid assembly attachment role: " + value);
  return value as AssemblyBinding["role"];
}
export interface BuildingAssembly {
  selected: [name: string, suffix: string, material: number, emissionOrigin?: number[], binding?: AssemblyBinding][];
}
/** An opening in a prefab's own x/y plane. */
export interface BuildingPrefabOpening {
  min: [number, number];
  max: [number, number];
}
/** A member drawn with an arrangement unit, such as a stone hat. `matrix` is its pose in
 * the prefab. With a span it bends along the surface the prefab is mounted on, from
 * x = span[0] to x = span[1] of the prefab; without one it is placed rigidly. */
export interface BuildingPrefabUnitMember {
  unit: string;
  path: string;
  matrix: number[];
  span?: [number, number];
}
/** Read-only compilation output of a building prefab: its members, with the prefab's poses
 * baked into their meshes, its unit members, and the openings it takes out of a wall. The
 * openings together form one opening. */
export interface BuildingPrefab {
  /** `stoneFrame` is the frame's stone alternative, drawn when the frame takes the wall's
   * material: a stone unit of the kit and the member's pose in the prefab. */
  members: [
    name: string,
    suffix: string,
    material: number,
    emissionOrigin?: number[],
    stoneFrame?: { template: string; matrix: number[] }
  ][];
  units: BuildingPrefabUnitMember[];
  openings: BuildingPrefabOpening[];
  /** Metres taken off the opening's width on a curved wall. */
  curvedNarrowing: number;
  /** The right half of the small roof the prefab carries out of a roof slope, from its peak
   * at x = 0 down to its eave, in the prefab's x/y plane. */
  roofProfile?: [number, number][];
}
/** A building prefab with the bounds of its baked members. */
export interface CompiledBuildingPrefab extends BuildingPrefab {
  bounds: { min: number[]; max: number[] };
}

export function assemblyEmissionOrigin(origin: number[] | undefined, matrix: readonly number[]): number[] | undefined {
  if (!origin) return undefined;
  if (origin.length !== 3 || !origin.every(Number.isFinite)) throw Error("Invalid assembly emission origin");
  return transformAssemblyAttribute(origin, "Vertex_Position", matrix);
}

export function validateAssemblyPart(name: string, matrix: readonly number[], surfaceKind: number | undefined): void {
  if (!name || matrix.length !== 16 || !matrix.every(Number.isFinite) || !validDecorationMaterial(surfaceKind!, 0))
    throw Error("Invalid building assembly part: " + name);
  const m = new Matrix();
  m.copyFromArray(matrix);
  // Mirroring needs winding/tangent parity handling; reject rather than silently change culling.
  if (!(m.determinant() > 1e-12)) throw Error("Assembly transform requires a positive nonsingular determinant");
}

/** Bake only a derived CPU copy. The native Mesh and authored hierarchy stay untouched. */
export function transformAssemblyAttribute(values: number[], semantic: string, matrix: readonly number[]): number[] {
  if (matrix.every((v, i) => v === (i % 5 === 0 ? 1 : 0))) return values;
  const position = semantic === "Vertex_Position";
  const normal = semantic === "Vertex_Normal";
  if (!position && !normal && semantic !== "tangent" && semantic !== "bitangent") return values;
  const m = new Matrix();
  m.copyFromArray(matrix);
  if (normal) {
    m.invert();
    m.transpose();
  }
  const result: number[] = [],
    v = new Vector3();
  for (let i = 0; i < values.length; i += 3) {
    v.set(values[i], values[i + 1], values[i + 2]);
    if (position) Vector3.transformCoordinate(v, m, v);
    else {
      Vector3.transformNormal(v, m, v);
      v.normalize();
    }
    result.push(v.x, v.y, v.z);
  }
  return result;
}
