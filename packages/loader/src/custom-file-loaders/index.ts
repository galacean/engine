import { FileHeader } from "./utils/FileHeader";

import { Texture2DDecoder } from "./Texture2D";
import { Engine } from "@oasis-engine/core";

export const decoderMap: { [key: number]: { decode: Function } } = {
  1: Texture2DDecoder
};

export function decode<T>(arraybuffer: ArrayBuffer, engine: Engine): T {
  const header = FileHeader.decode(arraybuffer);
  const object = decoderMap[header.type].decode(engine, arraybuffer, header.headerLength, header.dataLength);
  object.name = header.name;
  return object;
}
