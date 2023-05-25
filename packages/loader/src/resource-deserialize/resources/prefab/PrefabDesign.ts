import type {
  BackgroundMode,
  DiffuseMode,
  RenderState,
  ShadowCascadesMode,
  ShadowResolution
} from "@galacean/engine-core";
import { IReferable } from "@galacean/engine-core/types/asset/IReferable";
import { IColor } from "../mesh/IModelMesh";

export interface IPrefabFile {
  entities: Array<IEntity>;
}

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
    };
  };
  files: Array<{ id: string; type: string; virtualPath: string; path: string }>;
}

export interface IVector3 {
  x: number;
  y: number;
  z: number;
}
export interface IBasicEntity {
  name?: string;
  id?: string;
  components?: Array<IComponent>;
  isActive?: boolean;
  position?: IVector3;
  rotation?: IVector3;
  scale?: IVector3;
  children?: Array<string>;
  parent?: string;
}

export type IEntity = IBasicEntity | IRefEntity;

export interface IRefEntity extends IBasicEntity {
  assetRefId: string;
  key?: string;
  isClone?: boolean;
}

export type IComponent = { id: string; refId?: string } & IClassObject;

export type IMethodParams = Array<IBasicType>;

export type IClassObject = {
  class: string;
  constructParams?: IMethodParams;
  methods?: { [methodName: string]: Array<IMethodParams> };
  props?: { [key: string]: IBasicType | IMethodParams };
};

export type IBasicType = string | number | boolean | null | undefined | IAssetRef | IClassObject | IMethodParams;

export type IAssetRef = { key?: string; refId: string };

export interface IPrefabMaterial {
  name: string;
  shader: string;
  shaderData: {
    [key: string]: {
      type: "Vector2" | "Vector3" | "Vector4" | "Color" | "Float" | "Texture";
      value: any;
    };
  };
  macros: Array<{ name: string; value?: string }>;
  renderState: RenderState;
}
