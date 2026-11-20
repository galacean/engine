import {
  AnimationClip,
  AssetType,
  Loader,
  Material,
  PrefabResource,
  Script,
  Texture2D,
  TextureFormat,
  WebGLEngine,
  request
} from "@galacean/engine";
import { HDRDecoder } from "@galacean/engine-loader";
import { GLCompressedTextureInternalFormat } from "@galacean/engine-rhi-webgl";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseSingleKTX } from "../../../packages/loader/src/compressed-texture";
import { KTX2Container } from "../../../packages/loader/src/ktx2/KTX2Container";
import { PrefabParser } from "../../../packages/loader/src/prefab/PrefabParser";

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
  header.push(0x47, 0x4c, 0x43, 0x4e); // "GLCN" magic (little-endian 0x4e434c47)
  writeUint32(header, 0); // placeholder totalLength
  header.push(1); // version
  writeString(header, "AnimationClip");
  writeString(header, "test-clip");
  const alignedHeaderLen = (header.length + 3) & ~3;
  while (header.length < alignedHeaderLen) {
    header.push(0);
  }

  const full = new Uint8Array(header.length + body.length);
  full.set(header, 0);
  full.set(body, header.length);
  new DataView(full.buffer).setUint32(4, full.byteLength, true);
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
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
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

    it("preserves descending event sorting and Vector4 curve loading", async () => {
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

  describe("2. HDRDecoder dimension & buffer bounds defense", () => {
    it("rejects oversized HDR dimensions (PoC -Y 8192 +X 32767) and truncated payloads before allocation", async () => {
      const encoder = new TextEncoder();
      const pocBytes = encoder.encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 8192 +X 32767\n\x02\x02\x7f\xff");
      const truncatedBytes = encoder.encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2048 +X 4096\nAAAA");
      const badHeightBytes = encoder.encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 0 +X 8\n\x02\x02\x00\x08");
      const badSuffixBytes = encoder.encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 8abc +X 8\n\x02\x02\x00\x08");

      expect(() => HDRDecoder.decode(pocBytes)).toThrow();
      expect(() => HDRDecoder.decode(truncatedBytes)).toThrow();
      expect(() => HDRDecoder.decode(badHeightBytes)).toThrow();
      expect(() => HDRDecoder.decode(badSuffixBytes)).toThrow();

      const beforeCount = engine.resourceManager.findResourcesByType(Texture2D).length;
      const pocUrl = blobUrl(pocBytes);
      try {
        await expect(engine.resourceManager.load({ type: AssetType.Texture, url: pocUrl })).rejects.toThrow();
        expect(engine.resourceManager.findResourcesByType(Texture2D)).toHaveLength(beforeCount);
      } finally {
        URL.revokeObjectURL(pocUrl);
      }
    });

    it("decodes and loads valid RLE HDR textures normally", async () => {
      const header = new TextEncoder().encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 8\n");
      const scanline = [2, 2, 0, 8, 136, 128, 136, 128, 136, 128, 136, 128];
      const hdrBytes = new Uint8Array(header.length + scanline.length * 2);
      hdrBytes.set(header, 0);
      hdrBytes.set(scanline, header.length);
      hdrBytes.set(scanline, header.length + scanline.length);

      const url = blobUrl(hdrBytes);
      let texture: Texture2D | undefined;
      try {
        texture = await engine.resourceManager.load<Texture2D>({ type: AssetType.Texture, url });
        expect(texture).toBeInstanceOf(Texture2D);
        expect(texture.width).toBe(8);
        expect(texture.height).toBe(2);
        expect(texture.format).toBe(TextureFormat.R16G16B16A16_SFloat);
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

    it("rejects oversized/zero imageSize and key-value bounds overflow", () => {
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

  describe("5. MaterialLoader, ReflectionParser, ResourceManager & request.ts prototype defense", () => {
    it("rejects reserved shaderData keys in MaterialLoader without leaking or polluting", async () => {
      const beforeCount = engine.resourceManager.findResourcesByType(Material).length;
      const badMaterial = {
        name: "evil-material",
        shader: "Unlit",
        shaderData: {
          ["__proto__"]: { pollutedByMaterial: true },
          constructor: { pollutedByCtor: true }
        },
        macros: []
      };
      const url = blobUrl(JSON.stringify(badMaterial), "application/json");
      try {
        await expect(engine.resourceManager.load({ type: AssetType.Material, url })).rejects.toThrow();
        expect(({} as any).pollutedByMaterial).toBeUndefined();
        expect(({} as any).pollutedByCtor).toBeUndefined();
        expect(engine.resourceManager.findResourcesByType(Material)).toHaveLength(beforeCount);
      } finally {
        URL.revokeObjectURL(url);
      }
    });

    it("ignores Object.prototype keys in MaterialLoader shaderData and loads valid material", async () => {
      (Object.prototype as any).u_PollutedShaderUniform = 12345;
      const url = blobUrl(
        JSON.stringify({
          name: "valid-unlit-material",
          shader: "Unlit",
          shaderData: {
            material_BaseColor: { type: "Color", value: { r: 0.2, g: 0.4, b: 0.6, a: 1 } }
          },
          macros: []
        }),
        "application/json"
      );
      let material: Material | undefined;
      try {
        material = await engine.resourceManager.load<Material>({ type: AssetType.Material, url });
        expect(material).toBeInstanceOf(Material);
        expect(material.shaderData.getFloat("u_PollutedShaderUniform")).toBeUndefined();
      } finally {
        delete (Object.prototype as any).u_PollutedShaderUniform;
        material?.destroy(true);
        URL.revokeObjectURL(url);
      }
    });

    it("blocks constructor/prototype/host traversal in v2 Prefab ReflectionParser", async () => {
      let executed = false;
      (globalThis as any).__galaceanV2RceTest = () => {
        executed = true;
      };

      const badPropPrefab = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root", components: [0] }],
        components: [
          {
            type: "MeshRenderer",
            props: {
              ["constructor"]: { value: 1 }
            }
          }
        ],
        root: 0
      } as any;

      const badCallPrefab = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root", components: [0] }],
        components: [
          {
            type: "MeshRenderer",
            calls: [
              {
                method: "constructor",
                args: ["globalThis.__galaceanV2RceTest()"]
              }
            ]
          }
        ],
        root: 0
      } as any;

      const hostEscapePrefab = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root", components: [0] }],
        components: [
          {
            type: "MeshRenderer",
            props: {
              _engine: { canvas: { _webCanvas: null } }
            }
          }
        ],
        root: 0
      } as any;

      const multiHopCallEscape = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root", components: [0] }],
        components: [
          {
            type: "MeshRenderer",
            calls: [
              {
                target: ["_engine", "_canvas", "_webCanvas", "ownerDocument", "location"],
                method: "assign",
                args: ["javascript:globalThis.__galaceanV2RceTest()"]
              }
            ]
          }
        ],
        root: 0
      } as any;

      const multiHopPoolEscape = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root", components: [0] }],
        components: [
          {
            type: "MeshRenderer",
            calls: [
              {
                target: ["_engine", "resourceManager", "_assetUrlPool"],
                method: "hasOwnProperty",
                args: ["x"]
              }
            ]
          }
        ],
        root: 0
      } as any;

      const protoMethodCall = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root", components: [0] }],
        components: [
          {
            type: "MeshRenderer",
            calls: [
              {
                method: "__defineGetter__",
                args: ["evil", "x"]
              }
            ]
          }
        ],
        root: 0
      } as any;

      class UnsafeResultScript extends Script {
        getFn() {
          return Function;
        }
        getEntity() {
          return this.entity;
        }
      }
      Loader.registerClass("UnsafeResultScript_Test", UnsafeResultScript);

      const unsafeFnCallResult = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root", components: [0] }],
        components: [
          {
            type: "UnsafeResultScript_Test",
            calls: [
              {
                method: "getFn",
                args: [],
                result: { props: { pollutedFn: 1 } }
              }
            ]
          }
        ],
        root: 0
      } as any;

      const unsafeEntityCallResult = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root", components: [0] }],
        components: [
          {
            type: "UnsafeResultScript_Test",
            calls: [
              {
                method: "getEntity",
                args: [],
                result: { props: { name: "pwned" } }
              }
            ]
          }
        ],
        root: 0
      } as any;

      const badComponentRefPrefab = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root", components: [0] }],
        components: [
          {
            type: "MeshRenderer",
            props: {
              target: { $component: { entity: [0], type: "Engine", index: 0 } }
            }
          }
        ],
        root: 0
      } as any;

      try {
        await expect(PrefabParser.parse(engine, "bad-prop.prefab", badPropPrefab)).rejects.toThrow();
        await expect(PrefabParser.parse(engine, "bad-call.prefab", badCallPrefab)).rejects.toThrow();
        await expect(PrefabParser.parse(engine, "host-escape.prefab", hostEscapePrefab)).rejects.toThrow();
        await expect(PrefabParser.parse(engine, "multihop-location.prefab", multiHopCallEscape)).rejects.toThrow(
          "not a safe object instance"
        );
        await expect(PrefabParser.parse(engine, "multihop-pool.prefab", multiHopPoolEscape)).rejects.toThrow();
        await expect(PrefabParser.parse(engine, "proto-method.prefab", protoMethodCall)).rejects.toThrow(
          "Reserved serialized method"
        );
        await expect(PrefabParser.parse(engine, "unsafe-fn-result.prefab", unsafeFnCallResult)).rejects.toThrow(
          "unsafe value"
        );
        await expect(PrefabParser.parse(engine, "unsafe-entity-result.prefab", unsafeEntityCallResult)).rejects.toThrow(
          "unsafe value"
        );
        await expect(PrefabParser.parse(engine, "bad-comp-ref.prefab", badComponentRefPrefab)).rejects.toThrow(
          "not assignable to Component"
        );
        expect(executed).toBe(false);
      } finally {
        delete (globalThis as any).__galaceanV2RceTest;
      }
    });

    it("blocks non-Component and non-StateMachineScript class instantiation in v2 hierarchy and animator loaders", async () => {
      // @galacean/engine registers core exports including request and Engine into Loader
      expect(Loader.getClass("request")).toBe(request);

      const badRequestComponent = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root", components: [0] }],
        components: [{ type: "request" }],
        root: 0
      } as any;

      const badEngineComponent = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root", components: [0] }],
        components: [{ type: "Engine" }],
        root: 0
      } as any;

      const badColliderComponent = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root", components: [0] }],
        components: [{ type: "BoxColliderShape" }],
        root: 0
      } as any;

      await expect(PrefabParser.parse(engine, "req-comp.prefab", badRequestComponent)).rejects.toThrow(
        "not assignable to Component"
      );
      await expect(PrefabParser.parse(engine, "eng-comp.prefab", badEngineComponent)).rejects.toThrow(
        "not assignable to Component"
      );
      await expect(PrefabParser.parse(engine, "shape-comp.prefab", badColliderComponent)).rejects.toThrow(
        "not assignable to Component"
      );

      const badAnimCtrlUrl = blobUrl(
        JSON.stringify({
          layers: [
            {
              name: "Base",
              blendingMode: 0,
              weight: 1,
              stateMachine: {
                states: [
                  {
                    id: "s1",
                    name: "idle",
                    speed: 1,
                    wrapMode: 1,
                    clipStartNormalizedTime: 0,
                    clipEndNormalizedTime: 1,
                    scripts: ["request"]
                  }
                ],
                transitions: [],
                entryTransitions: [],
                anyTransitions: []
              }
            }
          ],
          parameters: []
        }),
        "application/json"
      );
      try {
        await expect(
          engine.resourceManager.load({ type: AssetType.AnimatorController, url: badAnimCtrlUrl })
        ).rejects.toThrow("not assignable to StateMachineScript");
      } finally {
        URL.revokeObjectURL(badAnimCtrlUrl);
      }
    });

    it("blocks reserved and disallowed ResourceManager sub-asset ?q= traversal", async () => {
      const prefabData = {
        version: "2.0",
        refs: [],
        entities: [{ name: "root" }],
        components: [],
        root: 0
      };
      const url = blobUrl(JSON.stringify(prefabData), "application/json");
      try {
        await expect(
          engine.resourceManager.load({ type: AssetType.Prefab, url: url + "?q=constructor" })
        ).rejects.toThrow();
        await expect(
          engine.resourceManager.load({ type: AssetType.Prefab, url: url + "?q=%70rototype" })
        ).rejects.toThrow();
        await engine.resourceManager.load<PrefabResource>({ type: AssetType.Prefab, url });
        expect(await engine.resourceManager.load({ type: AssetType.Prefab, url: url + "?q=url" })).toBe(url);
        for (const suffix of ["engine", "_root.engine", "destroy"]) {
          await expect(
            engine.resourceManager.load({ type: AssetType.Prefab, url: url + "?q=" + suffix })
          ).rejects.toThrow();
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    });

    it("ignores polluted Object.prototype properties in request() XHR and Fetch transports", async () => {
      const openSpy = vi.fn();
      const sendSpy = vi.fn();
      const setHeaderSpy = vi.fn();
      let capturedXhr: any;

      const OrigXHR = globalThis.XMLHttpRequest;
      const OrigFetch = globalThis.fetch;
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

      (Object.prototype as any).method = "POST";
      (Object.prototype as any).body = "galacean-poc";
      (Object.prototype as any).credentials = "include";
      (Object.prototype as any).headers = { "X-Polluted": "1" };

      try {
        (globalThis as any).XMLHttpRequest = MockXHR;
        const xhrResult = await request<{ ok: boolean }>("https://example.test/asset.json", {});
        expect(xhrResult).toEqual({ ok: true });
        expect(openSpy).toHaveBeenCalledWith("get", "https://example.test/asset.json", true);
        expect(capturedXhr.withCredentials).toBe(false);
        expect(sendSpy).toHaveBeenCalledWith(undefined);
        expect(setHeaderSpy).not.toHaveBeenCalled();

        // Exercise Fetch transport fallback (e.g. Worker environment without XMLHttpRequest)
        (globalThis as any).XMLHttpRequest = undefined;
        const fetchSpy = vi.fn().mockImplementation(() =>
          Promise.resolve(
            new Response(JSON.stringify({ via: "fetch" }), {
              status: 200,
              headers: { "content-type": "application/json" }
            })
          )
        );
        (globalThis as any).fetch = fetchSpy;
        const fetchResult = await request<{ via: string }>("https://example.test/fetch.json", {});
        expect(fetchResult).toEqual({ via: "fetch" });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [, fetchInit] = fetchSpy.mock.calls[0];
        expect(Object.getPrototypeOf(fetchInit)).toBeNull();
        expect(Object.prototype.hasOwnProperty.call(fetchInit, "method")).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(fetchInit, "body")).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(fetchInit, "credentials")).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(fetchInit, "headers")).toBe(false);
        expect(fetchInit.method).toBeUndefined();

        await request<{ via: string }>("https://example.test/explicit.json", {
          method: "put",
          headers: { "X-Allowed": "yes" }
        });
        const [, explicitInit] = fetchSpy.mock.calls[1];
        expect(explicitInit.method).toBe("put");
        expect(explicitInit.headers).toEqual({ "X-Allowed": "yes" });
      } finally {
        delete (Object.prototype as any).method;
        delete (Object.prototype as any).body;
        delete (Object.prototype as any).credentials;
        delete (Object.prototype as any).headers;
        globalThis.XMLHttpRequest = OrigXHR;
        globalThis.fetch = OrigFetch;
      }
    });
  });
});
