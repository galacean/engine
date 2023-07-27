interface IRenderStatePropertyItemInfo {
  property: string;
  value: string;
  index?: number;
}

export interface IRenderStateInfo {
  renderStateType: "BlendState" | "DepthState" | "StencilState" | "RasterState";
  properties: Array<IRenderStatePropertyItemInfo>;
}
