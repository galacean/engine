import type { RefItem } from "./CommonSchema";
import type { IColor, IVector2, IVector3 } from "./BasicSchema";

export type IMaterialSchema = {
  name: string;
  shaderData: {
    [key: string]: {
      type: MaterialLoaderType;
      value: IVector3 | IVector2 | IColor | number | RefItem;
    };
  };
  macros: Array<{ name: string; value?: string }>;
} & (
  | {
      /** Shader asset reference. Takes precedence over the optional shader name. */
      shaderRef: RefItem;
      shader?: string;
    }
  | {
      /** Registered shader name, used when no shader asset reference is supplied. */
      shader: string;
      shaderRef?: undefined;
    }
);

export enum MaterialLoaderType {
  Vector2 = "Vector2",
  Vector3 = "Vector3",
  Vector4 = "Vector4",
  Color = "Color",
  Float = "Float",
  Texture = "Texture",
  Boolean = "Boolean",
  Integer = "Integer"
}
