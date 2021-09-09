import { FileHeader } from "./utils/FileHeader";

import { Texture2DDecoder } from "./Texture2D";
import { MaterialDecoder } from "./Material";
import { Engine } from "@oasis-engine/core";

export const decoderMap: { [key: string]: { decode: Function } } = {
  "Texture2D": Texture2DDecoder,
  "Material": MaterialDecoder
};

export function decode<T>(arraybuffer: ArrayBuffer, engine: Engine): Promise<T> {
  const header = FileHeader.decode(arraybuffer);
  return decoderMap[header.type].decode(engine, arraybuffer, header.headerLength, header.dataLength).then((object)=>{
    object.name = header.name;
    return object
  });
  
}
