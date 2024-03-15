import { Engine } from "@galacean/engine-core";
import { BufferReader } from "./utils/BufferReader";
import { decoderMap, decoder } from "./utils/Decorator";
import { FileHeader } from "./utils/FileHeader";

export { MeshDecoder } from "./resources/mesh/MeshDecoder";
export { Texture2DDecoder } from "./resources/texture2D/TextureDecoder";
export { ReflectionParser } from "./resources/parser/ReflectionParser";
export { PrefabParser } from "./resources/prefab/PrefabParser";
export * from "./resources/animationClip/AnimationClipDecoder";
export type { IModelMesh } from "./resources/mesh/IModelMesh";

/**
 * Decode engine binary resource.
 * @param arrayBuffer - array buffer of decode binary file
 * @param engine - engine
 * @returns
 */
export function decode<T>(arrayBuffer: ArrayBuffer, engine: Engine): Promise<T> {
  const header = FileHeader.decode(arrayBuffer);
  const bufferReader = new BufferReader(new Uint8Array(arrayBuffer), header.headerLength, header.dataLength);
  return decoderMap[header.type].decode(engine, bufferReader).then((object) => {
    object.name = header.name;
    return object;
  });
}

export * from "./resources/schema";
export * from "./resources/scene/SceneParser";
export * from "./resources/scene/MeshLoader";
export * from "./resources/scene/EditorTextureLoader";
export * from "./resources/parser/ParserContext";
