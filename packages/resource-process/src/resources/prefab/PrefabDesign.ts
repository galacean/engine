export interface IPrefabFile {
  entities: Array<IEntity>;
}

export interface IEntity {
  name: string;
  id: string;
  components: Array<IComponent>;
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
