import { ShaderProperty } from "../shader";

/**
 * @internal
 */
export class ParticleShaderProperty {
  // Base
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
}
