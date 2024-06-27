import { Color } from "@galacean/engine-math";

export interface IShaderInfo {
  vertexSource: string;
  fragmentSource: string;
  tags?: Record<string, number | string | boolean>;
  renderStates: [
    /** Constant RenderState. */
    Record<number, boolean | string | number | Color>,
    /** Variable RenderState. */
    Record<number, string>
  ];
}
