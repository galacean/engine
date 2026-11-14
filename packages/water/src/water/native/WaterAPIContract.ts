import type { WatercourseAuthoring } from "../authoring/river/Watercourse";
import type { WaterTerrainSnapshot } from "../authoring/terrain/WaterTerrainSnapshot";
import type { WaterBodyAsset } from "../authoring/body/WaterBodyAsset";
import type { WaterLookAuthoringComponents } from "../authoring/surface/WaterLookAuthoringSnapshot";
import type { WaterQualityPlanV2 } from "../authoring/quality/WaterQualityPlan";
import type {
  WaterInteractionRequestV1,
  WaterRepresentationInstanceStateV1
} from "../authoring/body/WaterBodyInstance";

/** Complete existing authoring inputs. Lake/River sources must already contain terrain-derived inputs. */
export interface WaterDefinition {
  asset: WaterBodyAsset;
  look: WaterLookAuthoringComponents;
  quality: WaterQualityPlanV2;
}
export interface WaterInstanceSettings {
  visible?: boolean;
  priority?: number;
  interaction?: WaterInteractionRequestV1;
  representationState?: WaterRepresentationInstanceStateV1;
}
export interface WaterCommands {
  resolveRiver: { authoring: WatercourseAuthoring; terrain: WaterTerrainSnapshot };
  list: Record<string, never>;
  presets: Record<string, never>;
  get: { id: string };
  capabilities: { id?: string };
  create: {
    id?: string;
    name?: string;
    definition?: WaterDefinition;
    preset?: string;
    settings?: WaterInstanceSettings;
  };
  update: {
    id: string;
    asset?: WaterBodyAsset;
    look?: WaterLookAuthoringComponents;
    quality?: WaterQualityPlanV2;
    settings?: WaterInstanceSettings;
  };
  updateMany: { updates: WaterCommands["update"][] };
  setEnabled: { id: string; enabled: boolean };
  remove: { id: string };
  sampleDrops: { x: number; y: number; z: number; id?: string };
  sample: { x: number; z: number; id?: string };
  verify: { id: string; expectedRevision?: number };
}
export type WaterCommand = {
  [K in keyof WaterCommands]: { operation: K; input: WaterCommands[K] };
}[keyof WaterCommands];
export type WaterErrorCode =
  | "INVALID_ARGUMENT"
  | "TERRAIN_CHANGE_REQUIRED"
  | "RESOURCE_LIMIT"
  | "NOT_FOUND"
  | "MISSING_DEPENDENCY"
  | "NOT_SUPPORTED"
  | "CONFLICT"
  | "CANCELLED"
  | "DESTROYED"
  | "EXECUTION_FAILED";
export type WaterResult<T> =
  | { ok: true; revision: number; value: T }
  | { ok: false; revision: number; error: { code: WaterErrorCode; message: string } };
