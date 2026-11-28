import type { RiverDrop } from "./RiverDrop";
import type { WaterConnectionPort } from "../connections/WaterConnection";
/** Versioned, serializable river-network descriptor. */
import type { WaterTerrainSnapshot } from "../terrain/WaterTerrainSnapshot";
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
  RiverPathControlPoint,
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
  /** Legacy standalone-compiler material metadata; WaterBody backends neutralize it and consume WaterLook. */
  material?: Partial<RiverMaterialConfig>;
  /** Optional deterministic ordering hint used when resolving network facts. */
  order?: number;
}

interface RiverNetworkDescriptorBase {
  readonly drops?: readonly RiverDrop[];
  readonly connections?: readonly WaterConnectionPort[];
  id: string;
  /** External bed snapshot. When present, actual depth is max(0, surface Y minus bilinear bed Y). Author depth fields are ignored. */
  terrain?: WaterTerrainSnapshot;
  /**
   * Declares whether Water may resolve node elevations or must only validate an
   * upstream Hydrology Resolver's final profile.
   */
  surfaceAuthority?: "water-resolved" | "external-resolved";
  /** Optional deterministic derivation evidence carried into source hashes. */
  derivation?: Readonly<{
    profileId: string;
    profileVersion: number;
    profileHash: string;
    descriptorSchemaVersion: number;
    hydrologySemanticVersion: string;
    compilerSemanticVersion: string;
    canonicalSourceHash: string;
    bodyOrigin: readonly [x: number, z: number];
  }>;
  nodes: RiverNodeConfig[];
  segments: RiverSegmentConfig[];
  defaults: {
    shape: RiverShapeConfig;
    flow: RiverFlowConfig;
    material: RiverMaterialConfig;
    quality: RiverQualityConfig;
  };
  /** Optional caller resource ceilings. Exceeding one fails without changing path precision. */
  budget?: Partial<RiverNetworkBudgetConfig>;
}

export interface RiverNetworkDescriptorV2 extends RiverNetworkDescriptorBase {
  schemaVersion: RiverNetworkSchemaVersion.V2;
  defaults: RiverNetworkDescriptorBase["defaults"] & {
    surfaceMotion: RiverSurfaceMotionConfig;
  };
  disturbances?: RiverDisturbanceSource[];
}

export type RiverNetworkDescriptor = RiverNetworkDescriptorV2;

export type RiverWaterBodySourceControlPointV2 = Omit<RiverPathControlPoint, "bankFeather">;

export interface RiverWaterBodySourceCurveV2 extends Omit<RiverCurveConfig, "points" | "segmentLength"> {
  readonly points: readonly RiverWaterBodySourceControlPointV2[];
}

export type RiverWaterBodySourceShapeV2 = Pick<RiverShapeConfig, "width" | "depth">;

export interface RiverWaterBodySourceSegmentV2 extends Omit<RiverSegmentConfig, "curve" | "shape" | "material"> {
  readonly curve: RiverWaterBodySourceCurveV2;
  readonly shape?: Partial<RiverWaterBodySourceShapeV2>;
}

/** Active physical WaterBody Source DTO. Quality, budgets and visual bank feather are other model axes. */
export interface RiverWaterBodySourceDescriptorV2
  extends Omit<RiverNetworkDescriptorV2, "segments" | "defaults" | "budget"> {
  readonly segments: readonly RiverWaterBodySourceSegmentV2[];
  readonly defaults: Readonly<{
    shape: RiverWaterBodySourceShapeV2;
    flow: RiverFlowConfig;
    surfaceMotion: RiverSurfaceMotionConfig;
  }>;
}

export interface RiverWaterBodyRepresentationDataV1 {
  readonly schemaVersion: 1;
  readonly kind: "river-surface-representation";
  readonly defaultBankFeather: number;
  /** Compiler precision and explicit caller ceilings, separate from physical source identity. */
  readonly sampling?: Readonly<{
    maxChordError: number;
    maxSegmentCount?: number;
    budget?: Readonly<Partial<RiverNetworkBudgetConfig>>;
    segments: readonly Readonly<{ id: string; segmentLength: number }>[];
  }>;
  readonly segments: readonly Readonly<{
    id: string;
    bankFeather?: number;
    pointBankFeathers: readonly Readonly<{ id: string; bankFeather: number }>[];
  }>[];
}
