import { Layer } from "@galacean/engine-core";

export interface IVector3 {
  x: number;
  y: number;
  z: number;
}
export interface IVector2 {
  x: number;
  y: number;
}

export interface IVector4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface IColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface IHierarchyFile {
  entities: Array<IEntity>;
}

export type IMethod = {
  params: Array<IBasicType>;
  result?: IInstance;
};

export type IMethodParams = Array<IBasicType> | IMethod;

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
  layer?: Layer;
}

export type IEntity = IBasicEntity | IRefEntity | IStrippedEntity;

export interface IRefEntity extends IBasicEntity {
  assetRefId: string;
  key?: string;
  isClone?: boolean;
  modifications: (IInstance & {
    target: IPrefabModifyTarget;
  })[];
  removedEntities: IPrefabModifyTarget[];
  removedComponents: IPrefabModifyTarget[];
}

export interface IPrefabModifyTarget {
  entityId?: string;
  componentId?: string;
}

export interface IStrippedEntity extends IBasicEntity {
  strippedId: string;
  prefabInstanceId: string;
  prefabSource: { assetId: string; entityId: string };
}

export type IComponent = { id: string; refId?: string } & IClass;

export type IClass = {
  class: string;
  constructParams?: Array<IBasicType>;
} & IInstance;

export interface IInstance {
  methods?: { [methodName: string]: Array<IMethodParams> };
  props?: { [key: string]: IBasicType | IMethodParams };
}

export type IClassType = {
  classType: string;
};

export type IBasicType =
  | string
  | number
  | boolean
  | null
  | undefined
  | IAssetRef
  | IClass
  | IClassType
  | IMethodParams
  | IEntityRef;

export type IAssetRef = { key?: string; refId: string };

export type IEntityRef = { entityId: string };

export type IComponentRef = {
  ownerId: string;
  componentId: string;
};
