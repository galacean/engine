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
}
