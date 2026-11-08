// CPU packing fixtures read the actual native prefab bindings and compiled shaders.
// GPU mesh/texture handles are opaque here; browser acceptance loads the real assets.
import fs from "node:fs";
import path from "node:path";
const repo = path.resolve(import.meta.dirname, "../../..");
const directory = path.join(repo, "packages/building/src/building/assets/native");
const read = (file) => JSON.parse(fs.readFileSync(path.join(directory, file), "utf8"));
const relative = (reference) => reference.replace(/^Building\/Units\//, "");
const materials = new Map();
function material(reference) {
  const file = relative(reference);
  if (materials.has(file)) return materials.get(file);
  const descriptor = read(file), shader = read(relative(descriptor.shaderRef.url));
  const result = {
    instanceId: file,
    shader: { subShaders: shader.subShaders.map((s) => ({ passes: s.passes.map((p) => ({
      _vertexShaderInstructions: p.vertexShaderInstructions,
      _fragmentShaderInstructions: p.fragmentShaderInstructions
    })) })) }
  };
  materials.set(file, result);
  return result;
}
export function decorationAssets(parts) {
  const value = material("Building/Units/Materials/decoration.mat");
  // Explicit single-material authoring fixture exercises merged buffer packing.
  return { decorationMaterial: value,
    decorations: Object.fromEntries(parts.filter((p) => p.assetUnit).map((p) => [p.assetUnit, { material: value }])) };
}
export function nativeBuildingAssets(library) {
  const props = read("building-kit.prefab").components.find((c) => c.type === "BuildingAssetKitComponent").props;
  return {
    ...props,
    decorationMaterial: material(props.decorationMaterial.$ref),
    woodArchMaterial: material(props.woodArchMaterial.$ref),
    textures: Object.fromEntries(Object.keys(props.textures).map((key) => [key, {}])),
    units: Object.fromEntries(Object.entries(props.units).map(([name, ref]) => {
      const prefab = read(relative(ref.$ref));
      const unit = prefab.components.find((c) => c.type === "BuildingUnitComponent").props;
      const renderer = prefab.components.find((c) => c.type === "MeshRenderer");
      return [name, { ...unit, sdfMaterial: undefined,
        lodMesh: unit.lodMesh ? { get subMeshes() {
          const lod = library.templates[name]?.lod;
          if (!lod) throw Error("Missing captured LOD index metadata: " + name);
          return [{ count: lod.indexCount }];
        } } : undefined,
        material: material(renderer.calls.find((c) => c.method === "setMaterial").args[0].$ref),
        mesh: { get subMeshes() {
          const template = library.templates[name];
          if (!template) throw Error("Missing captured mesh index metadata: " + name);
          return [{ count: template.indexCount }];
        } }
      }];
    }))
  };
}
