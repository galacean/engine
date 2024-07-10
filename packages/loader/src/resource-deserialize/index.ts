import { Engine } from "@galacean/engine-core";
import { BufferReader } from "./utils/BufferReader";
import { decoderMap } from "./utils/Decorator";
import { FileHeader } from "./utils/FileHeader";

export * from "./resources/animationClip/AnimationClipDecoder";
export type { IModelMesh } from "./resources/mesh/IModelMesh";
export { MeshDecoder } from "./resources/mesh/MeshDecoder";
export { ReflectionParser } from "./resources/parser/ReflectionParser";
export { Texture2DDecoder } from "./resources/texture2D/TextureDecoder";

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

export * from "./resources/parser/CustomParser";
export * from "./resources/parser/ParserContext";
export * from "./resources/scene/EditorTextureLoader";
export * from "./resources/scene/MeshLoader";
export * from "./resources/scene/SceneParser";
export * from "./resources/schema";

export * from "./utils/BufferReader";
export * from "./utils/Decorator";
export * from "./utils/FileHeader";
