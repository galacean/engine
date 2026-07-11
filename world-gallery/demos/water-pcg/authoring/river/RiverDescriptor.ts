/** Versioned, serializable river-network descriptor. */
import { RiverNetworkSchemaVersion, RiverNodeKind } from "./RiverAuthoringEnums";
import type {
  RiverCurveConfig,
  RiverFlowConfig,
  RiverMaterialConfig,
  RiverNetworkBudgetConfig,
  RiverQualityConfig,
  RiverShapeConfig,
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

export interface RiverNetworkDescriptor {
  schemaVersion: RiverNetworkSchemaVersion;
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

/** @deprecated Use RiverNetworkDescriptor. */
export type RiverNetworkConfig = RiverNetworkDescriptor;
