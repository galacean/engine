/** Versioned, serializable river-network descriptor. */
import { RiverNetworkSchemaVersion, RiverNodeKind } from "./RiverAuthoringEnums";
import type {
  RiverCurveConfig,
  RiverDisturbanceSource,
  RiverFlowConfig,
  RiverMaterialConfig,
  RiverNetworkBudgetConfig,
  RiverQualityConfig,
  RiverShapeConfig,
  RiverSurfaceMotionConfig,
  Vector3Tuple
} from "./RiverAuthoringTypes";

export interface RiverNodeConfig {
  id: string;
  kind: RiverNodeKind;
  position: Vector3Tuple;
  mergeRadius?: number;
  elevation?: number;
}

export interface RiverSegmentConfig {
  id: string;
  from: string;
  to: string;
  curve: RiverCurveConfig;
  shape?: Partial<RiverShapeConfig>;
  flow?: Partial<RiverFlowConfig>;
  material?: Partial<RiverMaterialConfig>;
  order?: number;
}

interface RiverNetworkDescriptorBase {
  id: string;
  nodes: RiverNodeConfig[];
  segments: RiverSegmentConfig[];
  defaults: {
    shape: RiverShapeConfig;
    flow: RiverFlowConfig;
    material: RiverMaterialConfig;
    quality: RiverQualityConfig;
  };
  budget?: Partial<RiverNetworkBudgetConfig>;
}

export interface RiverNetworkDescriptorV1 extends RiverNetworkDescriptorBase {
  schemaVersion: RiverNetworkSchemaVersion.V1;
}

export interface RiverNetworkDescriptorV2 extends RiverNetworkDescriptorBase {
  schemaVersion: RiverNetworkSchemaVersion.V2;
  defaults: RiverNetworkDescriptorBase["defaults"] & {
    surfaceMotion: RiverSurfaceMotionConfig;
  };
  disturbances?: RiverDisturbanceSource[];
}

export type RiverNetworkDescriptor = RiverNetworkDescriptorV1 | RiverNetworkDescriptorV2;

/** @deprecated Use RiverNetworkDescriptor. */
export type RiverNetworkConfig = RiverNetworkDescriptor;
