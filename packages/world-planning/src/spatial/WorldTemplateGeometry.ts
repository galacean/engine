import type { WorldTemplate } from "./WorldTemplateCatalog";
import { WORLD_TEMPLATE_ART } from "./WorldTemplateArtDirection";
import { spatialCompositionParameters, type SpatialCompositionParameters } from "./SpatialCompositionParameters";
import { compositionPoint } from "./SpatialCompositionGeometry";

type Vec3 = [number, number, number];
export interface TemplateNode {
  id: string;
  label?: string;
  /** Supplied model fitted to this node's authored envelope. */
  assetUrl?: string;
  /** Stretch the asset along each axis to match the authored envelope. */
  stretchToEnvelope?: boolean;
  /** Planting plane in the imported model's metre coordinates; defaults to its lowest point. */
  assetGroundY?: number;
  /** Model-only heading around its authored root; placement and camera envelope stay fixed. */
  assetYawDegrees?: number;
  /** Source material slots whose authored normals use the shared foliage lighting contract. */
  assetLeafMaterials?: readonly string[];
  /** Optional sRGB leaf tint for the supplied model; its bark and textures retain their authored values. */
  assetLeafColor?: string;
  /** Linear intensity of the leaf pigment, including values above one. */
  assetLeafIntensity?: number;
  /** Native foliage texture overlay weight; zero uses the atlas for coverage only. */
  assetLeafTextureBlend?: number;
  /** Local emission lighting. Offset uses envelope fractions relative to its centre. */
  light?: { offset: Vec3; color: string; intensity: number; rangeM: number };
  /** Source material presentation overrides shared by every instance. */
  assetMaterials?: Readonly<
    Record<
      string,
      {
        color?: string;
        /** Linear RGB intensity multiplier; source alpha and textures stay intact. */
        intensity?: number;
        emission?: { color: string; intensity: number };
        /** A dyed, diffusely transmitting surface; source textures remain untouched. */
        translucent?: {
          shade: string;
          highlight: string;
          textureExposure: number;
          transmission: number;
          roughness: number;
          clearCoat: number;
          clearCoatRoughness: number;
        };
      }
    >
  >;
  /** Solid ground clearance in metres, independent of an overhanging crown's visual envelope. */
  footprint?: [number, number];
  /** Terrain sampling area for the planting plane, including shallow spreading roots. */
  groundingFootprint?: [number, number];
  position: Vec3;
  scale: Vec3;
  rotation: Vec3;
  grounded: boolean;
}
export interface TemplateGeometry {
  nodes: TemplateNode[];
  radius: number;
  height: number;
  targetHeight: number;
  focusIds: string[];
}
export type TemplateAssetSlot = Omit<TemplateNode, "position" | "rotation">;

/** Uniform containment keeps the source XZ origin and grounds its planting plane.
 * The envelope is centred in XZ, so an off-centre crown must fit on both sides. */
function templateAssetOccupiedSize(
  size: readonly number[],
  bounds: { min: readonly number[]; max: readonly number[] },
  groundY: number
): Vec3 {
  const dimensions = bounds.max.map((value, axis) => value - bounds.min[axis]);
  if (
    size.length !== 3 ||
    bounds.min.length !== 3 ||
    bounds.max.length !== 3 ||
    ![...size, ...dimensions].every((value) => Number.isFinite(value) && value > 0) ||
    ![...bounds.min, ...bounds.max, groundY].every(Number.isFinite) ||
    groundY < bounds.min[1] ||
    groundY >= bounds.max[1]
  )
    throw new Error("Invalid template asset bounds");
  return [
    Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])) * 2,
    bounds.max[1] - groundY,
    Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2])) * 2
  ];
}

export function fitTemplateAsset(
  size: readonly number[],
  bounds: { min: readonly number[]; max: readonly number[] },
  groundY = bounds.min[1]
): { scale: number; offset: Vec3 } {
  const occupied = templateAssetOccupiedSize(size, bounds, groundY);
  const scale = Math.min(size[0] / occupied[0], size[1] / occupied[1], size[2] / occupied[2]);
  return { scale, offset: [0, -size[1] / 2 - groundY * scale, 0] };
}

/** Fit a reusable mesh to an envelope while keeping its origin and planting plane. */
export function stretchTemplateAsset(
  size: Vec3,
  bounds: { min: Vec3; max: Vec3 },
  groundY = bounds.min[1]
): { scale: Vec3; offset: Vec3 } {
  const occupied = templateAssetOccupiedSize(size, bounds, groundY);
  const scale: Vec3 = [size[0] / occupied[0], size[1] / occupied[1], size[2] / occupied[2]];
  return { scale, offset: [0, -size[1] / 2 - groundY * scale[1], 0] };
}

/** Reference assets share the same authored layout envelopes as missing models.
 * Unavailable assets occupy one plain white box each.
 * Effects have no substitute renderer until their corresponding assets exist. */
export function buildWorldTemplateGeometry(
  template: WorldTemplate,
  _seed: number,
  parameters?: Partial<SpatialCompositionParameters>
): TemplateGeometry {
  const art = WORLD_TEMPLATE_ART[template.id];
  if (!art) throw new Error("风格缺少对应的参考图配方：" + template.id);
  // Reference layout uses screen-right +X and depth +Z. A native camera looking
  // into +Z has world-right -X; convert the layout frame once at this boundary.
  let nodes: TemplateNode[];
  if ((art.generation || parameters?.enabled) && art.modelLayout !== "authored") {
    const q = spatialCompositionParameters(parameters ?? art.generation),
      frame = { ...q, centerX: 0, centerZ: 0 };
    const primary = art.models.filter((slot) => art.focus.includes(slot.id));
    const axis = q.primaryPattern === "depth" ? 2 : 0;
    const extent = primary.reduce((sum, slot) => sum + slot.scale[axis], 0) + (primary.length - 1) * q.subjectSpacingM;
    let cursor = -extent / 2,
      secondary = 0;
    const primaryRadius = Math.max(...primary.map((slot) => Math.hypot(slot.scale[0], slot.scale[2]) / 2));
    nodes = art.models.map((slot) => {
      let x = 0,
        z = 0;
      if (art.focus.includes(slot.id)) {
        const offset = cursor + slot.scale[axis] / 2;
        if (axis === 0) x = offset;
        else z = offset;
        cursor += slot.scale[axis] + q.subjectSpacingM;
      } else {
        const ordinal = secondary++,
          rank = q.subjectSide === "both" ? Math.floor(ordinal / 2) : ordinal;
        const side = q.subjectSide === "left" || (q.subjectSide === "both" && ordinal % 2 === 0) ? -1 : 1;
        const angle = (q.subjectArcDegrees * Math.PI) / 180;
        const radius = primaryRadius + (rank + 1) * (q.subjectSpacingM + Math.hypot(slot.scale[0], slot.scale[2]) / 2);
        x = side * radius * Math.cos(angle);
        z = radius * Math.sin(angle);
      }
      const p = compositionPoint(frame, x, z);
      return {
        ...structuredClone(slot),
        position: [p.x, slot.grounded ? 0 : q.floatingHeightM, p.z] as Vec3,
        rotation: [0, q.headingDegrees, 0] as Vec3
      };
    });
  } else {
    nodes = art.models.map((node) => {
      if (!("position" in node)) throw new Error("模板资产缺少布局生成参数：" + node.id);
      return {
        ...structuredClone(node),
        position: [0 - node.position[0], node.position[1], node.position[2]] as Vec3,
        rotation: [node.rotation[0], 0 - node.rotation[1], node.rotation[2]] as Vec3
      };
    });
  }
  const radius = Math.max(
    0,
    ...nodes.flatMap((node) => templateNodeFootprint(node, true).flatMap((p) => [Math.abs(p.x), Math.abs(p.z)]))
  );
  const height = nodes.length
    ? Math.max(...nodes.map((node) => node.position[1] + node.scale[1] * (node.grounded ? 1 : 0.5)))
    : 0;
  return { nodes, radius, height, targetHeight: height / 2, focusIds: [...art.focus] };
}

/** Exact rotated asset footprint, shared by reservation, placement and verification. */
export function templateNodeFootprint(node: TemplateNode, visualEnvelope = false) {
  const angle = (node.rotation[1] * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ].map(([sx, sz]) => {
    const size = !visualEnvelope && node.footprint ? node.footprint : [node.scale[0], node.scale[2]];
    const x = (sx * size[0]) / 2,
      z = (sz * size[1]) / 2;
    return { x: node.position[0] + x * c - z * s, z: node.position[2] + x * s + z * c };
  });
}
