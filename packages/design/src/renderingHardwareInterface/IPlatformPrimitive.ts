import { IPlatformShaderProgram } from "./IPlatformShaderProgram";

export interface IPlatformPrimitive {
  draw(shaderProgram: IPlatformShaderProgram, subPrimitive: any): void;
  destroy(): void;
}
