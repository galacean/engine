import {
  AnimationClip,
  AssetType,
  BlendFactor,
  BlendOperation,
  CompareFunction,
  CullMode,
  Material,
  RenderQueueType,
  StencilOperation,
  Texture2D,
  TextureCube,
  Transform,
  WebGLEngine,
  request
} from "@galacean/engine";
import { KTX2Container } from "../../../packages/loader/src/ktx2/KTX2Container";
import { parseSingleKTX } from "../../../packages/loader/src/compressed-texture";
import { GLCompressedTextureInternalFormat } from "@galacean/engine-rhi-webgl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

function writeUint16(bytes: number[], value: number): void {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setUint16(0, value, true);
  bytes.push(...new Uint8Array(buf));
}

function writeUint32(bytes: number[], value: number): void {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, value, true);
  bytes.push(...new Uint8Array(buf));
}

function writeFloat32(bytes: number[], value: number): void {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, value, true);
  bytes.push(...new Uint8Array(buf));
}

function writeString(bytes: number[], value: string): void {
  const encoded = new TextEncoder().encode(value);
  writeUint16(bytes, encoded.byteLength);
  bytes.push(...encoded);
}

function createAniFile(options: {
  events?: Array<{ time: number; name: string; val: unknown }>;
  curveType?: string;
  keyTimes?: number[];
  declaredKeysLen?: number;
}): ArrayBuffer {
  const { events = [], curveType = "AnimationFloatCurve", keyTimes = [0], declaredKeysLen } = options;
  const body: number[] = [];
  writeString(body, "clip");
  writeUint16(body, events.length);
  for (const event of events) {
    writeFloat32(body, event.time);
    writeString(body, event.name);
    writeString(body, JSON.stringify({ val: event.val }));
  }

  writeUint16(body, 1); // curveBindingsLen
  writeString(body, "");
  writeString(body, "Transform");
  writeString(body, "position.x");
  writeString(body, "");
  body.push(1); // Linear
  writeUint16(body, declaredKeysLen ?? keyTimes.length);
  writeString(body, curveType);

  for (let i = 0; i < keyTimes.length; i++) {
    writeFloat32(body, keyTimes[i]);
    if (curveType === "AnimationFloatCurve") {
      writeFloat32(body, i);
      writeFloat32(body, 0);
      writeFloat32(body, 0);
    } else if (curveType === "AnimationVector4Curve") {
      for (let k = 0; k < 12; k++) writeFloat32(body, k);
    }
  }

  const header: number[] = [];
  writeUint32(header, 0); // placeholder totalLength
  header.push(1); // version
  writeString(header, "AnimationClip");
  writeString(header, "test-clip");

  const full = new Uint8Array(header.length + body.length);
  full.set(header, 0);
  full.set(body, header.length);
  new DataView(full.buffer).setUint32(0, full.byteLength, true);
  return full.buffer;
}

function createValidKTX1(width: number, height: number, levels: number, seed = 10): ArrayBuffer {
  const headerLen = 64;
  const levelDataSize = 8;
  const buffer = new ArrayBuffer(headerLen + levels * (4 + levelDataSize));
  const bytes = new Uint8Array(buffer);
  bytes.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  new Uint32Array(buffer, 12, 13).set([
    0x04030201,
    0,
    1,
    0,
    GLCompressedTextureInternalFormat.RGB_S3TC_DXT1_EXT,
    0x1907,
    width,
    height,
    0,
    0,
    1,
    levels,
    0
  ]);
  const view = new DataView(buffer);
  for (let level = 0; level < levels; level++) {
    const offset = headerLen + level * (4 + levelDataSize);
    view.setUint32(offset, levelDataSize, true);
    bytes.fill(seed + level, offset + 4, offset + 4 + levelDataSize);
  }
  return buffer;
}

function createKTX2Header(width: number, height: number, levelCount: number): Uint8Array {
  const bytes = new Uint8Array(80);
  bytes.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(20, width, true);
  view.setUint32(24, height, true);
  view.setUint32(36, 1, true); // faceCount
  view.setUint32(40, levelCount, true);
  return bytes;
}

function blobUrl(data: ArrayBuffer | Uint8Array | string, type = "application/octet-stream"): string {
  const blobPart =
    typeof data === "string"
      ? data
      : new Uint8Array(
          data instanceof ArrayBuffer ? data : data.buffer,
          data instanceof ArrayBuffer ? 0 : data.byteOffset,
          data.byteLength
        );
  return URL.createObjectURL(new Blob([blobPart], { type }));
}

describe("Loader security hardening (TVM-3019414)", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  afterAll(() => {
    engine?.destroy();
  });

  describe("1. AnimationClipDecoder & AnimationCurve DoS defense", () => {
    it("handles 65,535 descending keyframes in O(n log n) without blocking main thread", async () => {
      const count = 65535;
      const descending = new Array<number>(count);
      for (let i = 0; i < count; i++) {
        descending[i] = count - 1 - i;
      }
      const url = blobUrl(createAniFile({ keyTimes: descending }));
      try {
        const start = performance.now();
        const clip = await engine.resourceManager.load<AnimationClip>({
          type: AssetType.AnimationClip,
          url
        });
        const elapsed = performance.now() - start;

        expect(elapsed).toBeLessThan(2000);
        expect(clip.curveBindings).toHaveLength(1);
        const curve = clip.curveBindings[0].curve;
        expect(curve.keys).toHaveLength(count);
        expect(curve.keys[0].time).toBe(0);
        expect(curve.keys[count - 1].time).toBe(count - 1);
        expect(curve.length).toBe(count - 1);
      } finally {
        URL.revokeObjectURL(url);
      }
    });

    it("rejects forged keyframe counts exceeding buffer bounds, non-finite times, and unknown curves", async () => {
      const forgedUrl = blobUrl(createAniFile({ keyTimes: [0], declaredKeysLen: 65535 }));
      const nanTimeUrl = blobUrl(createAniFile({ keyTimes: [Number.NaN] }));
      const badCurveUrl = blobUrl(createAniFile({ curveType: "UnknownCurve", keyTimes: [] }));
      try {
        await expect(engine.resourceManager.load({ type: AssetType.AnimationClip, url: forgedUrl })).rejects.toThrow(
          "exceeds bounds"
        );
        await expect(engine.resourceManager.load({ type: AssetType.AnimationClip, url: nanTimeUrl })).rejects.toThrow(
          "invalid keyframe time"
        );
        await expect(engine.resourceManager.load({ type: AssetType.AnimationClip, url: badCurveUrl })).rejects.toThrow(
          "unsupported curve type"
        );
      } finally {
        URL.revokeObjectURL(forgedUrl);
        URL.revokeObjectURL(nanTimeUrl);
        URL.revokeObjectURL(badCurveUrl);
      }
    });

    it("preserves descending event sorting, multi-key Vector4 curves, and curve sampling", async () => {
      const url = blobUrl(
        createAniFile({
          events: [
            { time: 2, name: "second", val: 2 },
            { time: 1, name: "first", val: 1 }
          ],
          curveType: "AnimationVector4Curve",
          keyTimes: [2, 0]
        })
      );
      try {
        const clip = await engine.resourceManager.load<AnimationClip>({
          type: AssetType.AnimationClip,
          url
        });
        expect(clip.events.map((e) => e.functionName)).toEqual(["first", "second"]);
        expect(clip.curveBindings[0].curve.keys.map((k) => k.time)).toEqual([0, 2]);
      } finally {
        URL.revokeObjectURL(url);
      }
    });
  });

  describe("2. HDRLoader dimension & buffer bounds defense", () => {
    it("rejects oversized HDR dimensions (PoC -Y 8192 +X 32767) and truncated payloads before allocation", async () => {
      const beforeCount = engine.resourceManager.findResourcesByType(TextureCube).length;
      const pocUrl = blobUrl("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 8192 +X 32767\n\x02\x02\x7f\xff");
      const truncatedUrl = blobUrl("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2048 +X 4096\nAAAA");
      const badHeightUrl = blobUrl("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 8\n\x02\x02\x00\x08");
      const badSuffixUrl = blobUrl("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 8abc +X 8\n\x02\x02\x00\x08");
      try {
        await expect(engine.resourceManager.load({ type: AssetType.HDR, url: pocUrl })).rejects.toBeDefined();
        await expect(engine.resourceManager.load({ type: AssetType.HDR, url: truncatedUrl })).rejects.toBeDefined();
        await expect(engine.resourceManager.load({ type: AssetType.HDR, url: badHeightUrl })).rejects.toBeDefined();
        await expect(engine.resourceManager.load({ type: AssetType.HDR, url: badSuffixUrl })).rejects.toBeDefined();
        expect(engine.resourceManager.findResourcesByType(TextureCube)).toHaveLength(beforeCount);
      } finally {
        URL.revokeObjectURL(pocUrl);
        URL.revokeObjectURL(truncatedUrl);
        URL.revokeObjectURL(badHeightUrl);
        URL.revokeObjectURL(badSuffixUrl);
      }
    });

    it("loads valid RLE HDR cubemap textures normally", async () => {
      const header = new TextEncoder().encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 8\n");
      const scanline = [2, 2, 0, 8, 136, 128, 136, 128, 136, 128, 136, 128];
      const hdrBytes = new Uint8Array(header.length + scanline.length * 2);
      hdrBytes.set(header, 0);
      hdrBytes.set(scanline, header.length);
      hdrBytes.set(scanline, header.length + scanline.length);

      const url = blobUrl(hdrBytes);
      let texture: TextureCube | undefined;
      try {
        texture = await engine.resourceManager.load<TextureCube>({ type: AssetType.HDR, url });
        expect(texture).toBeInstanceOf(TextureCube);
        expect(texture.width).toBe(1);
      } finally {
        texture?.destroy(true);
        URL.revokeObjectURL(url);
      }
    });
  });

  describe("3. KhronosTextureContainer (KTX1) mipmap count & bounds defense", () => {
    it("rejects oversized numberOfMipmapLevels (PoC 1,000,000 levels on 8x8) before looping", async () => {
      const pocBuffer = createValidKTX1(8, 8, 1);
      new DataView(pocBuffer).setUint32(56, 1_000_000, true);
      const url = blobUrl(pocBuffer);
      try {
        expect(() => parseSingleKTX(pocBuffer)).toThrow("exceeds maximum 4");
        await expect(engine.resourceManager.load({ type: AssetType.KTX, url })).rejects.toThrow("exceeds maximum 4");
      } finally {
        URL.revokeObjectURL(url);
      }
    });

    it("rejects negative/oversized imageSize and key-value bounds overflow", () => {
      const badImageSize = createValidKTX1(4, 4, 1);
      new DataView(badImageSize).setUint32(64, 0xffffffff, true);
      expect(() => parseSingleKTX(badImageSize)).toThrow("exceeds buffer bounds");

      const zeroImageSize = createValidKTX1(4, 4, 1);
      new DataView(zeroImageSize).setUint32(64, 0, true);
      expect(() => parseSingleKTX(zeroImageSize)).toThrow("invalid mipmap image size 0");

      const badKv = createValidKTX1(4, 4, 1);
      new DataView(badKv).setUint32(60, 0x100000, true);
      expect(() => parseSingleKTX(badKv)).toThrow("key-value data exceeds buffer bounds");
    });

    it("loads valid KTX1 texture with full mip chain", () => {
      const valid = createValidKTX1(4, 4, 3, 20);
      const parsed = parseSingleKTX(valid);
      expect(parsed.mipmaps).toHaveLength(3);
      expect(parsed.mipmaps.map((m) => [m.width, m.height])).toEqual([
        [4, 4],
        [2, 2],
        [1, 1]
      ]);
    });
  });

  describe("4. KTX2Container levelCount pre-allocation & bounds defense", () => {
    it("rejects oversized levelCount (PoC 100,000,000 on 80-byte KTX2) before Array allocation", async () => {
      const poc = createKTX2Header(32, 32, 100_000_000);
      expect(() => new KTX2Container(poc)).toThrow("exceeds maximum 6");

      const url = blobUrl(poc);
      try {
        await expect(engine.resourceManager.load({ type: AssetType.KTX2, url })).rejects.toThrow("exceeds maximum 6");
      } finally {
        URL.revokeObjectURL(url);
      }
    });

    it("rejects levelCount within mip depth when level-index exceeds buffer bounds", () => {
      const truncated = createKTX2Header(32, 32, 6);
      expect(() => new KTX2Container(truncated)).toThrow("exceeds buffer bounds");

      const zeroWidth = createKTX2Header(0, 32, 1);
      expect(() => new KTX2Container(zeroWidth)).toThrow("invalid texture dimensions");
    });
  });

  describe("5. MaterialLoader renderState whitelist & request.ts own-property defense", () => {
    it("rejects reserved and non-whitelisted properties in MaterialLoader without leaking or polluting", async () => {
      const beforeCount = engine.resourceManager.findResourcesByType(Material).length;
      const payloads = [
        {
          error: "Reserved material property",
          data: {
            name: "proto",
            shader: "unlit",
            shaderData: {},
            macros: [],
            renderState: { constructor: { prototype: { pollutedByCtor: true } } }
          }
        },
        {
          error: "Unsupported material property",
          data: {
            name: "unknown-field",
            shader: "unlit",
            shaderData: {},
            macros: [],
            renderState: { arbitraryProp: "evil" }
          }
        },
        {
          error: "Unsupported material property",
          data: {
            name: "method-overwrite",
            shader: "unlit",
            shaderData: {},
            macros: [],
            renderState: { _applyStates: 1 }
          }
        },
        {
          error: "Reserved material property",
          data: {
            name: "shaderdata-proto",
            shader: "unlit",
            shaderData: { ["__proto__"]: { type: "Float", value: 1 } },
            macros: []
          }
        }
      ];

      for (const payload of payloads) {
        const url = blobUrl(JSON.stringify(payload.data), "application/json");
        try {
          await expect(engine.resourceManager.load({ type: AssetType.Material, url })).rejects.toThrow(payload.error);
        } finally {
          URL.revokeObjectURL(url);
        }
      }

      expect(({} as any).pollutedByCtor).toBeUndefined();
      expect(engine.resourceManager.findResourcesByType(Material)).toHaveLength(beforeCount);
    });

    it("applies whitelisted MaterialLoader renderState properties accurately", async () => {
      const url = blobUrl(
        JSON.stringify({
          name: "valid-material",
          shader: "unlit",
          shaderData: {},
          macros: [],
          renderState: {
            renderQueueType: RenderQueueType.Transparent,
            blendState: {
              alphaToCoverage: true,
              blendColor: { r: 0.25, g: 0.5, b: 0.75, a: 1 },
              targetBlendState: {
                enabled: true,
                colorBlendOperation: BlendOperation.Add,
                sourceColorBlendFactor: BlendFactor.SourceAlpha
              }
            },
            depthState: {
              enabled: true,
              writeEnabled: false,
              compareFunction: CompareFunction.LessEqual
            },
            stencilState: {
              enabled: true,
              referenceValue: 7,
              passOperationFront: StencilOperation.Replace
            },
            rasterState: {
              cullMode: CullMode.Off,
              depthBias: 1.5
            }
          }
        }),
        "application/json"
      );

      let material: Material | undefined;
      try {
        material = await engine.resourceManager.load<Material>({ type: AssetType.Material, url });
        const rs = material.renderState;
        expect(rs.renderQueueType).toBe(RenderQueueType.Transparent);
        expect(rs.blendState.alphaToCoverage).toBe(true);
        expect(rs.blendState.blendColor.r).toBeCloseTo(0.25);
        expect(rs.blendState.targetBlendState.enabled).toBe(true);
        expect(rs.blendState.targetBlendState.sourceColorBlendFactor).toBe(BlendFactor.SourceAlpha);
        expect(rs.depthState.writeEnabled).toBe(false);
        expect(rs.depthState.compareFunction).toBe(CompareFunction.LessEqual);
        expect(rs.stencilState.referenceValue).toBe(7);
        expect(rs.stencilState.passOperationFront).toBe(StencilOperation.Replace);
        expect(rs.rasterState.cullMode).toBe(CullMode.Off);
        expect(rs.rasterState.depthBias).toBe(1.5);
      } finally {
        material?.destroy(true);
        URL.revokeObjectURL(url);
      }
    });

    it("ignores polluted Object.prototype properties in request() XHR transport", async () => {
      const openSpy = vi.fn();
      const sendSpy = vi.fn();
      const setHeaderSpy = vi.fn();
      let capturedXhr: any;

      const OrigXHR = globalThis.XMLHttpRequest;
      class MockXHR {
        timeout = 0;
        withCredentials = false;
        responseType = "";
        status = 200;
        response = { ok: true };
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        ontimeout: (() => void) | null = null;
        onprogress: ((e: any) => void) | null = null;

        constructor() {
          capturedXhr = this;
        }
        open = openSpy;
        setRequestHeader = setHeaderSpy;
        send(body: any) {
          sendSpy(body);
          this.onload?.();
        }
      }

      (globalThis as any).XMLHttpRequest = MockXHR;
      (Object.prototype as any).method = "POST";
      (Object.prototype as any).body = "galacean-poc";
      (Object.prototype as any).credentials = "include";
      (Object.prototype as any).headers = { "X-Polluted": "1" };

      try {
        const result = await request<{ ok: boolean }>("https://example.test/asset.json", {});
        expect(result).toEqual({ ok: true });
        expect(openSpy).toHaveBeenCalledWith("get", "https://example.test/asset.json", true);
        expect(capturedXhr.withCredentials).toBe(false);
        expect(sendSpy).toHaveBeenCalledWith(undefined);
        expect(setHeaderSpy).not.toHaveBeenCalled();
      } finally {
        delete (Object.prototype as any).method;
        delete (Object.prototype as any).body;
        delete (Object.prototype as any).credentials;
        delete (Object.prototype as any).headers;
        globalThis.XMLHttpRequest = OrigXHR;
      }
    });
  });
});
