import type { IslandPlan } from "../semantic-study/IslandPlanModel";
import { buildWorldTemplateGeometry, templateNodeFootprint, type TemplateNode } from "./WorldTemplateGeometry";
import { worldTemplate } from "./WorldTemplateCatalog";
import { WORLD_TEMPLATE_ART } from "./WorldTemplateArtDirection";
import type { SubjectViewPose } from "./PlanningSubjectView";
import type {
  LandscapeBounds,
  LandscapeFocus,
  LandscapeView
} from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import profile from "../planning-data/settlement-profile.json";

type Position = [number, number, number];
export interface ResolvedTemplateNode {
  node: TemplateNode;
  position: Position;
  bounds: LandscapeBounds;
}
export interface ResolvedWorldTemplateScene {
  id: string;
  anchor: Position;
  geometry: ReturnType<typeof buildWorldTemplateGeometry>;
  nodes: ResolvedTemplateNode[];
  focusBounds: LandscapeBounds;
  world: { width: number; depth: number; spacingX: number; spacingZ: number };
}

/** One grounded scene description for rendering, first-person framing and vegetation visibility. */
export function resolveWorldTemplateScene(
  plan: IslandPlan,
  ground: (x: number, z: number) => number | undefined
): ResolvedWorldTemplateScene | undefined {
  const template = worldTemplate(plan.parameters.worldTemplate?.id);
  if (!template) return undefined;
  const site = plan.worldTemplateSite;
  if (!site || site.templateId !== template.id) throw new Error("风格主体缺少已发布的规划占地");
  const sample = (x: number, z: number) => {
    const value = ground(x, z);
    if (value === undefined || !Number.isFinite(value)) throw new Error("风格主体占地缺少有效地面");
    return value;
  };
  const anchor: Position = [site.center.x, sample(site.center.x, site.center.z), site.center.z];
  const geometry = buildWorldTemplateGeometry(template, plan.parameters.seed, plan.parameters.spatialComposition);
  const resolution = plan.raster?.heightSamples ?? profile.world.heightmapResolution;
  const spacingX = plan.parameters.width / (resolution - 1);
  const spacingZ = plan.parameters.depth / (resolution - 1);
  const nodes = geometry.nodes.map((node) => {
    const [x, y, z] = node.position,
      [width, height, depth] = node.scale;
    const corners = templateNodeFootprint(node).map((p) => ({ x: anchor[0] + p.x, z: anchor[2] + p.z }));
    let bottom = anchor[1] + y - height / 2;
    if (node.grounded) {
      const columns = Math.ceil(width / spacingX),
        rows = Math.ceil(depth / spacingZ);
      const angle = (node.rotation[1] * Math.PI) / 180,
        c = Math.cos(angle),
        s = Math.sin(angle);
      bottom = Infinity;
      for (let row = 0; row <= rows; row++)
        for (let column = 0; column <= columns; column++) {
          const dx = (column / columns - 0.5) * width,
            dz = (row / rows - 0.5) * depth;
          bottom = Math.min(bottom, sample(anchor[0] + x + dx * c - dz * s, anchor[2] + z + dx * s + dz * c));
        }
      bottom += y;
    }
    const bounds: LandscapeBounds = {
      min: [Math.min(...corners.map((p) => p.x)), bottom, Math.min(...corners.map((p) => p.z))],
      max: [Math.max(...corners.map((p) => p.x)), bottom + height, Math.max(...corners.map((p) => p.z))]
    };
    return { node, position: [anchor[0] + x, bottom + height / 2, anchor[2] + z] as Position, bounds };
  });
  const focus = nodes.filter((item) => geometry.focusIds.includes(item.node.id));
  if (focus.length !== geometry.focusIds.length) throw new Error("参考图取景主体不存在");
  const focusBounds: LandscapeBounds = {
    min: [0, 1, 2].map((axis) => Math.min(...focus.map((item) => item.bounds.min[axis]))) as Position,
    max: [0, 1, 2].map((axis) => Math.max(...focus.map((item) => item.bounds.max[axis]))) as Position
  };
  return {
    id: template.id,
    anchor,
    geometry,
    nodes,
    focusBounds,
    world: { width: plan.parameters.width, depth: plan.parameters.depth, spacingX, spacingZ }
  };
}

/** Terrain along a ray is piecewise linear on native fixed-diagonal triangles,
 * or quadratic on a bilinear cell. Split at grid and diagonal crossings, then
 * bound each interval from its endpoints and quadratic stationary point. */
function terrainVisible(
  eye: Position,
  target: Position,
  scene: ResolvedWorldTemplateScene,
  ground: (x: number, z: number) => number | undefined
): boolean {
  const dx = target[0] - eye[0],
    dy = target[1] - eye[1],
    dz = target[2] - eye[2],
    times = [0, 1];
  const crossings = (a: number, b: number) => {
    if (a === b) return;
    for (let boundary = Math.floor(Math.min(a, b)) + 1; boundary < Math.max(a, b); boundary++) {
      const t = (boundary - a) / (b - a);
      if (t > 0 && t < 1) times.push(t);
    }
  };
  const { spacingX, spacingZ } = scene.world;
  crossings(eye[0] / spacingX, target[0] / spacingX);
  crossings(eye[2] / spacingZ, target[2] / spacingZ);
  crossings(eye[0] / spacingX - eye[2] / spacingZ, target[0] / spacingX - target[2] / spacingZ);
  times.sort((a, b) => a - b);
  const gap = (t: number) => {
    const floor = ground(eye[0] + dx * t, eye[2] + dz * t);
    return floor === undefined ? Infinity : floor - (eye[1] + dy * t);
  };
  for (let i = 1; i < times.length; i++) {
    const a = times[i - 1],
      b = times[i],
      middle = (a + b) / 2;
    if (a === b) continue;
    const y0 = gap(a),
      ym = gap(middle),
      y1 = gap(b);
    if (![y0, ym, y1].every(Number.isFinite)) return false;
    const tolerance =
      Number.EPSILON * Math.max(1, Math.abs(eye[1]), Math.abs(target[1]), Math.abs(y0), Math.abs(y1)) * 32;
    if (Math.max(y0, ym, y1) > tolerance) return false;
    // Fit q(u)=A*u²+B*u+C on u∈[0,1]. A<0 has an interior maximum.
    const A = 2 * (y1 + y0 - 2 * ym),
      B = y1 - y0 - A;
    if (A < 0) {
      const u = -B / (2 * A);
      if (u > 0 && u < 1 && y0 + B * u + A * u * u > tolerance) return false;
    }
  }
  return true;
}

/** Fit actual projected corners at standing height, and reject terrain-blocked
 * views. A sphere fit alone can put the viewer behind a foreground ridge. */
export function resolveWorldTemplateView(
  scene: ResolvedWorldTemplateScene,
  aspect: number,
  fovDegrees: number,
  eyeHeight: number,
  ground: (x: number, z: number) => number | undefined
) {
  const art = WORLD_TEMPLATE_ART[scene.id],
    bounds = scene.focusBounds;
  if (
    ![aspect, fovDegrees, eyeHeight].every(Number.isFinite) ||
    aspect <= 0 ||
    eyeHeight <= 0 ||
    fovDegrees <= 0 ||
    fovDegrees >= 180
  )
    throw new Error("参考图取景的视口、视野角或眼高无效");
  const target = [0, 1, 2].map(
    (axis) => (bounds.min[axis] + bounds.max[axis]) / 2 + (art.lookAtOffset?.[axis] ?? 0) * (axis === 0 ? -1 : 1)
  ) as Position;
  const angle = (-art.azimuthDegrees * Math.PI) / 180;
  const direction = [Math.sin(angle), -Math.cos(angle)],
    spacing = Math.min(scene.world.spacingX, scene.world.spacingZ);
  const corners: Position[] = [];
  for (const x of [bounds.min[0], bounds.max[0]])
    for (const y of [bounds.min[1], bounds.max[1]])
      for (const z of [bounds.min[2], bounds.max[2]]) corners.push([x, y, z]);
  const near = Math.max(...corners.map((p) => (p[0] - target[0]) * direction[0] + (p[2] - target[2]) * direction[1]));
  const far = Math.min(
    ...direction.map((d, i) =>
      d === 0 ? Infinity : ((d > 0 ? [scene.world.width, scene.world.depth][i] : 0) - target[i === 0 ? 0 : 2]) / d
    )
  );
  const tanY = Math.tan((fovDegrees * Math.PI) / 360) * art.frameFraction,
    tanX = tanY * aspect;
  let eye: Position | undefined;
  for (let distance = near + spacing; distance <= far; distance += spacing) {
    const x = target[0] + direction[0] * distance,
      z = target[2] + direction[1] * distance,
      floor = ground(x, z);
    if (floor === undefined || !Number.isFinite(floor)) continue;
    const candidate: Position = [x, floor + eyeHeight, z];
    const length = Math.hypot(...target.map((v, axis) => v - candidate[axis]));
    const forward = target.map((v, axis) => (v - candidate[axis]) / length);
    const right = [-direction[1], 0, direction[0]];
    const up = [forward[1] * right[2], forward[2] * right[0] - forward[0] * right[2], -forward[1] * right[0]];
    const dot = (a: number[], b: number[]) => a.reduce((sum, v, axis) => sum + v * b[axis], 0);
    if (
      corners.some((p) => {
        const delta = p.map((v, axis) => v - candidate[axis]),
          depth = dot(delta, forward);
        return depth <= 0 || Math.abs(dot(delta, right)) > depth * tanX || Math.abs(dot(delta, up)) > depth * tanY;
      })
    )
      continue;
    const visible = [target, ...corners.filter((p) => p[1] === bounds.max[1])];
    if (!visible.every((point) => terrainVisible(candidate, point, scene, ground))) continue;
    eye = candidate;
    break;
  }
  if (!eye) throw new Error("地形遮挡参考图主景，无法在当前世界范围内完整取景");
  const pose: SubjectViewPose = {
    subjectId: `world-template:${scene.id}`,
    eye,
    target,
    fovDegrees,
    frameFraction: art.frameFraction,
    distanceM: Math.hypot(...target.map((value, axis) => value - eye[axis]))
  };
  const view: LandscapeView = {
    id: pose.subjectId,
    eye,
    lookAt: target,
    weight: 1,
    depthBreaks: [pose.distanceM / 3, (pose.distanceM * 2) / 3]
  };
  const focus: LandscapeFocus = {
    id: pose.subjectId,
    objectId: pose.subjectId,
    kind: "world-template",
    bounds,
    clearance: 0,
    visibility: [{ viewId: view.id, bounds, padding: 0 }]
  };
  return { pose, landscape: { view, focus } };
}
