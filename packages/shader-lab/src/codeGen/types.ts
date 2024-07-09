import { ShaderContent } from "@galacean/engine-design";

export type IRenderState = [
  /** Constant RenderState. */
  Record<number, boolean | string | number | any>,
  /** Variable RenderState. */
  Record<number, string>
];

export type ITag = ShaderContent["subShaders"][number]["tags"];
