import { AssetPromise, Engine } from "@galacean/engine-core";
import type { BufferReader } from "./BufferReader";

export const decoderMap: Record<
  string,
  {
    decode: (engine: Engine, bufferReader: BufferReader, ...arg: any[]) => AssetPromise<any>;
  }
> = {};

/**
 * Decoder decorator generator.
 * @param type - resource file type.
 * @returns Decoder decorator
 */
export function decoder(type: string): ClassDecorator {
  return (target: any) => {
    decoderMap[type] = target;
  };
}
