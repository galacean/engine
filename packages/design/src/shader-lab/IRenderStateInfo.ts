interface IRenderStatePropertyItemInfo {
  property: string;
  value: any;
  index?: number;
}

export interface IRenderStateInfo {
  renderStateType: "BlendState" | "DepthState" | "StencilState" | "RasterState";
  properties: Array<IRenderStatePropertyItemInfo>;
}
