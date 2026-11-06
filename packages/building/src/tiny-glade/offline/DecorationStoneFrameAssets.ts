import { stoneFrameProgram } from "../assets/decorations/stone-frame-program";
import { nativeDecorationTextureBindings } from "../assets/decorations/native-texture-bindings";
import manifest from "../assets/decorations/stone-frame-manifest.json";
import { createStoneFrameTemplate, stoneFrameProgramName } from "./StoneFrameTemplate";
import { decorationCatalogBuffer } from "./DecorationCatalogBuffer";
import type { ConstructionAssetLibrary, ConstructionDrawTemplate } from "./CapturedConstructionAssets";

export const stoneFrameTemplateName = (mesh: string) => "stone-frame/" + mesh;

/** Original mesh/UV buffers and the native stone material, including its real
 * halftimber texture branch. Slots/palettes/identity remain scene-owned. */
export function decorationStoneFrameAssets(base: ConstructionAssetLibrary) {
  const color = base.templates.brick?.resources.ColorLibraryData_natural;
  if (color?.kind !== "uniform" || !color.file) throw Error("Stone frames require the original color-library uniform");
  if (!base.textures[nativeDecorationTextureBindings.halfTimber])
    throw Error("Stone frames require the original halftimber texture");
  const sources = new Map<string, { mesh: string; attribute: string; integer: boolean }>();
  const templates: Record<string, ConstructionDrawTemplate> = {};
  for (const [name, mesh] of Object.entries(manifest.meshes)) {
    const attributes = mesh.attributes.map(({ source, ...attribute }) => {
      sources.set(attribute.file, { mesh: name, attribute: source, integer: attribute.integer });
      return attribute;
    });
    sources.set(mesh.indices, { mesh: name, attribute: "indices", integer: true });
    templates[stoneFrameTemplateName(name)] = createStoneFrameTemplate({
      attributes,
      indices: mesh.indices,
      indexCount: mesh.indexCount,
      colorLibraryFile: color.file,
      halfTimberTexture: nativeDecorationTextureBindings.halfTimber,
      // Seed World owns one authored timber palette per building (wood_color).
      // Do not bind the unrelated, currently constant half-timber defaults.
      timberColorRole: "woodenColors"
    });
  }
  const asset = async (name: string): Promise<ArrayBuffer> => {
    const source = sources.get(name);
    if (!source) throw Error("Unknown stone-frame asset " + name);
    const bytes = decorationCatalogBuffer(source.mesh, source.attribute, source.integer);
    if (bytes.byteLength !== manifest.files[name as keyof typeof manifest.files]?.byteLength)
      throw Error("Stone-frame template byte count differs");
    return bytes;
  };
  return {
    programs: { [stoneFrameProgramName]: stoneFrameProgram },
    templates,
    files: manifest.files,
    asset,
    hasAsset: (name: string) => sources.has(name)
  };
}

export function mergeDecorationStoneFrameLibrary(base: ConstructionAssetLibrary) {
  const bundle = decorationStoneFrameAssets(base);
  const library: ConstructionAssetLibrary = {
    ...base,
    programs: { ...base.programs, ...bundle.programs },
    templates: { ...base.templates, ...bundle.templates },
    files: { ...base.files, ...bundle.files }
  };
  return { ...bundle, library };
}
