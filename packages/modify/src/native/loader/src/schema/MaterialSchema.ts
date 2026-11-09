import type { ScreenSpaceReflectionMaterialSettings } from "@galacean/engine-core";
import type { RefItem } from "./CommonSchema";
import type { IColor, IVector2, IVector3, IVector4 } from "./BasicSchema";

interface MaterialData {
  contributeScreenSpaceReflection?: boolean;
  screenSpaceReflection?: ScreenSpaceReflectionMaterialSettings | null;
  name: string;
  shaderData: Record<string, MaterialShaderProperty>;
  macros: Array<{ name: string; value?: string }>;
}

interface MaterialWithShaderName extends MaterialData {
  /** Registered shader name used to resolve the material's shader. */
  shader: string;
  shaderRef?: undefined;
}

interface MaterialWithShaderReference extends MaterialData {
  /** Shader asset reference that determines the material's shader. */
  shaderRef: RefItem;
  /** Optional shader name retained alongside the explicit reference. */
  shader?: string;
}

/** Serialized material with a shader name or an explicit shader asset reference. */
export type IMaterialSchema = MaterialWithShaderName | MaterialWithShaderReference;

/** Serialized shader property whose type determines the value representation. */
export type MaterialShaderProperty =
  | { type: MaterialLoaderType.Vector2; value: IVector2 }
  | { type: MaterialLoaderType.Vector3; value: IVector3 }
  | { type: MaterialLoaderType.Vector4; value: IVector4 }
  | { type: MaterialLoaderType.Color; value: IColor }
  | { type: MaterialLoaderType.Float | MaterialLoaderType.Integer; value: number }
  | { type: MaterialLoaderType.Boolean; value: boolean }
  | { type: MaterialLoaderType.Texture; value: RefItem };

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
