/** Static CPU mesh consumed by both resident and distance compilation. */
export interface RoofSpireAsset {
  positions: number[][];
  normals: number[][];
  profileMultipliers: number[];
  indices: number[];
  /** Linear RGB of the retained finial finish. */
  color: number[];
}
export function validateRoofSpireAsset(value: unknown): asserts value is RoofSpireAsset {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Missing roof spire asset");
  const mesh = value as RoofSpireAsset;
  if (
    Object.keys(mesh).some((key) => !["positions", "normals", "profileMultipliers", "indices", "color"].includes(key))
  )
    throw Error("Unknown roof spire mesh field");
  const finite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && Number.isFinite(Math.fround(v));
  const vectors = (v: unknown): v is number[][] =>
    Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 3 && p.every(finite));
  if (!Array.isArray(mesh.color) || mesh.color.length !== 3 || !mesh.color.every((v) => finite(v) && v >= 0))
    throw Error("Invalid roof spire color");
  if (
    !vectors(mesh.positions) ||
    !mesh.positions.length ||
    !vectors(mesh.normals) ||
    mesh.normals.length !== mesh.positions.length ||
    !Array.isArray(mesh.profileMultipliers) ||
    mesh.profileMultipliers.length !== mesh.positions.length ||
    !mesh.profileMultipliers.every(finite) ||
    !Array.isArray(mesh.indices) ||
    !mesh.indices.length ||
    mesh.indices.length % 3 ||
    !mesh.indices.every((i) => Number.isInteger(i) && i >= 0 && i < mesh.positions.length)
  )
    throw Error("Invalid roof spire mesh geometry");
}
