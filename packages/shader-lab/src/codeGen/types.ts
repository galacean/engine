import { IShaderSource } from "@galacean/engine-design";

export type IRenderState = [
  /** Constant RenderState. */
  Record<number, boolean | string | number | any>,
  /** Variable RenderState. */
  Record<number, string>
];

export type ITag = IShaderSource["subShaders"][number]["tags"];

export type ICodeSegment = { text: string; index: number };
