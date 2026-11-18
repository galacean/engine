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
