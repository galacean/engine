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

export enum SpecularMode {
  Sky = 0,
  Custom = 1
}

export interface SceneFile extends HierarchyFile {
  scene: {
    name?: string;
    rootEntities: number[];
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
      customAmbientLight?: number;
      diffuseSolidColor?: Vec4Tuple;
      diffuseIntensity: number;
      specularIntensity: number;
      specularMode: SpecularMode;
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
