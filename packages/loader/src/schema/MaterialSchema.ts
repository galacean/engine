import type { RefItem } from "./CommonSchema";
import type { IColor, IVector2, IVector3 } from "./BasicSchema";

export interface IMaterialSchema {
  name: string;
  shader: string;
  shaderData: {
    [key: string]: {
      type: MaterialLoaderType;
      value: IVector3 | IVector2 | IColor | number | RefItem;
    };
  };
  macros: Array<{ name: string; value?: string }>;
  shaderRef: RefItem;
}

export const MaterialLoaderType = {
  Vector2: "Vector2",
  Vector3: "Vector3",
  Vector4: "Vector4",
  Color: "Color",
  Float: "Float",
  Texture: "Texture",
  Boolean: "Boolean",
  Integer: "Integer"
} as const;

export type MaterialLoaderType = (typeof MaterialLoaderType)[keyof typeof MaterialLoaderType];
