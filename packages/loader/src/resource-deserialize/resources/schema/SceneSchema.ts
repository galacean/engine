import { BackgroundMode, DiffuseMode, ShadowCascadesMode, ShadowResolution } from "@galacean/engine-core";
import type { IReferable } from "@galacean/engine-core/types/asset/IReferable";
import type { IColor, IPrefabFile, IVector3 } from "./BasicSchema";

export enum SpecularMode {
  Sky = "Sky",
  Custom = "Custom"
}

export interface IScene extends IPrefabFile {
  scene: {
    background: {
      mode: BackgroundMode;
      color: IColor;
      texture?: IReferable;
      skyMesh?: IReferable;
      skyMaterial?: IReferable;
    };
    ambient: {
      diffuseMode: DiffuseMode;
      ambientLight: IReferable;
      customAmbientLight: IReferable;
      customSpecularTexture: IReferable;
      diffuseSolidColor: IColor;
      diffuseIntensity: number;
      specularIntensity: number;
      specularMode: SpecularMode;
      bakerResolution: number;
    };
    shadow?: {
      castShadows: boolean;
      shadowResolution: ShadowResolution;
      shadowDistance: number;
      shadowCascades: ShadowCascadesMode;
      shadowTwoCascadeSplits: number;
      shadowFourCascadeSplits: IVector3;
    };
  };
  files: Array<{ id: string; type: string; virtualPath: string; path: string }>;
}
