import {
  BackgroundMode,
  BackgroundTextureFillMode,
  DiffuseMode,
  FogMode,
  ShadowCascadesMode,
  ShadowResolution
} from "@galacean/engine-core";
import type { HierarchyFile } from "./HierarchySchema";
import type { Vec3Tuple, Vec4Tuple } from "./CommonSchema";

export interface SceneFile extends HierarchyFile {
  scene: {
    name?: string;
    rootEntities: number[];
    physics?: {
      /**
       * Upper-triangular collision exclusions. In row i, bit j disables collision between
       * layers i and j, including self-collision. Only bits j >= i are valid.
       * Rows are unsigned 32-bit integers. Omitted trailing rows and unset bits allow collision.
       */
      disabledCollisionMasks?: number[];
    };
    background: {
      mode: BackgroundMode;
      color: Vec4Tuple;
      texture?: number;
      textureFillMode?: BackgroundTextureFillMode;
      skyMesh?: number;
      skyMaterial?: number;
    };
    ambient?: {
      diffuseMode: DiffuseMode;
      ambientLight?: number;
      diffuseSolidColor?: Vec4Tuple;
      diffuseIntensity: number;
      specularIntensity: number;
    };
    shadow?: {
      castShadows?: boolean;
      enableTransparentShadow?: boolean;
      shadowResolution?: ShadowResolution;
      shadowDistance?: number;
      shadowCascades?: ShadowCascadesMode;
      shadowTwoCascadeSplits?: number;
      shadowFourCascadeSplits?: Vec3Tuple;
      shadowFadeBorder?: number;
    };
    fog?: {
      fogMode?: FogMode;
      fogStart?: number;
      fogEnd?: number;
      fogDensity?: number;
      fogColor?: Vec4Tuple;
    };
    ambientOcclusion?: {
      enabledAmbientOcclusion?: boolean;
      quality?: number;
      intensity?: number;
      radius?: number;
      bias?: number;
      power?: number;
      bilateralThreshold?: number;
      minHorizonAngle?: number;
    };
    /** Not supported in scene yet; presence triggers a warning. */
    postProcess?: unknown;
  };
}
