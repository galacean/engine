import manifest from "./assets/ktx2-manifest.json";
import {
  WaterBodyResourceSchemaVersion,
  type WaterResourceAssetDescriptorV1
} from "../../authoring/body/WaterBodyAuthoringTypes";

function texture(id: string, contentHash: string): WaterResourceAssetDescriptorV1 {
  return Object.freeze({
    schemaVersion: WaterBodyResourceSchemaVersion.V1,
    id: `farmlands-drop-${id}`,
    kind: "texture",
    contentHash,
    ownership: "shared",
    fallbackPolicy: "required"
  });
}
export const FARMLANDS_DROP_ASSETS = {
  directional: {
    descriptor: texture("directional", manifest.textures.directional.sha256),
    size: 512,
    srgb: true
  },
  cloud: {
    descriptor: texture("cloud", manifest.textures.cloud.sha256),
    size: 512,
    srgb: false
  },
  lines: {
    descriptor: texture("lines", manifest.textures.lines.sha256),
    size: 512,
    srgb: true
  },
  edge: {
    descriptor: texture("edge", manifest.textures.edge.sha256),
    size: 256,
    height: 512,
    srgb: true
  },
  voronoi: {
    descriptor: texture("voronoi", manifest.textures.voronoi.sha256),
    size: 512,
    srgb: true
  },
  foam: {
    descriptor: texture("foam", manifest.textures.foam.sha256),
    size: 512,
    srgb: true
  },
  mist: {
    descriptor: texture("mist", manifest.textures.mist.sha256),
    size: 512,
    srgb: true
  },
  splash: {
    descriptor: texture("splash", manifest.textures.splash.sha256),
    size: 256,
    srgb: true
  }
} as const;
