export const EngineType: Record<string, Record<string, any>> = {
  RenderQueueType: {},
  RenderStateElementKey: {}
};
export type IEngineType = Record<keyof typeof EngineType, Record<string, any>>;
