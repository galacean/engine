// What a building's preview is made of: the surfaces it draws and picks, the palettes they are
// coloured from, and the whole preview the distance view takes. The core renderer produces it.
import type { ConstructionSurfaceRegion } from "./ConstructionSurfaceFrame";
import type { ConstructionLodAppearance } from "./ConstructionLodAppearance";
import type { StonePavingPlacement } from "./StonePavingPlacement";
import type { MaterialUnit } from "./UnitPlacementStyle";
import type {
  ConstructionDecorationAppearance,
  ConstructionDecorationPart,
  ConstructionDecorationStone
} from "./ConstructionDecorations";
import type { RetainedWallUnits } from "./ConstructionWallLod";
import type { UnitPlacementBinding as MasonryBinding } from "./UnitPlacement";
import type { SupportCell } from "./PlacementSupport";
import type { ConstructionDecorationFrame } from "./ConstructionDecorationFrames";
import type { ConstructionWoodArchPart, ConstructionWoodArchPillar } from "./ConstructionWoodArchRender";

export interface ConstructionPlasterMetadata {
  wear: number;
  color: number;
  wallLength: number;
  /** Distance to the effective support union boundary at each skin vertex. */
  edgeDistances: number[];
}
/** Published support geometry, independent of render materials and paint partitions. */
export interface ConstructionSurfacePart {
  owner: string;
  positions: number[];
  indices: number[];
  /** Effective polygons in their original clipping charts. Render-only meshes omit these. */
  regions?: ConstructionSurfaceRegion[];
}
export interface ConstructionPreviewPart extends ConstructionSurfacePart {
  /** A retained material unit must never receive a second placement grid. */
  placement?: "unit";
  /** False for coarse-only surfaces whose detail already consists of complete solid units. */
  backing?: false;
  lodAppearance?: ConstructionLodAppearance;
  plaster?: ConstructionPlasterMetadata;
  stonePaving?: StonePavingPlacement;
  /** Resident backing clearance behind this coarse facade. */
  supportInset?: number;
  material: MaterialUnit | "wall";
  uvs: number[][];
  bindingId?: string;
  /** Scene attachment identity, independent of the host used for lighting. */
  pickId?: string;
  geometryId?: string;
  color?: number[];
  emissive?: number;
  decoration?: boolean;
  /** Original finial shares this geometry with the resident decoration batch. */
  roofSpire?: boolean;
  appearance?: ConstructionDecorationAppearance;
  colors?: number[];
  neutralColors?: number[];
  tintRoles?: number[];
  normals?: number[];
  emission?: number[];
  junction?: boolean;
  /** Attachment roof surface; resident draws own the settled roof units. */
  dormer?: boolean;
}
export const wallPalette = [
  [0.772549, 0.631373, 0.458824],
  [0.72549, 0.623529, 0.4],
  [0.352941, 0.333333, 0.270588],
  [0.596078, 0.572549, 0.458824],
  [0.458824, 0.431373, 0.352941]
];
export const roofPalette = [
  [0.588235, 0.411765, 0.258824],
  [0.372549, 0.337255, 0.231373],
  [0.294118, 0.4, 0.45098],
  [0.352941, 0.517647, 0.427451],
  [0.239216, 0.32549, 0.207843],
  [0.345098, 0.32549, 0.278431],
  [0.376471, 0.458824, 0.286275],
  [0.470588, 0.458824, 0.4],
  [0.462745, 0.411765, 0.231373],
  [0.32549, 0.447059, 0.45098],
  [0.4, 0.396078, 0.470588],
  [0.458824, 0.294118, 0.180392],
  [0.239216, 0.286275, 0.278431]
];
export const woodPalette = [
  [0.513725, 0.466667, 0.317647],
  [0.352941, 0.317647, 0.207843],
  [0.32549, 0.427451, 0.458824],
  [0.470588, 0.317647, 0.239216],
  [0.709804, 0.67451, 0.533333],
  [0.270588, 0.352941, 0.258824],
  [0.384314, 0.458824, 0.376471],
  [0.286275, 0.286275, 0.239216],
  [0.32549, 0.309804, 0.384314],
  [0.596078, 0.415686, 0.396078],
  [0.592157, 0.513725, 0.219608]
];
/** Original brick fragment shader color IDs select layers, not modulo palette size.
 * Palette averages remain a distance approximation of the original texture. */
export function constructionBrickColor(id: number) {
  const layer = constructionBrickLayer(id);
  return wallPalette[layer].map((c) => {
    if (id !== 1 && id !== 5) return c;
    const linear = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const powered = linear ** 1.1;
    return powered <= 0.0031308 ? powered * 12.92 : 1.055 * powered ** (1 / 2.4) - 0.055;
  });
}
export function constructionBrickLayer(id: number) {
  return [0, 1, 2, 3, 0, 1, 3, 2, 3, 3, 0, 4, 0][id] ?? 0;
}
/** Units drawn at a junction or an arch, with the owner that colours, picks and edits them. */
export interface ConstructionJunctionGroup {
  decorationId?: string;
  ownerId: string;
  binding: MasonryBinding;
  slot: number;
  role: "wall_junction" | "roof_junction" | "wall_arch";
  sourceUnit: "brick" | "wooden_plank";
  sourceDrawId: string;
  cells: SupportCell[];
  records: Uint8Array[];
}
/** A building's preview: what the distance view draws and picks. */
export interface ConstructionPreview {
  parts: ConstructionPreviewPart[];
  decorationParts: ConstructionDecorationPart[];
  retainedWallUnits: RetainedWallUnits[];
  archGroups: ConstructionJunctionGroup[];
  bounds: { min: number[]; max: number[] };
  stones: ConstructionDecorationStone[];
  frames: ConstructionDecorationFrame[];
  woodArchFrames: ConstructionWoodArchPart[];
  woodArchPillars: ConstructionWoodArchPillar[];
  structuralParts?: ConstructionSurfacePart[];
}

export type PackedUv2 = readonly (readonly number[])[] | Float32Array;

export function uvCount(uvs: PackedUv2 | undefined): number {
  if (!uvs) return 0;
  return uvs instanceof Float32Array ? uvs.length / 2 : uvs.length;
}

export function uvU(uvs: PackedUv2 | undefined, index: number, fallback = 0): number {
  if (!uvs) return fallback;
  if (uvs instanceof Float32Array) {
    const off = index * 2;
    return off < uvs.length ? uvs[off]! : fallback;
  }
  return uvs[index]?.[0] ?? fallback;
}

export function uvV(uvs: PackedUv2 | undefined, index: number, fallback = 0): number {
  if (!uvs) return fallback;
  if (uvs instanceof Float32Array) {
    const off = index * 2 + 1;
    return off < uvs.length ? uvs[off]! : fallback;
  }
  return uvs[index]?.[1] ?? fallback;
}

export function areUvsFinite(uvs: PackedUv2): boolean {
  if (uvs instanceof Float32Array) {
    for (let i = 0; i < uvs.length; i++) if (!Number.isFinite(uvs[i])) return false;
    return true;
  }
  return uvs.every((v) => v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]));
}

function toFloat32(values: ArrayLike<number>): Float32Array {
  return values instanceof Float32Array ? values : Float32Array.from(values);
}

function toIndexArray(values: ArrayLike<number>, vertexCount: number): Uint16Array | Uint32Array {
  if (values instanceof Uint16Array || values instanceof Uint32Array) return values;
  return vertexCount <= 65535 ? Uint16Array.from(values) : Uint32Array.from(values);
}

function toFlatUv32(uvs: PackedUv2): Float32Array {
  if (uvs instanceof Float32Array) return uvs;
  const out = new Float32Array(uvs.length * 2);
  for (let i = 0; i < uvs.length; i++) {
    const pair = uvs[i];
    if (pair) {
      out[i * 2] = pair[0] ?? 0;
      out[i * 2 + 1] = pair[1] ?? 0;
    }
  }
  return out;
}

function packAppearance(
  appearance: import("./ConstructionDecorations").ConstructionDecorationAppearance | undefined
): void {
  if (!appearance) return;
  appearance.materialUVs = toFlatUv32(appearance.materialUVs as unknown as PackedUv2) as unknown as number[][];
  appearance.kinds = (appearance.kinds instanceof Uint8Array
    ? appearance.kinds
    : Uint8Array.from(appearance.kinds)) as unknown as number[];
  appearance.colorIds = (appearance.colorIds instanceof Int16Array
    ? appearance.colorIds
    : Int16Array.from(appearance.colorIds)) as unknown as number[];
  appearance.centers = toFloat32(appearance.centers) as unknown as number[];
}

/** Pack numeric/tuple arrays in a ConstructionDecorationPart into TypedArrays for Worker transfer and retention. */
export function packDecorationPart(d: ConstructionDecorationPart): void {
  const vCount = d.positions.length / 3;
  d.positions = toFloat32(d.positions) as unknown as number[];
  d.normals = toFloat32(d.normals) as unknown as number[];
  d.colors = toFloat32(d.colors) as unknown as number[];
  d.emission = toFloat32(d.emission) as unknown as number[];
  d.indices = toIndexArray(d.indices, vCount) as unknown as number[];
  if (d.uvs) d.uvs = toFlatUv32(d.uvs as unknown as PackedUv2) as unknown as number[][];
  packAppearance(d.appearance);
}

/** Convert boxed JS numeric/tuple arrays in a ConstructionPreview into compact TypedArrays
 * before sending across Worker boundaries or retaining on the Main Thread. */
export function packConstructionPreview(preview: ConstructionPreview): void {
  for (const p of preview.parts) {
    const vCount = p.positions.length / 3;
    p.positions = toFloat32(p.positions) as unknown as number[];
    p.indices = toIndexArray(p.indices, vCount) as unknown as number[];
    if (p.normals) p.normals = toFloat32(p.normals) as unknown as number[];
    if (p.colors) p.colors = toFloat32(p.colors) as unknown as number[];
    if (p.neutralColors) p.neutralColors = toFloat32(p.neutralColors) as unknown as number[];
    if (p.tintRoles) {
      p.tintRoles = (p.tintRoles instanceof Int8Array
        ? p.tintRoles
        : Int8Array.from(p.tintRoles)) as unknown as number[];
    }
    if (p.emission) p.emission = toFloat32(p.emission) as unknown as number[];
    if (p.uvs) p.uvs = toFlatUv32(p.uvs as unknown as PackedUv2) as unknown as number[][];
    if (p.plaster?.edgeDistances) {
      p.plaster.edgeDistances = toFloat32(p.plaster.edgeDistances) as unknown as number[];
    }
    packAppearance(p.appearance);
  }
  for (const d of preview.decorationParts) {
    packDecorationPart(d);
  }
  if (preview.structuralParts) {
    for (const s of preview.structuralParts) {
      const vCount = s.positions.length / 3;
      s.positions = toFloat32(s.positions) as unknown as number[];
      s.indices = toIndexArray(s.indices, vCount) as unknown as number[];
    }
  }
}
