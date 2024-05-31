export const EngineType = {
  RenderQueueType: {},
  _RenderStateElementKey: {}
};
export type IEngineType = Record<string, Record<string, any>>;

export type IEngineFunction = new (...args: number[]) => any;
export const EngineFunctions: Record<string, IEngineFunction> = {};
