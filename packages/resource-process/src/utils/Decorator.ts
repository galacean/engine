import { Engine } from "@oasis-engine/core";

export const decoderMap: Record<
  string,
  {
    decode: (engine: Engine, arraybuffer: ArrayBuffer, byteOffset?: number, byteLength?: number) => Promise<any>;
  }
> = {};

/**
 * Decoder decorator generator.
 * @param type - resource file type.
 * @returns Decoder decorator
 */
export function decoder(type: string): ClassDecorator {
  return (target: any) => {
    decoderMap[type] = target.decode;
  };
}

export const encoderMap = {};

/**
 * Encoder decorator generator.
 * @param type - resource file type.
 * @returns Encoder decorator
 */
export function encoder(type: string): ClassDecorator {
  return (target: any) => {
    encoderMap[type] = target.encode;
  };
}
