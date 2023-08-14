import { ShaderProperty } from "../shader";

/**
 * @internal
 */
export class ParticleShaderProperty {
  //Base
  static readonly worldPosition: ShaderProperty = ShaderProperty.getByName("u_WorldPosition");
  static readonly worldRotation: ShaderProperty = ShaderProperty.getByName("u_WorldRotation");
  static readonly positionScale: ShaderProperty = ShaderProperty.getByName("u_PositionScale");
  static readonly sizeScale: ShaderProperty = ShaderProperty.getByName("u_SizeScale");
  static readonly scaleMode: ShaderProperty = ShaderProperty.getByName("u_ScalingMode");
  static readonly gravity: ShaderProperty = ShaderProperty.getByName("u_Gravity");
  static readonly startRotation3D: ShaderProperty = ShaderProperty.getByName("u_ThreeDStartRotation");
  static readonly lengthScale: ShaderProperty = ShaderProperty.getByName("u_StretchedBillboardLengthScale");
  static readonly speedScale: ShaderProperty = ShaderProperty.getByName("u_StretchedBillboardSpeedScale");
  static readonly simulationSpace: ShaderProperty = ShaderProperty.getByName("u_SimulationSpace");
  static readonly currentTime: ShaderProperty = ShaderProperty.getByName("u_CurrentTime");

  //VelocityOverLifetime
  static readonly VOLVELOCITYCONST: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityConst");
  static readonly VOLVELOCITYGRADIENTX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientX");
  static readonly VOLVELOCITYGRADIENTY: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientY");
  static readonly VOLVELOCITYGRADIENTZ: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientZ");
  static readonly VOLVELOCITYCONSTMAX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityConstMax");
  static readonly VOLVELOCITYGRADIENTXMAX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientMaxX");
  static readonly VOLVELOCITYGRADIENTYMAX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientMaxY");
  static readonly VOLVELOCITYGRADIENTZMAX: ShaderProperty = ShaderProperty.getByName("u_VOLVelocityGradientMaxZ");
  static readonly VOLSPACETYPE: ShaderProperty = ShaderProperty.getByName("u_VOLSpaceType");

  //ColorOverLifetime
  static readonly COLOROVERLIFEGRADIENTALPHAS: ShaderProperty = ShaderProperty.getByName(
    "u_ColorOverLifeGradientAlphas"
  );
  static readonly COLOROVERLIFEGRADIENTCOLORS: ShaderProperty = ShaderProperty.getByName(
    "u_ColorOverLifeGradientColors"
  );
  static readonly MAXCOLOROVERLIFEGRADIENTALPHAS: ShaderProperty = ShaderProperty.getByName(
    "u_MaxColorOverLifeGradientAlphas"
  );
  static readonly MAXCOLOROVERLIFEGRADIENTCOLORS: ShaderProperty = ShaderProperty.getByName(
    "u_MaxColorOverLifeGradientColors"
  );

  //SizeOverLifetime
  static readonly SOLSIZEGRADIENT: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradient");
  static readonly SOLSIZEGRADIENTX: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientX");
  static readonly SOLSIZEGRADIENTY: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientY");
  static readonly SOLSizeGradientZ: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientZ");
  static readonly SOLSizeGradientMax: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientMax");
  static readonly SOLSIZEGRADIENTXMAX: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientMaxX");
  static readonly SOLSIZEGRADIENTYMAX: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientMaxY");
  static readonly SOLSizeGradientZMAX: ShaderProperty = ShaderProperty.getByName("u_SOLSizeGradientMaxZ");

  //RotationOverLifetime
  static readonly ROLANGULARVELOCITYCONST: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityConst");
  static readonly ROLANGULARVELOCITYCONSTSEPRARATE: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityConstSeprarate"
  );
  static readonly ROLANGULARVELOCITYGRADIENT: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityGradient");
  static readonly ROLANGULARVELOCITYGRADIENTX: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityGradientX"
  );
  static readonly ROLANGULARVELOCITYGRADIENTY: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityGradientY"
  );
  static readonly ROLANGULARVELOCITYGRADIENTZ: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityGradientZ"
  );
  static readonly ROLANGULARVELOCITYCONSTMAX: ShaderProperty = ShaderProperty.getByName("u_ROLAngularVelocityConstMax");
  static readonly ROLANGULARVELOCITYCONSTMAXSEPRARATE: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityConstMaxSeprarate"
  );
  static readonly ROLANGULARVELOCITYGRADIENTMAX: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityGradientMax"
  );
  static readonly ROLANGULARVELOCITYGRADIENTXMAX: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityGradientMaxX"
  );
  static readonly ROLANGULARVELOCITYGRADIENTYMAX: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityGradientMaxY"
  );
  static readonly ROLANGULARVELOCITYGRADIENTZMAX: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityGradientMaxZ"
  );
  static readonly ROLANGULARVELOCITYGRADIENTWMAX: ShaderProperty = ShaderProperty.getByName(
    "u_ROLAngularVelocityGradientMaxW"
  );

  //TextureSheetAnimation
  static readonly TEXTURESHEETANIMATIONCYCLES: ShaderProperty = ShaderProperty.getByName("u_TSACycles");
  static readonly TEXTURESHEETANIMATIONSUBUVLENGTH: ShaderProperty = ShaderProperty.getByName("u_TSASubUVLength");
  static readonly TEXTURESHEETANIMATIONGRADIENTUVS: ShaderProperty = ShaderProperty.getByName("u_TSAGradientUVs");
  static readonly TEXTURESHEETANIMATIONGRADIENTMAXUVS: ShaderProperty = ShaderProperty.getByName("u_TSAMaxGradientUVs");
}
