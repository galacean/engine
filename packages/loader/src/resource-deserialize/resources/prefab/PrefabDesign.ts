export interface IPrefabFile {
  entities: Array<IEntity>;
}

export interface IScene extends IPrefabFile {}

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

export type IBasicType = string | number | boolean | null | undefined | IReferenceType | IClassObject | IMethodParams;

export type IReferenceType = { key?: string; refId: string };
