// Pure CPU grid-kernel input and reference brick-record helpers (no Engine/WebGL imports so
// BuildingWorker stays lightweight without bundling @galacean/engine).
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

export const GRID_UNIT_KERNEL_STRIDE = 64;
export const MAX_GRID_KERNEL_HOLES = 32;
const FNV_PRIME = 0x01000193;

/** FNV-1a over a string without the final mix, so the GPU can continue the same hash. */
function fnvState(text: string, h: number): number {
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), FNV_PRIME);
  return h >>> 0;
}

/** Pure heightmap sampling metadata (no sample buffer copy). */
export interface GridKernelTerrainInfo {
  readonly resolution: number;
  readonly origin: readonly [number, number];
  readonly size: number;
  readonly decode: { readonly offset: number; readonly scale: number };
  readonly frame: { readonly position: readonly [number, number, number]; readonly rotationY: number };
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
  /** Constant world ground Y elevation of a flat groundStrip (default 0). */
  readonly groundY?: number;
  /** Rectangular removed/reserved areas [u0, v0, u1, v1]; first `removeCount` are removeArea (trimmable), rest reserveArea. */
  readonly holes?: readonly (readonly [number, number, number, number])[];
  readonly removeCount?: number;
  /** Rolling terrain heightmap sampling parameters (reads shared GPU heightmap texture). */
  readonly terrain?: GridKernelTerrainInfo;
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

/** Turns a part's layout into kernel input, or explains why the kernel cannot lay it. */
export function gridKernelInput(
  part: ExpandablePart & { readonly key?: string },
  slot: number,
  options?: { readonly groundY?: number; readonly terrain?: GridKernelTerrainInfo }
): GridKernelInput {
  const unit = part.unit,
    layout = part.layout;
  if (!unit || !layout) throw Error("The part has no layout");
  if (part.algorithm.type !== "surfaceGrid") throw Error("Grid kernel lays surfaceGrid parts only");
  if (unit.rotation || unit.position || unit.pivot) throw Error("Grid kernel needs a centred, unrotated unit");
  const b = unit.bounds;
  if (!b || b.min.some((v, i) => v !== -b.max[i])) throw Error("Grid kernel needs bounds centred on the origin");
  const entries = layout.data as GridData[];
  if (entries.length !== 1 || entries[0].closed) throw Error("Grid kernel lays one open surface");
  const e = entries[0];
  const removes: [number, number, number, number][] = [];
  const reserves: [number, number, number, number][] = [];
  for (const mod of part.modifications) {
    if (mod.element !== e.id) continue;
    if (mod.op === "removeArea") {
      if (mod.outline) throw Error("Grid kernel does not support outlined area removals");
      removes.push([mod.rect[0], mod.rect[1], mod.rect[2], mod.rect[3]]);
    } else if (mod.op === "reserveArea") {
      reserves.push([mod.rect[0], mod.rect[1], mod.rect[2], mod.rect[3]]);
    } else {
      throw Error(`Grid kernel does not support modification "${mod.op}"`);
    }
  }
  const holes = [...removes, ...reserves];
  if (holes.length > MAX_GRID_KERNEL_HOLES) {
    throw Error(`Grid kernel supports at most ${MAX_GRID_KERNEL_HOLES} holes`);
  }
  const element = part.original.elements[e.id];
  if (element?.kind !== "surface" || element.surface.kind !== "groundStrip")
    throw Error("Grid kernel lays groundStrip faces only");
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
    seedState,
    ...(options?.groundY !== undefined ? { groundY: options.groundY } : {}),
    ...(holes.length > 0 ? { holes, removeCount: removes.length } : {}),
    ...(options?.terrain ? { terrain: options.terrain } : {})
  };
}

/** CPU reference: the same records, built from units expanded on the CPU. Empty slots stay zero. */
export function cpuBrickRecords(part: ExpandablePart, registry: BuildingRegistry, slot: number): Uint8Array {
  const out = new Uint8Array(part.layout!.count * GRID_UNIT_KERNEL_STRIDE);
  const slots = slotIndex(part);
  for (const laid of expandPart(part, registry))
    out.set(brickRecord(laid, slot), slots.get(laid.key)! * GRID_UNIT_KERNEL_STRIDE);
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
