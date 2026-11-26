import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { ShaderPass } from "../shader/ShaderPass";
import { ShaderProgram } from "../shader/ShaderProgram";
import { RenderElement } from "./RenderElement";

/**
 * Optional per-camera hook that overrides `ShaderProgram` resolution inside `RenderQueue.render`.
 * @internal
 */
export interface IShaderProgramResolver {
  resolveProgram(
    shaderPass: ShaderPass,
    compileMacros: ShaderMacroCollection,
    pipelineStageTagValue: string,
    element: RenderElement
  ): ShaderProgram;
}
