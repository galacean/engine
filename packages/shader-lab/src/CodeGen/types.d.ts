type IRenderState = [
  /** Constant RenderState. */
  Record<number, boolean | string | number | Color>,
  /** Variable RenderState. */
  Record<number, string>
];

type ITag = Record<string, number | string | boolean>;

interface IPassCodeGenResult {
  name: string;
  vertexSource: string;
  fragmentSource: string;
  renderStates: IRenderState;
  tags?: ITag;
}

interface ISubShaderCodeGenResult {
  name: string;
  passes: (IPassCodeGenResult | string)[];
  renderStates?: IRenderState;
  tags?: ITag;
}

interface IShaderCodeGenResult {
  name: string;
  subShaders: ISubShaderCodeGenResult[];
  renderStates?: IRenderState;
}
