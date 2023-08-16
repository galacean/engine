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


  // static readonly SHADERDEFINE_COLORKEYCOUNT_8 = ShaderMacro.getByName("COLORKEYCOUNT_8");
  // static readonly SHADERDEFINE_COLOROVERLIFETIME = ShaderMacro.getByName("COLOROVERLIFETIME");
  // static readonly SHADERDEFINE_RANDOMCOLOROVERLIFETIME = ShaderMacro.getByName("RANDOMCOLOROVERLIFETIME");
  // static readonly SHADERDEFINE_VELOCITYOVERLIFETIMECONSTANT = ShaderMacro.getByName("VELOCITYOVERLIFETIMECONSTANT");
  // static readonly SHADERDEFINE_VELOCITYOVERLIFETIMECURVE = ShaderMacro.getByName("VELOCITYOVERLIFETIMECURVE");
  // static readonly SHADERDEFINE_VELOCITYOVERLIFETIMERANDOMCONSTANT = ShaderMacro.getByName(
  //   "VELOCITYOVERLIFETIMERANDOMCONSTANT"
  // );
  // static readonly SHADERDEFINE_VELOCITYOVERLIFETIMERANDOMCURVE = ShaderMacro.getByName(
  //   "VELOCITYOVERLIFETIMERANDOMCURVE"
  // );

  // static readonly SHADERDEFINE_ROTATIONOVERLIFETIME = ShaderMacro.getByName("ROTATIONOVERLIFETIME");
  // static readonly SHADERDEFINE_ROTATIONOVERLIFETIMESEPERATE = ShaderMacro.getByName("ROTATIONOVERLIFETIMESEPERATE");
  // static readonly SHADERDEFINE_ROTATIONOVERLIFETIMECONSTANT = ShaderMacro.getByName("ROTATIONOVERLIFETIMECONSTANT");
  // static readonly SHADERDEFINE_ROTATIONOVERLIFETIMECURVE = ShaderMacro.getByName("ROTATIONOVERLIFETIMECURVE");
  // static readonly SHADERDEFINE_ROTATIONOVERLIFETIMERANDOMCONSTANTS = ShaderMacro.getByName(
  //   "ROTATIONOVERLIFETIMERANDOMCONSTANTS"
  // );
  // static readonly SHADERDEFINE_ROTATIONOVERLIFETIMERANDOMCURVES = ShaderMacro.getByName(
  //   "ROTATIONOVERLIFETIMERANDOMCURVES"
  // );
  
  // static readonly SHADERDEFINE_RENDERMODE_MESH = ShaderMacro.getByName("RENDERMODE_MESH");
  // static readonly SHADERDEFINE_SHAPE = ShaderMacro.getByName("SHAPE");
}
