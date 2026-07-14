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

export type Vector3Tuple = [number, number, number];

export interface RiverPathControlPoint {
  id: string;
  position: Vector3Tuple;
  in?: Vector3Tuple;
  out?: Vector3Tuple;
  width?: number;
  depth?: number;
  flowSpeed?: number;
  bankFeather?: number;
}

export interface RiverCurveConfig {
  points: RiverPathControlPoint[];
  mode: RiverPathMode;
  segmentLength: number;
}

export type RiverPathConfig = RiverCurveConfig;

export interface RiverShapeConfig {
  width: number;
  depth: number;
  bankFeather: number;
}

export interface RiverFlowConfig {
  speed: number;
  directionMode: RiverDirectionMode;
}

export interface RiverMaterialConfig {
  preset: RiverMaterialPreset;
  baseColor: string;
  foamColor: string;
  foamIntensity: number;
  clarity: number;
}

/** Network-wide dynamic surface controls introduced by RiverNetworkDescriptor V2. */
export interface RiverSurfaceMotionConfig {
  seed: number;
  displacementAmplitude: number;
  displacementLengthScale: number;
  shoreDampingWidth: number;
  turbulence: number;
  crestIntensity: number;
  microNormalStrength: number;
}

/** First production disturbance source: a deterministic static obstacle. */
export interface RiverDisturbanceSource {
  id: string;
  kind: RiverDisturbanceKind;
  position: Vector3Tuple;
  radius: number;
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
