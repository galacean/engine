import { Resource } from "./Resource";

export type ResType =
  | "texture"
  | "technique"
  | "image"
  | "video"
  | "cubemap"
  | "canvastexture"
  | "gltf"
  | "glb"
  | "ktx";
export type HandlerType = "image" | "video";
export type Prop = { [key: string]: any };
export type Engine = any;
export type Handler = {
  [key: string]: any;
  load: (request: Request, props: Prop, callback: HandlerCb) => void;
  open: (resource: Resource) => void | Promise<any>;
  patch?: (resource: Resource, resources: { [key: string]: Array<Resource> }) => void;
};
export type Request = {
  [key: string]: any;
  load: (type: string, props: Prop, cb: any) => void;
};
export type ResArrayCb = (error: string | void, res?: Array<Resource>) => void;
export type ResCb = (error: string | void, res?: Resource) => void;
export type HandlerCb = (error: string | void, data?: Array<Prop> | Prop) => void;
