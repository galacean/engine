// Prototype: lay a surfaceGrid part on the GPU and write brick records directly.
// The CPU keeps only the part's layout; TransformFeedback computes one record per slot.
//
// Scope of this prototype (checked by `gridKernelInput`):
// - surfaceGrid on one "groundStrip" face, flat ground, no area modifications;
// - unit bounds centred on the origin, default pivot, no rotation or position.
// Rolling ground needs a height texture from the terrain system; holes need the
// removed rectangles as a uniform array. Both come after this prototype.
import {
  MeshTopology,
  Shader,
  ShaderData,
  ShaderDataGroup,
  ShaderLanguage,
  ShaderPass,
  TransformFeedbackSimulator,
  Vector3,
  Vector4,
  VertexElement,
  VertexElementFormat,
  type Engine,
  type VertexBufferBinding
} from "@galacean/engine";
import {
  deriveSeed,
  expandPart,
  sinCos,
  unitNominal,
  type BuildingRegistry,
  type ExpandablePart,
  type LaidUnit
} from "../core";
import { encodeBrick96 } from "../runtime/UnitPacking.js";

const STRIDE = 64;
const FNV_PRIME = 0x01000193;

/** FNV-1a over a string without the final mix, so the GPU can continue the same hash. */
function fnvState(text: string, h: number): number {
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), FNV_PRIME);
  return h >>> 0;
}

/** Everything the kernel reads. Its size does not depend on the number of units. */
export interface GridKernelInput {
  readonly count: number;
  readonly slot: number;
  readonly grid: readonly [w: number, h: number, stagger: number, r0: number];
  readonly columns: readonly [columns: number, evenStart: number, oddStart: number, evenEnd: number];
  readonly oddEnd: number;
  readonly bounds: readonly [u0: number, u1: number, v0: number, v1: number];
  readonly strip: readonly [cx: number, cz: number, cos: number, sin: number];
  readonly length: number;
  readonly nominal: readonly [number, number, number];
  readonly rangeMin: readonly [number, number, number];
  readonly rangeMax: readonly [number, number, number];
  /** gap u, gap v, gap limit (negative: none), trim (0 or 1). */
  readonly gap: readonly [number, number, number, number];
  /** FNV state after "s" + element id + ":", continuing from the part and unit seeds. */
  readonly seedState: number;
}

interface GridData {
  id: string;
  count: number;
  w: number;
  h: number;
  r0: number;
  columns: number;
  c0: [number, number];
  c1: [number, number];
  stagger: number;
  closed: boolean;
}

/** Turns a part's layout into kernel input, or explains why the prototype cannot lay it. */
export function gridKernelInput(part: ExpandablePart & { readonly key?: string }, slot: number): GridKernelInput {
  const unit = part.unit,
    layout = part.layout;
  if (!unit || !layout) throw Error("The part has no layout");
  if (part.algorithm.type !== "surfaceGrid") throw Error("The prototype lays surfaceGrid parts only");
  if (part.modifications.length) throw Error("The prototype does not support area modifications yet");
  if (unit.rotation || unit.position || unit.pivot) throw Error("The prototype needs a centred, unrotated unit");
  const b = unit.bounds;
  if (!b || b.min.some((v, i) => v !== -b.max[i])) throw Error("The prototype needs bounds centred on the origin");
  const entries = layout.data as GridData[];
  if (entries.length !== 1 || entries[0].closed) throw Error("The prototype lays one open surface");
  const e = entries[0];
  const element = part.original.elements[e.id];
  if (element?.kind !== "surface" || element.surface.kind !== "groundStrip")
    throw Error("The prototype lays groundStrip faces only");
  const strip = element.surface.params as {
    rectangle: { center: [number, number]; size: [number, number]; rotation: number };
    height: number;
  };
  const [s, c] = sinCos(strip.rectangle.rotation);
  const params = layout.params as { trim?: boolean; gap?: [number, number]; gapLimit?: number };
  const range = unit.range ?? { min: [1, 1, 1], max: [1, 1, 1] };
  const seedState = fnvState("s" + e.id + ":", deriveSeed(part.seed, unit.seed ?? 0));
  return {
    count: layout.count,
    slot,
    grid: [e.w, e.h, e.stagger, e.r0],
    columns: [e.columns, e.c0[0], e.c0[1], e.c1[0]],
    oddEnd: e.c1[1],
    bounds: [0, strip.rectangle.size[0], 0, strip.height],
    strip: [strip.rectangle.center[0], strip.rectangle.center[1], c, s],
    length: strip.rectangle.size[0],
    nominal: [...unitNominal(unit)] as [number, number, number],
    rangeMin: [...range.min] as [number, number, number],
    rangeMax: [...range.max] as [number, number, number],
    gap: [params.gap?.[0] ?? 0, params.gap?.[1] ?? 0, params.gapLimit ?? -1, params.trim ? 1 : 0],
    seedState
  };
}

/** CPU reference: the same records, built from units expanded on the CPU. Empty slots stay zero. */
export function cpuBrickRecords(part: ExpandablePart, registry: BuildingRegistry, slot: number): Uint8Array {
  const out = new Uint8Array(part.layout!.count * STRIDE);
  const slots = slotIndex(part);
  for (const laid of expandPart(part, registry)) out.set(brickRecord(laid, slot), slots.get(laid.key)! * STRIDE);
  return out;
}
/** Slot index of every key, from the grid layout. */
function slotIndex(part: ExpandablePart): Map<string, number> {
  const e = (part.layout!.data as GridData[])[0];
  const map = new Map<string, number>();
  for (let i = 0; i < part.layout!.count; i++) {
    const r = e.r0 + Math.floor(i / e.columns),
      parity = ((r % 2) + 2) % 2;
    map.set(`${e.id}:${r}:${e.c0[parity] + (i % e.columns)}`, i);
  }
  return map;
}
/** One brick record in the online 64-byte format, from one laid unit. */
export function brickRecord(laid: LaidUnit, slot: number): Uint8Array {
  const f = laid.frame,
    size = laid.size ?? [0, 0, 0];
  const mat = [f.x, f.y, f.z].flatMap((axis, j) => axis.map((x) => x * size[j]));
  const b = new Uint8Array(96),
    v = new DataView(b.buffer);
  [...mat, ...f.origin].forEach((x, i) => v.setFloat32(i * 4, x, true));
  [16, 17, 18].forEach((i) => v.setFloat32(i * 4, -100, true));
  v.setUint32(76, laid.seed & 0x7fffffff, true);
  v.setUint32(80, slot, true);
  return encodeBrick96(b);
}

const SOURCE = `
precision highp float;
precision highp int;
uniform int uCount;
uniform int uSlot;
uniform int uSeedState;
uniform vec4 uGrid;
uniform vec4 uColumns;
uniform float uOddEnd;
uniform vec4 uBounds;
uniform vec4 uStrip;
uniform float uLength;
uniform vec3 uNominal;
uniform vec3 uRangeMin;
uniform vec3 uRangeMax;
uniform vec4 uGap;
layout(location=0) in uvec4 record0;
layout(location=1) in uvec4 record1;
layout(location=2) in uvec4 record2;
layout(location=3) in uvec4 record3;
flat out uvec4 result0;
flat out uvec4 result1;
flat out uvec4 result2;
flat out uvec4 result3;

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

void main() {
  result0 = uvec4(0u); result1 = uvec4(0u); result2 = uvec4(0u); result3 = uvec4(0u);
  int i = gl_VertexID;
  int columns = int(uColumns.x);
  if (i >= uCount || columns <= 0) return;
  int r = int(uGrid.w) + i / columns;
  int parity = ((r % 2) + 2) % 2;
  int c = (parity == 1 ? int(uColumns.z) : int(uColumns.y)) + i % columns;
  if (c >= (parity == 1 ? int(uOddEnd) : int(uColumns.w))) return;
  float shift = parity == 1 ? uGrid.z : 0.0;
  vec4 rect = vec4((float(c) + shift) * uGrid.x, float(r) * uGrid.y, (float(c) + 1.0 + shift) * uGrid.x, float(r + 1) * uGrid.y);
  if (uGap.w > 0.5) {
    rect = vec4(max(rect.x, uBounds.x), max(rect.y, uBounds.z), min(rect.z, uBounds.y), min(rect.w, uBounds.w));
    if (!(rect.z > rect.x && rect.w > rect.y)) return;
  }
  if (rect.x < uBounds.x - 1e-6 || rect.z > uBounds.y + 1e-6 || rect.y < uBounds.z - 1e-6 || rect.w > uBounds.w + 1e-6) return;
  vec3 size = vec3(joint(rect.z - rect.x, uGap.x, uGap.z), joint(rect.w - rect.y, uGap.y, uGap.z), uNominal.z);
  vec3 stretch = size / uNominal;
  if (any(lessThan(stretch, uRangeMin - 1e-6)) || any(greaterThan(stretch, uRangeMax + 1e-6))) return;
  vec2 uv = vec2(rect.x + rect.z, rect.y + rect.w) * 0.5;
  float x = uv.x - uLength * 0.5;
  vec3 origin = vec3(uStrip.x + uStrip.z * x, uv.y, uStrip.y + uStrip.w * x);
  vec3 t = vec3(uStrip.z, 0.0, uStrip.w) * size.x;
  vec3 b = vec3(0.0, 1.0, 0.0) * size.y;
  vec3 n = vec3(-uStrip.w, 0.0, uStrip.z) * size.z;
  uint seed = mix32(fnvInt(fnv(fnvInt(uint(uSeedState), r), 58u), c)) & 0x7fffffffu;
  result0 = uvec4(pair(t.x, t.y), pair(t.z, b.x), pair(b.y, b.z), pair(n.x, n.y));
  result1 = uvec4(toHalf(n.z), floatBitsToUint(origin.x), floatBitsToUint(origin.y), floatBitsToUint(origin.z));
  result2 = uvec4(0u, 0u, pair(-100.0, -100.0), toHalf(-100.0));
  result3 = uvec4(0u, seed, uint(uSlot), 0u);
}
`;
const NAME = "Building/GridUnitKernel";
const VARYINGS = ["result0", "result1", "result2", "result3"];
const ELEMENTS = [0, 1, 2, 3].map((i) => new VertexElement(`record${i}`, i * 16, VertexElementFormat.UInt4, 0));
// Same internal bridge as EngineRoofFeedback: the Renderer group constructor is not public.
const RendererShaderData = ShaderData as unknown as new (group: ShaderDataGroup) => ShaderData;

function kernelPass(): ShaderPass {
  let shader = Shader.find(NAME);
  if (!shader) {
    const pass = new ShaderPass(
      "GridUnits",
      [[0, SOURCE]],
      [[0, "precision highp float; out vec4 color; void main(){ color = vec4(0.0); }"]],
      ShaderLanguage.GLSLES300
    );
    shader = Shader.create(NAME, [pass])!;
  }
  return shader.subShaders[0].passes[0];
}

/** Lays one part on the GPU. The output binding holds one 64-byte record per slot. */
export class GridUnitKernel {
  private readonly simulator: TransformFeedbackSimulator;
  private readonly data = new RendererShaderData(ShaderDataGroup.Renderer);
  constructor(
    engine: Engine,
    readonly input: GridKernelInput
  ) {
    this.simulator = new TransformFeedbackSimulator(engine, STRIDE, Math.max(1, input.count), kernelPass(), VARYINGS);
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
    if (!this.simulator.beginUpdate(d, ELEMENTS, [], [])) throw Error("Grid unit kernel failed to compile");
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
