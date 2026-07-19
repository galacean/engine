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
  /** Stable node id referenced by segment from/to fields. */
  id: string;
  /** Topology role; bifurcation is reserved but currently rejected before compilation. */
  kind: RiverNodeKind;
  /** World-space [x, y, z] position in metres. */
  position: Vector3Tuple;
  /** Junction trim/patch radius in metres, required for junction node kinds. */
  mergeRadius?: number;
  /** Optional authored water-surface elevation in metres. */
  elevation?: number;
}

export interface RiverSegmentConfig {
  /** Stable reach id within the network. */
  id: string;
  /** Upstream node id. */
  from: string;
  /** Downstream node id. */
  to: string;
  /** Ordered centerline from the upstream node position to the downstream node position. */
  curve: RiverCurveConfig;
  /** Per-reach shape overrides applied over network defaults. */
  shape?: Partial<RiverShapeConfig>;
  /** Per-reach flow overrides applied over network defaults. */
  flow?: Partial<RiverFlowConfig>;
  /** Per-reach material overrides applied over network defaults. */
  material?: Partial<RiverMaterialConfig>;
  /** Optional deterministic ordering hint used when resolving network facts. */
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
