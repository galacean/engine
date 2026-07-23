import {
  Engine,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";

export const DEMO_REFLECTION_PROBE_SIZE = 128;
export const DEMO_REFLECTION_PROBE_FACE_COUNT = 6;
export const DEMO_REFLECTION_PROBE_BYTE_LENGTH =
  DEMO_REFLECTION_PROBE_SIZE * DEMO_REFLECTION_PROBE_SIZE * 4 * DEMO_REFLECTION_PROBE_FACE_COUNT;

export const DEMO_REFLECTION_PROBE_PROVENANCE = Object.freeze({
  kind: "procedural" as const,
  license: "CC0/generated" as const,
  generator: "Galacean Water Optics Lab deterministic direction marker v1",
  colorSpace: "linear" as const,
  format: "RGBA8" as const,
  externalAsset: false,
  deterministic: true
});

export type DemoReflectionProbeFaceName =
  | "positive-x"
  | "negative-x"
  | "positive-y"
  | "negative-y"
  | "positive-z"
  | "negative-z";

export interface DemoReflectionProbeFaceData {
  readonly face: TextureCubeFace;
  readonly name: DemoReflectionProbeFaceName;
  /** Caller-owned full mip-0 RGBA8 data in linear color space. */
  readonly pixels: Uint8Array;
  readonly hash: string;
}

export interface DemoReflectionProbeFaceHashes {
  readonly positiveX: string;
  readonly negativeX: string;
  readonly positiveY: string;
  readonly negativeY: string;
  readonly positiveZ: string;
  readonly negativeZ: string;
}

export interface DemoReflectionProbeTextureDescriptor {
  readonly name: string;
  readonly size: number;
  readonly format: TextureFormat;
  readonly mipmap: false;
  readonly isSRGBColorSpace: false;
}

/** Injection boundary used by Node tests; the default creates a real Engine TextureCube. */
export interface DemoReflectionProbeTextureFactory {
  create(engine: Engine, descriptor: Readonly<DemoReflectionProbeTextureDescriptor>): TextureCube;
}

export interface DemoReflectionProbeMetrics {
  readonly textureCreateCount: number;
  readonly textureDestroyCount: number;
  readonly activeTextureCount: 0 | 1;
  readonly faceUploadCount: number;
  readonly activeResourceBytes: number;
}

export interface DemoReflectionProbeOptions {
  readonly textureFactory?: DemoReflectionProbeTextureFactory;
}

interface MutableDemoReflectionProbeMetrics {
  textureCreateCount: number;
  textureDestroyCount: number;
  activeTextureCount: 0 | 1;
  faceUploadCount: number;
  activeResourceBytes: number;
}

interface FaceDefinition {
  readonly face: TextureCubeFace;
  readonly name: DemoReflectionProbeFaceName;
  readonly baseColor: readonly [number, number, number];
}

const TEXTURE_NAME = "WaterOpticsLabProceduralLinearProbe";
const TEXTURE_DESCRIPTOR: Readonly<DemoReflectionProbeTextureDescriptor> = Object.freeze({
  name: TEXTURE_NAME,
  size: DEMO_REFLECTION_PROBE_SIZE,
  format: TextureFormat.R8G8B8A8,
  mipmap: false,
  isSRGBColorSpace: false
});
const POSITIVE_U_MARKER = Object.freeze([255, 248, 32, 255] as const);
const POSITIVE_V_MARKER = Object.freeze([28, 246, 255, 255] as const);
const FACE_DEFINITIONS: readonly FaceDefinition[] = Object.freeze([
  Object.freeze({ face: TextureCubeFace.PositiveX, name: "positive-x", baseColor: [188, 38, 30] as const }),
  Object.freeze({ face: TextureCubeFace.NegativeX, name: "negative-x", baseColor: [24, 154, 174] as const }),
  Object.freeze({ face: TextureCubeFace.PositiveY, name: "positive-y", baseColor: [46, 178, 62] as const }),
  Object.freeze({ face: TextureCubeFace.NegativeY, name: "negative-y", baseColor: [180, 36, 152] as const }),
  Object.freeze({ face: TextureCubeFace.PositiveZ, name: "positive-z", baseColor: [42, 78, 204] as const }),
  Object.freeze({ face: TextureCubeFace.NegativeZ, name: "negative-z", baseColor: [196, 158, 24] as const })
]);

const defaultTextureFactory: DemoReflectionProbeTextureFactory = Object.freeze({
  create(engine: Engine, descriptor: Readonly<DemoReflectionProbeTextureDescriptor>): TextureCube {
    return new TextureCube(engine, descriptor.size, descriptor.format, descriptor.mipmap, descriptor.isSRGBColorSpace);
  }
});

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function writePixel(pixels: Uint8Array, size: number, x: number, y: number, color: readonly number[]): void {
  const offset = (y * size + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function isPositiveUArrow(x: number, y: number, size: number): boolean {
  const centerY = Math.floor(size * 0.34);
  const startX = Math.floor(size * 0.14);
  const headStartX = Math.floor(size * 0.67);
  const tipX = Math.floor(size * 0.84);
  const thickness = Math.max(1, Math.floor(size / 64));
  const shaft = x >= startX && x <= tipX && Math.abs(y - centerY) <= thickness;
  const head = x >= headStartX && x <= tipX && Math.abs(y - centerY) <= Math.floor((tipX - x) * 0.58);
  return shaft || head;
}

function isPositiveVArrow(x: number, y: number, size: number): boolean {
  const centerX = Math.floor(size * 0.28);
  const startY = Math.floor(size * 0.54);
  const headStartY = Math.floor(size * 0.72);
  const tipY = Math.floor(size * 0.88);
  const thickness = Math.max(1, Math.floor(size / 64));
  const shaft = y >= startY && y <= tipY && Math.abs(x - centerX) <= thickness;
  const head = y >= headStartY && y <= tipY && Math.abs(x - centerX) <= Math.floor((tipY - y) * 0.58);
  return shaft || head;
}

function createFacePixels(definition: FaceDefinition, faceIndex: number): Uint8Array {
  const size = DEMO_REFLECTION_PROBE_SIZE;
  const pixels = new Uint8Array(size * size * 4);
  const [baseR, baseG, baseB] = definition.baseColor;
  const identityMarkerStartX = 24 + faceIndex * 14;
  for (let y = 0; y < size; y++) {
    const v = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const checker = ((x >> 4) + (y >> 4)) % 2 === 0 ? -10 : 14;
      writePixel(pixels, size, x, y, [
        clampByte(baseR * 0.58 + u * 74 + (1 - v) * 18 + checker),
        clampByte(baseG * 0.58 + (1 - u) * 26 + v * 78 - checker * 0.35),
        clampByte(baseB * 0.58 + u * 28 + (1 - v) * 62 + checker * 0.45),
        255
      ]);

      if (isPositiveUArrow(x, y, size)) writePixel(pixels, size, x, y, POSITIVE_U_MARKER);
      if (isPositiveVArrow(x, y, size)) writePixel(pixels, size, x, y, POSITIVE_V_MARKER);
      if (x >= 5 && x < 15 && y >= 5 && y < 15) writePixel(pixels, size, x, y, [255, 255, 255, 255]);
      if (x >= identityMarkerStartX && x < identityMarkerStartX + 8 && y >= 8 && y < 16) {
        writePixel(pixels, size, x, y, [255 - baseR, 255 - baseG, 255 - baseB, 255]);
      }
    }
  }
  return pixels;
}

function toHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** Stable dual-accumulator hash for regression evidence; not a cryptographic digest. */
export function hashDemoReflectionProbePixels(pixels: Uint8Array): string {
  let low = 0x811c9dc5;
  let high = 0x9e3779b9;
  for (const value of pixels) {
    low = Math.imul(low ^ value, 0x01000193) >>> 0;
    high = Math.imul(high ^ value, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
  }
  return `${toHex(high)}${toHex(low)}`;
}

/** Generates six caller-owned mip-0 faces without random or external assets. */
export function createDemoReflectionProbeFaces(): readonly DemoReflectionProbeFaceData[] {
  return Object.freeze(
    FACE_DEFINITIONS.map((definition, faceIndex) => {
      const pixels = createFacePixels(definition, faceIndex);
      return Object.freeze({
        face: definition.face,
        name: definition.name,
        pixels,
        hash: hashDemoReflectionProbePixels(pixels)
      });
    })
  );
}

/** Owns one real procedural TextureCube for the Water Optics Lab Probe path. */
export class DemoReflectionProbe {
  readonly size = DEMO_REFLECTION_PROBE_SIZE;
  readonly byteLength = DEMO_REFLECTION_PROBE_BYTE_LENGTH;
  readonly provenance = DEMO_REFLECTION_PROBE_PROVENANCE;
  readonly faceHashes: Readonly<DemoReflectionProbeFaceHashes>;

  private _texture: TextureCube | undefined;
  private _destroyed = false;
  private readonly _mutableMetrics: MutableDemoReflectionProbeMetrics = {
    textureCreateCount: 0,
    textureDestroyCount: 0,
    activeTextureCount: 0,
    faceUploadCount: 0,
    activeResourceBytes: 0
  };

  constructor(engine: Engine, options: DemoReflectionProbeOptions = {}) {
    const faces = createDemoReflectionProbeFaces();
    const texture = (options.textureFactory ?? defaultTextureFactory).create(engine, TEXTURE_DESCRIPTOR);
    try {
      texture.name = TEXTURE_NAME;
      texture.filterMode = TextureFilterMode.Bilinear;
      texture.wrapModeU = TextureWrapMode.Clamp;
      texture.wrapModeV = TextureWrapMode.Clamp;
      texture.isGCIgnored = true;
      for (const face of faces) {
        texture.setPixelBuffer(face.face, face.pixels, 0, 0, 0, this.size, this.size);
      }
    } catch (error) {
      texture.destroy(true);
      throw error;
    }

    const [positiveX, negativeX, positiveY, negativeY, positiveZ, negativeZ] = faces;
    this.faceHashes = Object.freeze({
      positiveX: positiveX.hash,
      negativeX: negativeX.hash,
      positiveY: positiveY.hash,
      negativeY: negativeY.hash,
      positiveZ: positiveZ.hash,
      negativeZ: negativeZ.hash
    });
    this._texture = texture;
    this._mutableMetrics.textureCreateCount = 1;
    this._mutableMetrics.activeTextureCount = 1;
    this._mutableMetrics.faceUploadCount = faces.length;
    this._mutableMetrics.activeResourceBytes = this.byteLength;
  }

  get texture(): TextureCube | undefined {
    return this._texture;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  get metrics(): DemoReflectionProbeMetrics {
    return Object.freeze({ ...this._mutableMetrics });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    const texture = this._texture;
    this._texture = undefined;
    if (texture) {
      texture.destroy(true);
      this._mutableMetrics.textureDestroyCount = 1;
    }
    this._mutableMetrics.activeTextureCount = 0;
    this._mutableMetrics.activeResourceBytes = 0;
  }
}
