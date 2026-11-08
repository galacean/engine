import { BufferMesh, BufferUtil } from "@galacean/engine-core";
import type { BuildingAssetKitComponent, NativeBuildingUnit } from "./BuildingAssetKit";
import { createDecorationMesh, type ConstructionDecorationMeshes } from "../runtime/ConstructionDecorationMeshes";
import type { ConstructionStoneGeometry } from "../runtime/ConstructionGeometryAssets";
import { validateRoofSpireAsset } from "../runtime/RoofSpireAsset";
import { validateDecorationCollisions } from "../runtime/ConstructionDecorationCollisions";
import {
  transformAssemblyAttribute,
  type BuildingAssembly,
  type BuildingPrefab,
  type CompiledBuildingPrefab
} from "./BuildingAssembly";
import { validateBuildingAssetContract } from "./BuildingAssetContract";

export type BuildingQueryMesh = Pick<
  BufferMesh,
  "vertexElements" | "vertexBufferBindings" | "indexBufferBinding" | "subMeshes" | "bounds"
>;
/** Arrangement units have one material/triangle draw. Do not silently render
 * an arbitrary native Mesh's unused indices or discard its submesh materials. */
export function validateBuildingMesh(mesh: BuildingQueryMesh): void {
  const binding = mesh.indexBufferBinding,
    sub = mesh.subMeshes[0];
  const size = binding && [1, 2, 4][binding.format];
  if (
    !binding ||
    !binding.buffer.data ||
    !size ||
    mesh.subMeshes.length !== 1 ||
    sub.topology !== 4 ||
    sub.start !== 0 ||
    sub.count % 3 !== 0 ||
    sub.count * size !== binding.buffer.data.byteLength
  )
    throw Error("Building unit Mesh requires one complete triangle submesh");
}
type QueryUnit = Pick<
  NativeBuildingUnit,
  | "family"
  | "instanceStride"
  | "directInstances"
  | "textureSlots"
  | "attributeLocations"
  | "doubleSided"
  | "localMatrix"
> & { mesh: BuildingQueryMesh };
type QueryKit = Pick<
  BuildingAssetKitComponent,
  "decorationCollisions" | "windowCuts" | "roofSpireColor" | "textures" | "neutralTextures" | "textureColors"
> & {
  roofSpireMesh: BuildingQueryMesh | null;
  gothic: Record<
    string,
    { mesh: BuildingQueryMesh; frameTemplate: string; glassTemplate: string; glassAlbedoSlot: number }
  >;
};
/** CPU facts are copied from the native mesh. No asset URL, captured layout, or GPU readback. */
export function nativeMeshAttribute(mesh: BuildingQueryMesh, name: string): { values: number[]; width: number } {
  const attribute = mesh.vertexElements.find((element) => element.attribute === name);
  if (!attribute) throw Error("Missing native mesh attribute: " + name);
  const binding = mesh.vertexBufferBindings[attribute.bindingIndex];
  const data = binding?.buffer.data;
  if (!binding || !data) throw Error("Building unit requires readable vertex data: " + name);
  const values = BufferUtil.getVertexElementData(data, attribute.format, binding.stride, attribute.offset);
  if (!values.every(Number.isFinite)) throw Error("Nonfinite native mesh attribute: " + name);
  return { values, width: values.length / (data.byteLength / binding.stride) };
}
/** Derived placement geometry; the asset's readable buffer remains immutable. */
export function scaledNativeAttribute(
  mesh: BuildingQueryMesh,
  name: string,
  scale: readonly number[],
  normal: boolean
): Float32Array {
  const attribute = nativeMeshAttribute(mesh, name);
  if (attribute.width !== 3) throw Error("Scaled unit requires XYZ position/normal attributes");
  const data = Float32Array.from(attribute.values);
  for (let i = 0; i < data.length; i += 3) {
    for (let axis = 0; axis < 3; axis++)
      data[i + axis] = normal ? data[i + axis] / scale[axis] : data[i + axis] * scale[axis];
    if (normal) {
      const length = Math.hypot(data[i], data[i + 1], data[i + 2]) || 1;
      for (let axis = 0; axis < 3; axis++) data[i + axis] /= length;
    }
  }
  return data;
}
export function nativeMeshIndices(mesh: BuildingQueryMesh): number[] {
  const binding = mesh.indexBufferBinding;
  const data = binding?.buffer.data;
  if (!binding || !data) throw Error("Building unit requires readable indexed geometry");
  return mesh.subMeshes.flatMap((sub) => BufferUtil.getIndexData(data, binding.format, sub.start, sub.count));
}
const rows = (values: number[], width: number) =>
  Array.from({ length: values.length / width }, (_, i) => values.slice(i * width, (i + 1) * width));
const bounds = (mesh: BuildingQueryMesh) => ({
  min: [mesh.bounds.min.x, mesh.bounds.min.y, mesh.bounds.min.z],
  max: [mesh.bounds.max.x, mesh.bounds.max.y, mesh.bounds.max.z]
});
export function buildingGeometry(
  kit: QueryKit,
  units: Record<string, QueryUnit>,
  decorationUnits: Record<string, QueryUnit>,
  assemblies: Record<string, BuildingAssembly> = {},
  prefabs: Record<string, BuildingPrefab> = {}
) {
  validateBuildingAssetContract(kit, units);
  const decorations: ConstructionDecorationMeshes = { meshes: {}, assemblies };
  for (const [name, unit] of Object.entries(decorationUnits)) {
    const matrix = unit.localMatrix;
    const transformed = matrix && !matrix.every((v, i) => v === (i % 5 === 0 ? 1 : 0));
    const channels = Object.fromEntries(
      unit.mesh.vertexElements.map((attribute) => {
        const { values, width } = nativeMeshAttribute(unit.mesh, attribute.attribute);
        // Match the native float vertex stream after baking the Prefab transform.
        const result = transformed ? transformAssemblyAttribute(values, attribute.attribute, matrix) : values;
        // Only transformed spatial channels need float32 rounding. Other channels
        // already came from native storage; keep integer precision and avoid copies.
        if (result !== values) for (let i = 0; i < result.length; i++) result[i] = Math.fround(result[i]);
        return [attribute.attribute, { width, values: result }];
      })
    );
    let box = bounds(unit.mesh);
    if (transformed && channels.Vertex_Position) {
      box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      channels.Vertex_Position.values.forEach((v, i) => {
        box.min[i % 3] = Math.min(box.min[i % 3], v);
        box.max[i % 3] = Math.max(box.max[i % 3], v);
      });
    }
    decorations.meshes[name] = createDecorationMesh(channels, nativeMeshIndices(unit.mesh), box, unit.doubleSided);
  }
  // A prefab's bounds enclose its baked members.
  const buildingPrefabs: Record<string, CompiledBuildingPrefab> = Object.fromEntries(
    Object.entries(prefabs).map(([key, prefab]) => {
      const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (const [name] of prefab.members) {
        const member = decorations.meshes[name].bounds;
        for (let axis = 0; axis < 3; axis++) {
          box.min[axis] = Math.min(box.min[axis], member.min[axis]);
          box.max[axis] = Math.max(box.max[axis], member.max[axis]);
        }
      }
      return [key, { ...prefab, bounds: box }];
    })
  );
  const positionMesh = (unit: QueryUnit) => ({
    positions: nativeMeshAttribute(unit.mesh, unit.attributeLocations[0]).values,
    indices: nativeMeshIndices(unit.mesh)
  });
  if (!units.wood) throw Error("Building asset kit requires its wood unit");
  const woodPillar = positionMesh(units.wood);
  const stoneGeometry: ConstructionStoneGeometry = {};
  for (const [name, unit] of Object.entries(units))
    if (unit.family === "stone-decoration") {
      stoneGeometry[name] = {
        ...positionMesh(unit),
        bounds: bounds(unit.mesh),
        ...(unit.attributeLocations[6]
          ? { bbx: nativeMeshAttribute(unit.mesh, unit.attributeLocations[6]).values }
          : {})
      };
    }
  const gothic = Object.fromEntries(
    ([1, 2, 3] as const).map((rank) => {
      const unit = kit.gothic[rank];
      if (!unit?.mesh) throw Error("Missing Gothic collision Mesh: " + rank);
      const positions = rows(nativeMeshAttribute(unit.mesh, "POSITION").values, 3);
      return [
        rank,
        {
          frameTemplate: unit.frameTemplate,
          glassTemplate: unit.glassTemplate,
          glassAlbedoSlot: unit.glassAlbedoSlot,
          collisionBounds: bounds(unit.mesh),
          geometry: { collision: { positions, indices: nativeMeshIndices(unit.mesh) } }
        }
      ];
    })
  ) as Record<
    1 | 2 | 3,
    {
      frameTemplate: string;
      glassTemplate: string;
      glassAlbedoSlot: number;
      collisionBounds: { min: number[]; max: number[] };
      geometry: { collision: { positions: number[][]; indices: number[] } };
    }
  >;
  const spire = kit.roofSpireMesh;
  if (!spire) throw Error("Roof spire requires its native Mesh");
  const roofSpire = {
    positions: rows(nativeMeshAttribute(spire, "POSITION").values, 3),
    normals: rows(nativeMeshAttribute(spire, "NORMAL").values, 3),
    profileMultipliers: nativeMeshAttribute(spire, "profileMultiplier").values,
    indices: nativeMeshIndices(spire),
    color: [...kit.roofSpireColor]
  };
  validateRoofSpireAsset(roofSpire);
  validateDecorationCollisions(kit.decorationCollisions);
  return {
    decorations,
    prefabs: buildingPrefabs,
    decorationCollisions: structuredClone(kit.decorationCollisions),
    stoneGeometry,
    windowCuts: structuredClone(kit.windowCuts),
    roofSpire,
    gothic,
    woodPillar
  };
}
export type ConstructionGeometryAssets = ReturnType<typeof buildingGeometry>;
