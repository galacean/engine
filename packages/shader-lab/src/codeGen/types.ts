import { ShaderStruct } from "@galacean/engine-design";

export type IRenderState = [
  /** Constant RenderState. */
  Record<number, boolean | string | number | any>,
  /** Variable RenderState. */
  Record<number, string>
];

export type ITag = ShaderStruct["subShaders"][number]["tags"];

export interface IPassCodeGenResult {
  vertexSource: string;
  fragmentSource: string;
}
