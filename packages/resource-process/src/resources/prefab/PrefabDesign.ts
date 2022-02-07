export interface IPrefabFile {
  entities: Array<IEntity>;
}

export interface IVector3 {
  x: number;
  y: number;
  z: number;
}
export interface IEntity {
  name: string;
  id: string;
  components: Array<IComponent>;
  isActive?: boolean;
  position?: IVector3;
  rotation?: IVector3;
  scale?: IVector3;
  children?: Array<string>;
}

export type IComponent = { id: string } & IClassObject;

export type IMethodParams = Array<IBasicType>;

export type IClassObject = {
  class: string;
  constructor?: IMethodParams;
  methods?: { [methodName: string]: Array<IMethodParams> };
  props?: { [key: string]: IBasicType | IMethodParams };
};

export type IBasicType = string | number | boolean | null | undefined | IReferenceType | IClassObject | IMethodParams;

export type IReferenceType = { objectId: string; path: string };
