import {
  BackgroundMode,
  BackgroundTextureFillMode,
  DiffuseMode,
  FogMode,
  ShadowCascadesMode,
  ShadowResolution
} from "@galacean/engine-core";
import type { AssetRef, IHierarchyFile, Vec3Tuple, Vec4Tuple } from "../../../scene-format/types";

export enum SpecularMode {
  Sky = "Sky",
  Custom = "Custom"
}

export interface IScene extends IHierarchyFile {
  name?: string;
  scene: {
    entities: number[];
    background: {
      mode: BackgroundMode;
      color: Vec4Tuple;
      texture?: AssetRef;
      textureFillMode?: BackgroundTextureFillMode;
      skyMesh?: AssetRef;
      skyMaterial?: AssetRef;
    };
    ambient: {
      diffuseMode: DiffuseMode;
      ambientLight?: AssetRef;
      customAmbientLight?: AssetRef;
      customSpecularTexture?: AssetRef;
      diffuseSolidColor?: Vec4Tuple;
      diffuseIntensity: number;
      specularIntensity: number;
      specularMode: SpecularMode;
      bakerResolution: number;
    };
    shadow?: {
      castShadows: boolean;
      enableTransparentShadow: boolean;
      shadowResolution: ShadowResolution;
      shadowDistance: number;
      shadowCascades: ShadowCascadesMode;
      shadowTwoCascadeSplits: number;
      shadowFourCascadeSplits: Vec3Tuple;
      shadowFadeBorder: number;
    };
    fog?: {
      fogMode: FogMode;
      fogStart: number;
      fogEnd: number;
      fogDensity: number;
      fogColor: Vec4Tuple;
    };
    ambientOcclusion?: {
      bias: number;
      bilateralThreshold: number;
      enabledAmbientOcclusion: boolean;
      intensity: number;
      power: number;
      quality: number;
      radius: number;
      minHorizonAngle: number;
    };
  };
}
