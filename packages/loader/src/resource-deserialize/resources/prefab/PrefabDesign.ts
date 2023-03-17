import type { BackgroundMode } from "@oasis-engine/core";
import { IRefObject } from "@oasis-engine/core/types/asset/IRefObject";
import { IColor } from "../mesh/IModelMesh";

export interface IPrefabFile {
  entities: Array<IEntity>;
}

export interface IScene extends IPrefabFile {
  scene: {
    background: {
      mode: BackgroundMode;
      color: IColor;
      texture?: IRefObject;
      sky?: IRefObject;
    };
    ambient: {
      ambientLight: IRefObject;
      diffuseSolidColor: IColor;
      diffuseIntensity: number;
      specularIntensity: number;
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

export type IBasicType = string | number | boolean | null | undefined | IAssetRef | IClassObject | IMethodParams | IEntityRef;

export type IAssetRef = { key?: string; refId: string };

export type IEntityRef = { entityId: string };
