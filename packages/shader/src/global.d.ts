declare module "*.glsl" {
  const value: string;
  export default value;
}

declare module "*.shader" {
  const value: string;
  export default value;
}

declare module "*.shaderc" {
  import { IPrecompiledShader } from "@galacean/engine-design";
  const value: IPrecompiledShader;
  export default value;
}
