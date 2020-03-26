export type CompressedData = {
  internalFormat: number;
  width: number;
  height: number;
  mipmaps: Mipmap[];
};

export type Mipmap = {
  data: ArrayBuffer;
  width: number;
  height: number;
};
