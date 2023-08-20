import { ShaderMacro, ShaderProperty } from "../shader";

/**
 * @internal
 */
export class ParticleShaderMacro {
  static readonly renderModeBillboardMacro = ShaderMacro.getByName("RENDERER_MODE_SPHERE_BILLBOARD");
  static readonly renderModeStretchedBillboardMode = ShaderMacro.getByName("RENDERER_MODE_STRETCHED_BILLBOARD");
  static readonly renderModeHorizontalBillboardMacro = ShaderMacro.getByName("RENDERER_MODE_HORIZONTAL_BILLBOARD");
  static readonly renderModeVerticalBillboardMacro = ShaderMacro.getByName("RENDERER_MODE_VERTICAL_BILLBOARD");
  static readonly renderModeMeshMacro = ShaderMacro.getByName("RENDERER_MODE_MESH");

  
  
  // static readonly SHADERDEFINE_RENDERMODE_MESH = ShaderMacro.getByName("RENDERMODE_MESH");
  // static readonly SHADERDEFINE_SHAPE = ShaderMacro.getByName("SHAPE");
}
