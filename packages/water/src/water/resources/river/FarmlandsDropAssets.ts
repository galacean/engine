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
    descriptor: texture("directional", "4304ca4bdf11e1cc0d1073018480339874ae0506f0adbe74e2983c3601784f9f"),
    size: 2048,
    srgb: true
  },
  cloud: {
    descriptor: texture("cloud", "b22b11325d1c8e9bc4d3171d27b63e40356c4c2fec46e9b8e21f7e43564807d9"),
    size: 2048,
    srgb: false
  },
  lines: {
    descriptor: texture("lines", "6fe94736b5507d1b1ea9b8add09bd3f3f1011479afe4b2ea0506646b5b6bae8e"),
    size: 512,
    srgb: true
  },
  edge: {
    descriptor: texture("edge", "dc94d20f448ce892b063628ad6a0b611af72111eaa71915dbca103305f02765c"),
    size: 256,
    height: 512,
    srgb: true
  },
  voronoi: {
    descriptor: texture("voronoi", "51c2adc8a4fc854a39eecad6f834bd11a2718dc52e1125c8abe09f49de7f80ef"),
    size: 2048,
    srgb: true
  },
  foam: {
    descriptor: texture("foam", "0f224383d8632bc5b5b439b7f3e88eac63f8f63bba79c23e7fb7c6d77ebcde9d"),
    size: 512,
    srgb: true
  },
  mist: {
    descriptor: texture("mist", "a9a0dc6664305b58139f3fe736fee3d10f1f022131e524f06b222fdf2d54a705"),
    size: 1024,
    srgb: true
  },
  splash: {
    descriptor: texture("splash", "a7c315f60c0cec3a7ba2847c239c9eb2659a4d00e1d3ae40292a723f95267046"),
    size: 256,
    srgb: true
  }
} as const;
