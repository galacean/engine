import type { PlanningComponentDefinition } from "./PlanningComponents";
import type { PlanningDocument } from "./PlanningDocument";
import type { IslandPlan, PlanPoint } from "../semantic-study/IslandPlanModel";
import { ComponentRegistry, resolveComponent } from "./SpatialDocument";
import { PLANNING_RUNTIME_OPTIONS } from "./runtime/RuntimeOptions";
import type { PlanningSystemDeclaration } from "./PlanningSystemDeclaration";
import { planningWhiteboxes } from "../semantic-study/PlanningWhiteboxes";
import { measureVisibility, type Occluder } from "./guidance/VisibilityQuery";
import type {
  LandscapeFocus,
  LandscapePosition,
  LandscapeView,
  LandscapeVisibilityTarget
} from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import { NATURAL_VEGETATION_CONTROLS } from "../planning-data/NaturalVegetationProfile";
import type { FlowerRegion } from "./ecology/FlowerRegions";
import { createPlanningRingQuery } from "../semantic-study/WorldPlanningTerrain";
import { ringArea } from "../semantic-study/WorldPlanningGeometry";
import { flowerAssetMembers } from "../planning-data/FlowerAssetWeights";
import { volumeEnvelope } from "./layout/LayoutKernel";

/** Product framing default, independent of theme, mood, seed and building dimensions. */
export const SUBJECT_VIEW_DEFAULTS = { frameFraction: 0.6, fovDegrees: PLANNING_RUNTIME_OPTIONS.verticalFieldOfView };
/** Distance from a sphere centre that fits it inside the narrower viewport dimension. */
export function subjectViewFitDistance(
  radius: number,
  fovDegrees: number,
  aspect: number,
  frameFraction = SUBJECT_VIEW_DEFAULTS.frameFraction
): number {
  const tangent = Math.tan((fovDegrees * Math.PI) / 360) * Math.min(1, aspect) * frameFraction;
  return radius / Math.sin(Math.atan(tangent));
}
export const SUBJECT_VIEW_COMPONENT: PlanningComponentDefinition = {
  type: "subjectView",
  label: "主体展示视角",
  version: 1,
  tab: "lighting",
  presentation: true,
  fields: [
    {
      key: "subjectId",
      label: "展示主体",
      type: "string",
      default: "",
      description:
        "引用已发布建筑、岩石体量或花区的稳定 ID；体量消费全部 OBB 部件，花区从实际种植多边形内以人的眼高观察。空字符串恢复私人漫游视角。只移动相机，不改出生点或世界布局。"
    },
    {
      key: "frameFraction",
      label: "主体取景比例",
      type: "number",
      min: Number.EPSILON,
      max: 1,
      unit: "%",
      default: SUBJECT_VIEW_DEFAULTS.frameFraction,
      description:
        "建筑按包络外接球和视口/FOV拟合完整取景距离；花区按实际连续种植边界确定观察距离的比例。不是像素占比或遮挡验收。"
    },
    {
      key: "fovDegrees",
      label: "垂直视野角",
      type: "number",
      min: Number.EPSILON,
      max: 180 - Number.EPSILON * 180,
      unit: "°",
      default: SUBJECT_VIEW_DEFAULTS.fovDegrees
    },
    {
      key: "azimuthDegrees",
      label: "主体观察角",
      type: "number",
      unit: "°",
      default: 0,
      description: "建筑为相对入口方向的水平角；花区为相对实际种植面积主轴的水平角。"
    },
    {
      key: "distanceM",
      label: "指定观察距离",
      type: "number",
      min: Number.EPSILON,
      unit: "m",
      description:
        "建筑未指定时按包络、FOV与取景比例计算，过近会拒绝；花区为连续种植区域内的水平观察距离，超出实际边界会拒绝。"
    }
  ]
};
export const SUBJECT_VIEW_DECLARATION: PlanningSystemDeclaration = {
  id: "subject-view",
  title: "主体展示",
  skill: "spatial",
  components: [
    {
      type: "subjectView",
      domain: "composition",
      knowledge: [
        "当前规划建筑已经是有屋顶、墙面和装饰的真实建筑。subjectView 只调整相机，不改变建筑或布局。它是 world 对象的公开参数组件，不是同名工具或同名文件。",
        "先读取 declare/editor/world/tools/ 下的 world.parameters.describe.d.ts、world.parameters.inspect.d.ts 和 world.parameters.apply.d.ts。通过 tools.world.parameters.describe({component:'subjectView'}) 读取字段。用 tools.world.parameters.inspect({id:'world',component:'subjectView'}) 获取当前值和 versionToken，再按 apply 声明提交 subjectId 等字段。不要在文件目录里反复搜索 subjectView。",
        "查看建筑时，通过原生 Scene、Entity、Component 查询实际对象和位置，并使用空间定位和 spatial.teleport。subjectView 只覆盖当前规划发布的主体，不包含之后在 Scene 中创建的建筑。",
        "用户说“看看”时，允许必要的取景。拿到目标后，只补取景需要的信息。应用后仍可以漫游。包络取景不保证无遮挡，可以用 snapshot 检查实际画面。不要把查询正确当作已经展示，也不要为了查询材质或数量而移动相机。"
      ]
    }
  ]
};
const registry = new ComponentRegistry();
registry.register(SUBJECT_VIEW_COMPONENT);
export function readSubjectView(document: PlanningDocument): Record<string, unknown> {
  return document.entities.world?.components.subjectView
    ? Object.fromEntries(
        Object.entries(resolveComponent(document, "world", "subjectView", registry).values).filter(
          ([, value]) => value !== undefined
        )
      )
    : { subjectId: "" };
}
export interface SubjectViewPose {
  subjectId: string;
  eye: [number, number, number];
  target: [number, number, number];
  distanceM: number;
  fovDegrees: number;
  frameFraction: number;
}
/** Framing consumes published occupied geometry, independently of its renderer binding. */
export function subjectVolumes(plan: IslandPlan) {
  return [
    ...plan.buildings.map((item) => ({ ...item, kind: "building" as const })),
    ...(plan.rocks ?? []).map((item) => ({ ...item, kind: "rock" as const }))
  ].map((item) => {
    if (!item.boxes?.length) return item;
    const shape = volumeEnvelope({
      id: item.id,
      owner: item.id,
      boxes: item.boxes.map((box) => ({
        center: box.center,
        width: box.sizeX,
        depth: box.sizeZ,
        height: box.sizeY,
        yaw: box.yaw,
        elevation: box.elevation ?? item.baseHeight ?? 0
      }))
    });
    return {
      ...item,
      ...shape,
      yaw: 0,
      baseHeight: Math.min(...item.boxes.map((box) => box.elevation ?? item.baseHeight ?? 0))
    };
  });
}
/** Closed-form sphere fitting. No camera search, object movement or semantic presets. */
export function resolveSubjectView(
  values: Readonly<Record<string, unknown>>,
  plan: IslandPlan,
  aspect: number,
  ground: (x: number, z: number) => number | undefined,
  eyeHeight: number
): SubjectViewPose | undefined {
  registry.validate("subjectView", values);
  const subjectId = String(values.subjectId ?? "");
  if (!subjectId) return undefined;
  if (!Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(eyeHeight) || eyeHeight <= 0)
    throw new Error("主体展示视口或相机高度无效");
  const region = plan.flowerRegions?.find((item) => item.id === subjectId);
  if (region) return resolveFlowerView(values, region, aspect, ground, eyeHeight).pose;
  const building = subjectVolumes(plan).find((item) => item.id === subjectId);
  if (!building) throw new Error(`展示主体不存在：${subjectId}`);
  const fovDegrees = Number(values.fovDegrees ?? SUBJECT_VIEW_DEFAULTS.fovDegrees);
  const frameFraction = Number(values.frameFraction ?? SUBJECT_VIEW_DEFAULTS.frameFraction);
  const radius = Math.hypot(building.width, building.depth, building.height) / 2;
  const fitDistance = subjectViewFitDistance(radius, fovDegrees, aspect, frameFraction);
  const distanceM = Number(values.distanceM ?? fitDistance);
  if (distanceM < fitDistance) throw new Error(`指定距离 ${distanceM} 米不足以完整取景，至少需要 ${fitDistance} 米`);
  const baseY = building.baseHeight ?? ground(building.center.x, building.center.z);
  if (baseY === undefined || !Number.isFinite(baseY)) throw new Error("展示主体地面高度不可用");
  const target: SubjectViewPose["target"] = [building.center.x, baseY + building.height / 2, building.center.z];
  const entry = plan.courtyards?.find((item) => item.buildingId === subjectId);
  const dx = entry ? entry.door.x - building.center.x : Math.sin(building.yaw);
  const dz = entry ? entry.door.z - building.center.z : Math.cos(building.yaw);
  const angle = Math.atan2(dx, dz) + (Number(values.azimuthDegrees ?? 0) * Math.PI) / 180;
  const x = target[0] + Math.sin(angle) * distanceM,
    z = target[2] + Math.cos(angle) * distanceM;
  if (x < 0 || z < 0 || x > plan.parameters.width || z > plan.parameters.depth)
    throw new Error("主体展示相机超出当前地形范围；请调整观察角或取景比例");
  const floor = ground(x, z);
  if (floor === undefined || !Number.isFinite(floor)) throw new Error("主体展示相机地面高度不可用");
  const eye: SubjectViewPose["eye"] = [x, Math.max(target[1], floor + eyeHeight), z];
  return {
    subjectId,
    eye,
    target,
    distanceM: Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]),
    fovDegrees,
    frameFraction
  };
}

/** Integrate the published convex planting cells, including gaps and holes, rather than their bounding rectangle. */
function flowerViewGeometry(region: FlowerRegion) {
  if (!(region.config.densityPerM2 > 0) || !flowerAssetMembers(region.config.assetWeights).length)
    throw new Error(`展示花区没有启用的花丛人口：${region.id}`);
  const boundary = region.outlines
    .slice()
    .sort((a, b) => ringArea(b) - ringArea(a) || JSON.stringify(a).localeCompare(JSON.stringify(b)))[0];
  if (!boundary) throw new Error(`展示花区没有发布的种植多边形：${region.id}`);
  const query = createPlanningRingQuery(boundary);
  const cells = region.patches
    .map((polygon) => {
      let crossSum = 0,
        x = 0,
        z = 0,
        xx = 0,
        zz = 0,
        xz = 0;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length],
          cross = a.x * b.z - b.x * a.z;
        crossSum += cross;
        x += (a.x + b.x) * cross;
        z += (a.z + b.z) * cross;
        xx += (a.x * a.x + a.x * b.x + b.x * b.x) * cross;
        zz += (a.z * a.z + a.z * b.z + b.z * b.z) * cross;
        xz += (2 * a.x * a.z + a.x * b.z + b.x * a.z + 2 * b.x * b.z) * cross;
      }
      return {
        polygon,
        area: Math.abs(crossSum) / 2,
        center: { x: x / (3 * crossSum), z: z / (3 * crossSum) },
        xx: xx / (6 * crossSum),
        zz: zz / (6 * crossSum),
        xz: xz / (12 * crossSum)
      };
    })
    .filter((cell) => cell.area > 0 && query.inside(cell.center))
    .sort((a, b) => a.center.x - b.center.x || a.center.z - b.center.z || a.area - b.area);
  const area = cells.reduce((sum, cell) => sum + cell.area, 0);
  if (!(area > 0)) throw new Error(`展示花区没有可用的连续种植面积：${region.id}`);
  const mean = (read: (cell: (typeof cells)[number]) => number) =>
    cells.reduce((sum, cell) => sum + cell.area * read(cell), 0) / area;
  const center = { x: mean((cell) => cell.center.x), z: mean((cell) => cell.center.z) };
  const xx = mean((cell) => cell.xx) - center.x ** 2,
    zz = mean((cell) => cell.zz) - center.z ** 2;
  const xz = mean((cell) => cell.xz) - center.x * center.z;
  // A concave region's mass centre can fall in a hole. Use an actual convex planting-cell centre.
  const eye = cells.reduce((best, cell) =>
    Math.hypot(cell.center.x - center.x, cell.center.z - center.z) <
    Math.hypot(best.center.x - center.x, best.center.z - center.z)
      ? cell
      : best
  ).center;
  const principal = 0.5 * Math.atan2(2 * xz, xx - zz);
  return { eye, cells, angle: Math.atan2(Math.cos(principal), Math.sin(principal)) };
}

/** Integrate actual planting polygons clipped to a horizontal view wedge; holes contribute no area. */
function plantedWedgePolygons(cells: readonly { polygon: PlanPoint[] }[], wedge: readonly PlanPoint[]): PlanPoint[][] {
  return cells
    .map((cell) => {
      let polygon = cell.polygon;
      for (let edge = 0; edge < wedge.length && polygon.length; edge++) {
        const a = wedge[edge],
          b = wedge[(edge + 1) % wedge.length];
        const signed = (p: PlanPoint) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
        const output: PlanPoint[] = [];
        for (let i = 0; i < polygon.length; i++) {
          const p = polygon[i],
            q = polygon[(i + 1) % polygon.length],
            u = signed(p),
            v = signed(q);
          if (u >= 0) output.push(p);
          if (u >= 0 !== v >= 0) {
            const t = u / (u - v);
            output.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
          }
        }
        polygon = output;
      }
      return polygon;
    })
    .filter((polygon) => ringArea(polygon) > 0);
}

/** Exact ray/contour intersections stop at the first gap, road exclusion or hole, not the area bounding box. */
function plantedReach(eye: PlanPoint, angle: number, outlines: readonly PlanPoint[][]): number {
  const dx = Math.sin(angle),
    dz = Math.cos(angle);
  let reach = Infinity;
  for (const ring of outlines)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length],
        ex = b.x - a.x,
        ez = b.z - a.z;
      const denominator = dx * ez - dz * ex;
      if (!denominator) continue;
      const ax = a.x - eye.x,
        az = a.z - eye.z;
      const distance = (ax * ez - az * ex) / denominator,
        along = (ax * dz - az * dx) / denominator;
      if (distance > 0 && along >= 0 && along <= 1) reach = Math.min(reach, distance);
    }
  if (!Number.isFinite(reach) || reach <= 0) throw new Error("无法求得连续种植边界");
  return reach;
}

function resolveFlowerView(
  values: Readonly<Record<string, unknown>>,
  region: FlowerRegion,
  aspect: number,
  ground: (x: number, z: number) => number | undefined,
  eyeHeight: number,
  geometry = flowerViewGeometry(region)
) {
  const fovDegrees = Number(values.fovDegrees ?? SUBJECT_VIEW_DEFAULTS.fovDegrees);
  const frameFraction = Number(values.frameFraction ?? SUBJECT_VIEW_DEFAULTS.frameFraction);
  const halfFov = Math.atan(Math.tan((fovDegrees * Math.PI) / 360) * aspect);
  const angle = geometry.angle + (Number(values.azimuthDegrees ?? 0) * Math.PI) / 180;
  const reach = Math.min(
    ...[angle - halfFov, angle, angle + halfFov].map((direction) =>
      plantedReach(geometry.eye, direction, region.outlines)
    )
  );
  const distance = Number(values.distanceM ?? reach * frameFraction);
  if (!(distance > 0) || distance > reach) throw new RangeError("指定观察距离超出连续花区边界");
  const x = geometry.eye.x,
    z = geometry.eye.z,
    tx = x + Math.sin(angle) * distance,
    tz = z + Math.cos(angle) * distance;
  const floor = ground(x, z),
    targetFloor = ground(tx, tz);
  if (floor === undefined || targetFloor === undefined || !Number.isFinite(floor) || !Number.isFinite(targetFloor))
    throw new Error("花区展示地面高度不可用");
  const eye: SubjectViewPose["eye"] = [x, floor + eyeHeight, z],
    target: SubjectViewPose["target"] = [tx, targetFloor + eyeHeight, tz];
  const wedge = [
    geometry.eye,
    { x: x + Math.sin(angle + halfFov) * distance, z: z + Math.cos(angle + halfFov) * distance },
    { x: x + Math.sin(angle - halfFov) * distance, z: z + Math.cos(angle - halfFov) * distance }
  ];
  return {
    pose: {
      subjectId: region.id,
      eye,
      target,
      distanceM: Math.hypot(distance, target[1] - eye[1]),
      fovDegrees,
      frameFraction
    },
    groundAreaM2: plantedWedgePolygons(geometry.cells, wedge).reduce((sum, polygon) => sum + ringArea(polygon), 0),
    forwardReachM: distance
  };
}

/** First-person area framing over actual planted ground. Principal axes provide the four opposing
 * horizontal orientations; rank their continuous ground wedge by the region's authored clump density.
 * This is a geometric foreground estimate, not flower-pixel visibility or aesthetic acceptance.
 */
export function selectFlowerView(
  plan: IslandPlan,
  aspect: number,
  ground: (x: number, z: number) => number,
  eyeHeight: number,
  subjectIds?: readonly string[],
  values: Readonly<Record<string, unknown>> = {}
) {
  registry.validate("subjectView", values);
  if (!(aspect > 0) || !Number.isFinite(aspect) || !(eyeHeight > 0) || !Number.isFinite(eyeHeight))
    throw new Error("花区展示视口或相机高度无效");
  const ids = subjectIds ? new Set(subjectIds) : undefined;
  const regions = (plan.flowerRegions ?? [])
    .filter(
      (region) =>
        (!ids || ids.has(region.id)) &&
        region.config.densityPerM2 > 0 &&
        region.patches.length &&
        flowerAssetMembers(region.config.assetWeights).length
    )
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const preferred = Number(values.azimuthDegrees ?? 0);
  let best:
    | {
        pose: SubjectViewPose;
        azimuthDegrees: number;
        groundAreaM2: number;
        forwardReachM: number;
        expectedClumps: number;
      }
    | undefined;
  for (const region of regions) {
    const geometry = flowerViewGeometry(region);
    for (const turn of [0, 90, -90, 180]) {
      const azimuthDegrees = preferred + turn;
      let selected: ReturnType<typeof resolveFlowerView>;
      try {
        selected = resolveFlowerView({ ...values, azimuthDegrees }, region, aspect, ground, eyeHeight, geometry);
      } catch (error) {
        if (error instanceof RangeError) continue;
        throw error;
      }
      const expectedClumps = selected.groundAreaM2 * region.config.densityPerM2;
      if (!(expectedClumps > 0)) continue;
      if (!best || expectedClumps > best.expectedClumps) best = { ...selected, azimuthDegrees, expectedClumps };
    }
  }
  if (!best) throw new Error("没有启用花丛人口且符合观察距离的已发布种植面积目标");
  return best;
}

/** First-generation camera selection over published geometry, independent of natural-language labels.
 * Angular samples are spaced by the subject's fitted angular diameter. Rank visibility first,
 * then other building projection, then the change from the published front direction.
 * Visibility is a CPU estimate over the actual terrain and published OBBs, not an image review.
 */
export function selectSubjectView(
  plan: IslandPlan,
  aspect: number,
  ground: (x: number, z: number) => number,
  eyeHeight: number,
  subjectId?: string | readonly string[],
  values: Readonly<Record<string, unknown>> = {},
  kind: "building" | "volume" = "building"
) {
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error("主体展示视口无效");
  registry.validate("subjectView", values);
  const fov = Number(values.fovDegrees ?? SUBJECT_VIEW_DEFAULTS.fovDegrees);
  const fraction = Number(values.frameFraction ?? SUBJECT_VIEW_DEFAULTS.frameFraction);
  const preferredAngle = Number(values.azimuthDegrees ?? 0);
  const subjectIds =
    subjectId === undefined ? undefined : new Set(typeof subjectId === "string" ? [subjectId] : subjectId);
  const published = subjectVolumes(plan);
  const candidates = published
    .filter(
      (building) => (kind === "volume" || building.kind === "building") && (!subjectIds || subjectIds.has(building.id))
    )
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!candidates.length) throw new Error(subjectId ? `展示主体不存在：${subjectId}` : "没有已发布的主体体量");
  const solids: Occluder[] = planningWhiteboxes(plan, (p) => ground(p.x, p.z)).flatMap((part) =>
    part.boxes.map((box) => ({ ownerId: part.id, box }))
  );
  type Choice = { pose: SubjectViewPose; azimuthDegrees: number; visibleFraction: number; competingArea: number };
  let best: Choice | undefined;
  for (const building of candidates) {
    const radius = Math.hypot(building.width, building.depth, building.height) / 2;
    const fitDistance = subjectViewFitDistance(radius, fov, aspect, fraction);
    if (fitDistance > Math.hypot(plan.parameters.width, plan.parameters.depth)) continue;
    const angles = Math.ceil(Math.PI / Math.atan(radius / fitDistance));
    const rows = 2 ** 3,
      columns = Math.ceil(rows * aspect);
    if (angles > rows * columns) throw new Error("主体角度采样超出当前视线采样预算；请增大取景比例或视野角");
    for (let i = 0; i < angles; i++) {
      const signed = i <= angles / 2 ? i : i - angles;
      const azimuthDegrees = preferredAngle + (signed * 360) / angles;
      let pose: SubjectViewPose;
      try {
        pose = resolveSubjectView(
          { ...values, subjectId: building.id, azimuthDegrees },
          plan,
          aspect,
          ground,
          eyeHeight
        )!;
      } catch (error) {
        if (String(error).includes("超出当前地形范围")) continue;
        throw error;
      }
      const [x, y, z] = pose.eye,
        [tx, ty, tz] = pose.target;
      // Only boxes intersecting the eye-to-subject envelope can block a target ray.
      const nearby = solids.filter(({ box }) => {
        const c = Math.abs(Math.cos(box.yaw)),
          s = Math.abs(Math.sin(box.yaw));
        const halfX = (c * box.sizeX + s * box.sizeZ) / 2,
          halfZ = (s * box.sizeX + c * box.sizeZ) / 2;
        return (
          box.center.x + halfX >= Math.min(x, tx) - radius &&
          box.center.x - halfX <= Math.max(x, tx) + radius &&
          box.center.z + halfZ >= Math.min(z, tz) - radius &&
          box.center.z - halfZ <= Math.max(z, tz) + radius
        );
      });
      // OBB corners define eight independent geometric samples per viewport axis.
      const measured = measureVisibility(
        {
          position: { x, y, z },
          forward: { x: tx - x, y: ty - y, z: tz - z },
          verticalFovDegrees: pose.fovDegrees,
          aspect,
          rows,
          columns,
          terrainStepM: plan.raster.spacing,
          nearM: Number.EPSILON
        },
        nearby,
        new Set([building.id]),
        (p) => ground(p.x, p.z)
      );
      if (!measured.projectedSamples) continue;
      const visibleFraction = measured.visibleSamples / measured.projectedSamples;
      const competingArea = published
        .filter((other) => other.id !== building.id)
        .reduce((sum, other) => sum + projectedBuildingArea(other, pose, aspect, ground), 0);
      const choice = { pose, azimuthDegrees, visibleFraction, competingArea };
      if (
        !best ||
        visibleFraction > best.visibleFraction ||
        (visibleFraction === best.visibleFraction &&
          (competingArea < best.competingArea ||
            (competingArea === best.competingArea &&
              Math.abs(azimuthDegrees - preferredAngle) < Math.abs(best.azimuthDegrees - preferredAngle))))
      )
        best = choice;
    }
  }
  if (!best || best.visibleFraction === 0) throw new Error("未找到可见的首次主体视角");
  return best;
}

function projectedBuildingArea(
  building: ReturnType<typeof subjectVolumes>[number],
  pose: SubjectViewPose,
  aspect: number,
  ground: (x: number, z: number) => number
): number {
  const forward = pose.target.map((value, axis) => (value - pose.eye[axis]) / pose.distanceM);
  const length = Math.hypot(forward[0], forward[2]);
  const right = [-forward[2] / length, 0, forward[0] / length];
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0]
  ];
  const tangent = Math.tan((pose.fovDegrees * Math.PI) / 360),
    c = Math.cos(building.yaw),
    s = Math.sin(building.yaw);
  const base = building.baseHeight ?? ground(building.center.x, building.center.z);
  const points: number[][] = [];
  for (const dx of [-building.width / 2, building.width / 2])
    for (const dz of [-building.depth / 2, building.depth / 2])
      for (const y of [base, base + building.height]) {
        const offset = [
          building.center.x + c * dx - s * dz - pose.eye[0],
          y - pose.eye[1],
          building.center.z + s * dx + c * dz - pose.eye[2]
        ];
        const dot = (axis: number[]) => axis.reduce((sum, value, i) => sum + value * offset[i], 0);
        const depth = dot(forward);
        if (depth > 0) points.push([dot(right) / (depth * tangent * aspect), dot(up) / (depth * tangent)]);
      }
  if (!points.length) return 0;
  const span = (axis: number) =>
    Math.max(
      0,
      Math.min(1, Math.max(...points.map((p) => p[axis]))) - Math.max(-1, Math.min(...points.map((p) => p[axis])))
    );
  return (span(0) * span(1)) / 4;
}

/** Clip a convex planting surface to the actual camera frustum before protecting its sightlines. */
function visiblePlantingSurface(
  polygon: LandscapePosition[],
  pose: SubjectViewPose,
  aspect: number
): LandscapePosition[] {
  const delta = pose.target.map((v, i) => v - pose.eye[i]),
    length = Math.hypot(...delta);
  const forward = delta.map((v) => v / length),
    horizontal = Math.hypot(forward[0], forward[2]);
  const right = [forward[2] / horizontal, 0, -forward[0] / horizontal];
  const up = [-forward[1] * right[2], forward[2] * right[0] - forward[0] * right[2], forward[1] * right[0]];
  const tanY = Math.tan((pose.fovDegrees * Math.PI) / 360),
    tanX = tanY * aspect;
  const planes = [
    forward,
    ...[right, up].flatMap((axis, i) =>
      [-1, 1].map((sign) => forward.map((value, j) => value * (i === 0 ? tanX : tanY) + axis[j] * sign))
    )
  ];
  for (const plane of planes) {
    const signed = (p: LandscapePosition) => plane.reduce((sum, v, i) => sum + v * (p[i] - pose.eye[i]), 0);
    const output: LandscapePosition[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length],
        u = signed(p),
        v = signed(q);
      if (u >= 0) output.push(p);
      if (u >= 0 !== v >= 0) {
        const t = u / (u - v);
        output.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
      }
    }
    polygon = output;
  }
  return polygon;
}

/** Pass the same initial view and published solid or planted surface to the plant visibility solver. */
export function subjectViewLandscape(
  pose: SubjectViewPose,
  plan: IslandPlan,
  ground?: (x: number, z: number) => number | undefined,
  aspect?: number
): { view: LandscapeView; focus: LandscapeFocus } {
  const view = {
    id: "initial-subject",
    eye: pose.eye,
    lookAt: pose.target,
    weight: 1,
    depthBreaks: [pose.distanceM / 3, (pose.distanceM * 2) / 3] as const
  };
  const region = plan.flowerRegions?.find((region) => region.id === pose.subjectId);
  if (region) {
    if (!ground || aspect === undefined || !Number.isFinite(aspect) || aspect <= 0)
      throw new Error("花区构图需要实际地形和视口");
    const geometry = flowerViewGeometry(region);
    const [x, , z] = pose.eye,
      dx = pose.target[0] - x,
      dz = pose.target[2] - z;
    const angle = Math.atan2(dx, dz),
      distance = Math.hypot(dx, dz);
    const halfFov = Math.atan(Math.tan((pose.fovDegrees * Math.PI) / 360) * aspect);
    const wedge = [
      { x, z },
      { x: x + Math.sin(angle + halfFov) * distance, z: z + Math.cos(angle + halfFov) * distance },
      { x: x + Math.sin(angle - halfFov) * distance, z: z + Math.cos(angle - halfFov) * distance }
    ];
    const visibility: LandscapeVisibilityTarget[] = plantedWedgePolygons(geometry.cells, wedge).flatMap((polygon) => {
      const surface = visiblePlantingSurface(
        polygon.map((p) => {
          const y = ground(p.x, p.z);
          if (y === undefined || !Number.isFinite(y)) throw new Error("花区构图地面高度不可用");
          return [p.x, y, p.z] as LandscapePosition;
        }),
        pose,
        aspect
      );
      return surface.slice(2).flatMap((c, i) => {
        const a = surface[0],
          b = surface[i + 1];
        const u = b.map((v, axis) => v - a[axis]),
          v = c.map((v, axis) => v - a[axis]);
        const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        if (normal.reduce((sum, n, axis) => sum + n * (pose.eye[axis] - a[axis]), 0) === 0) return [];
        return [{ viewId: view.id, surface: [a, b, c] as const }];
      });
    });
    if (!visibility.length) throw new Error("当前花区视角内没有可见种植面");
    const points = visibility.flatMap((target) => target.surface!);
    const bounds = {
      min: [0, 1, 2].map((axis) => Math.min(...points.map((p) => p[axis]))) as [number, number, number],
      max: [0, 1, 2].map((axis) => Math.max(...points.map((p) => p[axis]))) as [number, number, number]
    };
    return {
      view,
      focus: {
        id: region.id,
        objectId: region.id,
        kind: "flowerRegion",
        bounds,
        occupiedBounds: null,
        clearance: 0,
        members: [
          { layerId: NATURAL_VEGETATION_CONTROLS.find((layer) => layer.key === "flowers")!.label, scopeId: region.id }
        ],
        visibility
      }
    };
  }
  const building = subjectVolumes(plan).find((item) => item.id === pose.subjectId);
  if (!building) throw new Error(`展示主体不存在：${pose.subjectId}`);
  const c = Math.abs(Math.cos(building.yaw)),
    s = Math.abs(Math.sin(building.yaw));
  const halfX = (c * building.width + s * building.depth) / 2,
    halfZ = (s * building.width + c * building.depth) / 2;
  const base = pose.target[1] - building.height / 2;
  const bounds = {
    min: [building.center.x - halfX, base, building.center.z - halfZ] as const,
    max: [building.center.x + halfX, base + building.height, building.center.z + halfZ] as const
  };
  return {
    view,
    focus: {
      id: pose.subjectId,
      objectId: pose.subjectId,
      kind: building.kind,
      bounds,
      clearance: 0,
      visibility: [{ viewId: view.id, bounds, padding: 0 }]
    }
  };
}
