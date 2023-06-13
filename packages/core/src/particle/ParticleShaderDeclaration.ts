import { ShaderMacro, ShaderProperty } from "../shader";

/**
 * @internal
 */
export class ParticleShaderDeclaration {
  /**@internal */
  static RENDERMODE_BILLBOARD = ShaderMacro.getByName("SPHERE_BILLBOARD");
  /**@internal */
  static RENDERMODE_STRETCHED_BILLBOARD = ShaderMacro.getByName("STRETCHED_BILLBOARD");
  /**@internal */
  static RENDERMODE_HORIZONTAL_BILLBOARD = ShaderMacro.getByName("HORIZONTAL_BILLBOARD");
  /**@internal */
  static RENDERMODE_VERTICAL_BILLBOARD = ShaderMacro.getByName("VERTICAL_BILLBOARD");

  /**@internal */
  static COLOR_KEY_COUNT_8 = ShaderMacro.getByName("COLOR_KEY_COUNT_8");
  /**@internal */
  static COLOR_OVER_LIFETIME = ShaderMacro.getByName("COLOR_OVER_LIFETIME");
  /**@internal */
  static RANDOM_COLOR_OVER_LIFETIME = ShaderMacro.getByName("RANDOM_COLOR_OVER_LIFETIME");
  /**@internal */
  static VELOCITY_OVER_LIFETIME_CONSTANT = ShaderMacro.getByName("VELOCITY_OVER_LIFETIME_CONSTANT");
  /**@internal */
  static VELOCITY_OVER_LIFETIME_CURVE = ShaderMacro.getByName("VELOCITY_OVER_LIFETIME_CURVE");
  /**@internal */
  static VELOCITY_OVER_LIFETIME_RANDOM_CONSTANT = ShaderMacro.getByName("VELOCITY_OVER_LIFETIME_RANDOM_CONSTANT");
  /**@internal */
  static VELOCITY_OVER_LIFETIME_RANDOM_CURVE = ShaderMacro.getByName("VELOCITY_OVER_LIFETIME_RANDOM_CURVE");

  /**@internal */
  static TEXTURE_SHEET_ANIMATION_CURVE = ShaderMacro.getByName("TEXTURE_SHEET_ANIMATION_CURVE");
  /**@internal */
  static TEXTURE_SHEET_ANIMATION_RANDOM_CURVE = ShaderMacro.getByName("TEXTURE_SHEET_ANIMATION_RANDOM_CURVE");
  /**@internal */
  static ROTATION_OVER_LIFETIME = ShaderMacro.getByName("ROTATION_OVER_LIFETIME");
  /**@internal */
  static ROTATION_OVER_LIFETIME_SEPARATE = ShaderMacro.getByName("ROTATION_OVER_LIFETIME_SEPARATE");
  /**@internal */
  static ROTATION_OVER_LIFETIME_CONSTANT = ShaderMacro.getByName("ROTATION_OVER_LIFETIME_CONSTANT");
  /**@internal */
  static ROTATION_OVER_LIFETIME_CURVE = ShaderMacro.getByName("ROTATION_OVER_LIFETIME_CURVE");
  /**@internal */
  static ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS = ShaderMacro.getByName("ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS");
  /**@internal */
  static ROTATION_OVER_LIFETIME_RANDOM_CURVES = ShaderMacro.getByName("ROTATION_OVER_LIFETIME_RANDOM_CURVES");
  /**@internal */
  static SIZE_OVER_LIFETIME_CURVE = ShaderMacro.getByName("SIZE_OVER_LIFETIME_CURVE");
  /**@internal */
  static SIZE_OVER_LIFETIME_CURVE_SEPARATE = ShaderMacro.getByName("SIZE_OVER_LIFETIME_CURVE_SEPARATE");
  /**@internal */
  static SIZE_OVER_LIFETIME_RANDOM_CURVES = ShaderMacro.getByName("SIZE_OVER_LIFETIME_RANDOM_CURVES");
  /**@internal */
  static SIZE_OVER_LIFETIME_RANDOM_CURVES_SEPARATE = ShaderMacro.getByName("SIZE_OVER_LIFETIME_RANDOM_CURVES_SEPARATE");
  /**@internal */
  static RENDERMODE_MESH = ShaderMacro.getByName("MESH");
  /**@internal */
  static SHAPE = ShaderMacro.getByName("SHAPE");

  //Base
  /**@internal */
  static WORLD_POSITION = ShaderProperty.getByName("u_WorldPosition");
  /**@internal */
  static WORLD_ROTATION = ShaderProperty.getByName("u_WorldRotation");
  /**@internal */
  static POSITION_SCALE = ShaderProperty.getByName("u_PositionScale");
  /**@internal */
  static SIZE_SCALE = ShaderProperty.getByName("u_SizeScale");
  /**@internal */
  static SCALING_MODE = ShaderProperty.getByName("u_ScalingMode");
  /**@internal */
  static GRAVITY = ShaderProperty.getByName("u_Gravity");
  /**@internal */
  static THREED_START_ROTATION = ShaderProperty.getByName("u_ThreeDStartRotation");
  /**@internal */
  static STRETCHED_BILLBOARD_LENGTH_SCALE = ShaderProperty.getByName("u_StretchedBillboardLengthScale");
  /**@internal */
  static STRETCHED_BILLBOARD_SPEED_SCALE = ShaderProperty.getByName("u_StretchedBillboardSpeedScale");
  /**@internal */
  static SIMULATION_SPACE = ShaderProperty.getByName("u_SimulationSpace");
  /**@internal */
  static CURRENT_TIME = ShaderProperty.getByName("u_CurrentTime");
  /**@internal */
  static DRAG = ShaderProperty.getByName("u_DragConstant");

  //VelocityOverLifetime
  /**@internal */
  static VOL_VELOCITY_CONST = ShaderProperty.getByName("u_VOLVelocityConst");
  /**@internal */
  static VOL_VELOCITY_GRADIENTX = ShaderProperty.getByName("u_VOLVelocityGradientX");
  /**@internal */
  static VOL_VELOCITY_GRADIENTY = ShaderProperty.getByName("u_VOLVelocityGradientY");
  /**@internal */
  static VOL_VELOCITY_GRADIENTZ = ShaderProperty.getByName("u_VOLVelocityGradientZ");
  /**@internal */
  static VOL_VELOCITY_CONST_MAX = ShaderProperty.getByName("u_VOLVelocityConstMax");
  /**@internal */
  static VOL_VELOCITY_GRADIENTX_MAX = ShaderProperty.getByName("u_VOLVelocityGradientMaxX");
  /**@internal */
  static VOL_VELOCITY_GRADIENTY_MAX = ShaderProperty.getByName("u_VOLVelocityGradientMaxY");
  /**@internal */
  static VOL_VELOCITY_GRADIENTZ_MAX = ShaderProperty.getByName("u_VOLVelocityGradientMaxZ");
  /**@internal */
  static VOL_SPACE_TYPE = ShaderProperty.getByName("u_VOLSpaceType");

  //ColorOverLifetime
  /**@internal */
  static COLOR_OVER_LIFE_GRADIENT_ALPHAS = ShaderProperty.getByName("u_ColorOverLifeGradientAlphas");
  /**@internal */
  static COLOR_OVER_LIFE_GRADIENT_COLORS = ShaderProperty.getByName("u_ColorOverLifeGradientColors");
  /**@internal */
  static COLOR_OVER_LIFE_GRADIENT_RANGES = ShaderProperty.getByName("u_ColorOverLifeGradientRanges");
  /**@internal */
  static MAX_COLOR_OVER_LIFE_GRADIENT_ALPHAS = ShaderProperty.getByName("u_MaxColorOverLifeGradientAlphas");
  /**@internal */
  static MAX_COLOR_OVER_LIFE_GRADIENT_COLORS = ShaderProperty.getByName("u_MaxColorOverLifeGradientColors");
  /**@internal */
  static MAX_COLOR_OVER_LIFE_GRADIENT_RANGES = ShaderProperty.getByName("u_MaxColorOverLifeGradientRanges");

  //SizeOverLifetime
  /**@internal */
  static SOL_SIZE_GRADIENT = ShaderProperty.getByName("u_SOLSizeGradient");
  /**@internal */
  static SOL_SIZE_GRADIENTX = ShaderProperty.getByName("u_SOLSizeGradientX");
  /**@internal */
  static SOL_SIZE_GRADIENTY = ShaderProperty.getByName("u_SOLSizeGradientY");
  /**@internal */
  static SOL_SIZE_GRADIENTZ = ShaderProperty.getByName("u_SOLSizeGradientZ");
  /**@internal */
  static SOL_SIZE_GRADIENT_Max = ShaderProperty.getByName("u_SOLSizeGradientMax");
  /**@internal */
  static SOL_SIZE_GRADIENTX_MAX = ShaderProperty.getByName("u_SOLSizeGradientMaxX");
  /**@internal */
  static SOL_SIZE_GRADIENTY_MAX = ShaderProperty.getByName("u_SOLSizeGradientMaxY");
  /**@internal */
  static SOL_SIZE_GRADIENTZ_MAX = ShaderProperty.getByName("u_SOLSizeGradientMaxZ");

  //RotationOverLifetime
  /**@internal */
  static ROL_ANGULAR_VELOCITY_CONST = ShaderProperty.getByName("u_ROLAngularVelocityConst");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_CONST_SEPARATE = ShaderProperty.getByName("u_ROLAngularVelocityConstSeparate");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENT = ShaderProperty.getByName("u_ROLAngularVelocityGradient");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTX = ShaderProperty.getByName("u_ROLAngularVelocityGradientX");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTY = ShaderProperty.getByName("u_ROLAngularVelocityGradientY");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTZ = ShaderProperty.getByName("u_ROLAngularVelocityGradientZ");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_CONST_MAX = ShaderProperty.getByName("u_ROLAngularVelocityConstMax");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_CONST_MAX_SEPARATE = ShaderProperty.getByName("u_ROLAngularVelocityConstMaxSeparate");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENT_MAX = ShaderProperty.getByName("u_ROLAngularVelocityGradientMax");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTX_MAX = ShaderProperty.getByName("u_ROLAngularVelocityGradientMaxX");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTY_MAX = ShaderProperty.getByName("u_ROLAngularVelocityGradientMaxY");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTZ_MAX = ShaderProperty.getByName("u_ROLAngularVelocityGradientMaxZ");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTW_MAX = ShaderProperty.getByName("u_ROLAngularVelocityGradientMaxW");

  //TextureSheetAnimation
  /**@internal */
  static TEXTURE_SHEET_ANIMATION_CYCLES = ShaderProperty.getByName("u_TSACycles");
  /**@internal */
  static TEXTURE_SHEET_ANIMATION_SUB_UV_LENGTH = ShaderProperty.getByName("u_TSASubUVLength");
  /**@internal */
  static TEXTURE_SHEET_ANIMATION_GRADIENT_UVS = ShaderProperty.getByName("u_TSAGradientUVs");
  /**@internal */
  static TEXTURE_SHEET_ANIMATION_GRADIENT_MAX_UVS = ShaderProperty.getByName("u_TSAMaxGradientUVs");
}
