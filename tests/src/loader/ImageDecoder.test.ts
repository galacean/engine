import { AssetPromise, AssetType, ImageDecoder, Texture2D, TextureCube, WebGLEngine } from "@galacean/engine";
import "@galacean/engine-loader";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let engine: WebGLEngine;
let pngBytes: Uint8Array;
let jpegBytes: Uint8Array;
let webpBytes: Uint8Array;

async function encodeCanvas(type: string): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  canvas.getContext("2d")!.fillRect(0, 0, 1, 1);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Galacean binary texture: [MAGIC "GLCN"][totalLength u32][version u8][typeLen u16][type][nameLen u16][name]
 * padded to 4 bytes, then [url str][mipmap][filterMode][anisoLevel][wrapU][wrapV][format][size...][isSRGB]
 * [u32 size × n][image bytes × n].
 */
function encodeGalaceanTexture(type: "Texture2D" | "TextureCube", images: Uint8Array[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const typeBytes = encoder.encode(type);
  const nameBytes = encoder.encode("texture");
  const headerLength = (4 + 4 + 1 + 2 + typeBytes.length + 2 + nameBytes.length + 3) & ~3;
  // url(empty) + mipmap, filterMode, anisoLevel, wrapU, wrapV, format
  const sizeBytes = type === "Texture2D" ? 4 : 2; // width + height, or faceSize
  const imagesLength = images.reduce((sum, image) => sum + image.length, 0);
  const dataLength = 2 + 6 + sizeBytes + 1 + 4 * images.length + imagesLength;
  const buffer = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint32(0, 0x4e434c47, true);
  view.setUint32(4, buffer.byteLength, true);
  view.setUint8(8, 1);
  view.setUint16(9, typeBytes.length, true);
  bytes.set(typeBytes, 11);
  view.setUint16(11 + typeBytes.length, nameBytes.length, true);
  bytes.set(nameBytes, 13 + typeBytes.length);

  let p = headerLength;
  view.setUint16(p, 0, true);
  p += 2;
  bytes.set([0, 1, 1, 0, 0, 1], p); // no mipmap, bilinear, aniso 1, clamp, clamp, R8G8B8A8
  p += 6;
  view.setUint16(p, 1, true);
  if (type === "Texture2D") view.setUint16(p + 2, 1, true);
  p += sizeBytes;
  view.setUint8(p, 1);
  p += 1;
  for (const image of images) {
    view.setUint32(p, image.length, true);
    p += 4;
  }
  for (const image of images) {
    bytes.set(image, p);
    p += image.length;
  }
  return buffer;
}

function spyObjectUrlTypes(): string[] {
  const types: string[] = [];
  const createObjectURL = URL.createObjectURL.bind(URL);
  vi.spyOn(URL, "createObjectURL").mockImplementation((object: Blob | MediaSource) => {
    types.push((object as Blob).type);
    return createObjectURL(object);
  });
  return types;
}

function mockRequest(buffer: ArrayBuffer) {
  return vi.spyOn(engine.resourceManager, "_requestByRemoteUrl").mockReturnValue(AssetPromise.resolve(buffer));
}

beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  pngBytes = await encodeCanvas("image/png");
  jpegBytes = await encodeCanvas("image/jpeg");
  webpBytes = await encodeCanvas("image/webp");
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  engine.destroy();
});

describe("ImageDecoder", () => {
  it("detects the MIME type from the leading bytes", () => {
    expect(ImageDecoder.getMimeType(pngBytes)).toBe("image/png");
    expect(ImageDecoder.getMimeType(jpegBytes)).toBe("image/jpeg");
    expect(ImageDecoder.getMimeType(webpBytes)).toBe("image/webp");
    expect(ImageDecoder.getMimeType(pngBytes.buffer as ArrayBuffer)).toBe("image/png");
  });

  it("returns an empty type for unknown or truncated data", () => {
    expect(ImageDecoder.getMimeType(new Uint8Array([1, 2, 3, 4]))).toBe("");
    expect(ImageDecoder.getMimeType(new Uint8Array([0x89, 0x50]))).toBe("");
    expect(ImageDecoder.getMimeType(new Uint8Array(0))).toBe("");
  });

  it("reads the view, not the start of its underlying buffer", () => {
    const backing = new Uint8Array(8 + pngBytes.length);
    backing.set(jpegBytes.subarray(0, 8), 0);
    backing.set(pngBytes, 8);
    expect(ImageDecoder.getMimeType(backing.subarray(8))).toBe("image/png");
  });

  it("decodes a PNG texture through a typed blob", async () => {
    const types = spyObjectUrlTypes();
    mockRequest(pngBytes.slice().buffer);
    const texture = await engine.resourceManager.load<Texture2D>({
      url: "image-decoder/png.png",
      type: AssetType.Texture
    });
    expect(texture.width).toBe(1);
    expect(types).toEqual(["image/png"]);
  });

  it("decodes a JPEG texture through a typed blob", async () => {
    const types = spyObjectUrlTypes();
    mockRequest(jpegBytes.slice().buffer);
    await engine.resourceManager.load<Texture2D>({ url: "image-decoder/jpeg.jpg", type: AssetType.Texture });
    expect(types).toEqual(["image/jpeg"]);
  });

  it("decodes a Galacean binary Texture2D through a typed blob", async () => {
    const types = spyObjectUrlTypes();
    mockRequest(encodeGalaceanTexture("Texture2D", [pngBytes]));
    const texture = await engine.resourceManager.load<Texture2D>({
      url: "image-decoder/2d.tex",
      type: AssetType.Texture
    });
    expect(texture).toBeInstanceOf(Texture2D);
    expect(types).toEqual(["image/png"]);
  });

  it("decodes every face of a Galacean binary TextureCube through a typed blob", async () => {
    const types = spyObjectUrlTypes();
    mockRequest(encodeGalaceanTexture("TextureCube", [pngBytes, pngBytes, pngBytes, jpegBytes, jpegBytes, jpegBytes]));
    const texture = await engine.resourceManager.load<TextureCube>({
      url: "image-decoder/cube.tex",
      type: AssetType.Texture
    });
    expect(texture).toBeInstanceOf(TextureCube);
    expect(types.sort()).toEqual(["image/jpeg", "image/jpeg", "image/jpeg", "image/png", "image/png", "image/png"]);
  });

  it("rejects a Galacean binary Texture2D whose image cannot be decoded with a descriptive error", async () => {
    mockRequest(encodeGalaceanTexture("Texture2D", [new Uint8Array([1, 2, 3])]));
    await expect(
      engine.resourceManager.load<Texture2D>({ url: "image-decoder/broken.tex", type: AssetType.Texture })
    ).rejects.toThrow("failed to decode texture");
  });
});
