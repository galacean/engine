import type { SubPrimitive } from "../graphic/SubPrimitive";
import type { IPlatformShaderProgram } from "./IPlatformShaderProgram";

export interface IPlatformPrimitive {
  draw(shaderProgram: IPlatformShaderProgram, subPrimitive: SubPrimitive): void;
  destroy(): void;
}
