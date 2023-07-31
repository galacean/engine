import { Color } from "@galacean/engine-math";

export interface IRenderStateInfo {
  renderStateType: "BlendState" | "DepthState" | "StencilState" | "RasterState";
  properties: [
    Record<number, boolean | string | number | Color>,
    /** Variable RenderState */
    Record<number, string>
  ];
}
