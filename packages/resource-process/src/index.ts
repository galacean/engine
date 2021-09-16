import { Engine } from "@oasis-engine/core";
import { BufferReader } from "./utils/BufferReader";
import { BufferWriter } from "./utils/BufferWriter";
import { decoderMap, encoderMap } from "./utils/Decorator";
import { FileHeader } from "./utils/FileHeader";

export { MaterialDecoder } from "./resources/material/MaterialDecoder";
export { MaterialEncoder } from "./resources/material/MaterialEncoder";
export { MeshDecoder } from "./resources/mesh/MeshDecoder";
export { MeshEncoder } from "./resources/mesh/MeshEncoder";
export { encoder, decoder } from "./utils/Decorator";
export { UniformType } from "./resources/material/type";

/**
 * Decode engine binary resource.
 * @param arrayBuffer - array buffer of decode binary file
 * @param engine - engine
 * @returns
 */
export function decode<T>(arrayBuffer: ArrayBuffer, engine: Engine): Promise<T> {
  const header = FileHeader.decode(arrayBuffer);
  const bufferReader = new BufferReader(arrayBuffer, header.headerLength, header.dataLength);
  return decoderMap[header.type].decode(engine, bufferReader).then((object) => {
    object.name = header.name;
    return object;
  });
}

/**
 * Encode main file and meta to an array buffer.
 * @param main - main file data
 * @param meta - meta file data
 * @param byteLength - byte length of estimate array buffer
 */
export function encode(main: any, meta: any, byteLength: number = 10000): ArrayBuffer {
  const { name, version, type } = meta;
  const bufferWriter = new BufferWriter(new ArrayBuffer(byteLength));
  // write header
  bufferWriter.writeUint32(byteLength);
  bufferWriter.writeUint8(version);
  bufferWriter.writeStr(type);
  bufferWriter.writeStr(name);

  encoderMap[type].encode(bufferWriter, main, meta);

  const totalLength = bufferWriter.totalLen;
  bufferWriter.writeLen(totalLength);
  return bufferWriter.buffer.slice(0, bufferWriter.totalLen);
}
