import {
  BackgroundMode,
  BackgroundTextureFillMode,
  BloomDownScaleMode,
  DiffuseMode,
  FogMode,
  ShadowCascadesMode,
  ShadowResolution,
  TonemappingMode
} from "@galacean/engine-core";
import type { IAssetRef, IColor, IHierarchyFile, IVector3 } from "./BasicSchema";

export enum SpecularMode {
  Sky = "Sky",
  Custom = "Custom"
}

export interface IScene extends IHierarchyFile {
  name?: string;
  scene: {
    background: {
      mode: BackgroundMode;
      color: IColor;
      texture?: IAssetRef;
      textureFillMode?: BackgroundTextureFillMode;
      skyMesh?: IAssetRef;
      skyMaterial?: IAssetRef;
    };
    ambient: {
      diffuseMode: DiffuseMode;
      ambientLight: IAssetRef;
      customAmbientLight: IAssetRef;
      customSpecularTexture: IAssetRef;
      diffuseSolidColor: IColor;
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
      shadowFourCascadeSplits: IVector3;
      shadowFadeBorder: number;
    };
    fog?: {
      fogMode: FogMode;
      fogStart: number;
      fogEnd: number;
      fogDensity: number;
      fogColor: IColor;
    };
    postProcess?: {
      isActive: boolean;
      bloom: {
        enabled: boolean;
        downScale: BloomDownScaleMode;
        threshold: number;
        scatter: number;
        intensity: number;
        tint: IColor;
        dirtTexture: IAssetRef;
        dirtIntensity: number;
      };
      tonemapping: {
        enabled: boolean;
        mode: TonemappingMode;
      };
    };
  };
  files: Array<{ id: string; type: string; virtualPath: string; path: string }>;
}
