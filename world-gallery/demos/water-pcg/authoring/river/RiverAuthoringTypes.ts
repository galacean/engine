/** Engine-independent river reach authoring values. */
import {
  RiverDirectionMode,
  RiverDisturbanceKind,
  RiverMaterialPreset,
  RiverPathMode,
  RiverQualityLevel,
  RiverValidationMode
} from "./RiverAuthoringEnums";
import type { RiverDiagnostic } from "../../compiler/shared/diagnostics";

/** Water-authoring position/vector in Galacean's right-handed, Y-up world space; distances use metres. */
export type Vector3Tuple = [number, number, number];

export interface RiverPathControlPoint {
  /** Stable authoring id within this curve. */
  id: string;
  /** World-space [x, y, z] position in metres. */
  position: Vector3Tuple;
  /** Optional incoming Bezier handle offset in metres. */
  in?: Vector3Tuple;
  /** Optional outgoing Bezier handle offset in metres. */
  out?: Vector3Tuple;
  /** Optional local surface width override in metres. */
  width?: number;
  /** Optional local authored water depth override in metres. */
  depth?: number;
  /** Optional local downstream flow speed override in metres per second. */
  flowSpeed?: number;
  /** Optional visual bank feather outside the water half-width, in metres. */
  bankFeather?: number;
}

export interface RiverCurveConfig {
  /** Ordered topology anchors from the upstream node to the downstream node. */
  points: RiverPathControlPoint[];
  /** Interpolation algorithm used between control points. */
  mode: RiverPathMode;
  /** Target longitudinal sample spacing in metres before quality and budget constraints. */
  segmentLength: number;
}

export type RiverPathConfig = RiverCurveConfig;

export interface RiverShapeConfig {
  /** Full water-surface width in metres. */
  width: number;
  /** Authored centerline water depth in metres. */
  depth: number;
  /** Visual bank feather width in metres. */
  bankFeather: number;
}

export interface RiverFlowConfig {
  /** Downstream flow speed in metres per second. */
  speed: number;
  /** Rule used to resolve downstream direction from the authored curve. */
  directionMode: RiverDirectionMode;
}

export interface RiverMaterialConfig {
  /** Semantic style preset used for defaults and deterministic V1 surface motion. */
  preset: RiverMaterialPreset;
  /** Water base color encoded as #RRGGBB. */
  baseColor: string;
  /** Foam color encoded as #RRGGBB. */
  foamColor: string;
  /** Normalized foam amount. */
  foamIntensity: number;
  /** Normalized optical clarity, where 0 is opaque and 1 is clear. */
  clarity: number;
}

/** Network-wide dynamic surface controls introduced by RiverNetworkDescriptor V2. */
export interface RiverSurfaceMotionConfig {
  /** Deterministic integer noise seed. */
  seed: number;
  /** Maximum vertical macro displacement in metres. */
  displacementAmplitude: number;
  /** Macro-noise feature length in metres. */
  displacementLengthScale: number;
  /** Distance in metres over which macro displacement fades at each bank. */
  shoreDampingWidth: number;
  /** Dimensionless domain-warp and ridge turbulence amount. */
  turbulence: number;
  /** Dimensionless crest-foam response. */
  crestIntensity: number;
  /** Dimensionless micro-normal strength. */
  microNormalStrength: number;
}

/** First production disturbance source: a deterministic static obstacle. */
export interface RiverDisturbanceSource {
  /** Stable disturbance id within the network. */
  id: string;
  /** Supported deterministic disturbance model. */
  kind: RiverDisturbanceKind;
  /** World-space [x, y, z] center in metres. */
  position: Vector3Tuple;
  /** Influence radius in metres. */
  radius: number;
  /** Dimensionless flow-deflection and foam strength. */
  strength: number;
}

export interface RiverQualityConfig {
  geometry: {
    level: RiverQualityLevel;
    maxSegmentCount: number;
    maxChordError: number;
  };
  material: { level: RiverQualityLevel };
  maps: { level: RiverQualityLevel };
  query: { level: RiverQualityLevel };
}

export interface RiverNetworkBudgetConfig {
  maxSegmentCount: number;
  maxSampleCount: number;
  maxVertexCount: number;
  maxChunkCount: number;
  maxMapPixelCount: number;
}

/** Fully resolved per-reach authoring data. Debug state is deliberately excluded. */
export interface RiverAuthoringConfig {
  id: string;
  path: RiverPathConfig;
  shape: RiverShapeConfig;
  flow: RiverFlowConfig;
  material: RiverMaterialConfig;
  quality: RiverQualityConfig;
}

export interface RiverValidationOptions {
  mode?: RiverValidationMode;
}

export interface RiverValidationResult<T> {
  value?: T;
  diagnostics: RiverDiagnostic[];
  valid: boolean;
}
