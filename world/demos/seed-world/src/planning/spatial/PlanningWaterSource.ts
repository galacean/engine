import { createWaterQualitySettings } from "@galacean/engine-water/water/native/WaterQualitySettings";
import type { WaterShapeAuthoring } from "@galacean/engine-water/water/native/WaterAuthoring";
import { validateWaterShape } from "@galacean/engine-water/water/native/WaterAuthoring";
import type { WaterSourceAuthoring } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";
import { LAKE_DEFAULTS, type LakeParameters } from "@galacean/engine-world-planning/spatial/hydrology/LakeRegions";
import { RIVER_DEFAULTS, type RiverParameters } from "@galacean/engine-world-planning/spatial/hydrology/RiverRegions";
import type { SpatialEntity } from "@galacean/engine-world-planning/spatial/SpatialDocument";
import type { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { hashStableValue } from "@galacean/engine-water/water/compiler/shared/determinism";

export const WATER_COMPONENT = "WaterBodyComponent";

/** A template's planning label is scoped by the public Source component identity. */
export function effectivePlanningWaterId(
  scene: string,
  bodyId: string,
  planningId: string,
  kind: WaterShapeAuthoring["kind"]
): string {
  return bodyId.startsWith("@instance:") && kind !== "ocean"
    ? `${kind}:authored:source-${hashStableValue([scene, bodyId])}`
    : planningId;
}

export function planningWaterSourceId(scene: RuntimeSceneEdit, entityId: string): string | undefined {
  const identity = scene.queryComponents({ entityId, type: "PlanningEntityAuthoring" })[0];
  if (!identity) return;
  const id = scene.readComponent(identity.id).props?.planningId as string;
  const body = scene.queryComponents({ entityId, type: WATER_COMPONENT })[0];
  const input = body && (scene.readComponent(body.id).props?.authoring as unknown as WaterSourceAuthoring | undefined);
  return body && input ? effectivePlanningWaterId(body.scene, body.id, id, input.shape.kind) : id;
}

/** The Planning document is an algorithm DTO. Concrete shape fields persist only on native components. */
export function planningWaterSource(entity: SpatialEntity): WaterSourceAuthoring | undefined {
  const lake = entity.components.lakes?.values as Partial<LakeParameters> | undefined;
  const river = entity.components.rivers?.values as Partial<RiverParameters> | undefined;
  let shape: WaterShapeAuthoring;
  if (entity.id.startsWith("lake:") && lake?.shoreline && lake.referenceLevel !== undefined) {
    const values = { ...LAKE_DEFAULTS, ...lake };
    shape = {
      kind: "lake",
      shoreline: values.shoreline!.map((point) => ({
        ...point,
        x: point.x + values.offsetX,
        z: point.z + values.offsetZ
      })),
      referenceLevel: values.referenceLevel!,
      levelOffsetM: values.levelOffsetM,
      basin: { depthM: values.depthM, bankWidthM: values.bankWidthM, carve: values.allowCarving }
    };
  } else if (entity.id.startsWith("river:") && river?.points) {
    const values = { ...RIVER_DEFAULTS, ...river };
    shape = {
      kind: "river",
      course: {
        id: entity.id,
        points: values.points!,
        sections: values.sections,
        bankClearance: values.bankClearance ?? 0.05,
        dropThreshold: values.dropThreshold ?? 0.5,
        slopeThreshold: values.slopeThreshold ?? 0.2,
        probeSpacing: values.probeSpacing ?? 0.25
      },
      speed: values.speed ?? 1,
      bankWidthM: values.bankWidthM
    };
  } else return undefined;
  validateWaterShape(shape);
  return {
    shape,
    terrain: { mode: "host" },

    quality: createWaterQualitySettings(shape.kind),
    material: { $ref: `Water/Materials/${shape.kind}.mat` }
  };
}

export function planningWaterParameters(input: WaterSourceAuthoring, enabled: boolean): SpatialEntity["components"] {
  if (input.terrain.mode !== "host") return {};
  const shape = validateWaterShape(input.shape);
  if (shape.kind === "lake") {
    const shore = shape.shoreline.filter((point) => point.ring === "shore");
    const x = shore.reduce((sum, point) => sum + point.x, 0) / shore.length;
    const z = shore.reduce((sum, point) => sum + point.z, 0) / shore.length;
    const radiusM = Math.max(...shore.map((point) => Math.hypot(point.x - x, point.z - z)));
    return {
      lakes: {
        base: { entity: "world", component: "lakes" },
        values: {
          shoreline: structuredClone(shape.shoreline),
          referenceLevel: shape.referenceLevel,
          levelOffsetM: shape.levelOffsetM,
          depthM: shape.basin?.depthM ?? LAKE_DEFAULTS.depthM,
          bankWidthM: shape.basin?.bankWidthM ?? LAKE_DEFAULTS.bankWidthM,
          allowCarving: shape.basin?.carve ?? false,
          radiusM,
          offsetX: 0,
          offsetZ: 0,
          enabled
        }
      }
    };
  }
  if (shape.kind === "river")
    return {
      rivers: {
        base: { entity: "world", component: "rivers" },
        values: {
          points: structuredClone(shape.course.points),
          sections: structuredClone(shape.course.sections),
          bankWidthM: shape.bankWidthM ?? RIVER_DEFAULTS.bankWidthM,
          enabled,
          speed: shape.speed,
          bankClearance: shape.course.bankClearance ?? 0.05,
          dropThreshold: shape.course.dropThreshold ?? 0.5,
          slopeThreshold: shape.course.slopeThreshold ?? 0.2,
          probeSpacing: shape.course.probeSpacing ?? 0.25
        }
      }
    };
  return {};
}

interface WaterFrame {
  x: number;
  y: number;
  z: number;
  yaw: number;
  active: boolean;
}
/** The host's solver uses world metres; the persisted shape remains local to its Entity. */
export function planningWaterFrame(scene: RuntimeSceneEdit, id: string): WaterFrame {
  const entities = scene.list(),
    parents = new Map(
      entities.flatMap((entity) => (entity.children ?? []).map((child) => [child, entity.id] as const))
    );
  const visited = new Set<string>();
  const read = (id: string): WaterFrame => {
    if (visited.has(id)) throw new Error("Water has a cyclic authoring hierarchy");
    visited.add(id);
    const entity = scene.readEntity(id),
      position = entity.position ?? [0, 0, 0],
      rotation = entity.rotation ?? [0, 0, 0],
      scale = entity.scale ?? [1, 1, 1];
    if (![...position, ...rotation, ...scale].every(Number.isFinite))
      throw new Error(`Water '${id}' requires finite transforms.`);
    if ([rotation[0], rotation[2], ...scale.map((value) => value - 1)].some((value) => Math.abs(value) > 1e-6))
      throw new Error(`NOT_SUPPORTED: Water '${id}' supports translation and yaw with unit scale.`);
    const parent = parents.get(id),
      frame = parent ? read(parent) : { x: 0, y: 0, z: 0, yaw: 0, active: true };
    const angle = (frame.yaw * Math.PI) / 180,
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    return {
      x: frame.x + cos * position[0] + sin * position[2],
      y: frame.y + position[1],
      z: frame.z - sin * position[0] + cos * position[2],
      yaw: frame.yaw + rotation[1],
      active: frame.active && entity.isActive !== false
    };
  };
  return read(id);
}

export function transformPlanningWater(
  shape: WaterShapeAuthoring,
  frame: WaterFrame,
  inverse = false
): WaterShapeAuthoring {
  const angle = ((frame.yaw * Math.PI) / 180) * (inverse ? -1 : 1),
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const point = (x: number, z: number) => {
    if (inverse) {
      x -= frame.x;
      z -= frame.z;
    }
    return { x: cos * x + sin * z + (inverse ? 0 : frame.x), z: -sin * x + cos * z + (inverse ? 0 : frame.z) };
  };
  const elevation = (value: number) => value + (inverse ? -frame.y : frame.y);
  if (shape.kind === "lake")
    return {
      ...shape,
      referenceLevel: elevation(shape.referenceLevel),
      shoreline: shape.shoreline.map((value) => ({ ...value, ...point(value.x, value.z) }))
    };
  if (shape.kind === "river")
    return {
      ...shape,
      course: {
        ...shape.course,
        points: shape.course.points.map((value) => ({
          ...value,
          ...point(value.x, value.z),
          ...(value.elevation === undefined ? {} : { elevation: elevation(value.elevation) })
        }))
      }
    };
  if ([frame.x, frame.y, frame.z, frame.yaw].some((value) => Math.abs(value) > 1e-6))
    throw new Error("NOT_SUPPORTED: Seed World Ocean uses the fixed world datum and an explicit surface layout.");
  return shape;
}
