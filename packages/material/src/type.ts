import { TextureFilter, TextureWrapMode } from "@alipay/o3-base";

export type TextureConfig = {
  magFilter?: TextureFilter;
  minFilter?: TextureFilter;
  wrapS?: TextureWrapMode;
  wrapT?: TextureWrapMode;
  [key: string]: any;
};
export type React = { x: number; y: number; width: number; height: number };
