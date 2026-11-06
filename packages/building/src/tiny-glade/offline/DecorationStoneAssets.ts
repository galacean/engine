import { nativeDecorationTextureBindings } from "../assets/decorations/native-texture-bindings";
import program from "../assets/decorations/stone-program.json";
import manifest from "../assets/decorations/stone-manifest.json";
import { decorationCatalogBuffer } from "./DecorationCatalogBuffer";
import type { ConstructionAssetLibrary, ConstructionDrawTemplate } from "./CapturedConstructionAssets";

/** Standalone native program bundle. The host library must admit reflected stride 128. */
export function decorationStoneAssets(base: ConstructionAssetLibrary) {
  const templates: Record<string, Omit<ConstructionDrawTemplate, "instanceStride"> & { instanceStride: 128 }> = {};
  const sources = new Map<string, { mesh: string; attribute: string; integer: boolean }>();
  const colorLibrary = base.templates.brick?.resources.ColorLibraryData_natural;
  if (!colorLibrary) throw Error("Stone decorations require the original shared color library");
  for (const [name, mesh] of Object.entries(manifest.meshes)) {
    const attributes = mesh.attributes.map(({ source, ...attribute }) => {
      sources.set(attribute.file, { mesh: name, attribute: source, integer: attribute.integer });
      return attribute;
    });
    sources.set(mesh.indices, { mesh: name, attribute: "indices", integer: true });
    templates[name] = {
      family: "stone-decoration",
      program: manifest.program,
      instanceStride: 128,
      directInstances: false,
      attributes,
      indices: mesh.indices,
      indexCount: mesh.indexCount,
      resources: {
        storage_7_0: { kind: "storage", role: "indirection" },
        storage_0_0: { kind: "storage", role: "instances" },
        storage_6_0: { kind: "storage", role: "wallColors" },
        storage_22_0: { kind: "storage", role: "identities" },
        storage_21_0: { kind: "storage", role: "woodenColors" },
        storage_20_0: { kind: "storage", role: "halfTimberColors" },
        ViewConstants_natural: { kind: "uniform", role: "view", minByteLength: 1024 },
        FrameConstants_natural: { kind: "uniform", role: "frame", minByteLength: 352 },
        ColorLibraryData_natural: { ...colorLibrary },
        roof_colors_tex: { kind: "texture", texture: "roof_colors", array: true },
        wall_color_data_brick_colors: { kind: "texture", texture: "brick_colors", array: true },
        wooden_wall_colors_tex: { kind: "texture", texture: "timberframe", array: true },
        halftimber_colors_tex: { kind: "texture", texture: nativeDecorationTextureBindings.halfTimber, array: true }
      }
    };
  }
  /** Reconstruct static template bytes from the exact offline catalog on demand;
   * no author placement, expanded world-space vertex buffer or GPU readback. */
  const asset = async (name: string): Promise<ArrayBuffer> => {
    const source = sources.get(name);
    if (!source) throw Error("Unknown stone decoration asset " + name);
    const bytes = decorationCatalogBuffer(source.mesh, source.attribute, source.integer);
    const expected = manifest.files[name as keyof typeof manifest.files];
    if (!expected || bytes.byteLength !== expected.byteLength) throw Error("Stone template byte count differs");
    return bytes;
  };
  return {
    programs: { [manifest.program]: program },
    templates,
    files: manifest.files,
    asset,
    hasAsset: (name: string) => sources.has(name)
  };
}

/** Extend only the immutable asset library. Source bytes remain lazily decoded
 * by the same catalog owner used by the mesh inspection path. */
export function mergeDecorationStoneLibrary(base: ConstructionAssetLibrary) {
  const bundle = decorationStoneAssets(base);
  const library: ConstructionAssetLibrary = {
    ...base,
    programs: { ...base.programs, ...bundle.programs },
    templates: { ...base.templates, ...bundle.templates },
    files: { ...base.files, ...bundle.files }
  };
  return { ...bundle, library };
}
