import type { WorldTemplate } from "./WorldTemplateCatalog";
import { WORLD_TEMPLATE_ART } from "./WorldTemplateArtDirection";

type Vec3 = [number, number, number];
export interface TemplateNode {
  id: string;
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

/** Unavailable reference assets occupy one plain white box each. These are
 * authored layout envelopes, never a geometric imitation of the missing model.
 * Effects have no substitute renderer until their corresponding assets exist. */
export function buildWorldTemplateGeometry(template: WorldTemplate, _seed: number): TemplateGeometry {
  const art = WORLD_TEMPLATE_ART[template.id];
  if (!art) throw new Error("风格缺少对应的参考图配方：" + template.id);
  // Reference layout uses screen-right +X and depth +Z. A native camera looking
  // into +Z has world-right -X; convert the layout frame once at this boundary.
  const nodes = art.models.map((node) => ({
    ...structuredClone(node),
    position: [0 - node.position[0], node.position[1], node.position[2]] as Vec3,
    rotation: [node.rotation[0], 0 - node.rotation[1], node.rotation[2]] as Vec3
  }));
  const radius = Math.max(
    ...nodes.flatMap((node) => templateNodeFootprint(node).flatMap((p) => [Math.abs(p.x), Math.abs(p.z)]))
  );
  const height = Math.max(...nodes.map((node) => node.position[1] + node.scale[1] * (node.grounded ? 1 : 0.5)));
  return { nodes, radius, height, targetHeight: height / 2, focusIds: [...art.focus] };
}

/** Exact rotated asset footprint, shared by reservation, placement and verification. */
export function templateNodeFootprint(node: TemplateNode) {
  const angle = (node.rotation[1] * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ].map(([sx, sz]) => {
    const x = (sx * node.scale[0]) / 2,
      z = (sz * node.scale[2]) / 2;
    return { x: node.position[0] + x * c - z * s, z: node.position[2] + x * s + z * c };
  });
}
