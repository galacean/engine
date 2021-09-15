import { Engine } from "@oasis-engine/core";

export const decoderMap: Record<
  string,
  {
    decode: (engine: Engine, arraybuffer: ArrayBuffer, byteOffset?: number, byteLength?: number) => Promise<any>;
  }
> = {};

export function decoder(type: string): ClassDecorator {
  return (target: any) => {
    decoderMap[type] = target.decode;
  };
}

export const encoderMap = {};

export function encoder(type: string): ClassDecorator {
  return (target: any) => {
    encoderMap[type] = target.encode;
  };
}
