import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  MeshTopology,
  Shader,
  ShaderData,
  ShaderDataGroup,
  ShaderLanguage,
  ShaderPass,
  ShaderProperty,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  TransformFeedbackSimulator,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat,
  type Engine
} from "@galacean/engine";
import { GridUnitKernel, type GridKernelInput } from "../render/GridUnitKernel";
import type { ConstructionTerrainGrid } from "./TerrainField";
import { restoreResource } from "@galacean/engine-project/rendering/RestorableResources";

export interface BrickPackFeedbackInput {
  kind: "pack";
  count: number;
  slot: number;
  /** 20 floats/uint32s per brick:
   *  0..2: tangent*sx | 3..5: bitangent*sy | 6..8: normal*sz | 9..11: origin
   *  12..15: deform[0..3] | 16..17: span[0..1] | 18: seed (u32 bits) | 19: flags (u32 bits) */
  data: Float32Array;
}

export interface BrickGridFeedbackInput {
  kind: "grid";
  count: number;
  grid: GridKernelInput;
}

export type BrickFeedbackSource = BrickGridFeedbackInput | BrickPackFeedbackInput;

const OUT_STRIDE = 64;
const IN_STRIDE = 80; // 5 * vec4

const PACK_SHADER_NAME = "Building/BrickPackKernel";
const PACK_SHADER_LAB_SOURCE = `Shader "${PACK_SHADER_NAME}" {
  SubShader "Default" {
    Pass "BrickPack" {
      int uSlot;
      struct Attributes {
        vec4 a0;
        vec4 a1;
        vec4 a2;
        vec4 a3;
        vec4 a4;
      };
      struct Varyings {
        flat uvec4 result0;
        flat uvec4 result1;
        flat uvec4 result2;
        flat uvec4 result3;
      };

      uint roundShift(uint v, uint shift) {
        uint q = v >> shift, r = v & ((1u << shift) - 1u), mid = 1u << (shift - 1u);
        return q + ((r > mid || (r == mid && (q & 1u) == 1u)) ? 1u : 0u);
      }
      uint toHalf(float value) {
        uint bits = floatBitsToUint(value);
        uint sgn = (bits >> 16) & 0x8000u, exponent = (bits >> 23) & 255u, fraction = bits & 0x7fffffu;
        if (exponent == 255u) return sgn | 0x7c00u | (fraction != 0u ? (fraction >> 13) | 0x200u : 0u);
        if (exponent >= 143u) return sgn | 0x7c00u;
        if (exponent < 102u) return sgn;
        if (exponent <= 112u) return sgn | roundShift(0x800000u | fraction, 126u - exponent);
        return sgn | (((exponent - 112u) << 10) + roundShift(fraction, 13u));
      }
      uint pair(float a, float b) { return toHalf(a) | (toHalf(b) << 16); }

      Varyings vert(Attributes a) {
        gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        // a0 = (tx, ty, tz, bx), a1 = (by, bz, nx, ny), a2 = (nz, ox, oy, oz)
        // a3 = (d0, d1, d2, d3), a4 = (span0, span1, uintBitsToFloat(seed), uintBitsToFloat(flags))
        Varyings v;
        v.result0 = uvec4(pair(a.a0.x, a.a0.y), pair(a.a0.z, a.a0.w), pair(a.a1.x, a.a1.y), pair(a.a1.z, a.a1.w));
        v.result1 = uvec4(toHalf(a.a2.x), floatBitsToUint(a.a2.y), floatBitsToUint(a.a2.z), floatBitsToUint(a.a2.w));
        v.result2 = uvec4(pair(a.a3.x, a.a3.y), pair(a.a3.z, a.a3.w), pair(-100.0, -100.0), pair(-100.0, a.a4.x));
        v.result3 = uvec4(toHalf(a.a4.y), floatBitsToUint(a.a4.z), uint(uSlot), floatBitsToUint(a.a4.w));
        return v;
      }

      void frag() {
        gl_FragColor = vec4(0.0);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`;
const VARYINGS = ["result0", "result1", "result2", "result3"];
const IN_ELEMENTS = [0, 1, 2, 3, 4].map((i) => new VertexElement(`a${i}`, i * 16, VertexElementFormat.Vector4, 0));
const RendererShaderData = ShaderData as unknown as new (group: ShaderDataGroup) => ShaderData;
const PROP_U_SLOT = ShaderProperty.getByName("uSlot");
const IS_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const terrainHeightTextures = new WeakMap<Engine, { samples: Uint16Array; resolution: number; texture: Texture2D }>();

/** Upload an R16 terrain height grid once per Engine/samples pair as a shared R8G8 GPU Texture2D (zero CPU copy on LE). */
export function getOrCreateTerrainHeightTexture(engine: Engine, grid: ConstructionTerrainGrid): Texture2D {
  const cached = terrainHeightTextures.get(engine);
  if (cached && cached.samples === grid.samples && cached.resolution === grid.resolution && !cached.texture.destroyed) {
    return cached.texture;
  }
  if (cached && !cached.texture.destroyed) {
    cached.texture.destroy();
  }
  const n = grid.resolution;
  const texture = new Texture2D(engine, n, n, TextureFormat.R8G8_UNorm, false, false);
  texture.filterMode = TextureFilterMode.Point;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  let bytes: Uint8Array;
  if (IS_LITTLE_ENDIAN) {
    bytes = new Uint8Array(grid.samples.buffer, grid.samples.byteOffset, grid.samples.byteLength);
  } else {
    bytes = new Uint8Array(grid.samples.length * 2);
    for (let i = 0; i < grid.samples.length; i++) {
      const v = grid.samples[i]!;
      bytes[i * 2] = v & 0xff;
      bytes[i * 2 + 1] = v >>> 8;
    }
  }
  texture.setPixelBuffer(bytes);
  restoreResource(texture, () => texture.setPixelBuffer(bytes));
  texture.isGCIgnored = true;
  terrainHeightTextures.set(engine, { samples: grid.samples, resolution: n, texture });
  return texture;
}

function packKernelPass(engine?: Engine): ShaderPass {
  let shader = Shader.find(PACK_SHADER_NAME);
  if (!shader) {
    shader = engine ? Shader.create(PACK_SHADER_LAB_SOURCE, engine)! : Shader.create(PACK_SHADER_LAB_SOURCE)!;
  }
  return shader.subShaders[0].passes[0];
}

/** Generate `storage_0_1` brick Texture2D from the feedback compute buffer (zero CPU 64B copy, zero readback). */
export function buildBrickStorageFromFeedback(
  engine: Engine,
  source: BrickFeedbackSource,
  terrainGrid?: ConstructionTerrainGrid
): Texture2D {
  const device = engine._hardwareRenderer;
  if (!device.copyBufferToTexture) throw new Error("Brick storage requires buffer-to-texture copies");
  const count = Math.max(1, source.count);
  const texels = count * 4;
  const width = Math.min(1024, texels);
  const height = Math.ceil(texels / width);
  const texture = new Texture2D(engine, width, height, TextureFormat.R32G32B32A32_UInt, false, false);
  texture.filterMode = TextureFilterMode.Point;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  if (source.count === 0) return texture;

  if (source.kind === "grid") {
    const heightMap =
      source.grid.terrain && terrainGrid ? getOrCreateTerrainHeightTexture(engine, terrainGrid) : undefined;
    const kernel = new GridUnitKernel(engine, source.grid, heightMap);
    try {
      const binding = kernel.run();
      device.copyBufferToTexture(binding.buffer, texture, texels);
    } finally {
      kernel.destroy();
    }
    return texture;
  }

  const inputBuf = new Buffer(engine, BufferBindFlag.VertexBuffer, source.data, BufferUsage.Static, false);
  const simulator = new TransformFeedbackSimulator(
    engine,
    OUT_STRIDE,
    count,
    packKernelPass(engine),
    VARYINGS,
    "output-only"
  );
  const shaderData = new RendererShaderData(ShaderDataGroup.Renderer);
  shaderData.setInt(PROP_U_SLOT, source.slot);
  try {
    if (!simulator.beginUpdate(shaderData, [], [new VertexBufferBinding(inputBuf, IN_STRIDE)], IN_ELEMENTS)) {
      throw Error("Brick pack TransformFeedback failed to compile");
    }
    try {
      simulator.draw(MeshTopology.Points, 0, count);
    } finally {
      simulator.endUpdate();
    }
    device.copyBufferToTexture(simulator.readBinding.buffer, texture, texels);
  } finally {
    simulator.destroy();
    inputBuf.destroy(true);
  }
  return texture;
}
