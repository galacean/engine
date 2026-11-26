// Lay a surfaceGrid part on the GPU via WebGL2 TransformFeedback and write 64-byte brick records directly.
// The CPU keeps only the part's layout (~260 bytes + hole rects + terrain metadata);
// TransformFeedback computes one record per slot, sampling the shared GPU R8G8 heightmap texture
// for rolling terrain and trimming/clipping rectangular area modifications (doors/windows).
import {
  MeshTopology,
  Shader,
  ShaderData,
  ShaderDataGroup,
  ShaderLanguage,
  ShaderPass,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  TransformFeedbackSimulator,
  Vector2,
  Vector3,
  Vector4,
  type Engine,
  type VertexBufferBinding
} from "@galacean/engine";
import {
  GRID_UNIT_KERNEL_STRIDE,
  MAX_GRID_KERNEL_HOLES,
  type GridKernelInput,
  type GridKernelTerrainInfo
} from "./GridUnitKernelInput";
import { restoreResource } from "@galacean/engine-project/rendering/RestorableResources";
export {
  brickRecord,
  cpuBrickRecords,
  gridKernelInput,
  MAX_GRID_KERNEL_HOLES,
  type GridKernelInput,
  type GridKernelTerrainInfo
} from "./GridUnitKernelInput";

const STRIDE = GRID_UNIT_KERNEL_STRIDE;

const NAME = "Building/GridUnitKernel";
const SOURCE = `Shader "${NAME}" {
  SubShader "Default" {
    Pass "GridUnits" {
      int uCount;
      int uSlot;
      int uSeedState;
      vec4 uGrid;
      vec4 uColumns;
      float uOddEnd;
      vec4 uBounds;
      vec4 uStrip;
      float uLength;
      vec3 uNominal;
      vec3 uRangeMin;
      vec3 uRangeMax;
      vec4 uGap;
      float uGroundY;
      sampler2D uHeightMap;
      vec2 uHeightOrigin;
      vec4 uHeightMeta;
      vec4 uFrameTransform;
      int uRemoveCount;
      int uHoleCount;
      vec4 uHoles[${MAX_GRID_KERNEL_HOLES}];

      struct Varyings {
        flat uvec4 result0;
        flat uvec4 result1;
        flat uvec4 result2;
        flat uvec4 result3;
      };

      uint mix32(uint h) {
        h ^= h >> 16u; h *= 0x85ebca6bu; h ^= h >> 13u; h *= 0xc2b2ae35u; h ^= h >> 16u; return h;
      }
      uint fnv(uint h, uint ch) { return (h ^ ch) * 0x01000193u; }
      uint fnvInt(uint h, int v) {
        if (v < 0) { h = fnv(h, 45u); v = -v; }
        int d = 1;
        while (d * 10 <= v) d *= 10;
        for (; d > 0; d /= 10) h = fnv(h, uint(48 + (v / d) % 10));
        return h;
      }
      // Round to nearest even, exactly as f32BitsToHalf in UnitPacking.js.
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
      float joint(float span, float gap, float limit) { return span - (limit < 0.0 ? gap : min(gap, span * limit)); }

      float sampleHeightU16(ivec2 ij) {
        vec2 rg = texelFetch(uHeightMap, ij, 0).rg;
        return floor(rg.r * 255.0 + 0.5) + floor(rg.g * 255.0 + 0.5) * 256.0;
      }

      float sampleGroundY(float lx, float lz) {
        if (uHeightMeta.x < 1.5) return uGroundY;
        // Matches prepareBuildingTerrain: wx = px + c * lx + s * lz, wz = pz - s * lx + c * lz
        float wx = uFrameTransform.x + uFrameTransform.z * lx + uFrameTransform.w * lz;
        float wz = uFrameTransform.y - uFrameTransform.w * lx + uFrameTransform.z * lz;
        float u = clamp((wx - uHeightOrigin.x) / uHeightMeta.y, 0.0, 1.0);
        float v = clamp((wz - uHeightOrigin.y) / uHeightMeta.y, 0.0, 1.0);
        int maxIdx = int(uHeightMeta.x) - 1;
        float gx = u * float(maxIdx);
        float gz = v * float(maxIdx);
        int x0 = int(floor(gx));
        int z0 = int(floor(gz));
        int x1 = min(maxIdx, x0 + 1);
        int z1 = min(maxIdx, z0 + 1);
        float tx = gx - float(x0);
        float tz = gz - float(z0);
        float h00 = sampleHeightU16(ivec2(x0, z0));
        float h10 = sampleHeightU16(ivec2(x1, z0));
        float h01 = sampleHeightU16(ivec2(x0, z1));
        float h11 = sampleHeightU16(ivec2(x1, z1));
        float val = mix(mix(h00, h10, tx), mix(h01, h11, tx), tz);
        return uHeightMeta.z + (val / 65535.0) * uHeightMeta.w;
      }

      Varyings vert() {
        gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
        Varyings v;
        v.result0 = uvec4(0u); v.result1 = uvec4(0u); v.result2 = uvec4(0u); v.result3 = uvec4(0u);
        int i = gl_VertexID;
        int columns = int(uColumns.x);
        if (i >= uCount || columns <= 0) return v;
        int r = int(uGrid.w) + i / columns;
        int parity = ((r % 2) + 2) % 2;
        int c = (parity == 1 ? int(uColumns.z) : int(uColumns.y)) + i % columns;
        if (c >= (parity == 1 ? int(uOddEnd) : int(uColumns.w))) return v;
        float shift = parity == 1 ? uGrid.z : 0.0;
        vec4 rect = vec4((float(c) + shift) * uGrid.x, float(r) * uGrid.y, (float(c) + 1.0 + shift) * uGrid.x, float(r + 1) * uGrid.y);
        if (uGap.w > 0.5) {
          rect = vec4(max(rect.x, uBounds.x), max(rect.y, uBounds.z), min(rect.z, uBounds.y), min(rect.w, uBounds.w));
          if (!(rect.z > rect.x && rect.w > rect.y)) return v;
          // Trim against removeArea holes: keep the largest remaining side, matching surfaceGrid on CPU.
          for (int hi = 0; hi < ${MAX_GRID_KERNEL_HOLES}; hi++) {
            if (hi >= uRemoveCount) break;
            vec4 hole = uHoles[hi];
            if (!(hole.x < rect.z && rect.x < hole.z && hole.y < rect.w && rect.y < hole.w)) continue;
            float a = rect.x, b = rect.y, rc = rect.z, d = rect.w;
            float a0 = hole.x > a ? (hole.x - a) * (d - b) : 0.0;
            float a1 = rc > hole.z ? (rc - hole.z) * (d - b) : 0.0;
            float a2 = hole.y > b ? (rc - a) * (hole.y - b) : 0.0;
            float a3 = d > hole.w ? (rc - a) * (d - hole.w) : 0.0;
            float bestArea = a0;
            rect = vec4(a, b, hole.x, d);
            if (a1 > bestArea) { bestArea = a1; rect = vec4(hole.z, b, rc, d); }
            if (a2 > bestArea) { bestArea = a2; rect = vec4(a, b, rc, hole.y); }
            if (a3 > bestArea) { bestArea = a3; rect = vec4(a, hole.w, rc, d); }
            if (!(bestArea > 0.0)) return v;
          }
        }
        if (rect.x < uBounds.x - 1e-6 || rect.z > uBounds.y + 1e-6 || rect.y < uBounds.z - 1e-6 || rect.w > uBounds.w + 1e-6) return v;
        // Reject any remaining overlap with removeArea or reserveArea, matching EffectiveSurface.covers().
        for (int hi = 0; hi < ${MAX_GRID_KERNEL_HOLES}; hi++) {
          if (hi >= uHoleCount) break;
          vec4 hole = uHoles[hi];
          if (hole.x < rect.z && rect.x < hole.z && hole.y < rect.w && rect.y < hole.w) return v;
        }
        vec3 size = vec3(joint(rect.z - rect.x, uGap.x, uGap.z), joint(rect.w - rect.y, uGap.y, uGap.z), uNominal.z);
        vec3 stretch = size / uNominal;
        if (any(lessThan(stretch, uRangeMin - 1e-6)) || any(greaterThan(stretch, uRangeMax + 1e-6))) return v;
        vec2 uv = vec2(rect.x + rect.z, rect.y + rect.w) * 0.5;
        float x = uv.x - uLength * 0.5;
        float lx = uStrip.x + uStrip.z * x;
        float lz = uStrip.y + uStrip.w * x;
        float gy = sampleGroundY(lx, lz);
        vec3 origin = vec3(lx, uv.y + gy, lz);
        vec3 t = vec3(uStrip.z, 0.0, uStrip.w) * size.x;
        vec3 b = vec3(0.0, 1.0, 0.0) * size.y;
        vec3 n = vec3(-uStrip.w, 0.0, uStrip.z) * size.z;
        uint seed = mix32(fnvInt(fnv(fnvInt(uint(uSeedState), r), 58u), c)) & 0x7fffffffu;
        v.result0 = uvec4(pair(t.x, t.y), pair(t.z, b.x), pair(b.y, b.z), pair(n.x, n.y));
        v.result1 = uvec4(toHalf(n.z), floatBitsToUint(origin.x), floatBitsToUint(origin.y), floatBitsToUint(origin.z));
        v.result2 = uvec4(0u, 0u, pair(-100.0, -100.0), toHalf(-100.0));
        v.result3 = uvec4(0u, seed, uint(uSlot), 0u);
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
// Same internal bridge as EngineRoofFeedback: the Renderer group constructor is not public.
const RendererShaderData = ShaderData as unknown as new (group: ShaderDataGroup) => ShaderData;
const dummyHeightTextures = new WeakMap<Engine, Texture2D>();

const DUMMY_HEIGHT_BYTES = new Uint8Array(2);

function getDummyHeightTexture(engine: Engine): Texture2D {
  let tex = dummyHeightTextures.get(engine);
  if (!tex || tex.destroyed) {
    tex = new Texture2D(engine, 1, 1, TextureFormat.R8G8_UNorm, false, false);
    tex.filterMode = TextureFilterMode.Point;
    tex.wrapModeU = tex.wrapModeV = TextureWrapMode.Clamp;
    tex.setPixelBuffer(DUMMY_HEIGHT_BYTES);
    restoreResource(tex, () => tex!.setPixelBuffer(DUMMY_HEIGHT_BYTES));
    tex.isGCIgnored = true;
    dummyHeightTextures.set(engine, tex);
  }
  return tex;
}

function kernelPass(engine?: Engine): ShaderPass {
  let shader = Shader.find(NAME);
  if (!shader) {
    shader = engine ? Shader.create(SOURCE, engine)! : Shader.create(SOURCE)!;
  }
  return shader.subShaders[0].passes[0];
}

/** Lays one part on the GPU. The output binding holds one 64-byte record per slot. */
export class GridUnitKernel {
  private readonly simulator: TransformFeedbackSimulator;
  private readonly data = new RendererShaderData(ShaderDataGroup.Renderer);
  private readonly engine: Engine;
  private readonly heightMap?: Texture2D;
  constructor(
    engine: Engine,
    readonly input: GridKernelInput,
    heightMap?: Texture2D
  ) {
    this.engine = engine;
    this.heightMap = heightMap;
    this.simulator = new TransformFeedbackSimulator(
      engine,
      STRIDE,
      Math.max(1, input.count),
      kernelPass(engine),
      VARYINGS,
      "output-only"
    );
  }
  run(): VertexBufferBinding {
    const d = this.data,
      p = this.input;
    d.setInt("uCount", p.count);
    d.setInt("uSlot", p.slot);
    d.setInt("uSeedState", p.seedState | 0);
    d.setVector4("uGrid", new Vector4(...p.grid));
    d.setVector4("uColumns", new Vector4(...p.columns));
    d.setFloat("uOddEnd", p.oddEnd);
    d.setVector4("uBounds", new Vector4(...p.bounds));
    d.setVector4("uStrip", new Vector4(...p.strip));
    d.setFloat("uLength", p.length);
    d.setVector3("uNominal", new Vector3(...p.nominal));
    d.setVector3("uRangeMin", new Vector3(...p.rangeMin));
    d.setVector3("uRangeMax", new Vector3(...p.rangeMax));
    d.setVector4("uGap", new Vector4(...p.gap));
    d.setFloat("uGroundY", p.groundY ?? 0);
    const useTerrain = Boolean(p.terrain && this.heightMap);
    d.setTexture("uHeightMap", useTerrain ? this.heightMap! : getDummyHeightTexture(this.engine));
    if (useTerrain && p.terrain) {
      const t = p.terrain;
      const c = Math.cos(t.frame.rotationY),
        s = Math.sin(t.frame.rotationY);
      d.setVector2("uHeightOrigin", new Vector2(t.origin[0], t.origin[1]));
      d.setVector4("uHeightMeta", new Vector4(t.resolution, t.size, t.decode.offset, t.decode.scale));
      d.setVector4("uFrameTransform", new Vector4(t.frame.position[0], t.frame.position[2], c, s));
    } else {
      d.setVector2("uHeightOrigin", new Vector2(0, 0));
      d.setVector4("uHeightMeta", new Vector4(0, 1, 0, 1));
      d.setVector4("uFrameTransform", new Vector4(0, 0, 1, 0));
    }
    const holes = p.holes ?? [];
    const holeCount = Math.min(MAX_GRID_KERNEL_HOLES, holes.length);
    const removeCount = Math.min(holeCount, p.removeCount ?? holeCount);
    d.setInt("uRemoveCount", removeCount);
    d.setInt("uHoleCount", holeCount);
    const holeData = new Float32Array(MAX_GRID_KERNEL_HOLES * 4);
    for (let i = 0; i < holeCount; i++) {
      const h = holes[i]!;
      holeData[i * 4] = h[0];
      holeData[i * 4 + 1] = h[1];
      holeData[i * 4 + 2] = h[2];
      holeData[i * 4 + 3] = h[3];
    }
    d.setFloatArray("uHoles", holeData);
    if (!this.simulator.beginUpdate(d, [], [], [])) throw Error("Grid unit kernel failed to compile");
    try {
      this.simulator.draw(MeshTopology.Points, 0, p.count);
    } finally {
      this.simulator.endUpdate();
    }
    return this.simulator.readBinding;
  }
  /** Reads the records back. Only for checks: rendering uses the binding directly. */
  read(): Uint8Array {
    const out = new Uint8Array(this.input.count * STRIDE);
    this.simulator.readBinding.buffer.getData(out);
    return out;
  }
  destroy(): void {
    this.simulator.destroy();
  }
}
