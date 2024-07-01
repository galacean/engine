export type IRenderState = [
  /** Constant RenderState. */
  Record<number, boolean | string | number | any>,
  /** Variable RenderState. */
  Record<number, string>
];

export type ITag = Record<string, number | string | boolean>;

export interface IPassCodeGenResult {
  vertexSource: string;
  fragmentSource: string;
}
