import "./AnimationClipLoader";
import "./AnimatorControllerLoader";
import "./BufferLoader";
import "./EnvLoader";
import "./FontLoader";
import "./GLTFLoader";
import "./HDRLoader";
import "./JSONLoader";
import "./KTXCubeLoader";
import "./KTXLoader";
import "./MaterialLoader";
import "./MeshLoader";
import "./PrefabLoader";
import "./PrimitiveMeshLoader";
import "./ProjectLoader";
import "./SourceFontLoader";
import "./SpriteAtlasLoader";
import "./SpriteLoader";
import "./Texture2DLoader";
import "./TextureCubeLoader";
import "./ktx2/KTX2Loader";
import { CustomParser } from "./resource-deserialize/resources/parser/CustomParser";

export { GLTFLoader } from "./GLTFLoader";
export type { GLTFParams } from "./GLTFLoader";
export { PrefabLoader } from "./PrefabLoader";
export * from "./SceneLoader";
export type { Texture2DParams } from "./Texture2DLoader";
export { parseSingleKTX } from "./compressed-texture";
export * from "./gltf";
export { KTX2Loader, KTX2Transcoder } from "./ktx2/KTX2Loader";
export { KTX2TargetFormat } from "./ktx2/KTX2TargetFormat";
export * from "./prefab/PrefabResource";
export * from "./resource-deserialize";

export const customParsers = new Map<string, CustomParser>();

/**
 * Register a custom parser for any loader.
 * @param key - parser key
 * @param parser - parser function
 */
export function registerCustomParser(key: string) {
  return <T extends CustomParser>(Target: { new (): T }) => {
    customParsers.set(key, new Target());
  };
}
