import { decorationCollisionBounds } from "../assets/decorations/collision-bounds";
import program from "../assets/decorations/wood-cut-program.json";
import gableProgram from "../assets/decorations/wood-gable-cut-program.json";
import straightMesh from "../assets/decorations/wood-gable-straight-mesh.json";
import { windowCutSamples, windowCutLayers } from "../assets/decorations/window-cuts";
import type { ConstructionAssetLibrary } from "./CapturedConstructionAssets";
import type { buildDecorationWindowCutBuffer } from "../runtime/DecorationWindowCutBuffer";

export const decorationWoodCutTemplate = "wood-window-cuts";
export const decorationGableCutTemplate = "wood-gable-window-cuts";
export const decorationGableStraightCutTemplate = "wood-gable-straight-window-cuts";
const textureName = "decoration-window-cut-sdf";
const atlasHash = "99ab3391c8bcfbdf7bc9e8da5d63cddce059bd925b3d528a7b7fb8cf67569e18";
const atlasFile = atlasHash + ".bin";
const atlasBytes = 128 * 128 * 18 * 4;

/** Exact SNORM bytes in a portable filterable texture. Decode AFTER interpolation
 * with (r*255-128)/127; two's-complement bytes uploaded as UNORM would invert cuts.
 * Engine-owned leases/restoration consume this like every other immutable asset. */
export function decorationWoodCutAtlas(): Uint8Array {
  const rgba = new Uint8Array(atlasBytes);
  for (let layer = 0; layer < 18; layer++) {
    const samples = windowCutSamples(layer);
    for (let i = 0; i < samples.length; i++) {
      const offset = (layer * samples.length + i) * 4;
      rgba[offset] = samples[i] + 128;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

export function mergeDecorationWoodCutLibrary(base: ConstructionAssetLibrary) {
  const wood = base.templates.wood;
  if (!wood || wood.instanceStride !== 80) throw Error("Native wood80 template required");
  const library: ConstructionAssetLibrary = {
    ...base,
    schema: "tiny-glade-static-assets-v7",
    decorationCollisions: structuredClone(decorationCollisionBounds),
    windowCuts: { texture: textureName, layers: windowCutLayers.map(({ layer, bounds }) => ({ layer, bounds })) },
    programs: { ...base.programs, [decorationWoodCutTemplate]: program, [decorationGableCutTemplate]: gableProgram },
    textures: {
      ...base.textures,
      [textureName]: {
        width: 128,
        height: 128,
        layers: 18,
        srgb: false,
        levels: [atlasFile],
        sampling: "linear-clamp"
      }
    },
    files: {
      ...base.files,
      ...Object.fromEntries(Object.entries(straightMesh.files).map(([name, { base64, ...record }]) => [name, record])),
      [atlasFile]: { sha256: atlasHash, byteLength: atlasBytes, role: "original-decoded-texture" }
    },
    templates: {
      ...base.templates,
      [decorationGableCutTemplate]: {
        ...wood,
        family: "wood-gable",
        program: decorationGableCutTemplate,
        instanceStride: 96,
        resources: {
          storage_6_0: { kind: "storage", role: "indirection" },
          storage_0_0: { kind: "storage", role: "instances" },
          ViewConstants_natural: wood.resources.ViewConstants_natural,
          FrameConstants_natural: wood.resources.FrameConstants_natural,
          storage_8_0: { kind: "storage", role: "woodenColors" },
          wooden_wall_colors_tex: wood.resources.wooden_wall_colors_tex,
          material_data_wood_roughness: wood.resources.material_data_wood_roughness,
          decorationWindowCuts: { kind: "storage", role: "windowCuts", minByteLength: 16 },
          material_data_window_cut_sdf: { kind: "texture", texture: textureName, array: true }
        }
      },
      [decorationWoodCutTemplate]: {
        ...wood,
        program: decorationWoodCutTemplate,
        resources: {
          ...wood.resources,
          decorationWindowCuts: { kind: "storage", role: "windowCuts", minByteLength: 16 },
          material_data_window_cut_sdf: { kind: "texture", texture: textureName, array: true }
        }
      }
    }
  };
  library.templates[decorationGableStraightCutTemplate] = {
    ...library.templates[decorationGableCutTemplate],
    attributes: straightMesh.attributes,
    indices: straightMesh.indices,
    indexCount: straightMesh.indexCount
  };
  return {
    library,
    hasAsset: (name: string) => name === atlasFile || Object.hasOwn(straightMesh.files, name),
    asset: async (name: string): Promise<ArrayBuffer> => {
      if (Object.hasOwn(straightMesh.files, name)) {
        const file = straightMesh.files[name as keyof typeof straightMesh.files];
        return Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)).buffer;
      }
      if (name !== atlasFile) throw Error("Unknown window-cut asset " + name);
      return decorationWoodCutAtlas().buffer as ArrayBuffer;
    }
  };
}
