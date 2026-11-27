declare module "*.glsl" {
  const value: string;
  export default value;
}

declare module "*.shader" {
  const value: string;
  export default value;
}

declare module "*.shaderc" {
  import { IPrecompiledComputeShader, IPrecompiledShader } from "@galacean/engine-design";
  const value: IPrecompiledShader | IPrecompiledComputeShader;
  export default value;
}
