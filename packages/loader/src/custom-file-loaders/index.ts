import { FileHeader } from "./utils/FileHeader";

import { Texture2DDecoder } from "./Texture2D";
import { MaterialDecoder } from "./Material";
import { Engine } from "@oasis-engine/core";

export const decoderMap: { [key: number]: { decode: Function } } = {
  1: Texture2DDecoder,
  3: MaterialDecoder
};

export function decode<T>(arraybuffer: ArrayBuffer, engine: Engine): Promise<T> {
  const header = FileHeader.decode(arraybuffer);
  return decoderMap[header.type].decode(engine, arraybuffer, header.headerLength, header.dataLength).then((object)=>{
    object.name = header.name;
    return object
  });
  
}
