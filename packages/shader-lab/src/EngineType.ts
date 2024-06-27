export type IEngineType = Record<string, Record<string, any>>;

export type IEngineFunction = new (...args: number[]) => any;
