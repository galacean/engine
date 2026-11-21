import {
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  CompareFunction,
  type Engine,
  type Entity,
  IndexBufferBinding,
  IndexFormat,
  Material,
  MeshRenderer,
  MeshTopology,
  Shader,
  ShaderFactory,
  ShaderLanguage,
  ShaderMacro,
  ShaderProperty,
  Vector3,
  Vector4,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";
import farProxyShaderSource from "./MasonryFarProxy.shader?raw";
import lodDither from "./MasonryLodDither.glsl?raw";
import { registerConstructionSceneLighting } from "./ConstructionSceneLighting";
import { constructionPlasterGLSL } from "./ConstructionPlasterShader";
import { plasterLinearColor } from "./ConstructionPlasterPalette";
import { constructionBrickLayer, uvU, uvV, type ConstructionPreviewPart, type PackedUv2 } from "./ConstructionPreview";
import { DecorationMaterial } from "./ConstructionDecorationMaterial";
import type { ConstructionDecorationPart } from "./ConstructionDecorations";
import type { BuildingPaletteSlot } from "./BuildingGlobals";
import { masonryAppearance, srgbToLinear } from "./MasonryAppearance";
import { buildingGroupKey, buildingPartKey } from "./BuildingObjectIdentity";
import type { SeedWorldPickBatch } from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import { restoreBuffer } from "@galacean/engine-modify/rendering/RestorableResources";

// Compact split layout: stream 0 = 32B static geometry (pos 12 + norm/pick 4 + uv 8 + tag 8), stream 1 = 4B u8x4 color+emission
const COMPACT_GEOM_STRIDE_BYTES = 32;
const COMPACT_GEOM_F32_STRIDE = COMPACT_GEOM_STRIDE_BYTES / Float32Array.BYTES_PER_ELEMENT;
const COMPACT_GEOM_U16_STRIDE = COMPACT_GEOM_STRIDE_BYTES / Uint16Array.BYTES_PER_ELEMENT;
const FAR_PROXY_RGB_SCALE = 2;
const FAR_PROXY_EMISSION_SCALE = 8;
const FAR_PROXY_WALL_LENGTH_SCALE = 256;
const PLASTER_NORMAL_BIAS_METRES = 0.06;
const STONE_PAVING_NORMAL_BIAS_METRES = 0.02;

export const SURFACE_KIND_WALL = 0;
export const SURFACE_KIND_ROOF_TILE = 1;
export const SURFACE_KIND_WOODEN_PLANK = 2;
export const SURFACE_KIND_PLASTER = 3;
export const SURFACE_KIND_STONE_PAVING = 4;
export const SURFACE_KIND_DECORATION = 5;
export const SURFACE_KIND_DECORATION_GLASS = 6;

const COMPACT_ELEMENTS_INLINE_PICK: VertexElement[] = [
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
  new VertexElement("NORMAL", 12, VertexElementFormat.NormalizedByte4, 0),
  new VertexElement("TEXCOORD_0", 16, VertexElementFormat.Vector2, 0),
  new VertexElement("TANGENT", 24, VertexElementFormat.NormalizedUShort4, 0),
  new VertexElement("COLOR_0", 0, VertexElementFormat.NormalizedUByte4, 1)
];

const COMPACT_ELEMENTS_WITH_PICK_BUF: VertexElement[] = [
  ...COMPACT_ELEMENTS_INLINE_PICK,
  new VertexElement("TEXCOORD_1", 0, VertexElementFormat.Float, 2)
];

export function packSignedByte(value: number): number {
  const clamped = value < -1 ? -1 : value > 1 ? 1 : value;
  return Math.round(clamped * 127);
}

export function packU16Scaled(value: number, scale: number): number {
  if (!(value > 0)) return 0;
  const normalized = value / scale;
  return normalized >= 1 ? 65535 : Math.round(normalized * 65535);
}

export function packU8Scaled(value: number, scale: number): number {
  if (!(value > 0)) return 0;
  const normalized = value / scale;
  return normalized >= 1 ? 255 : Math.round(normalized * 255);
}

const SHARED_MATERIALS = new WeakMap<Engine, { standard?: Material; inlinePick?: Material }>();
const MACRO_FAR_DITHER =
  ShaderMacro?.getByName?.("MASONRY_FAR_DITHER") ?? ("MASONRY_FAR_DITHER" as unknown as ShaderMacro);
const MACRO_FAR_PLASTER =
  ShaderMacro?.getByName?.("MASONRY_FAR_PLASTER") ?? ("MASONRY_FAR_PLASTER" as unknown as ShaderMacro);
const PROP_FAR_LOD_FADE =
  ShaderProperty?.getByName?.("renderer_MasonryLodFade") ?? ("renderer_MasonryLodFade" as unknown as ShaderProperty);
const PROP_FAR_LOD_DEBUG_COLOR =
  ShaderProperty?.getByName?.("renderer_MasonryLodDebugColor") ??
  ("renderer_MasonryLodDebugColor" as unknown as ShaderProperty);

function getSharedFarProxyMaterial(engine: Engine, inlinePick = false): Material {
  let cache = SHARED_MATERIALS.get(engine);
  if (!cache) SHARED_MATERIALS.set(engine, (cache = {}));
  let material = inlinePick ? cache.inlinePick : cache.standard;
  if (!material || material.destroyed) {
    registerConstructionSceneLighting();
    if (!ShaderFactory.includeMap["Masonry/LodDither.glsl"]) {
      ShaderFactory.registerInclude("Masonry/LodDither.glsl", lodDither);
    }
    if (!ShaderFactory.includeMap["Masonry/Plaster.glsl"]) {
      ShaderFactory.registerInclude("Masonry/Plaster.glsl", constructionPlasterGLSL);
    }
    const shader = Shader.find("Masonry/FarProxy") ?? Shader.create(farProxyShaderSource, ShaderLanguage.GLSLES300);
    material = new Material(engine, shader);
    material.shaderData.setFloat("material_WorldPickDepthCompare", CompareFunction.Less);
    if (inlinePick) material.shaderData.enableMacro("FAR_PROXY_INLINE_PICK");
    if (inlinePick) cache.inlinePick = material;
    else cache.standard = material;
  }
  return material;
}

export function computeGeometricNormals(positions: readonly number[], indices: readonly number[]): Float32Array {
  const vertexCount = positions.length / 3;
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i]! * 3;
    const ib = indices[i + 1]! * 3;
    const ic = indices[i + 2]! * 3;
    const abX = positions[ib]! - positions[ia]!;
    const abY = positions[ib + 1]! - positions[ia + 1]!;
    const abZ = positions[ib + 2]! - positions[ia + 2]!;
    const acX = positions[ic]! - positions[ia]!;
    const acY = positions[ic + 1]! - positions[ia + 1]!;
    const acZ = positions[ic + 2]! - positions[ia + 2]!;
    const nx = abY * acZ - abZ * acY;
    const ny = abZ * acX - abX * acZ;
    const nz = abX * acY - abY * acX;
    normals[ia]! += nx;
    normals[ia + 1]! += ny;
    normals[ia + 2]! += nz;
    normals[ib]! += nx;
    normals[ib + 1]! += ny;
    normals[ib + 2]! += nz;
    normals[ic]! += nx;
    normals[ic + 1]! += ny;
    normals[ic + 2]! += nz;
  }
  for (let v = 0; v < vertexCount; v++) {
    const o = v * 3;
    const nx = normals[o]!;
    const ny = normals[o + 1]!;
    const nz = normals[o + 2]!;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      normals[o] = nx / len;
      normals[o + 1] = ny / len;
      normals[o + 2] = nz / len;
    } else {
      normals[o] = 0;
      normals[o + 1] = 1;
      normals[o + 2] = 0;
    }
  }
  return normals;
}

export function previewPartSurfaceKind(part: ConstructionPreviewPart): number {
  if (part.plaster) return SURFACE_KIND_PLASTER;
  if (part.stonePaving) return SURFACE_KIND_STONE_PAVING;
  if (part.decoration) return SURFACE_KIND_DECORATION;
  if (part.material === "roof_tile") return SURFACE_KIND_ROOF_TILE;
  if (part.material === "wooden_plank") return SURFACE_KIND_WOODEN_PLANK;
  return SURFACE_KIND_WALL;
}

const BOX_FACE_NORMALS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
];
const BOX_INDICES = new Uint16Array([
  0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22,
  20, 22, 23
]);

export function buildAxisBoxGeometry(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number
): { positions: Float32Array; normals: Float32Array; indices: Uint16Array } {
  const x0 = maxX - minX < 1e-3 ? (minX + maxX) * 0.5 - 0.01 : minX;
  const x1 = maxX - minX < 1e-3 ? (minX + maxX) * 0.5 + 0.01 : maxX;
  const y0 = maxY - minY < 1e-3 ? (minY + maxY) * 0.5 - 0.01 : minY;
  const y1 = maxY - minY < 1e-3 ? (minY + maxY) * 0.5 + 0.01 : maxY;
  const z0 = maxZ - minZ < 1e-3 ? (minZ + maxZ) * 0.5 - 0.01 : minZ;
  const z1 = maxZ - minZ < 1e-3 ? (minZ + maxZ) * 0.5 + 0.01 : maxZ;

  const corners: readonly (readonly [number, number, number])[][] = [
    [
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x1, y0, z1]
    ], // +X
    [
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0],
      [x0, y0, z0]
    ], // -X
    [
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0]
    ], // +Y
    [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1]
    ], // -Y
    [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1]
    ], // +Z
    [
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z0]
    ] // -Z
  ];
  const positions = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  let v = 0;
  for (let f = 0; f < 6; f++) {
    const [nx, ny, nz] = BOX_FACE_NORMALS[f]!;
    const face = corners[f]!;
    for (let c = 0; c < 4; c++) {
      const p = face[c]!;
      positions[v] = p[0];
      positions[v + 1] = p[1];
      positions[v + 2] = p[2];
      normals[v] = nx;
      normals[v + 1] = ny;
      normals[v + 2] = nz;
      v += 3;
    }
  }
  return { positions, normals, indices: BOX_INDICES };
}

export function collapsePositionsToBox(rawPositions: readonly number[]): {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array;
} {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < rawPositions.length; i += 3) {
    const x = rawPositions[i]!;
    const y = rawPositions[i + 1]!;
    const z = rawPositions[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return buildAxisBoxGeometry(minX, minY, minZ, maxX, maxY, maxZ);
}

export function collapsePreviewPartToBox(part: ConstructionPreviewPart): ConstructionPreviewPart {
  const box = collapsePositionsToBox(part.positions);
  let avgR = 0,
    avgG = 0,
    avgB = 0,
    avgE = 0;
  const count = part.positions.length / 3;
  if (part.colors && count > 0) {
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      avgR += part.colors[o]!;
      avgG += part.colors[o + 1]!;
      avgB += part.colors[o + 2]!;
    }
    avgR /= count;
    avgG /= count;
    avgB /= count;
  }
  if (part.emission && count > 0) {
    for (let i = 0; i < count; i++) avgE += part.emission[i]!;
    avgE /= count;
  }
  let colors: number[] | undefined;
  if (part.colors) {
    colors = new Array<number>(24 * 3);
    for (let i = 0; i < 24; i++) {
      colors[i * 3] = avgR;
      colors[i * 3 + 1] = avgG;
      colors[i * 3 + 2] = avgB;
    }
  }
  const emission = part.emission ? new Array<number>(24).fill(avgE) : undefined;
  return {
    owner: part.owner,
    material: part.material,
    placement: part.placement,
    decoration: part.decoration,
    roofSpire: part.roofSpire,
    stonePaving: part.stonePaving,
    pickId: part.pickId,
    color: part.color,
    emissive: part.emissive,
    plaster: part.plaster,
    positions: box.positions as unknown as number[],
    normals: box.normals as unknown as number[],
    indices: box.indices as unknown as number[],
    uvs: [],
    colors,
    emission
  };
}

export function collapseDecorationToBoxes(dp: ConstructionDecorationPart): ConstructionDecorationPart[] {
  const count = dp.positions.length / 3;
  if (!count) return [];
  const buckets: Array<{
    emissive: boolean;
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
    sumR: number;
    sumG: number;
    sumB: number;
    sumE: number;
    n: number;
    tintedCount: number;
  }> = [
    {
      emissive: false,
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity,
      sumR: 0,
      sumG: 0,
      sumB: 0,
      sumE: 0,
      n: 0,
      tintedCount: 0
    },
    {
      emissive: true,
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity,
      sumR: 0,
      sumG: 0,
      sumB: 0,
      sumE: 0,
      n: 0,
      tintedCount: 0
    }
  ];
  for (let i = 0; i < count; i++) {
    const e = dp.emission[i] ?? 0;
    const b = buckets[e > 0 ? 1 : 0]!;
    const xyz = i * 3;
    const x = dp.positions[xyz]!;
    const y = dp.positions[xyz + 1]!;
    const z = dp.positions[xyz + 2]!;
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (z < b.minZ) b.minZ = z;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
    if (z > b.maxZ) b.maxZ = z;
    b.sumR += dp.colors[xyz]!;
    b.sumG += dp.colors[xyz + 1]!;
    b.sumB += dp.colors[xyz + 2]!;
    b.sumE += e;
    if (dp.tintMask?.[i] !== false) b.tintedCount++;
    b.n++;
  }
  const out: ConstructionDecorationPart[] = [];
  for (const b of buckets) {
    if (!b.n) continue;
    const box = buildAxisBoxGeometry(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
    const r = b.sumR / b.n;
    const g = b.sumG / b.n;
    const bl = b.sumB / b.n;
    const em = b.sumE / b.n;
    const colors = new Float32Array(24 * 3);
    for (let i = 0; i < 24; i++) {
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = bl;
    }
    const emission = new Float32Array(24).fill(em);
    const tinted = b.tintedCount * 2 >= b.n;
    const tintMask = dp.tintMask ? new Array<boolean>(24).fill(tinted) : undefined;
    const kinds = b.emissive ? new Array<number>(24).fill(DecorationMaterial.glass) : undefined;
    out.push({
      ...dp,
      positions: box.positions as unknown as number[],
      normals: box.normals as unknown as number[],
      indices: box.indices as unknown as number[],
      colors: colors as unknown as number[],
      emission: emission as unknown as number[],
      uvs: undefined,
      tintMask,
      appearance: kinds ? ({ kinds } as ConstructionDecorationPart["appearance"]) : undefined
    });
  }
  return out;
}

interface FarProxyPartColorSpan {
  vertexStart: number;
  count: number;
  role: "brick" | "roof_tile" | "wooden_plank" | "plaster" | "decoration";
  layer: number;
  isPlaster: boolean;
  brickOverriddenFallback?: readonly [number, number, number];
  fallback: readonly [number, number, number];
  vertexRgb?: Uint8Array;
}

interface FarProxyDecoColorSpan {
  vertexStart: number;
  count: number;
  tintRole?: NonNullable<ConstructionDecorationPart["tintRole"]>;
  maxTintLuminance: number;
  baseRgb: Uint8Array;
  tintedFlags?: Uint8Array;
}

export function buildCompactColorSpans(
  includedParts: readonly ConstructionPreviewPart[],
  includedDecorations: readonly ConstructionDecorationPart[],
  ownerById: ReadonlyMap<string, BuildingPaletteSlot>,
  appearance: ReturnType<typeof masonryAppearance>
): { partSpans: FarProxyPartColorSpan[]; decoSpans: FarProxyDecoColorSpan[] } {
  const defaultOwner: BuildingPaletteSlot = { seed: 0, wallColor: 0, roofColor: 0, woodColor: 0 };
  const partSpans: FarProxyPartColorSpan[] = [];
  const decoSpans: FarProxyDecoColorSpan[] = [];
  let vertexBase = 0;

  for (let pIdx = 0; pIdx < includedParts.length; pIdx++) {
    const p = includedParts[pIdx]!;
    const count = p.positions.length / 3;
    const owner = ownerById.get(p.owner) ?? defaultOwner;
    const isPlaster = !!p.plaster;
    const role: FarProxyPartColorSpan["role"] = isPlaster
      ? "plaster"
      : p.decoration
        ? "decoration"
        : p.material === "wall"
          ? "brick"
          : p.material;
    const layer =
      role === "roof_tile"
        ? owner.roofColor
        : role === "wooden_plank"
          ? owner.woodColor
          : constructionBrickLayer(owner.wallColor);
    const fallback = (
      isPlaster
        ? plasterLinearColor(p.color ?? [1, 1, 1])
        : p.decoration
          ? [1, 1, 1]
          : (p.color ?? [0.7, 0.7, 0.7]).map(srgbToLinear)
    ) as [number, number, number];
    let vertexRgb: Uint8Array | undefined;
    if (p.colors && !p.decoration) {
      vertexRgb = new Uint8Array(count * 3);
      for (let i = 0; i < count * 3; i++) {
        vertexRgb[i] = Math.round(Math.max(0, Math.min(1, p.colors[i]!)) * 255);
      }
    }
    partSpans.push({
      vertexStart: vertexBase,
      count,
      role,
      layer,
      isPlaster,
      fallback,
      vertexRgb
    });
    vertexBase += count;
  }

  for (let dIdx = 0; dIdx < includedDecorations.length; dIdx++) {
    const dp = includedDecorations[dIdx]!;
    const count = dp.positions.length / 3;
    const baseRgb = new Uint8Array(count * 3);
    let maxTintLuminance = 0;
    const tintRole = dp.tintRole;
    let tintedFlags: Uint8Array | undefined;
    if (tintRole !== undefined && dp.tintMask) {
      tintedFlags = new Uint8Array(count);
    }
    for (let i = 0; i < count; i++) {
      const xyz = i * 3;
      const r = dp.colors[xyz]!;
      const g = dp.colors[xyz + 1]!;
      const b = dp.colors[xyz + 2]!;
      baseRgb[xyz] = packU8Scaled(r, FAR_PROXY_RGB_SCALE);
      baseRgb[xyz + 1] = packU8Scaled(g, FAR_PROXY_RGB_SCALE);
      baseRgb[xyz + 2] = packU8Scaled(b, FAR_PROXY_RGB_SCALE);
      const masked = !dp.tintMask || dp.tintMask[i] !== false;
      if (tintedFlags) tintedFlags[i] = masked ? 1 : 0;
      if (tintRole !== undefined && masked) {
        const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
        if (lum > maxTintLuminance) maxTintLuminance = lum;
      }
    }
    decoSpans.push({ vertexStart: vertexBase, count, tintRole, maxTintLuminance, baseRgb, tintedFlags });
    vertexBase += count;
  }
  void appearance;
  return { partSpans, decoSpans };
}

export function writeCompactFarProxyColors(
  partSpans: readonly FarProxyPartColorSpan[],
  decoSpans: readonly FarProxyDecoColorSpan[],
  appearance: ReturnType<typeof masonryAppearance>,
  colorBytes: Uint8Array
): void {
  const brickOverridden = appearance.isOverridden("brick");
  const brickTint = brickOverridden ? appearance.linearColor("brick") : undefined;

  for (let s = 0; s < partSpans.length; s++) {
    const span = partSpans[s]!;
    let baseR: number, baseG: number, baseB: number;
    if (span.isPlaster || span.role === "plaster") {
      if (brickTint) {
        const lum = span.fallback[0] * 0.2126 + span.fallback[1] * 0.7152 + span.fallback[2] * 0.0722;
        baseR = lum * brickTint[0];
        baseG = lum * brickTint[1];
        baseB = lum * brickTint[2];
      } else {
        baseR = span.fallback[0];
        baseG = span.fallback[1];
        baseB = span.fallback[2];
      }
    } else if (span.role === "decoration") {
      baseR = baseG = baseB = 1;
    } else {
      const c = appearance.previewColor(span.role, span.layer, span.fallback);
      baseR = c[0]!;
      baseG = c[1]!;
      baseB = c[2]!;
    }
    const vStart = span.vertexStart;
    const count = span.count;
    const vRgb = span.vertexRgb;
    if (vRgb) {
      for (let i = 0; i < count; i++) {
        const xyz = i * 3;
        const dst = (vStart + i) * 4;
        colorBytes[dst] = packU8Scaled((vRgb[xyz]! / 255) * baseR, FAR_PROXY_RGB_SCALE);
        colorBytes[dst + 1] = packU8Scaled((vRgb[xyz + 1]! / 255) * baseG, FAR_PROXY_RGB_SCALE);
        colorBytes[dst + 2] = packU8Scaled((vRgb[xyz + 2]! / 255) * baseB, FAR_PROXY_RGB_SCALE);
      }
    } else {
      const r8 = packU8Scaled(baseR, FAR_PROXY_RGB_SCALE);
      const g8 = packU8Scaled(baseG, FAR_PROXY_RGB_SCALE);
      const b8 = packU8Scaled(baseB, FAR_PROXY_RGB_SCALE);
      for (let i = 0; i < count; i++) {
        const dst = (vStart + i) * 4;
        colorBytes[dst] = r8;
        colorBytes[dst + 1] = g8;
        colorBytes[dst + 2] = b8;
      }
    }
  }

  for (let s = 0; s < decoSpans.length; s++) {
    const span = decoSpans[s]!;
    const tintActive = span.tintRole !== undefined && appearance.isOverridden(span.tintRole);
    const tint = tintActive ? appearance.linearColor(span.tintRole!) : undefined;
    const vStart = span.vertexStart;
    const count = span.count;
    const baseRgb = span.baseRgb;
    const flags = span.tintedFlags;
    if (tint) {
      const invMax = span.maxTintLuminance > 0 ? 1 / span.maxTintLuminance : 1;
      for (let i = 0; i < count; i++) {
        const xyz = i * 3;
        const dst = (vStart + i) * 4;
        if (!flags || flags[i] !== 0) {
          const r = (baseRgb[xyz]! / 255) * FAR_PROXY_RGB_SCALE;
          const g = (baseRgb[xyz + 1]! / 255) * FAR_PROXY_RGB_SCALE;
          const b = (baseRgb[xyz + 2]! / 255) * FAR_PROXY_RGB_SCALE;
          const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
          const scale = lum * invMax;
          colorBytes[dst] = packU8Scaled(scale * tint[0], FAR_PROXY_RGB_SCALE);
          colorBytes[dst + 1] = packU8Scaled(scale * tint[1], FAR_PROXY_RGB_SCALE);
          colorBytes[dst + 2] = packU8Scaled(scale * tint[2], FAR_PROXY_RGB_SCALE);
        } else {
          colorBytes[dst] = baseRgb[xyz]!;
          colorBytes[dst + 1] = baseRgb[xyz + 1]!;
          colorBytes[dst + 2] = baseRgb[xyz + 2]!;
        }
      }
    } else {
      for (let i = 0; i < count; i++) {
        const xyz = i * 3;
        const dst = (vStart + i) * 4;
        colorBytes[dst] = baseRgb[xyz]!;
        colorBytes[dst + 1] = baseRgb[xyz + 1]!;
        colorBytes[dst + 2] = baseRgb[xyz + 2]!;
      }
    }
  }
}

export interface BuildingFarProxyHandle {
  readonly root: Entity;
  readonly renderer: MeshRenderer;
  readonly pickBatch: SeedWorldPickBatch;
  refreshColors(): void;
  setFade(fade: number): void;
  setLodDebugColor(r: number, g: number, b: number, a: number): void;
  destroy(): void;
}

/**
 * Builds one merged far-proxy mesh and renderer for LOD 2 display, sharing a
 * single global shader/material across all buildings with zero texture binds.
 */
export function createBuildingFarProxy(
  engine: Engine,
  parent: Entity,
  parts: readonly ConstructionPreviewPart[],
  colorOwners: readonly ({ id: string } & BuildingPaletteSlot)[],
  appearance: ReturnType<typeof masonryAppearance>,
  decorationParts: readonly ConstructionDecorationPart[] = []
): BuildingFarProxyHandle | undefined {
  const includedParts: ConstructionPreviewPart[] = [];
  const includedDecorations: ConstructionDecorationPart[] = [];
  let totalVertices = 0;
  let totalIndices = 0;

  let hasPlaster = false;
  for (let i = 0; i < parts.length; i++) {
    const rawPart = parts[i]!;
    if (!rawPart.indices.length || !rawPart.positions.length) continue;
    if (rawPart.plaster) {
      if (rawPart.plaster.wear >= 1) continue;
      hasPlaster = true;
    }
    const p =
      rawPart.decoration && !rawPart.roofSpire && rawPart.indices.length > 72
        ? collapsePreviewPartToBox(rawPart)
        : rawPart;
    includedParts.push(p);
    totalVertices += p.positions.length / 3;
    totalIndices += p.indices.length;
  }
  for (let i = 0; i < decorationParts.length; i++) {
    const rawDp = decorationParts[i]!;
    if (!rawDp.indices.length || !rawDp.positions.length) continue;
    if (rawDp.indices.length > 72) {
      for (const boxDp of collapseDecorationToBoxes(rawDp)) {
        includedDecorations.push(boxDp);
        totalVertices += boxDp.positions.length / 3;
        totalIndices += boxDp.indices.length;
      }
    } else {
      includedDecorations.push(rawDp);
      totalVertices += rawDp.positions.length / 3;
      totalIndices += rawDp.indices.length;
    }
  }
  if (totalVertices === 0 || totalIndices === 0) return undefined;

  const ownerById = new Map(colorOwners.map((owner) => [owner.id, owner] as const));

  const pickIds: string[] = [];
  const pickIndexById = new Map<string, number>();
  const useUInt32 = totalVertices > 0xffff;
  const indices = useUInt32 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

  let minX = Number.POSITIVE_INFINITY,
    minY = Number.POSITIVE_INFINITY,
    minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY,
    maxY = Number.NEGATIVE_INFINITY,
    maxZ = Number.NEGATIVE_INFINITY;

  // Compact split mode: 32B static non-readable geom + 4B color buffer + inline NORMAL.w pick index (<=128 parts)
  const geomBytes = new Uint8Array(totalVertices * COMPACT_GEOM_STRIDE_BYTES);
  const geomF32 = new Float32Array(geomBytes.buffer);
  const geomI8 = new Int8Array(geomBytes.buffer);
  const geomU16 = new Uint16Array(geomBytes.buffer);
  const colorBytes = new Uint8Array(totalVertices * 4);
  const vertexPickIdsTemp = new Float32Array(totalVertices);

  let vertexBase = 0;
  let indexOffset = 0;

  const appendCompact = (
    pickId: string,
    positions: readonly number[],
    sourceNormals: readonly number[] | undefined,
    partIndices: readonly number[],
    normalBias: number,
    uvs: PackedUv2 | undefined,
    readEmission: (index: number) => number,
    readSurfaceTag: (index: number) => readonly [number, number, number, number]
  ) => {
    const count = positions.length / 3;
    let pickIndex = pickIndexById.get(pickId);
    if (pickIndex === undefined) {
      pickIndex = pickIds.length;
      pickIds.push(pickId);
      pickIndexById.set(pickId, pickIndex);
    }
    const pickByte = pickIndex <= 127 ? pickIndex : 0;
    vertexPickIdsTemp.fill(pickIndex, vertexBase, vertexBase + count);
    const normals =
      sourceNormals?.length === positions.length ? sourceNormals : computeGeometricNormals(positions, partIndices);
    for (let i = 0; i < count; i++) {
      const xyz = i * 3;
      const vIdx = vertexBase + i;
      const fBase = vIdx * COMPACT_GEOM_F32_STRIDE;
      const bBase = vIdx * COMPACT_GEOM_STRIDE_BYTES;
      const uBase = vIdx * COMPACT_GEOM_U16_STRIDE;
      const cBase = vIdx * 4;
      const nx = normals[xyz]!;
      const ny = normals[xyz + 1]!;
      const nz = normals[xyz + 2]!;
      const px = positions[xyz]! + nx * normalBias;
      const py = positions[xyz + 1]! + ny * normalBias;
      const pz = positions[xyz + 2]! + nz * normalBias;
      geomF32[fBase] = px;
      geomF32[fBase + 1] = py;
      geomF32[fBase + 2] = pz;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (pz < minZ) minZ = pz;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
      if (pz > maxZ) maxZ = pz;

      geomI8[bBase + 12] = packSignedByte(nx);
      geomI8[bBase + 13] = packSignedByte(ny);
      geomI8[bBase + 14] = packSignedByte(nz);
      geomI8[bBase + 15] = pickByte;
      geomF32[fBase + 4] = uvU(uvs, i, 0);
      geomF32[fBase + 5] = uvV(uvs, i, 0);
      const [tagX, tagY, tagZ, tagW] = readSurfaceTag(i);
      geomU16[uBase + 12] = Math.round(Math.max(0, Math.min(255, tagX))) * 257;
      geomU16[uBase + 13] = packU16Scaled(tagY, 1);
      geomU16[uBase + 14] = packU16Scaled(tagZ, FAR_PROXY_WALL_LENGTH_SCALE);
      geomU16[uBase + 15] = packU16Scaled(tagW, 1);
      colorBytes[cBase + 3] = packU8Scaled(readEmission(i), FAR_PROXY_EMISSION_SCALE);
    }
    for (let k = 0; k < partIndices.length; k++) {
      indices[indexOffset + k] = vertexBase + partIndices[k]!;
    }
    vertexBase += count;
    indexOffset += partIndices.length;
  };

  for (let pIdx = 0; pIdx < includedParts.length; pIdx++) {
    const p = includedParts[pIdx]!;
    const normalBias = p.plaster ? PLASTER_NORMAL_BIAS_METRES : p.stonePaving ? STONE_PAVING_NORMAL_BIAS_METRES : 0;
    const kind = previewPartSurfaceKind(p);
    const plaster = p.plaster;
    const isUnit = p.placement === "unit" ? 1 : 0;
    appendCompact(
      p.pickId === undefined ? buildingGroupKey(p.owner) : buildingPartKey(p.pickId),
      p.positions,
      p.normals,
      p.indices,
      normalBias,
      p.uvs,
      (i) => (p.emission ? p.emission[i]! : (p.emissive ?? 0)),
      (i) => (plaster ? [kind, plaster.wear, plaster.wallLength, plaster.edgeDistances[i] ?? 1] : [kind, 0, isUnit, 0])
    );
  }
  for (let dIdx = 0; dIdx < includedDecorations.length; dIdx++) {
    const dp = includedDecorations[dIdx]!;
    const uvs = dp.uvs ?? dp.appearance?.materialUVs;
    const appKinds = dp.appearance?.kinds;
    appendCompact(
      dp.decorationId === undefined ? buildingGroupKey(dp.ownerId) : buildingPartKey(dp.decorationId),
      dp.positions,
      dp.normals,
      dp.indices,
      0,
      uvs,
      (i) => dp.emission[i] ?? 0,
      (i) => {
        const appKind = appKinds?.[i];
        const surfaceKind =
          appKind === DecorationMaterial.glass || appKind === DecorationMaterial.texturedGlass
            ? SURFACE_KIND_DECORATION_GLASS
            : SURFACE_KIND_DECORATION;
        return [surfaceKind, 0, 0, 0];
      }
    );
  }

  const { partSpans, decoSpans } = buildCompactColorSpans(includedParts, includedDecorations, ownerById, appearance);
  writeCompactFarProxyColors(partSpans, decoSpans, appearance, colorBytes);

  const inlinePick = pickIds.length <= 128;
  const geomBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, geomBytes, BufferUsage.Static, false);
  const colorBuffer = restoreBuffer(
    new Buffer(engine, BufferBindFlag.VertexBuffer, colorBytes, BufferUsage.Static, false),
    colorBytes
  );
  const pickBuffer = inlinePick
    ? undefined
    : restoreBuffer(
        new Buffer(engine, BufferBindFlag.VertexBuffer, vertexPickIdsTemp, BufferUsage.Static, false),
        vertexPickIdsTemp
      );
  const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static, false);
  const mesh = new BufferMesh(engine, "MasonryFarProxyMesh");
  mesh.setVertexBufferBinding(geomBuffer, COMPACT_GEOM_STRIDE_BYTES, 0);
  mesh.setVertexBufferBinding(colorBuffer, 4, 1);
  if (pickBuffer) mesh.setVertexBufferBinding(pickBuffer, Float32Array.BYTES_PER_ELEMENT, 2);
  mesh.setVertexElements(inlinePick ? COMPACT_ELEMENTS_INLINE_PICK : COMPACT_ELEMENTS_WITH_PICK_BUF);
  mesh.setIndexBufferBinding(new IndexBufferBinding(indexBuffer, useUInt32 ? IndexFormat.UInt32 : IndexFormat.UInt16));
  mesh.addSubMesh(0, totalIndices, MeshTopology.Triangles);
  mesh.bounds = new BoundingBox(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ));

  const root = parent.createChild("Far proxy surfaces");
  root.isActive = false;
  const renderer = root.addComponent(MeshRenderer);
  renderer.mesh = mesh;
  renderer.setMaterial(getSharedFarProxyMaterial(engine, inlinePick));
  renderer.enableVertexColor = true;
  renderer.priority = hasPlaster ? -98 : -105;
  renderer.castShadows = false;
  renderer.receiveShadows = true;
  if (hasPlaster) renderer.shaderData?.enableMacro?.(MACRO_FAR_PLASTER);
  renderer.shaderData.setFloat(PROP_FAR_LOD_FADE, 1);
  const debugColor = new Vector4(0, 0, 0, 0);
  renderer.shaderData.setVector4(PROP_FAR_LOD_DEBUG_COLOR, debugColor);
  let ditherEnabled = false;

  return {
    root,
    renderer,
    pickBatch: { renderer, count: pickIds.length, resolve: (index) => pickIds[index] },
    refreshColors() {
      writeCompactFarProxyColors(partSpans, decoSpans, appearance, colorBytes);
      colorBuffer.setData(colorBytes);
    },
    setFade(fade: number) {
      const needDither = fade < 0.999;
      if (needDither !== ditherEnabled) {
        ditherEnabled = needDither;
        if (needDither) renderer.shaderData?.enableMacro?.(MACRO_FAR_DITHER);
        else renderer.shaderData?.disableMacro?.(MACRO_FAR_DITHER);
      }
      renderer.shaderData.setFloat(PROP_FAR_LOD_FADE, fade);
    },
    setLodDebugColor(r: number, g: number, b: number, a: number) {
      debugColor.set(r, g, b, a);
      renderer.shaderData.setVector4(PROP_FAR_LOD_DEBUG_COLOR, debugColor);
    },
    destroy() {
      const release = () => {
        mesh.destroy();
        geomBuffer.destroy(true);
        colorBuffer.destroy(true);
        pickBuffer?.destroy(true);
        indexBuffer.destroy(true);
      };
      if (!root.destroyed) root.destroy();
      if (root.pendingDestroy) queueMicrotask(release);
      else release();
    }
  };
}
