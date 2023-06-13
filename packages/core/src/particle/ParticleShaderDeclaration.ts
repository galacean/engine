import { Shader } from "../shader";

/**
 * @internal
 */
export class ParticleShaderDeclaration {
  /**@internal */
  static RENDERMODE_BILLBOARD = Shader.getMacroByName("SPHERE_BILLBOARD");
  /**@internal */
  static RENDERMODE_STRETCHED_BILLBOARD = Shader.getMacroByName("STRETCHED_BILLBOARD");
  /**@internal */
  static RENDERMODE_HORIZONTAL_BILLBOARD = Shader.getMacroByName("HORIZONTAL_BILLBOARD");
  /**@internal */
  static RENDERMODE_VERTICAL_BILLBOARD = Shader.getMacroByName("VERTICAL_BILLBOARD");

  /**@internal */
  static COLOR_KEY_COUNT_8 = Shader.getMacroByName("COLOR_KEY_COUNT_8");
  /**@internal */
  static COLOR_OVER_LIFETIME = Shader.getMacroByName("COLOR_OVER_LIFETIME");
  /**@internal */
  static RANDOM_COLOR_OVER_LIFETIME = Shader.getMacroByName("RANDOM_COLOR_OVER_LIFETIME");
  /**@internal */
  static VELOCITY_OVER_LIFETIME_CONSTANT = Shader.getMacroByName("VELOCITY_OVER_LIFETIME_CONSTANT");
  /**@internal */
  static VELOCITY_OVER_LIFETIME_CURVE = Shader.getMacroByName("VELOCITY_OVER_LIFETIME_CURVE");
  /**@internal */
  static VELOCITY_OVER_LIFETIME_RANDOM_CONSTANT = Shader.getMacroByName("VELOCITY_OVER_LIFETIME_RANDOM_CONSTANT");
  /**@internal */
  static VELOCITY_OVER_LIFETIME_RANDOM_CURVE = Shader.getMacroByName("VELOCITY_OVER_LIFETIME_RANDOM_CURVE");

  /**@internal */
  static TEXTURE_SHEET_ANIMATION_CURVE = Shader.getMacroByName("TEXTURE_SHEET_ANIMATION_CURVE");
  /**@internal */
  static TEXTURE_SHEET_ANIMATION_RANDOM_CURVE = Shader.getMacroByName("TEXTURE_SHEET_ANIMATION_RANDOM_CURVE");
  /**@internal */
  static ROTATION_OVER_LIFETIME = Shader.getMacroByName("ROTATION_OVER_LIFETIME");
  /**@internal */
  static ROTATION_OVER_LIFETIME_SEPARATE = Shader.getMacroByName("ROTATION_OVER_LIFETIME_SEPARATE");
  /**@internal */
  static ROTATION_OVER_LIFETIME_CONSTANT = Shader.getMacroByName("ROTATION_OVER_LIFETIME_CONSTANT");
  /**@internal */
  static ROTATION_OVER_LIFETIME_CURVE = Shader.getMacroByName("ROTATION_OVER_LIFETIME_CURVE");
  /**@internal */
  static ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS = Shader.getMacroByName("ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS");
  /**@internal */
  static ROTATION_OVER_LIFETIME_RANDOM_CURVES = Shader.getMacroByName("ROTATION_OVER_LIFETIME_RANDOM_CURVES");
  /**@internal */
  static SIZE_OVER_LIFETIME_CURVE = Shader.getMacroByName("SIZE_OVER_LIFETIME_CURVE");
  /**@internal */
  static SIZE_OVER_LIFETIME_CURVE_SEPARATE = Shader.getMacroByName("SIZE_OVER_LIFETIME_CURVE_SEPARATE");
  /**@internal */
  static SIZE_OVER_LIFETIME_RANDOM_CURVES = Shader.getMacroByName("SIZE_OVER_LIFETIME_RANDOM_CURVES");
  /**@internal */
  static SIZE_OVER_LIFETIME_RANDOM_CURVES_SEPARATE = Shader.getMacroByName("SIZE_OVER_LIFETIME_RANDOM_CURVES_SEPARATE");
  /**@internal */
  static RENDERMODE_MESH = Shader.getMacroByName("MESH");
  /**@internal */
  static SHAPE = Shader.getMacroByName("SHAPE");

  //Base
  /**@internal */
  static WORLD_POSITION = Shader.getPropertyByName("u_WorldPosition");
  /**@internal */
  static WORLD_ROTATION = Shader.getPropertyByName("u_WorldRotation");
  /**@internal */
  static POSITION_SCALE = Shader.getPropertyByName("u_PositionScale");
  /**@internal */
  static SIZE_SCALE = Shader.getPropertyByName("u_SizeScale");
  /**@internal */
  static SCALING_MODE = Shader.getPropertyByName("u_ScalingMode");
  /**@internal */
  static GRAVITY = Shader.getPropertyByName("u_Gravity");
  /**@internal */
  static THREED_START_ROTATION = Shader.getPropertyByName("u_ThreeDStartRotation");
  /**@internal */
  static STRETCHED_BILLBOARD_LENGTH_SCALE = Shader.getPropertyByName("u_StretchedBillboardLengthScale");
  /**@internal */
  static STRETCHED_BILLBOARD_SPEED_SCALE = Shader.getPropertyByName("u_StretchedBillboardSpeedScale");
  /**@internal */
  static SIMULATION_SPACE = Shader.getPropertyByName("u_SimulationSpace");
  /**@internal */
  static CURRENT_TIME = Shader.getPropertyByName("u_CurrentTime");
  /**@internal */
  static DRAG = Shader.getPropertyByName("u_DragConstant");

  //VelocityOverLifetime
  /**@internal */
  static VOL_VELOCITY_CONST = Shader.getPropertyByName("u_VOLVelocityConst");
  /**@internal */
  static VOL_VELOCITY_GRADIENTX = Shader.getPropertyByName("u_VOLVelocityGradientX");
  /**@internal */
  static VOL_VELOCITY_GRADIENTY = Shader.getPropertyByName("u_VOLVelocityGradientY");
  /**@internal */
  static VOL_VELOCITY_GRADIENTZ = Shader.getPropertyByName("u_VOLVelocityGradientZ");
  /**@internal */
  static VOL_VELOCITY_CONST_MAX = Shader.getPropertyByName("u_VOLVelocityConstMax");
  /**@internal */
  static VOL_VELOCITY_GRADIENTX_MAX = Shader.getPropertyByName("u_VOLVelocityGradientMaxX");
  /**@internal */
  static VOL_VELOCITY_GRADIENTY_MAX = Shader.getPropertyByName("u_VOLVelocityGradientMaxY");
  /**@internal */
  static VOL_VELOCITY_GRADIENTZ_MAX = Shader.getPropertyByName("u_VOLVelocityGradientMaxZ");
  /**@internal */
  static VOL_SPACE_TYPE = Shader.getPropertyByName("u_VOLSpaceType");

  //ColorOverLifetime
  /**@internal */
  static COLOR_OVER_LIFE_GRADIENT_ALPHAS = Shader.getPropertyByName("u_ColorOverLifeGradientAlphas");
  /**@internal */
  static COLOR_OVER_LIFE_GRADIENT_COLORS = Shader.getPropertyByName("u_ColorOverLifeGradientColors");
  /**@internal */
  static COLOR_OVER_LIFE_GRADIENT_RANGES = Shader.getPropertyByName("u_ColorOverLifeGradientRanges");
  /**@internal */
  static MAX_COLOR_OVER_LIFE_GRADIENT_ALPHAS = Shader.getPropertyByName("u_MaxColorOverLifeGradientAlphas");
  /**@internal */
  static MAX_COLOR_OVER_LIFE_GRADIENT_COLORS = Shader.getPropertyByName("u_MaxColorOverLifeGradientColors");
  /**@internal */
  static MAX_COLOR_OVER_LIFE_GRADIENT_RANGES = Shader.getPropertyByName("u_MaxColorOverLifeGradientRanges");

  //SizeOverLifetime
  /**@internal */
  static SOL_SIZE_GRADIENT = Shader.getPropertyByName("u_SOLSizeGradient");
  /**@internal */
  static SOL_SIZE_GRADIENTX = Shader.getPropertyByName("u_SOLSizeGradientX");
  /**@internal */
  static SOL_SIZE_GRADIENTY = Shader.getPropertyByName("u_SOLSizeGradientY");
  /**@internal */
  static SOL_SIZE_GRADIENTZ = Shader.getPropertyByName("u_SOLSizeGradientZ");
  /**@internal */
  static SOL_SIZE_GRADIENT_Max = Shader.getPropertyByName("u_SOLSizeGradientMax");
  /**@internal */
  static SOL_SIZE_GRADIENTX_MAX = Shader.getPropertyByName("u_SOLSizeGradientMaxX");
  /**@internal */
  static SOL_SIZE_GRADIENTY_MAX = Shader.getPropertyByName("u_SOLSizeGradientMaxY");
  /**@internal */
  static SOL_SIZE_GRADIENTZ_MAX = Shader.getPropertyByName("u_SOLSizeGradientMaxZ");

  //RotationOverLifetime
  /**@internal */
  static ROL_ANGULAR_VELOCITY_CONST = Shader.getPropertyByName("u_ROLAngularVelocityConst");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_CONST_SEPARATE = Shader.getPropertyByName("u_ROLAngularVelocityConstSeparate");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENT = Shader.getPropertyByName("u_ROLAngularVelocityGradient");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTX = Shader.getPropertyByName("u_ROLAngularVelocityGradientX");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTY = Shader.getPropertyByName("u_ROLAngularVelocityGradientY");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTZ = Shader.getPropertyByName("u_ROLAngularVelocityGradientZ");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_CONST_MAX = Shader.getPropertyByName("u_ROLAngularVelocityConstMax");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_CONST_MAX_SEPARATE = Shader.getPropertyByName("u_ROLAngularVelocityConstMaxSeparate");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENT_MAX = Shader.getPropertyByName("u_ROLAngularVelocityGradientMax");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTX_MAX = Shader.getPropertyByName("u_ROLAngularVelocityGradientMaxX");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTY_MAX = Shader.getPropertyByName("u_ROLAngularVelocityGradientMaxY");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTZ_MAX = Shader.getPropertyByName("u_ROLAngularVelocityGradientMaxZ");
  /**@internal */
  static ROL_ANGULAR_VELOCITY_GRADIENTW_MAX = Shader.getPropertyByName("u_ROLAngularVelocityGradientMaxW");

  //TextureSheetAnimation
  /**@internal */
  static TEXTURE_SHEET_ANIMATION_CYCLES = Shader.getPropertyByName("u_TSACycles");
  /**@internal */
  static TEXTURE_SHEET_ANIMATION_SUB_UV_LENGTH = Shader.getPropertyByName("u_TSASubUVLength");
  /**@internal */
  static TEXTURE_SHEET_ANIMATION_GRADIENT_UVS = Shader.getPropertyByName("u_TSAGradientUVs");
  /**@internal */
  static TEXTURE_SHEET_ANIMATION_GRADIENT_MAX_UVS = Shader.getPropertyByName("u_TSAMaxGradientUVs");
}
